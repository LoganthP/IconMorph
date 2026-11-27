//! Tauri IPC commands. Inputs are typed and validated by serde and by the engine; outputs are
//! plain serialisable structs. Errors are returned as human-readable strings.

use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use base64::Engine as _;
use iconmorph_core::image_io::GifInfo;
use iconmorph_core::palette::Swatch;
use iconmorph_core::store::{CustomizationRow, DesignRow, HistoryRow, SnapshotRow};
use iconmorph_core::LayerLayout;
use iconmorph_core::{
    encode, ApplyRequest, CoreError, DesktopItem, Engine, IconFormat, IconSpec, ItemResult,
    PlatformInfo, SourceInput,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{AppState, StartupReport};

type CmdResult<T> = Result<T, CoreError>;
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

/// Run engine work on the blocking pool.
async fn blocking<T: Send + 'static>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Engine) -> CmdResult<T> + Send + 'static,
) -> CmdResult<T> {
    let engine: Arc<Engine> = state.engine.clone();
    tauri::async_runtime::spawn_blocking(move || f(&engine))
        .await
        .map_err(|e| CoreError::platform(format!("Worker failed: {e}")))?
}

#[tauri::command]
pub async fn platform_info(state: State<'_, AppState>) -> CmdResult<PlatformInfo> {
    blocking(&state, |e| Ok(e.platform_info())).await
}

#[tauri::command]
pub fn startup_report(state: State<'_, AppState>) -> Option<StartupReport> {
    state.startup.lock().ok().and_then(|mut s| s.take())
}

#[tauri::command]
pub async fn list_desktop(state: State<'_, AppState>) -> CmdResult<Vec<DesktopItem>> {
    blocking(&state, |e| e.list_desktop()).await
}

#[tauri::command]
pub async fn list_folder(state: State<'_, AppState>, path: String) -> CmdResult<Vec<DesktopItem>> {
    blocking(&state, move |e| e.list_folder(Path::new(&path))).await
}

#[tauri::command]
pub async fn inspect_item(state: State<'_, AppState>, path: String) -> CmdResult<DesktopItem> {
    blocking(&state, move |e| e.inspect(&path)).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSet {
    /// 512 px PNG, base64.
    pub large: String,
    /// Native sizes rendered by the same downscaler used for real icons.
    pub sizes: Vec<(u32, String)>,
    /// Where the character sits on the 1024 px master (None for the plain folder).
    pub layout: Option<LayerLayout>,
}

const DEFAULT_PREVIEW_SIZES: [u32; 7] = [16, 24, 32, 48, 64, 128, 256];

#[tauri::command]
pub async fn preview_icon(
    state: State<'_, AppState>,
    spec: IconSpec,
    source: SourceInput,
    sizes: Option<Vec<u32>>,
) -> CmdResult<PreviewSet> {
    let sizes = sizes.unwrap_or_else(|| DEFAULT_PREVIEW_SIZES.to_vec());
    if sizes.len() > 12 || sizes.iter().any(|s| !(8..=1024).contains(s)) {
        return Err(CoreError::invalid(
            "Preview sizes must be 8–1024 px, at most 12",
        ));
    }
    blocking(&state, move |e| {
        let (master, layout) = e.render_master_with_layout(&spec, &source)?;
        let mut chain = encode::SizeChain::new(&master, spec.layer.pixel_art);
        let large = B64.encode(encode::png_bytes(&chain.get(512))?);
        let mut out = Vec::with_capacity(sizes.len());
        for s in sizes {
            out.push((s, B64.encode(encode::png_bytes(&chain.get(s))?)));
        }
        Ok(PreviewSet {
            large,
            sizes: out,
            layout,
        })
    })
    .await
}

#[tauri::command]
pub async fn apply_icon(
    state: State<'_, AppState>,
    request: ApplyRequest,
) -> CmdResult<ItemResult> {
    blocking(&state, move |e| e.apply(&request)).await
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchProgress {
    done: usize,
    total: usize,
    result: ItemResult,
}

#[tauri::command]
pub async fn apply_batch(
    app: AppHandle,
    state: State<'_, AppState>,
    requests: Vec<ApplyRequest>,
) -> CmdResult<Vec<ItemResult>> {
    if requests.len() > 500 {
        return Err(CoreError::invalid("A batch can contain at most 500 items"));
    }
    let cancel = state.cancel_batch.clone();
    cancel.store(false, Ordering::Relaxed);
    blocking(&state, move |e| {
        Ok(e.apply_batch(&requests, &cancel, |done, total, result| {
            let _ = app.emit(
                "batch-progress",
                BatchProgress {
                    done,
                    total,
                    result: result.clone(),
                },
            );
        }))
    })
    .await
}

#[tauri::command]
pub fn cancel_batch(state: State<'_, AppState>) {
    state.cancel_batch.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub async fn restore_icon(state: State<'_, AppState>, target: String) -> CmdResult<ItemResult> {
    blocking(&state, move |e| {
        let r = e.restore(&target)?;
        crate::live::prune(e);
        Ok(r)
    })
    .await
}

#[tauri::command]
pub async fn restore_all(state: State<'_, AppState>) -> CmdResult<Vec<ItemResult>> {
    blocking(&state, |e| {
        let r = e.restore_all()?;
        crate::live::prune(e);
        Ok(r)
    })
    .await
}

#[tauri::command]
pub async fn forget_item(state: State<'_, AppState>, target: String) -> CmdResult<()> {
    blocking(&state, move |e| {
        e.forget(&target)?;
        crate::live::forget_target(e, &target);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn history(state: State<'_, AppState>, limit: u32) -> CmdResult<Vec<HistoryRow>> {
    blocking(&state, move |e| e.history(limit)).await
}

#[tauri::command]
pub async fn customized_items(state: State<'_, AppState>) -> CmdResult<Vec<CustomizationRow>> {
    blocking(&state, |e| e.customized_items()).await
}

#[tauri::command]
pub async fn icon_preview(state: State<'_, AppState>, hash: String) -> CmdResult<Option<String>> {
    blocking(&state, move |e| e.icon_preview(&hash)).await
}

#[tauri::command]
pub async fn export_icon(
    state: State<'_, AppState>,
    spec: IconSpec,
    source: SourceInput,
    format: IconFormat,
    dest: String,
) -> CmdResult<u64> {
    // The destination comes from the native save dialog; still refuse anything that is not
    // an icon file of the requested type.
    let ok_ext = Path::new(&dest)
        .extension()
        .map(|x| x.to_string_lossy().eq_ignore_ascii_case(format.extension()))
        .unwrap_or(false);
    if !ok_ext {
        return Err(CoreError::invalid(format!(
            "Export file name must end in .{}",
            format.extension()
        )));
    }
    blocking(&state, move |e| {
        e.export(&spec, &source, format, Path::new(&dest))
    })
    .await
}

#[tauri::command]
pub async fn gif_info(state: State<'_, AppState>, path: String) -> CmdResult<GifInfo> {
    blocking(&state, move |e| e.gif_info(&path)).await
}

#[tauri::command]
pub async fn gif_thumbnails(
    state: State<'_, AppState>,
    path: String,
    max_frames: usize,
) -> CmdResult<Vec<(usize, String)>> {
    blocking(&state, move |e| e.gif_thumbnails(&path, max_frames)).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceStats {
    /// Resident memory of the IconMorph core process (the system WebView runs separately).
    pub core_rss_bytes: Option<u64>,
    pub icon_storage_bytes: u64,
    pub icons_dir: String,
}

#[tauri::command]
pub async fn performance_stats(state: State<'_, AppState>) -> CmdResult<PerformanceStats> {
    blocking(&state, |e| {
        Ok(PerformanceStats {
            core_rss_bytes: memory_stats::memory_stats().map(|m| m.physical_mem as u64),
            icon_storage_bytes: e.storage_bytes(),
            icons_dir: e.paths().icons_dir.to_string_lossy().into_owned(),
        })
    })
    .await
}

#[tauri::command]
pub async fn cleanup_icons(state: State<'_, AppState>) -> CmdResult<u64> {
    blocking(&state, |e| e.cleanup_unused_icons()).await
}

#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> CmdResult<Option<String>> {
    blocking(&state, move |e| e.setting(&key)).await
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> CmdResult<()> {
    blocking(&state, move |e| e.set_setting(&key, &value)).await
}

#[tauri::command]
pub fn release_memory(state: State<'_, AppState>) {
    state.engine.release_memory();
}

#[tauri::command]
pub async fn designs_for(state: State<'_, AppState>, target: String) -> CmdResult<Vec<DesignRow>> {
    blocking(&state, move |e| e.designs_for(&target)).await
}

#[tauri::command]
pub async fn reapply_design(state: State<'_, AppState>, id: i64) -> CmdResult<ItemResult> {
    blocking(&state, move |e| {
        let r = e.reapply_design(id)?;
        if r.ok {
            crate::live::forget_target(e, &r.target);
        }
        Ok(r)
    })
    .await
}

#[tauri::command]
pub async fn create_snapshot(state: State<'_, AppState>, name: String) -> CmdResult<SnapshotRow> {
    blocking(&state, move |e| e.create_snapshot(&name)).await
}

#[tauri::command]
pub async fn list_snapshots(state: State<'_, AppState>) -> CmdResult<Vec<SnapshotRow>> {
    blocking(&state, |e| e.snapshots()).await
}

#[tauri::command]
pub async fn delete_snapshot(state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    blocking(&state, move |e| e.delete_snapshot(id)).await
}

#[tauri::command]
pub async fn restore_snapshot(state: State<'_, AppState>, id: i64) -> CmdResult<Vec<ItemResult>> {
    blocking(&state, move |e| {
        let r = e.restore_snapshot(id)?;
        crate::live::prune(e);
        Ok(r)
    })
    .await
}

/// Dominant colours of the selected asset, for the Chameleon accent engine.
#[tauri::command]
pub async fn source_palette(
    state: State<'_, AppState>,
    source: SourceInput,
) -> CmdResult<Vec<Swatch>> {
    blocking(&state, move |e| e.palette(&source, 5)).await
}

#[tauri::command]
pub async fn image_thumbnail(
    state: State<'_, AppState>,
    path: String,
    max: u32,
) -> CmdResult<String> {
    blocking(&state, move |e| {
        Ok(B64.encode(e.image_thumbnail(&path, max)?))
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedTarget {
    /// The folder or shortcut to customize.
    pub path: String,
    /// Set when the user picked an app (e.g. `brave.exe`) and the matching desktop shortcut
    /// was used instead.
    pub resolved_from: Option<String>,
}

/// Choose a folder or shortcut to customize.
///
/// On Windows this uses the Shell's own dialog with `FOS_NODEREFERENCELINKS`, because the
/// standard dialog follows shortcuts and returns the program (`Docker Desktop.exe`) instead
/// of the shortcut on the desktop. If a program is still picked, its desktop shortcut is
/// looked up. Other systems use the regular dialog.
#[tauri::command]
pub async fn pick_target(
    app: AppHandle,
    window: tauri::WebviewWindow,
    kind: String,
    default_dir: Option<String>,
) -> CmdResult<Option<PickedTarget>> {
    let folder = kind == "folder";
    let title = if folder {
        "Choose a folder to customize"
    } else {
        "Choose a shortcut to customize"
    };
    let start = default_dir.map(std::path::PathBuf::from);

    #[cfg(windows)]
    {
        let _ = (&app, title);
        let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        let picked = tauri::async_runtime::spawn_blocking(move || {
            iconmorph_core::platform::windows::pick_customizable(owner, folder, start.as_deref())
        })
        .await
        .map_err(|e| CoreError::platform(format!("Worker failed: {e}")))??;
        Ok(picked.map(|(target, from)| PickedTarget {
            path: target.to_string_lossy().into_owned(),
            resolved_from: from.map(|p| p.to_string_lossy().into_owned()),
        }))
    }

    #[cfg(not(windows))]
    {
        use tauri_plugin_dialog::DialogExt;
        tauri::async_runtime::spawn_blocking(move || {
            let mut b = app.dialog().file().set_title(title).set_parent(&window);
            if let Some(dir) = start {
                b = b.set_directory(dir);
            }
            let picked = if folder {
                b.blocking_pick_folder()
            } else {
                b.blocking_pick_file()
            };
            Ok(picked
                .and_then(|p| p.into_path().ok())
                .map(|p| PickedTarget {
                    path: p.to_string_lossy().into_owned(),
                    resolved_from: None,
                }))
        })
        .await
        .map_err(|e| CoreError::platform(format!("Worker failed: {e}")))?
    }
}
