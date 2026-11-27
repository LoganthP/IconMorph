//! IconMorph desktop shell: a thin, strongly typed IPC layer over `iconmorph-core`.
//! Heavy work runs on Tauri's blocking pool so the UI thread never stalls.
//!
//! Lifecycle: the app itself has no tray icon, no autostart and no background workers.
//! Closing the window releases cached images and exits the process completely. The only
//! background process is the opt-in *iconmorph Live* helper (`iconmorph --live`, Windows),
//! which runs only while the user has animated desktop icons turned on.

mod commands;
mod live;

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use iconmorph_core::engine::RecoveryReport;
use iconmorph_core::{AppPaths, Engine};
use tauri::{Manager, RunEvent};

pub struct AppState {
    pub engine: Arc<Engine>,
    pub cancel_batch: Arc<AtomicBool>,
    pub startup: Mutex<Option<StartupReport>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupReport {
    pub recovery: Option<RecoveryReport>,
    pub recovery_error: Option<String>,
}

pub fn run() {
    tune_allocator();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let paths = AppPaths::for_current_user()?;
            let engine = Engine::open(paths)?;
            // Finish or undo anything a crash interrupted, without a resident service.
            let (recovery, recovery_error) = match engine.recover() {
                Ok(r) => (Some(r), None),
                Err(e) => (None, Some(e.to_string())),
            };
            live::resume(&engine);
            app.manage(AppState {
                engine: Arc::new(engine),
                cancel_batch: Arc::new(AtomicBool::new(false)),
                startup: Mutex::new(Some(StartupReport {
                    recovery,
                    recovery_error,
                })),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::platform_info,
            commands::startup_report,
            commands::list_desktop,
            commands::list_folder,
            commands::inspect_item,
            commands::preview_icon,
            commands::apply_icon,
            commands::apply_batch,
            commands::cancel_batch,
            commands::restore_icon,
            commands::restore_all,
            commands::forget_item,
            commands::history,
            commands::customized_items,
            commands::icon_preview,
            commands::export_icon,
            commands::gif_info,
            commands::gif_thumbnails,
            commands::performance_stats,
            commands::cleanup_icons,
            commands::get_setting,
            commands::set_setting,
            commands::release_memory,
            commands::designs_for,
            commands::reapply_design,
            commands::create_snapshot,
            commands::list_snapshots,
            commands::delete_snapshot,
            commands::restore_snapshot,
            commands::source_palette,
            commands::image_thumbnail,
            commands::pick_target,
            live::live_status,
            live::live_enable,
            live::live_disable,
            live::live_set_autostart,
            live::live_run,
        ])
        .build(tauri::generate_context!())
        .expect("error while building IconMorph");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<AppState>() {
                state.engine.release_memory();
            }
        }
    });
}

/// `iconmorph --live`: the animated-icon helper. No window, no WebView.
pub fn run_live_helper() {
    if let Ok(paths) = AppPaths::for_current_user() {
        if let Err(e) = iconmorph_core::live::run_helper(paths) {
            eprintln!("iconmorph Live: {e}");
        }
    }
}

/// glibc keeps freed 1024 px render buffers (4–16 MB each) in the heap once its
/// dynamic mmap threshold has grown, so RSS climbs with every preview and never
/// comes back. A fixed threshold makes large buffers use mmap and return to the
/// OS on free. Measured on Linux: 318 MB → 147 MB RSS after rendering Themes.
#[cfg(all(target_os = "linux", target_env = "gnu"))]
fn tune_allocator() {
    // SAFETY: mallopt only adjusts allocator parameters; it is called once at
    // startup before any worker threads exist.
    unsafe {
        libc::mallopt(libc::M_MMAP_THRESHOLD, 64 * 1024);
        libc::mallopt(libc::M_TRIM_THRESHOLD, 128 * 1024);
    }
}

#[cfg(not(all(target_os = "linux", target_env = "gnu")))]
fn tune_allocator() {}
