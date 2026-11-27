//! Windows 10/11 adapter.
//!
//! * Folders: `SHGetSetFolderCustomSettings` (the documented Shell API that writes
//!   `desktop.ini` and sets the folder's read-only/system attribute so Explorer honours it).
//!   The original `desktop.ini` bytes and attributes are backed up verbatim.
//! * Shortcuts (.lnk): `IShellLinkW::SetIconLocation`; target, arguments and working
//!   directory are untouched because only the icon location is written.
//! * Internet shortcuts (.url, e.g. Steam/Epic games): only `IconFile`/`IconIndex` in
//!   `[InternetShortcut]` are written; the original file bytes are backed up verbatim.
//! * Desktop discovery: `SHGetKnownFolderPath(FOLDERID_Desktop)`, which follows OneDrive
//!   and other folder redirection.
//!
//! No executables are modified, nothing is injected into Explorer and Explorer is never
//! restarted; `SHChangeNotify` asks the shell to refresh the item.

#![allow(unsafe_code)]

use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde_json::{json, Value};
use windows::core::{Interface, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{ERROR_CANCELLED, E_ACCESSDENIED, HWND, RPC_E_CHANGED_MODE};
use windows::Win32::Storage::FileSystem::{
    GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_NORMAL, FILE_FLAGS_AND_ATTRIBUTES,
    INVALID_FILE_ATTRIBUTES,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ, STGM_READWRITE,
};
use windows::Win32::UI::Shell::{
    FOLDERID_Desktop, FOLDERID_PublicDesktop, FileOpenDialog, IFileOpenDialog, IShellItem,
    IShellLinkW, SHChangeNotify, SHCreateItemFromParsingName, SHGetKnownFolderPath,
    SHGetSetFolderCustomSettings, ShellLink, FCSM_ICONFILE, FCS_FORCEWRITE, FCS_READ,
    FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_NODEREFERENCELINKS, FOS_PATHMUSTEXIST,
    FOS_PICKFOLDERS, KF_FLAG_DEFAULT, SHCNE_UPDATEDIR, SHCNE_UPDATEITEM, SHCNF_FLUSHNOWAIT,
    SHCNF_PATHW, SHFOLDERCUSTOMSETTINGS, SIGDN_FILESYSPATH,
};

use super::url_shortcut;
use super::{Capabilities, Classification, ItemKind, PlatformAdapter};
use crate::encode::IconFormat;
use crate::error::{CoreError, Result};

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;
const MAX_PATH_BUF: usize = 1024;

fn werr(e: windows::core::Error) -> CoreError {
    if e.code() == E_ACCESSDENIED {
        return access_denied();
    }
    CoreError::platform(e.message().to_string())
}

/// Shortcuts installed "for all users" (Docker Desktop, many installers) live in the Public
/// Desktop, which Windows only lets administrators change.
fn access_denied() -> CoreError {
    CoreError::platform(
        "Windows denied write access. Shortcuts installed for all users live in the Public \
         Desktop (C:\\Users\\Public\\Desktop) and need administrator rights: run iconmorph as \
         administrator once for this item, or move the shortcut into your own Desktop folder.",
    )
}

fn io_err(e: std::io::Error) -> CoreError {
    if e.kind() == std::io::ErrorKind::PermissionDenied {
        access_denied()
    } else {
        e.into()
    }
}

fn wide(p: &Path) -> HSTRING {
    HSTRING::from(p.to_string_lossy().as_ref())
}

/// Per-call COM initialisation guard (Tauri commands run on worker threads).
struct Com(bool);

impl Com {
    fn init() -> Result<Self> {
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if hr.is_ok() {
            Ok(Com(true))
        } else if hr == RPC_E_CHANGED_MODE {
            Ok(Com(false)) // already initialised as MTA on this thread; usable for ShellLink
        } else {
            Err(CoreError::platform(format!(
                "COM initialisation failed: {hr:?}"
            )))
        }
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

fn attributes(p: &Path) -> Option<u32> {
    let a = unsafe { GetFileAttributesW(&wide(p)) };
    (a != INVALID_FILE_ATTRIBUTES).then_some(a)
}

fn set_attributes(p: &Path, attrs: u32) -> Result<()> {
    unsafe { SetFileAttributesW(&wide(p), FILE_FLAGS_AND_ATTRIBUTES(attrs)) }.map_err(werr)
}

fn notify(p: &Path, is_dir: bool) {
    let w = wide(p);
    let ev = if is_dir {
        SHCNE_UPDATEDIR
    } else {
        SHCNE_UPDATEITEM
    };
    unsafe {
        SHChangeNotify(
            ev,
            SHCNF_PATHW | SHCNF_FLUSHNOWAIT,
            Some(w.as_ptr() as _),
            None,
        );
        SHChangeNotify(
            SHCNE_UPDATEITEM,
            SHCNF_PATHW | SHCNF_FLUSHNOWAIT,
            Some(w.as_ptr() as _),
            None,
        );
    }
}

fn is_shortcut(p: &Path) -> bool {
    p.is_file()
        && p.extension()
            .map(|e| e.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false)
}

fn is_url(p: &Path) -> bool {
    p.is_file()
        && p.extension()
            .map(|e| e.eq_ignore_ascii_case("url"))
            .unwrap_or(false)
}

fn read_url(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    let text = String::from_utf8(bytes).map_err(|_| {
        CoreError::unsupported(
            "This internet shortcut is not UTF-8/ANSI text and was left untouched",
        )
    })?;
    if !url_shortcut::is_internet_shortcut(&text) {
        return Err(CoreError::unsupported(
            "This .url file has no [InternetShortcut] URL and was left untouched",
        ));
    }
    Ok(text)
}

/// Write in place (no temp file appears on the desktop), lifting read-only for the write.
fn write_in_place(path: &Path, bytes: &[u8]) -> Result<()> {
    let attrs = attributes(path);
    let readonly = attrs.map(|a| a & 0x1 != 0).unwrap_or(false);
    if let (true, Some(a)) = (readonly, attrs) {
        set_attributes(path, a & !0x1)?;
    }
    let res = std::fs::write(path, bytes).map_err(io_err);
    if let (true, Some(a)) = (readonly, attrs) {
        let _ = set_attributes(path, a);
    }
    res
}

fn from_wide_buf(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn load_link(path: &Path, write: bool) -> Result<(IShellLinkW, IPersistFile)> {
    unsafe {
        let link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(werr)?;
        let pf: IPersistFile = link.cast().map_err(werr)?;
        pf.Load(&wide(path), if write { STGM_READWRITE } else { STGM_READ })
            .map_err(werr)?;
        Ok((link, pf))
    }
}

fn link_icon(path: &Path) -> Result<(String, i32)> {
    let (link, _pf) = load_link(path, false)?;
    let mut buf = [0u16; MAX_PATH_BUF];
    let mut idx = 0i32;
    unsafe { link.GetIconLocation(&mut buf, &mut idx) }.map_err(werr)?;
    Ok((from_wide_buf(&buf), idx))
}

fn set_link_icon(path: &Path, icon: &str, index: i32) -> Result<()> {
    let (link, pf) = load_link(path, true)?;
    unsafe {
        link.SetIconLocation(&HSTRING::from(icon), index)
            .map_err(werr)?;
        pf.Save(PCWSTR::null(), true).map_err(werr)?;
    }
    Ok(())
}

fn folder_icon(path: &Path) -> Result<String> {
    let mut buf = [0u16; MAX_PATH_BUF];
    let mut s = SHFOLDERCUSTOMSETTINGS {
        dwSize: std::mem::size_of::<SHFOLDERCUSTOMSETTINGS>() as u32,
        dwMask: FCSM_ICONFILE,
        pszIconFile: PWSTR(buf.as_mut_ptr()),
        cchIconFile: buf.len() as u32,
        ..Default::default()
    };
    unsafe { SHGetSetFolderCustomSettings(&mut s, &wide(path), FCS_READ) }.map_err(werr)?;
    Ok(from_wide_buf(&buf))
}

fn known_folder(id: &windows::core::GUID) -> Result<PathBuf> {
    unsafe {
        let p = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).map_err(werr)?;
        let s = p
            .to_string()
            .map_err(|e| CoreError::platform(e.to_string()));
        CoTaskMemFree(Some(p.0 as _));
        Ok(PathBuf::from(s?))
    }
}

fn link_target(path: &Path) -> Result<String> {
    let (link, _pf) = load_link(path, false)?;
    let mut buf = [0u16; MAX_PATH_BUF];
    unsafe { link.GetPath(&mut buf, std::ptr::null_mut(), 0) }.map_err(werr)?;
    Ok(from_wide_buf(&buf))
}

/// Native "Open" dialog that returns shortcuts themselves.
///
/// The common file dialog normally *follows* a .lnk and returns its target (picking
/// "Brave" yields `brave.exe`, which Windows cannot give an icon). `FOS_NODEREFERENCELINKS`
/// returns the .lnk so it can be customized. Returns `Ok(None)` when cancelled.
pub fn pick_item(
    owner: isize,
    title: &str,
    folder: bool,
    start: Option<&Path>,
) -> Result<Option<PathBuf>> {
    let _com = Com::init()?;
    unsafe {
        let dlg: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(werr)?;
        let mut opts = dlg.GetOptions().map_err(werr)?;
        opts |= FOS_NODEREFERENCELINKS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST;
        opts |= if folder {
            FOS_PICKFOLDERS
        } else {
            FOS_FILEMUSTEXIST
        };
        dlg.SetOptions(opts).map_err(werr)?;
        dlg.SetTitle(&HSTRING::from(title)).map_err(werr)?;
        if let Some(dir) = start {
            if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&wide(dir), None) {
                let _ = dlg.SetFolder(&item);
            }
        }
        let parent = (owner != 0).then_some(HWND(owner as *mut core::ffi::c_void));
        if let Err(e) = dlg.Show(parent) {
            if e.code() == ERROR_CANCELLED.to_hresult() {
                return Ok(None);
            }
            return Err(werr(e));
        }
        let item = dlg.GetResult().map_err(werr)?;
        let p = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(werr)?;
        let s = p
            .to_string()
            .map_err(|e| CoreError::platform(e.to_string()));
        CoTaskMemFree(Some(p.0 as _));
        Ok(Some(PathBuf::from(s?)))
    }
}

/// Shortcuts on the user's and the Public Desktop that launch `target` (case-insensitive),
/// so an .exe picked by mistake can be mapped back to the icon the user actually sees.
pub fn shortcuts_to(target: &Path) -> Vec<PathBuf> {
    let want = target.to_string_lossy().to_lowercase();
    let Ok(_com) = Com::init() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for id in [&FOLDERID_Desktop, &FOLDERID_PublicDesktop] {
        let Ok(dir) = known_folder(id) else { continue };
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in entries.flatten() {
            let p = e.path();
            if is_shortcut(&p)
                && link_target(&p)
                    .map(|t| t.to_lowercase() == want)
                    .unwrap_or(false)
            {
                out.push(p);
            }
        }
    }
    out
}

/// What the user chose, ready to customize: the dialog result, with an accidentally
/// picked program replaced by its desktop shortcut. Returns `(target, picked_program)`.
pub fn pick_customizable(
    owner: isize,
    folder: bool,
    start: Option<&Path>,
) -> Result<Option<(PathBuf, Option<PathBuf>)>> {
    let title = if folder {
        "Choose a folder to customize"
    } else {
        "Choose a shortcut to customize"
    };
    let Some(picked) = pick_item(owner, title, folder, start)? else {
        return Ok(None);
    };
    if !folder && picked.is_file() && !is_shortcut(&picked) && !is_url(&picked) {
        if let Some(link) = shortcuts_to(&picked).into_iter().next() {
            return Ok(Some((link, Some(picked))));
        }
    }
    Ok(Some((picked, None)))
}

pub struct WindowsAdapter;

impl WindowsAdapter {
    pub fn new() -> Self {
        WindowsAdapter
    }
}

impl Default for WindowsAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl PlatformAdapter for WindowsAdapter {
    fn id(&self) -> &'static str {
        "windows"
    }

    fn environment(&self) -> String {
        "Windows (Explorer)".into()
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            folders: true,
            shortcuts: true,
            files: false,
            icon_format: IconFormat::Ico,
            notes: vec![
                "Folders use desktop.ini through the Shell API; shortcuts use IShellLink; internet shortcuts (.url) use their IconFile key.".into(),
                "Windows does not support per-file icons for ordinary files; create a shortcut instead.".into(),
                "Explorer may take a few seconds to refresh a cached icon.".into(),
            ],
            status: "experimental",
        }
    }

    fn desktop_dir(&self) -> Result<PathBuf> {
        known_folder(&FOLDERID_Desktop)
    }

    fn classify(&self, path: &Path) -> Classification {
        if path.is_dir() {
            Classification {
                kind: ItemKind::Folder,
                supported: true,
                note: None,
            }
        } else if is_shortcut(path) || is_url(path) {
            // Opening for write (no truncation, nothing written) tells us up front whether
            // Windows will allow the change, e.g. Public Desktop shortcuts need admin rights.
            let writable = !matches!(
                std::fs::OpenOptions::new().write(true).open(path),
                Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied
            );
            Classification {
                kind: ItemKind::Shortcut,
                supported: writable,
                note: (!writable).then(|| {
                    "This shortcut is installed for all users (Public Desktop) or is read-only; \
                     Windows needs administrator rights to change it. Run iconmorph as \
                     administrator to customize it."
                        .into()
                }),
            }
        } else {
            Classification {
                kind: ItemKind::File,
                supported: false,
                note: Some(
                    "Windows only supports custom icons on folders and shortcuts. Customize the app's shortcut instead"
                        .into(),
                ),
            }
        }
    }

    fn read_state(&self, target: &Path) -> Result<Value> {
        if target.is_dir() {
            let ini = target.join("desktop.ini");
            let bytes = if ini.exists() {
                Some(std::fs::read(&ini)?)
            } else {
                None
            };
            Ok(json!({
                "type": "folder",
                "ini": bytes.map(|b| B64.encode(b)),
                "iniAttrs": attributes(&ini),
                "folderAttrs": attributes(target).ok_or_else(|| CoreError::NotFound(target.display().to_string()))?,
            }))
        } else if is_shortcut(target) {
            let _com = Com::init()?;
            let (icon, index) = link_icon(target)?;
            Ok(json!({ "type": "shortcut", "icon": icon, "index": index }))
        } else if is_url(target) {
            read_url(target)?; // refuse anything we would not edit safely
            Ok(json!({
                "type": "url",
                "bytes": B64.encode(std::fs::read(target)?),
            }))
        } else {
            Err(CoreError::unsupported(
                "Only folders and shortcuts (.lnk, .url) can be customized on Windows",
            ))
        }
    }

    fn apply(&self, target: &Path, icon_file: &Path) -> Result<()> {
        if target.is_dir() {
            let icon = wide(icon_file);
            let mut s = SHFOLDERCUSTOMSETTINGS {
                dwSize: std::mem::size_of::<SHFOLDERCUSTOMSETTINGS>() as u32,
                dwMask: FCSM_ICONFILE,
                pszIconFile: PWSTR(icon.as_ptr() as *mut u16),
                cchIconFile: 0,
                iIconIndex: 0,
                ..Default::default()
            };
            unsafe { SHGetSetFolderCustomSettings(&mut s, &wide(target), FCS_FORCEWRITE) }
                .map_err(werr)?;
            notify(target, true);
            Ok(())
        } else if is_shortcut(target) {
            let _com = Com::init()?;
            set_link_icon(target, &icon_file.to_string_lossy(), 0)?;
            notify(target, false);
            Ok(())
        } else if is_url(target) {
            let text = read_url(target)?;
            let updated = url_shortcut::set_icon(&text, &icon_file.to_string_lossy());
            write_in_place(target, updated.as_bytes())?;
            notify(target, false);
            Ok(())
        } else {
            Err(CoreError::unsupported(
                "Only folders and shortcuts (.lnk, .url) can be customized on Windows",
            ))
        }
    }

    fn restore(&self, target: &Path, state: &Value) -> Result<()> {
        match state.get("type").and_then(Value::as_str) {
            Some("folder") => {
                let ini = target.join("desktop.ini");
                if ini.exists() {
                    set_attributes(&ini, FILE_ATTRIBUTE_NORMAL.0)?;
                }
                match state.get("ini").and_then(Value::as_str) {
                    Some(b64) => {
                        let bytes = B64
                            .decode(b64)
                            .map_err(|e| CoreError::invalid(e.to_string()))?;
                        std::fs::write(&ini, bytes)?;
                        if let Some(a) = state.get("iniAttrs").and_then(Value::as_u64) {
                            set_attributes(&ini, a as u32)?;
                        }
                    }
                    None => {
                        if ini.exists() {
                            std::fs::remove_file(&ini)?;
                        }
                    }
                }
                if let Some(a) = state.get("folderAttrs").and_then(Value::as_u64) {
                    set_attributes(target, a as u32)?;
                }
                notify(target, true);
                Ok(())
            }
            Some("shortcut") => {
                let _com = Com::init()?;
                let icon = state.get("icon").and_then(Value::as_str).unwrap_or("");
                let index = state.get("index").and_then(Value::as_i64).unwrap_or(0) as i32;
                set_link_icon(target, icon, index)?;
                notify(target, false);
                Ok(())
            }
            Some("url") => {
                let b64 = state
                    .get("bytes")
                    .and_then(Value::as_str)
                    .ok_or_else(|| CoreError::invalid("Backup is missing the shortcut bytes"))?;
                let bytes = B64
                    .decode(b64)
                    .map_err(|e| CoreError::invalid(e.to_string()))?;
                write_in_place(target, &bytes)?;
                notify(target, false);
                Ok(())
            }
            _ => Err(CoreError::invalid(
                "Backup was not created by the Windows adapter",
            )),
        }
    }

    fn verify(&self, target: &Path, icon_file: &Path) -> Result<bool> {
        let want = icon_file.to_string_lossy().to_lowercase();
        let got = if target.is_dir() {
            folder_icon(target)?
        } else if is_url(target) {
            url_shortcut::icon_file(&read_url(target)?).unwrap_or_default()
        } else {
            let _com = Com::init()?;
            link_icon(target)?.0
        };
        Ok(got.to_lowercase() == want)
    }
}
