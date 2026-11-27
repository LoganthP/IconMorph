//! Real Windows integration tests (run on windows-latest in CI). They change icons on
//! temporary user-owned folders and shortcuts only, verify through the Shell, then restore.
#![cfg(any(windows, feature = "typecheck-windows"))]
#![allow(unsafe_code)]

use iconmorph_core::platform::windows::WindowsAdapter;
use iconmorph_core::platform::PlatformAdapter;
use iconmorph_core::store::Store;
use iconmorph_core::*;
use std::path::Path;
use windows::core::{Interface, HSTRING};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

fn engine(dir: &Path) -> Engine {
    let paths = AppPaths::at(&dir.join("appdata")).unwrap();
    let store = Store::open(&paths.db_path).unwrap();
    Engine::with_parts(paths, store, Box::new(WindowsAdapter::new()))
}

fn req(target: &Path) -> ApplyRequest {
    serde_json::from_value(serde_json::json!({
        "target": target.to_string_lossy(),
        "spec": { "mode": "classicFolder" },
        "source": { "type": "none" }
    }))
    .unwrap()
}

#[test]
fn folder_icon_is_written_verified_and_restored() {
    let tmp = tempfile::tempdir().unwrap();
    let folder = tmp.path().join("Personal");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("keep.txt"), b"data").unwrap();
    let e = engine(tmp.path());

    let res = e.apply(&req(&folder)).expect("apply");
    assert!(res.ok);
    let ini = std::fs::read(folder.join("desktop.ini")).expect("desktop.ini written by the Shell");
    let text = String::from_utf8_lossy(&ini).replace('\0', "");
    assert!(text.to_lowercase().contains(".ico"), "desktop.ini: {text}");
    assert_eq!(std::fs::read(folder.join("keep.txt")).unwrap(), b"data");

    e.restore(&res.target).expect("restore");
    assert!(
        !folder.join("desktop.ini").exists(),
        "original had no desktop.ini"
    );
}

#[test]
fn existing_desktop_ini_is_restored_byte_for_byte() {
    let tmp = tempfile::tempdir().unwrap();
    let folder = tmp.path().join("Work");
    std::fs::create_dir(&folder).unwrap();
    let original = b"[.ShellClassInfo]\r\nInfoTip=My work\r\n[ViewState]\r\nMode=4\r\n".to_vec();
    std::fs::write(folder.join("desktop.ini"), &original).unwrap();
    let e = engine(tmp.path());
    let res = e.apply(&req(&folder)).expect("apply");
    let during = String::from_utf8_lossy(&std::fs::read(folder.join("desktop.ini")).unwrap())
        .replace('\0', "");
    assert!(
        during.contains("InfoTip=My work"),
        "unrelated entries preserved: {during}"
    );
    e.restore(&res.target).unwrap();
    assert_eq!(std::fs::read(folder.join("desktop.ini")).unwrap(), original);
}

fn make_shortcut(lnk: &Path, target: &Path) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
        link.SetPath(&HSTRING::from(target.to_string_lossy().as_ref()))
            .unwrap();
        link.SetArguments(&HSTRING::from("--flag value")).unwrap();
        let pf: IPersistFile = link.cast().unwrap();
        pf.Save(&HSTRING::from(lnk.to_string_lossy().as_ref()), true)
            .unwrap();
    }
}

#[test]
fn shortcut_icon_changes_without_touching_target_or_arguments() {
    let tmp = tempfile::tempdir().unwrap();
    let target = tmp.path().join("app.txt");
    std::fs::write(&target, b"x").unwrap();
    let lnk = tmp.path().join("App.lnk");
    make_shortcut(&lnk, &target);
    let e = engine(tmp.path());
    let adapter = WindowsAdapter::new();
    let before = adapter.read_state(&lnk).unwrap();

    let res = e.apply(&req(&lnk)).expect("apply to shortcut");
    let during = adapter.read_state(&lnk).unwrap();
    assert!(during["icon"]
        .as_str()
        .unwrap()
        .to_lowercase()
        .ends_with(".ico"));
    let bytes = std::fs::read(&lnk).unwrap();
    let as_utf16: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    assert!(
        String::from_utf16_lossy(&as_utf16).contains("--flag value"),
        "arguments preserved"
    );

    e.restore(&res.target).unwrap();
    assert_eq!(adapter.read_state(&lnk).unwrap(), before);
}

#[test]
fn plain_files_are_refused() {
    let tmp = tempfile::tempdir().unwrap();
    let f = tmp.path().join("notes.txt");
    std::fs::write(&f, b"x").unwrap();
    assert!(engine(tmp.path()).apply(&req(&f)).is_err());
}

#[test]
fn internet_shortcut_icon_changes_and_restores_byte_for_byte() {
    let tmp = tempfile::tempdir().unwrap();
    let url = tmp.path().join("Dota 2.url");
    let original =
        b"[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,0\r\n[InternetShortcut]\r\nIDList=\r\nIconIndex=0\r\nURL=steam://rungameid/570\r\nIconFile=C:\\Steam\\game.ico\r\n"
            .to_vec();
    std::fs::write(&url, &original).unwrap();
    let e = engine(tmp.path());

    let res = e.apply(&req(&url)).expect("apply to .url");
    assert!(res.ok);
    let during = String::from_utf8(std::fs::read(&url).unwrap()).unwrap();
    assert!(during.contains("URL=steam://rungameid/570\r\n"), "URL kept");
    assert!(!during.contains("game.ico"));
    assert!(during.to_lowercase().contains(".ico"));

    e.restore(&res.target).unwrap();
    assert_eq!(std::fs::read(&url).unwrap(), original);
}

#[test]
fn picked_program_maps_back_to_nothing_outside_the_desktop() {
    // shortcuts_to only looks at the real desktops; a temp program has no shortcut there.
    let tmp = tempfile::tempdir().unwrap();
    let exe = tmp.path().join("tool.exe");
    std::fs::write(&exe, b"MZ").unwrap();
    assert!(iconmorph_core::platform::windows::shortcuts_to(&exe).is_empty());
    let c = WindowsAdapter::new().classify(&exe);
    assert!(!c.supported);
}

#[test]
fn live_helper_autostart_round_trips_in_the_user_run_key() {
    use iconmorph_core::platform::windows_live as live;
    let exe = std::env::temp_dir().join("iconmorph-test.exe");
    live::set_autostart(&exe, true).unwrap();
    assert!(live::autostart_enabled());
    live::set_autostart(&exe, false).unwrap();
    assert!(!live::autostart_enabled());
    live::set_autostart(&exe, false).unwrap(); // removing twice is fine
}
