//! Platform adapters. Each adapter knows how to read, apply and restore a native custom icon
//! using only mechanisms the operating system supports. Nothing is injected or patched.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::encode::IconFormat;
use crate::error::Result;

pub mod desktop_entry;
/// Freedesktop adapters. Compiled everywhere so the engine's end-to-end tests (which use the
/// file-based KDE / .desktop mechanisms on temp folders) run on every CI platform.
pub mod linux;
#[cfg(any(target_os = "macos", feature = "typecheck-macos"))]
pub mod macos;
pub mod url_shortcut;
#[cfg(any(windows, feature = "typecheck-windows"))]
pub mod windows;
#[cfg(any(windows, feature = "typecheck-windows"))]
pub mod windows_live;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemKind {
    Folder,
    Shortcut,
    File,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopItem {
    pub path: String,
    pub name: String,
    pub kind: ItemKind,
    pub supported: bool,
    pub note: Option<String>,
    pub customized: bool,
    pub icon_hash: Option<String>,
    pub modified_unix: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub folders: bool,
    pub shortcuts: bool,
    pub files: bool,
    pub icon_format: IconFormat,
    /// Honest, user-facing notes about what does and does not work here.
    pub notes: Vec<String>,
    /// "tested" | "experimental" | "unsupported"
    pub status: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Classification {
    pub kind: ItemKind,
    pub supported: bool,
    pub note: Option<String>,
}

pub trait PlatformAdapter: Send + Sync {
    /// Stable id stored with backups, e.g. "windows", "macos", "linux-gio", "linux-kde".
    fn id(&self) -> &'static str;
    /// Human-readable environment, e.g. "Windows 11", "GNOME (gio metadata)".
    fn environment(&self) -> String;
    fn capabilities(&self) -> Capabilities;
    fn desktop_dir(&self) -> Result<PathBuf>;
    fn classify(&self, path: &Path) -> Classification;
    /// Snapshot of whatever native metadata `apply` will change.
    fn read_state(&self, target: &Path) -> Result<Value>;
    fn apply(&self, target: &Path, icon_file: &Path) -> Result<()>;
    fn restore(&self, target: &Path, state: &Value) -> Result<()>;
    /// Re-read native metadata and confirm it points at `icon_file`.
    fn verify(&self, target: &Path, icon_file: &Path) -> Result<bool>;
}

/// Names never listed as desktop items.
pub fn is_ignored_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    name.starts_with('.')
        || name.starts_with("~$")
        || lower == "desktop.ini"
        || lower == "thumbs.db"
        || name == "Icon\r"
}

/// List the immediate children of `dir` (no recursion, no background scanning).
pub fn list_items(adapter: &dyn PlatformAdapter, dir: &Path) -> Result<Vec<DesktopItem>> {
    let mut items = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_ignored_name(&name) || is_hidden(&entry) {
            continue;
        }
        let path = entry.path();
        let c = adapter.classify(&path);
        let modified_unix = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        items.push(DesktopItem {
            path: path.to_string_lossy().into_owned(),
            name: display_name(&path),
            kind: c.kind,
            supported: c.supported,
            note: c.note,
            customized: false,
            icon_hash: None,
            modified_unix,
        });
    }
    items.sort_by(|a, b| {
        (a.kind != ItemKind::Folder, a.name.to_lowercase())
            .cmp(&(b.kind != ItemKind::Folder, b.name.to_lowercase()))
    });
    Ok(items)
}

#[cfg(windows)]
fn is_hidden(entry: &std::fs::DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    entry
        .metadata()
        .map(|m| m.file_attributes() & 0x2 != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn is_hidden(_entry: &std::fs::DirEntry) -> bool {
    false
}

/// File name without the shortcut extension (".lnk", ".desktop").
pub fn display_name(path: &Path) -> String {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    for ext in [".lnk", ".desktop"] {
        if name.to_ascii_lowercase().ends_with(ext) && !path.is_dir() {
            return name[..name.len() - ext.len()].to_string();
        }
    }
    name
}

/// Adapter used when the current OS / desktop has no supported mechanism.
pub struct UnsupportedAdapter {
    pub reason: String,
}

impl PlatformAdapter for UnsupportedAdapter {
    fn id(&self) -> &'static str {
        "unsupported"
    }
    fn environment(&self) -> String {
        self.reason.clone()
    }
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            folders: false,
            shortcuts: false,
            files: false,
            icon_format: IconFormat::Png,
            notes: vec![
                self.reason.clone(),
                "You can still design icons and export PNG, ICO or ICNS files.".into(),
            ],
            status: "unsupported",
        }
    }
    fn desktop_dir(&self) -> Result<PathBuf> {
        directories::UserDirs::new()
            .and_then(|u| u.desktop_dir().map(Path::to_path_buf))
            .ok_or_else(|| crate::CoreError::NotFound("desktop folder".into()))
    }
    fn classify(&self, path: &Path) -> Classification {
        Classification {
            kind: if path.is_dir() {
                ItemKind::Folder
            } else {
                ItemKind::File
            },
            supported: false,
            note: Some(self.reason.clone()),
        }
    }
    fn read_state(&self, _: &Path) -> Result<Value> {
        Err(crate::CoreError::unsupported(self.reason.clone()))
    }
    fn apply(&self, _: &Path, _: &Path) -> Result<()> {
        Err(crate::CoreError::unsupported(self.reason.clone()))
    }
    fn restore(&self, _: &Path, _: &Value) -> Result<()> {
        Err(crate::CoreError::unsupported(self.reason.clone()))
    }
    fn verify(&self, _: &Path, _: &Path) -> Result<bool> {
        Ok(false)
    }
}

/// The adapter for the machine IconMorph is running on.
pub fn native_adapter() -> Box<dyn PlatformAdapter> {
    #[cfg(windows)]
    {
        Box::new(windows::WindowsAdapter::new())
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacAdapter::new())
    }
    #[cfg(any(target_os = "linux", target_os = "freebsd"))]
    {
        linux::detect()
    }
    #[cfg(not(any(
        windows,
        target_os = "macos",
        target_os = "linux",
        target_os = "freebsd"
    )))]
    {
        Box::new(UnsupportedAdapter {
            reason: "This operating system is not supported yet.".into(),
        })
    }
}

/// Write `bytes` to `path` atomically (temp file in the same directory, then rename).
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| crate::CoreError::invalid("path has no parent"))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let tmp = dir.join(format!(
        ".{name}.iconmorph-{}.tmp",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::write(&tmp, bytes)?;
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// Percent-encode a filesystem path as a file:// URI.
pub fn file_uri(path: &Path) -> String {
    let s = path.to_string_lossy();
    let mut out = String::from("file://");
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
