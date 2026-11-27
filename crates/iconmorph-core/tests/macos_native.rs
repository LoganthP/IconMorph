//! Real macOS integration tests (run on macos-latest in CI) on temporary folders and files.
#![cfg(any(target_os = "macos", feature = "typecheck-macos"))]

use iconmorph_core::platform::macos::MacAdapter;
use iconmorph_core::store::Store;
use iconmorph_core::*;
use std::path::Path;

fn engine(dir: &Path) -> Engine {
    let paths = AppPaths::at(&dir.join("appdata")).unwrap();
    let store = Store::open(&paths.db_path).unwrap();
    Engine::with_parts(paths, store, Box::new(MacAdapter::new()))
}

fn req(target: &Path) -> ApplyRequest {
    serde_json::from_value(serde_json::json!({
        "target": target.to_string_lossy(), "spec": { "mode": "classicFolder" }, "source": { "type": "none" }
    }))
    .unwrap()
}

#[test]
fn folder_icon_round_trip() {
    let tmp = tempfile::tempdir().unwrap();
    let folder = tmp.path().join("Photos");
    std::fs::create_dir(&folder).unwrap();
    let e = engine(tmp.path());
    let res = e.apply(&req(&folder)).expect("apply");
    assert!(
        folder.join("Icon\r").exists(),
        "Finder custom icon file created"
    );
    e.restore(&res.target).expect("restore");
    assert!(
        !folder.join("Icon\r").exists(),
        "custom icon removed on restore"
    );
}

#[test]
fn app_bundles_are_refused() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("Fake.app");
    std::fs::create_dir(&app).unwrap();
    assert!(engine(tmp.path()).apply(&req(&app)).is_err());
}
