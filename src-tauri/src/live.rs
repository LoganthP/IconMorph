//! Live GIF icons: IPC for the opt-in *iconmorph Live* helper (Windows).
//!
//! The applied icon is always a normal still icon written by the engine. These commands only
//! manage which customized items additionally play their GIF on the desktop, and the helper
//! process that does it. Nothing here runs unless the user turns it on for an item.

use base64::Engine as _;
use iconmorph_core::{
    engine::canonical_target, image_io, live, CoreError, Engine, IconSpec, SourceInput,
};
use serde::Serialize;
use tauri::State;

use crate::AppState;

type CmdResult<T> = Result<T, CoreError>;
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveEntry {
    pub target: String,
    pub frames: usize,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStatus {
    /// Live playback exists on this OS.
    pub supported: bool,
    pub running: bool,
    pub autostart: bool,
    pub items: Vec<LiveEntry>,
}

fn exe() -> CmdResult<std::path::PathBuf> {
    Ok(std::env::current_exe()?)
}

fn status(e: &Engine) -> LiveStatus {
    LiveStatus {
        supported: live::helper_supported(),
        running: live::helper_running(),
        autostart: live::autostart_enabled(),
        items: live::load(e.paths())
            .items
            .into_iter()
            .map(|i| LiveEntry {
                target: i.target,
                frames: i.frames.len(),
                truncated: i.truncated,
            })
            .collect(),
    }
}

/// After restores / snapshot restores / reapplying an older design: stop animating items
/// that are no longer customized (or whose design changed, see `forget_target`).
pub(crate) fn prune(e: &Engine) {
    let Ok(rows) = e.customized_items() else {
        return;
    };
    let removed = live::retain(e.paths(), |t| {
        rows.iter().any(|r| live::same_target(&r.target_path, t))
    })
    .unwrap_or(0);
    if removed > 0 {
        if let Ok(exe) = exe() {
            let _ = live::sync_helper(e.paths(), &exe);
        }
    }
}

/// The item got a different (still) design: its animation no longer matches.
pub(crate) fn forget_target(e: &Engine, target: &str) {
    if live::remove(e.paths(), target).unwrap_or(false) {
        if let Ok(exe) = exe() {
            let _ = live::sync_helper(e.paths(), &exe);
        }
    }
}

/// Called once when the app starts: resume playback the user had turned on.
pub(crate) fn resume(e: &Engine) {
    if live::helper_supported() && !live::load(e.paths()).items.is_empty() {
        if let Ok(exe) = exe() {
            let _ = live::sync_helper(e.paths(), &exe);
        }
    }
}

async fn blocking<T: Send + 'static>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Engine) -> CmdResult<T> + Send + 'static,
) -> CmdResult<T> {
    let engine = state.engine.clone();
    tauri::async_runtime::spawn_blocking(move || f(&engine))
        .await
        .map_err(|e| CoreError::platform(format!("Worker failed: {e}")))?
}

#[tauri::command]
pub async fn live_status(state: State<'_, AppState>) -> CmdResult<LiveStatus> {
    blocking(&state, |e| Ok(status(e))).await
}

/// Pre-render the GIF with the item's design and start (or refresh) the helper.
#[tauri::command]
pub async fn live_enable(
    state: State<'_, AppState>,
    target: String,
    spec: IconSpec,
    source: SourceInput,
) -> CmdResult<LiveStatus> {
    blocking(&state, move |e| {
        if !live::helper_supported() {
            return Err(CoreError::unsupported(
                "Animated desktop icons are available on Windows. Here the icon shows the frame you chose.",
            ));
        }
        let target = canonical_target(&target)?.to_string_lossy().into_owned();
        let customized = e
            .customized_items()?
            .iter()
            .any(|r| live::same_target(&r.target_path, &target));
        if !customized {
            return Err(CoreError::invalid(
                "Apply the design to this item first; the animation plays over its icon",
            ));
        }
        let gif = match &source {
            SourceInput::File { path, .. } => image_io::read_source_file(std::path::Path::new(path))?,
            SourceInput::Bytes { base64, .. } => B64
                .decode(base64.trim())
                .map_err(|_| CoreError::invalid("Image data is not valid base64"))?,
            SourceInput::None => return Err(CoreError::invalid("Choose a GIF first")),
        };
        let item = live::prepare(e.paths(), &target, &spec, &gif)?;
        live::upsert(e.paths(), item)?;
        live::sync_helper(e.paths(), &exe()?)?;
        Ok(status(e))
    })
    .await
}

#[tauri::command]
pub async fn live_disable(state: State<'_, AppState>, target: String) -> CmdResult<LiveStatus> {
    blocking(&state, move |e| {
        live::remove(e.paths(), &target)?;
        live::sync_helper(e.paths(), &exe()?)?;
        Ok(status(e))
    })
    .await
}

#[tauri::command]
pub async fn live_set_autostart(state: State<'_, AppState>, on: bool) -> CmdResult<LiveStatus> {
    blocking(&state, move |e| {
        live::set_autostart(&exe()?, on)?;
        Ok(status(e))
    })
    .await
}

/// Start the helper (if anything is live) or stop it.
#[tauri::command]
pub async fn live_run(state: State<'_, AppState>, on: bool) -> CmdResult<LiveStatus> {
    blocking(&state, move |e| {
        if on {
            live::sync_helper(e.paths(), &exe()?)?;
        } else {
            live::stop_helper();
        }
        // Give the helper a moment to register its window before reporting.
        std::thread::sleep(std::time::Duration::from_millis(400));
        Ok(status(e))
    })
    .await
}
