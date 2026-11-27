//! *iconmorph Live*: the opt-in Windows helper that plays GIF icons on the desktop.
//!
//! Windows can only show still icons, so the applied icon stays a normal still frame (and
//! keeps working if this helper never runs). When the user turns on "Animate on the desktop"
//! for an item, the app starts `iconmorph.exe --live`, which:
//!
//! * finds the item on the desktop through the Shell (`IShellWindows` → `IFolderView`) and
//!   reads its exact icon rectangle from the desktop list view;
//! * shows a click-through, never-activated layered window over that icon, owned by the
//!   desktop window so it stays on the desktop layer (under every app window, and it comes
//!   forward with the desktop on Win+D);
//! * plays the pre-rendered frames from `live.json` at the GIF's own frame delays;
//! * re-checks icon positions every 750 ms (icons moved, resolution or DPI changed, Explorer
//!   restarted), skips drawing while the icon is covered, and pauses on lock;
//! * shows a notification-area icon with Pause / Open iconmorph / Stop.
//!
//! It never changes any file. Stopping it leaves the still icons exactly as they are.
#![allow(unsafe_code)]

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use image::RgbaImage;
use windows::core::{w, Interface, HSTRING, PCWSTR};
use windows::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT,
    POINT, RECT, SIZE, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
    SelectObject, AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION,
    DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, IServiceProvider, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Diagnostics::Debug::{ReadProcessMemory, WriteProcessMemory};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{
    VirtualAllocEx, VirtualFreeEx, MEM_COMMIT, MEM_RELEASE, MEM_RESERVE, PAGE_READWRITE,
};
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ,
};
use windows::Win32::System::RemoteDesktop::{
    WTSRegisterSessionNotification, WTSUnRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION,
};
use windows::Win32::System::Threading::{
    CreateMutexW, OpenProcess, PROCESS_VM_OPERATION, PROCESS_VM_READ, PROCESS_VM_WRITE,
};
use windows::Win32::System::Variant::{VARIANT, VT_I4};
use windows::Win32::UI::Controls::{LVIR_ICON, LVM_GETITEMRECT};
use windows::Win32::UI::HiDpi::{
    GetDpiForWindow, SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
    ExtractIconW, IFolderView, IFolderView2, IShellBrowser, IShellFolder, IShellWindows,
    SID_STopLevelBrowser, ShellWindows, Shell_NotifyIconW, StrRetToStrW, NIF_ICON, NIF_MESSAGE,
    NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW, SHGDN_FORPARSING, SVGIO_ALLVIEW, SWC_DESKTOP,
    SWFO_NEEDDISPATCH,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyIcon, DestroyMenu,
    DestroyWindow, DispatchMessageW, EnumWindows, FindWindowExW, FindWindowW, GetCursorPos,
    GetMessageW, GetWindowThreadProcessId, IsWindow, IsWindowVisible, KillTimer, PostMessageW,
    PostQuitMessage, RegisterClassExW, RegisterWindowMessageW, SendMessageTimeoutW,
    SetForegroundWindow, SetTimer, ShowWindow, TrackPopupMenu, TranslateMessage,
    UpdateLayeredWindow, WindowFromPoint, HICON, HMENU, MF_SEPARATOR, MF_STRING, MSG,
    SMTO_ABORTIFHUNG, SW_HIDE, SW_SHOWNOACTIVATE, TPM_RETURNCMD, TPM_RIGHTBUTTON, ULW_ALPHA,
    WINDOW_EX_STYLE, WM_APP, WM_CLOSE, WM_CONTEXTMENU, WM_DESTROY, WM_LBUTTONUP, WM_NCHITTEST,
    WM_RBUTTONUP, WM_TIMER, WM_WTSSESSION_CHANGE, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
};

use crate::engine::AppPaths;
use crate::error::{CoreError, Result};
use crate::live::{self, LiveItem};

const CTL_CLASS: PCWSTR = w!("IconMorphLiveCtl");
const OVL_CLASS: PCWSTR = w!("IconMorphLiveOverlay");
const MUTEX: PCWSTR = w!("Local\\IconMorphLiveHelper");
const RUN_KEY: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
const RUN_VALUE: PCWSTR = w!("iconmorph Live");

/// Sent by the app after `live.json` changed.
pub const WM_LIVE_RELOAD: u32 = WM_APP + 1;
const WM_TRAY: u32 = WM_APP + 2;
const TIMER_LAYOUT: usize = 1;
const TIMER_FRAME: usize = 2;
const LAYOUT_MS: u32 = 750;
const CMD_PAUSE: usize = 1;
const CMD_OPEN: usize = 2;
const CMD_STOP: usize = 3;
const WTS_SESSION_LOCK: usize = 0x7;
const WTS_SESSION_UNLOCK: usize = 0x8;
const HTTRANSPARENT: isize = -1;

fn werr(e: windows::core::Error) -> CoreError {
    CoreError::platform(e.message().to_string())
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

// ───────────────────────────── control API used by the app ─────────────────────────────

/// Is the helper running for this user?
pub fn is_running() -> bool {
    unsafe { FindWindowW(CTL_CLASS, PCWSTR::null()) }.is_ok()
}

/// Start the helper, or tell a running one to re-read `live.json`.
pub fn start_or_reload(exe: &Path) -> Result<()> {
    if let Ok(h) = unsafe { FindWindowW(CTL_CLASS, PCWSTR::null()) } {
        unsafe { PostMessageW(Some(h), WM_LIVE_RELOAD, WPARAM(0), LPARAM(0)) }.map_err(werr)?;
        return Ok(());
    }
    spawn_detached(exe)
}

#[cfg(windows)]
fn spawn_detached(exe: &Path) -> Result<()> {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new(exe)
        .arg("--live")
        .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
        .spawn()?;
    Ok(())
}

#[cfg(not(windows))]
fn spawn_detached(exe: &Path) -> Result<()> {
    std::process::Command::new(exe).arg("--live").spawn()?;
    Ok(())
}

/// Ask a running helper to quit (no-op if it isn't running).
pub fn stop() {
    if let Ok(h) = unsafe { FindWindowW(CTL_CLASS, PCWSTR::null()) } {
        let _ = unsafe { PostMessageW(Some(h), WM_CLOSE, WPARAM(0), LPARAM(0)) };
    }
}

/// Start the helper when the user signs in (HKCU Run key; no admin rights, easy to remove).
pub fn set_autostart(exe: &Path, on: bool) -> Result<()> {
    unsafe {
        let err = if on {
            let cmd = wide(&format!("\"{}\" --live", exe.display()));
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                RUN_KEY,
                RUN_VALUE,
                REG_SZ.0,
                Some(cmd.as_ptr().cast()),
                (cmd.len() * 2) as u32,
            )
        } else {
            let e = RegDeleteKeyValueW(HKEY_CURRENT_USER, RUN_KEY, RUN_VALUE);
            // Already absent is fine.
            if e.0 == 2 {
                return Ok(());
            }
            e
        };
        err.ok().map_err(werr)
    }
}

pub fn autostart_enabled() -> bool {
    unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            RUN_KEY,
            RUN_VALUE,
            RRF_RT_REG_SZ,
            None,
            None,
            None,
        )
    }
    .is_ok()
}

// ────────────────────────────────── the helper process ──────────────────────────────────

struct Overlay {
    target: String,
    hwnd: HWND,
    /// Encoded PNG frames (small); decoded only when the icon size changes.
    pngs: Vec<Vec<u8>>,
    delays: Vec<u32>,
    pixel_art: bool,
    /// Frames scaled to `px` as premultiplied BGRA.
    scaled: Vec<Vec<u8>>,
    px: u32,
    idx: usize,
    rect: Option<RECT>,
    dib: Option<Dib>,
}

struct Dib {
    dc: HDC,
    bmp: HBITMAP,
    old: HGDIOBJ,
    bits: *mut u8,
    px: u32,
}

impl Drop for Dib {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.dc, self.old);
            let _ = DeleteObject(self.bmp.into());
            let _ = DeleteDC(self.dc);
        }
    }
}

#[derive(Default)]
struct Desktop {
    host: HWND,
    listview: HWND,
    view: Option<IFolderView>,
    /// Normalised path → listview index, refreshed when the item count changes.
    index: HashMap<String, i32>,
    count: i32,
    /// Layout ticks since the last full re-index (catches re-sorts with the same count).
    since_index: u32,
}

struct Helper {
    paths: AppPaths,
    ctl: HWND,
    hinst: HINSTANCE,
    icon: HICON,
    taskbar_created: u32,
    overlays: Vec<Overlay>,
    desktop: Desktop,
    paused: bool,
    locked: bool,
}

thread_local! {
    static HELPER: RefCell<Option<Helper>> = const { RefCell::new(None) };
}

fn with_helper<R>(f: impl FnOnce(&mut Helper) -> R) -> Option<R> {
    HELPER.with(|h| h.try_borrow_mut().ok().and_then(|mut h| h.as_mut().map(f)))
}

/// Entry point for `iconmorph --live`. Returns when the user stops it.
pub fn run(paths: AppPaths) -> Result<()> {
    unsafe {
        let _mutex: HANDLE = CreateMutexW(None, true, MUTEX).map_err(werr)?;
        if GetLastError() == ERROR_ALREADY_EXISTS {
            return Ok(()); // another helper is already running for this user
        }
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let hinst: HINSTANCE = GetModuleHandleW(None).map_err(werr)?.into();

        for (class, proc_) in [
            (
                CTL_CLASS,
                ctl_proc as unsafe extern "system" fn(_, _, _, _) -> _,
            ),
            (OVL_CLASS, overlay_proc),
        ] {
            let wc = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(proc_),
                hInstance: hinst,
                lpszClassName: class,
                ..Default::default()
            };
            if RegisterClassExW(&wc) == 0 {
                return Err(CoreError::platform(
                    "Could not register the helper window class",
                ));
            }
        }
        // A hidden top-level window (not message-only) so it receives TaskbarCreated.
        let ctl = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            CTL_CLASS,
            w!("iconmorph Live"),
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            Some(hinst),
            None,
        )
        .map_err(werr)?;
        let exe = std::env::current_exe().unwrap_or_default();
        let icon = ExtractIconW(
            Some(hinst),
            &HSTRING::from(exe.to_string_lossy().as_ref()),
            0,
        );
        let helper = Helper {
            paths,
            ctl,
            hinst,
            icon,
            taskbar_created: RegisterWindowMessageW(w!("TaskbarCreated")),
            overlays: Vec::new(),
            desktop: Desktop::default(),
            paused: false,
            locked: false,
        };
        HELPER.with(|h| *h.borrow_mut() = Some(helper));
        with_helper(|h| {
            h.add_tray();
            h.reload();
        });
        let _ = WTSRegisterSessionNotification(ctl, NOTIFY_FOR_THIS_SESSION);
        SetTimer(Some(ctl), TIMER_LAYOUT, LAYOUT_MS, None);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = WTSUnRegisterSessionNotification(ctl);
        HELPER.with(|h| {
            if let Some(mut h) = h.borrow_mut().take() {
                h.remove_tray();
                h.clear_overlays();
                let _ = DestroyIcon(h.icon);
            }
        });
    }
    Ok(())
}

impl Helper {
    fn reload(&mut self) {
        self.clear_overlays();
        let cfg = live::load(&self.paths);
        if cfg.items.is_empty() {
            // Nothing to play: don't linger in the background.
            unsafe {
                let _ = PostMessageW(Some(self.ctl), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
            return;
        }
        for item in cfg.items {
            if let Some(o) = self.make_overlay(&item) {
                self.overlays.push(o);
            }
        }
        self.desktop.count = -1; // force re-index
        self.layout();
    }

    fn make_overlay(&self, item: &LiveItem) -> Option<Overlay> {
        let mut pngs = Vec::new();
        let mut delays = Vec::new();
        for f in &item.frames {
            pngs.push(std::fs::read(Path::new(&item.dir).join(&f.file)).ok()?);
            delays.push(f.delay_ms.max(20));
        }
        if pngs.is_empty() {
            return None;
        }
        Some(Overlay {
            target: item.target.clone(),
            hwnd: HWND::default(),
            pngs,
            delays,
            pixel_art: item.pixel_art,
            scaled: Vec::new(),
            px: 0,
            idx: 0,
            rect: None,
            dib: None,
        })
    }

    fn clear_overlays(&mut self) {
        for o in self.overlays.drain(..) {
            unsafe {
                let _ = KillTimer(Some(o.hwnd), TIMER_FRAME);
                if !o.hwnd.is_invalid() {
                    let _ = DestroyWindow(o.hwnd);
                }
            }
        }
    }

    fn active(&self) -> bool {
        !self.paused && !self.locked
    }

    /// Find the desktop, place every overlay over its icon, and (re)create windows if the
    /// desktop window changed (Explorer restarted).
    fn layout(&mut self) {
        let host = desktop_host();
        if host != self.desktop.host || !unsafe { IsWindow(Some(self.desktop.listview)) }.as_bool()
        {
            self.desktop = Desktop {
                host,
                listview: host_listview(host),
                count: -1,
                ..Default::default()
            };
            for o in &mut self.overlays {
                unsafe {
                    let _ = KillTimer(Some(o.hwnd), TIMER_FRAME);
                    if !o.hwnd.is_invalid() {
                        let _ = DestroyWindow(o.hwnd);
                    }
                }
                o.hwnd = HWND::default();
                o.dib = None;
            }
        }
        let lv = self.desktop.listview;
        let visible = !lv.is_invalid() && unsafe { IsWindowVisible(lv) }.as_bool();
        if visible {
            self.desktop.refresh_index();
        }
        let icon_px = if visible { self.desktop.icon_px() } else { 0 };
        let active = self.active();
        let hinst = self.hinst;
        for o in &mut self.overlays {
            let idx = self
                .desktop
                .index
                .get(&norm(&o.target))
                .copied()
                .filter(|_| visible);
            let rect = idx.and_then(|i| icon_rect(lv, i));
            match (rect, active) {
                (Some(r), true) if icon_px > 0 => {
                    if o.hwnd.is_invalid() {
                        o.hwnd = create_overlay_window(hinst, host);
                    }
                    let px = icon_px
                        .min((r.right - r.left).max(1) as u32)
                        .min((r.bottom - r.top).max(1) as u32);
                    let x = r.left + ((r.right - r.left) - px as i32) / 2;
                    let y = r.top + ((r.bottom - r.top) - px as i32) / 2;
                    let placed = RECT {
                        left: x,
                        top: y,
                        right: x + px as i32,
                        bottom: y + px as i32,
                    };
                    let first = o.rect.is_none();
                    let moved = o.rect != Some(placed);
                    o.rect = Some(placed);
                    if o.px != px {
                        o.rescale(px);
                    }
                    if moved {
                        o.draw();
                    }
                    if first {
                        unsafe {
                            let _ = ShowWindow(o.hwnd, SW_SHOWNOACTIVATE);
                            SetTimer(Some(o.hwnd), TIMER_FRAME, o.delays[o.idx], None);
                        }
                    }
                }
                _ => {
                    if o.rect.take().is_some() && !o.hwnd.is_invalid() {
                        unsafe {
                            let _ = KillTimer(Some(o.hwnd), TIMER_FRAME);
                            let _ = ShowWindow(o.hwnd, SW_HIDE);
                        }
                    }
                }
            }
        }
    }

    fn tick(&mut self, hwnd: HWND) {
        if let Some(o) = self.overlays.iter_mut().find(|o| o.hwnd == hwnd) {
            o.idx = (o.idx + 1) % o.pngs.len();
            if o.uncovered() {
                o.draw();
            }
            unsafe {
                SetTimer(Some(hwnd), TIMER_FRAME, o.delays[o.idx], None);
            }
        }
    }

    fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
        self.layout();
    }

    fn tray_data(&self) -> NOTIFYICONDATAW {
        let mut nid = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: self.ctl,
            uID: 1,
            uFlags: NIF_ICON | NIF_MESSAGE | NIF_TIP,
            uCallbackMessage: WM_TRAY,
            hIcon: self.icon,
            ..Default::default()
        };
        let tip: Vec<u16> = "iconmorph Live: playing GIF icons".encode_utf16().collect();
        nid.szTip[..tip.len()].copy_from_slice(&tip);
        nid
    }

    fn add_tray(&self) {
        unsafe {
            let _ = Shell_NotifyIconW(NIM_ADD, &self.tray_data());
        }
    }

    fn remove_tray(&self) {
        unsafe {
            let _ = Shell_NotifyIconW(NIM_DELETE, &self.tray_data());
        }
    }

    fn menu(&mut self) {
        unsafe {
            let Ok(menu): windows::core::Result<HMENU> = CreatePopupMenu() else {
                return;
            };
            let pause = if self.paused {
                w!("Resume")
            } else {
                w!("Pause")
            };
            let _ = AppendMenuW(menu, MF_STRING, CMD_PAUSE, pause);
            let _ = AppendMenuW(menu, MF_STRING, CMD_OPEN, w!("Open iconmorph"));
            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
            let _ = AppendMenuW(menu, MF_STRING, CMD_STOP, w!("Stop live icons"));
            let mut pt = POINT::default();
            let _ = GetCursorPos(&mut pt);
            let _ = SetForegroundWindow(self.ctl);
            let cmd = TrackPopupMenu(
                menu,
                TPM_RIGHTBUTTON | TPM_RETURNCMD,
                pt.x,
                pt.y,
                Some(0),
                self.ctl,
                None,
            );
            let _ = DestroyMenu(menu);
            match cmd.0 as usize {
                CMD_PAUSE => self.set_paused(!self.paused),
                CMD_OPEN => {
                    if let Ok(exe) = std::env::current_exe() {
                        let _ = std::process::Command::new(exe).spawn();
                    }
                }
                CMD_STOP => {
                    let _ = PostMessageW(Some(self.ctl), WM_CLOSE, WPARAM(0), LPARAM(0));
                }
                _ => {}
            }
        }
    }
}

impl Overlay {
    fn rescale(&mut self, px: u32) {
        let filter = if self.pixel_art {
            image::imageops::FilterType::Nearest
        } else {
            image::imageops::FilterType::Lanczos3
        };
        self.scaled = self
            .pngs
            .iter()
            .map(|png| {
                let f: RgbaImage = image::load_from_memory(png)
                    .map(|i| i.to_rgba8())
                    .unwrap_or_else(|_| RgbaImage::new(px, px));
                let s = image::imageops::resize(&f, px, px, filter);
                let mut out = Vec::with_capacity((px * px * 4) as usize);
                for p in s.pixels() {
                    let [r, g, b, a] = p.0;
                    let m = |c: u8| ((c as u32 * a as u32 + 127) / 255) as u8;
                    out.extend_from_slice(&[m(b), m(g), m(r), a]); // premultiplied BGRA
                }
                out
            })
            .collect();
        self.px = px;
        self.dib = None;
    }

    /// Is the centre of the icon actually showing the desktop (not covered by a window)?
    fn uncovered(&self) -> bool {
        let Some(r) = self.rect else { return false };
        let pt = POINT {
            x: (r.left + r.right) / 2,
            y: (r.top + r.bottom) / 2,
        };
        let w = unsafe { WindowFromPoint(pt) };
        let mut class = [0u16; 64];
        let n = unsafe { windows::Win32::UI::WindowsAndMessaging::GetClassNameW(w, &mut class) };
        let class = String::from_utf16_lossy(&class[..n.max(0) as usize]);
        matches!(
            class.as_str(),
            "SysListView32" | "SHELLDLL_DefView" | "Progman" | "WorkerW" | "IconMorphLiveOverlay"
        )
    }

    fn draw(&mut self) {
        let Some(r) = self.rect else { return };
        if self.hwnd.is_invalid() || self.scaled.is_empty() {
            return;
        }
        let px = self.px;
        if self.dib.as_ref().map(|d| d.px) != Some(px) {
            self.dib = Dib::new(px);
        }
        let Some(dib) = &self.dib else { return };
        let frame = &self.scaled[self.idx % self.scaled.len()];
        unsafe {
            std::ptr::copy_nonoverlapping(frame.as_ptr(), dib.bits, frame.len());
            let blend = BLENDFUNCTION {
                BlendOp: AC_SRC_OVER as u8,
                BlendFlags: 0,
                SourceConstantAlpha: 255,
                AlphaFormat: AC_SRC_ALPHA as u8,
            };
            let pos = POINT {
                x: r.left,
                y: r.top,
            };
            let size = SIZE {
                cx: px as i32,
                cy: px as i32,
            };
            let src = POINT::default();
            let _ = UpdateLayeredWindow(
                self.hwnd,
                None,
                Some(&pos),
                Some(&size),
                Some(dib.dc),
                Some(&src),
                windows::Win32::Foundation::COLORREF(0),
                Some(&blend),
                ULW_ALPHA,
            );
        }
    }
}

impl Dib {
    fn new(px: u32) -> Option<Dib> {
        unsafe {
            let screen = GetDC(None);
            let dc = CreateCompatibleDC(Some(screen));
            ReleaseDC(None, screen);
            let bi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: px as i32,
                    biHeight: -(px as i32), // top-down
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
            let bmp = CreateDIBSection(Some(dc), &bi, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
            if bits.is_null() {
                let _ = DeleteDC(dc);
                return None;
            }
            let old = SelectObject(dc, bmp.into());
            Some(Dib {
                dc,
                bmp,
                old,
                bits: bits.cast(),
                px,
            })
        }
    }
}

impl Desktop {
    fn folder_view(&mut self) -> Option<IFolderView> {
        if self.view.is_none() {
            self.view = desktop_folder_view().ok();
        }
        self.view.clone()
    }

    /// Map desktop paths to list-view indices (only when the item count changed).
    fn refresh_index(&mut self) {
        let Some(view) = self.folder_view() else {
            return;
        };
        let count = match unsafe { view.ItemCount(SVGIO_ALLVIEW) } {
            Ok(c) => c,
            Err(_) => {
                self.view = None; // Explorer restarted; reconnect next time
                return;
            }
        };
        self.since_index += 1;
        if count == self.count && self.since_index < 8 {
            return;
        }
        self.count = count;
        self.since_index = 0;
        self.index.clear();
        let Ok(folder) = (unsafe { view.GetFolder::<IShellFolder>() }) else {
            return;
        };
        for i in 0..count {
            unsafe {
                let Ok(pidl) = view.Item(i) else { continue };
                if let Some(p) = display_path(&folder, pidl) {
                    self.index.insert(norm(&p), i);
                }
                windows::Win32::System::Com::CoTaskMemFree(Some(pidl as *const _));
            }
        }
    }

    /// Desktop icon size in physical pixels.
    fn icon_px(&mut self) -> u32 {
        let Some(view) = self.folder_view() else {
            return 0;
        };
        let Ok(v2) = view.cast::<IFolderView2>() else {
            return 0;
        };
        let mut mode = Default::default();
        let mut size = 0i32;
        if unsafe { v2.GetViewModeAndIconSize(&mut mode, &mut size) }.is_err() || size <= 0 {
            return 0;
        }
        let dpi = unsafe { GetDpiForWindow(self.listview) }.max(96);
        (size as u32 * dpi / 96).clamp(16, 512)
    }
}

fn norm(p: &str) -> String {
    p.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

unsafe fn display_path(folder: &IShellFolder, pidl: *mut ITEMIDLIST) -> Option<String> {
    let mut sr = Default::default();
    folder
        .GetDisplayNameOf(pidl, SHGDN_FORPARSING, &mut sr)
        .ok()?;
    let mut p = windows::core::PWSTR::null();
    StrRetToStrW(&mut sr, Some(pidl), &mut p).ok()?;
    let s = p.to_string().ok();
    windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as *const _));
    s
}

/// The desktop's `IFolderView`, via the Shell's own window list (documented route).
fn desktop_folder_view() -> windows::core::Result<IFolderView> {
    unsafe {
        let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL)?;
        let mut loc = VARIANT::default(); // VT_I4 0 = CSIDL_DESKTOP
        (*loc.Anonymous.Anonymous).vt = VT_I4;
        let empty = VARIANT::default();
        let mut hwnd = 0i32;
        let disp = windows.FindWindowSW(&loc, &empty, SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH)?;
        let sp: IServiceProvider = disp.cast()?;
        let browser: IShellBrowser = sp.QueryService(&SID_STopLevelBrowser)?;
        let view = browser.QueryActiveShellView()?;
        view.cast()
    }
}

/// The top-level window that hosts the desktop icons (Progman, or a WorkerW).
fn desktop_host() -> HWND {
    unsafe extern "system" fn find(hwnd: HWND, out: LPARAM) -> windows::core::BOOL {
        if FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), PCWSTR::null()).is_ok() {
            *(out.0 as *mut HWND) = hwnd;
            return false.into();
        }
        true.into()
    }
    let mut host = HWND::default();
    unsafe {
        let _ = EnumWindows(Some(find), LPARAM(&mut host as *mut HWND as isize));
    }
    host
}

fn host_listview(host: HWND) -> HWND {
    unsafe {
        let Ok(defview) = FindWindowExW(Some(host), None, w!("SHELLDLL_DefView"), PCWSTR::null())
        else {
            return HWND::default();
        };
        FindWindowExW(Some(defview), None, w!("SysListView32"), PCWSTR::null()).unwrap_or_default()
    }
}

/// Screen rectangle of item `index`'s icon. The list view lives in Explorer, so the RECT is
/// exchanged through a small buffer in Explorer's address space (LVM_GETITEMRECT).
fn icon_rect(lv: HWND, index: i32) -> Option<RECT> {
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(lv, Some(&mut pid));
        let proc_ = OpenProcess(
            PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE,
            false,
            pid,
        )
        .ok()?;
        let size = std::mem::size_of::<RECT>();
        let remote = VirtualAllocEx(proc_, None, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        let mut out = None;
        if !remote.is_null() {
            let mut r = RECT {
                left: LVIR_ICON as i32,
                ..Default::default()
            };
            let ok = WriteProcessMemory(proc_, remote, (&r as *const RECT).cast(), size, None)
                .is_ok()
                && SendMessageTimeoutW(
                    lv,
                    LVM_GETITEMRECT,
                    WPARAM(index as usize),
                    LPARAM(remote as isize),
                    SMTO_ABORTIFHUNG,
                    500,
                    None,
                )
                .0 != 0
                && ReadProcessMemory(proc_, remote, (&mut r as *mut RECT).cast(), size, None)
                    .is_ok();
            if ok && r.right > r.left && r.bottom > r.top {
                let mut tl = POINT {
                    x: r.left,
                    y: r.top,
                };
                let mut br = POINT {
                    x: r.right,
                    y: r.bottom,
                };
                let _ = ClientToScreen(lv, &mut tl);
                let _ = ClientToScreen(lv, &mut br);
                out = Some(RECT {
                    left: tl.x,
                    top: tl.y,
                    right: br.x,
                    bottom: br.y,
                });
            }
            let _ = VirtualFreeEx(proc_, remote, 0, MEM_RELEASE);
        }
        let _ = CloseHandle(proc_);
        out
    }
}

/// Click-through, never activated, owned by the desktop host so it sits on the desktop layer.
fn create_overlay_window(hinst: HINSTANCE, owner: HWND) -> HWND {
    unsafe {
        CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            OVL_CLASS,
            w!(""),
            WS_POPUP,
            0,
            0,
            1,
            1,
            (!owner.is_invalid()).then_some(owner),
            None,
            Some(hinst),
            None,
        )
        .unwrap_or_default()
    }
}

unsafe extern "system" fn overlay_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_TIMER if wp.0 == TIMER_FRAME => {
            with_helper(|h| h.tick(hwnd));
            LRESULT(0)
        }
        WM_NCHITTEST => LRESULT(HTTRANSPARENT),
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

unsafe extern "system" fn ctl_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    let taskbar = with_helper(|h| h.taskbar_created).unwrap_or(0);
    match msg {
        WM_TIMER if wp.0 == TIMER_LAYOUT => {
            with_helper(|h| h.layout());
            LRESULT(0)
        }
        WM_LIVE_RELOAD => {
            with_helper(|h| h.reload());
            LRESULT(0)
        }
        WM_TRAY => {
            let ev = (lp.0 & 0xFFFF) as u32;
            if ev == WM_RBUTTONUP || ev == WM_CONTEXTMENU || ev == WM_LBUTTONUP {
                with_helper(|h| h.menu());
            }
            LRESULT(0)
        }
        WM_WTSSESSION_CHANGE => {
            let locked = match wp.0 {
                WTS_SESSION_LOCK => Some(true),
                WTS_SESSION_UNLOCK => Some(false),
                _ => None,
            };
            if let Some(l) = locked {
                with_helper(|h| {
                    h.locked = l;
                    h.layout();
                });
            }
            LRESULT(0)
        }
        WM_CLOSE => {
            let _ = DestroyWindow(hwnd);
            LRESULT(0)
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        m if m != 0 && m == taskbar => {
            // Explorer restarted: the tray icon and desktop windows are new.
            with_helper(|h| {
                h.add_tray();
                h.desktop = Desktop::default();
                h.layout();
            });
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

/// Path of the running app, for starting the helper and the Run key.
pub fn current_exe() -> Result<PathBuf> {
    Ok(std::env::current_exe()?)
}
