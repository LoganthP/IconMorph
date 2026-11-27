// Every IPC command is declared here so the capability file must grant it explicitly.
const COMMANDS: &[&str] = &[
    "platform_info",
    "startup_report",
    "list_desktop",
    "list_folder",
    "inspect_item",
    "preview_icon",
    "apply_icon",
    "apply_batch",
    "cancel_batch",
    "restore_icon",
    "restore_all",
    "forget_item",
    "history",
    "customized_items",
    "icon_preview",
    "export_icon",
    "gif_info",
    "gif_thumbnails",
    "performance_stats",
    "cleanup_icons",
    "get_setting",
    "set_setting",
    "release_memory",
    "designs_for",
    "reapply_design",
    "create_snapshot",
    "list_snapshots",
    "delete_snapshot",
    "restore_snapshot",
    "source_palette",
    "image_thumbnail",
    "pick_target",
    "live_status",
    "live_enable",
    "live_disable",
    "live_set_autostart",
    "live_run",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
