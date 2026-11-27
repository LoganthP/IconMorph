//! The orchestrator. Every customization follows
//! Validate → Backup → Generate → Apply → Verify → Commit, with an operation journal so an
//! interrupted operation is rolled back the next time IconMorph starts (no resident service).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use base64::Engine as _;
use image::RgbaImage;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::compose::{compose, IconSpec};
use crate::encode::{self, IconFormat};
use crate::error::{CoreError, Result};
use crate::image_io;
use crate::palette::Swatch;
use crate::platform::{self, Capabilities, DesktopItem, PlatformAdapter};
use crate::store::{DesignRow, HistoryRow, SnapshotRow, Store};

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;
const MAX_BASE64_LEN: usize = 60 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub icons_dir: PathBuf,
    pub db_path: PathBuf,
}

impl AppPaths {
    /// Per-user persistent data directory (never a temp directory, because the OS keeps
    /// reading generated icons after IconMorph exits).
    pub fn for_current_user() -> Result<Self> {
        let dirs = directories::ProjectDirs::from("dev", "IconMorph", "IconMorph")
            .ok_or_else(|| CoreError::NotFound("user data directory".into()))?;
        Self::at(dirs.data_dir())
    }

    pub fn at(dir: &Path) -> Result<Self> {
        let icons_dir = dir.join("icons");
        std::fs::create_dir_all(&icons_dir)?;
        Ok(Self {
            data_dir: dir.to_path_buf(),
            icons_dir,
            db_path: dir.join("iconmorph.db"),
        })
    }
}

/// Where the character / image comes from.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SourceInput {
    #[default]
    None,
    /// A file the user picked in the native file dialog.
    #[serde(rename_all = "camelCase")]
    File {
        path: String,
        gif_frame: Option<u32>,
    },
    /// Encoded image bytes (e.g. an emoji rasterised by the UI).
    #[serde(rename_all = "camelCase")]
    Bytes {
        base64: String,
        gif_frame: Option<u32>,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRequest {
    pub target: String,
    pub spec: IconSpec,
    #[serde(default)]
    pub source: SourceInput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemResult {
    pub target: String,
    pub name: String,
    pub ok: bool,
    pub message: String,
    pub icon_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: &'static str,
    pub arch: &'static str,
    pub adapter: &'static str,
    pub environment: String,
    pub capabilities: Capabilities,
    pub desktop_dir: Option<String>,
    pub data_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReport {
    pub rolled_back: Vec<String>,
    pub failed: Vec<String>,
}

pub struct Engine {
    paths: AppPaths,
    store: Mutex<Store>,
    adapter: Box<dyn PlatformAdapter>,
    source_cache: Mutex<Option<(String, RgbaImage)>>,
}

fn name_of(p: &Path) -> String {
    platform::display_name(p)
}

impl Engine {
    pub fn open(paths: AppPaths) -> Result<Self> {
        let store = Store::open(&paths.db_path)?;
        Ok(Self::with_parts(paths, store, platform::native_adapter()))
    }

    pub fn with_parts(paths: AppPaths, store: Store, adapter: Box<dyn PlatformAdapter>) -> Self {
        Self {
            paths,
            store: Mutex::new(store),
            adapter,
            source_cache: Mutex::new(None),
        }
    }

    fn store(&self) -> std::sync::MutexGuard<'_, Store> {
        self.store.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn paths(&self) -> &AppPaths {
        &self.paths
    }

    pub fn adapter(&self) -> &dyn PlatformAdapter {
        self.adapter.as_ref()
    }

    pub fn platform_info(&self) -> PlatformInfo {
        PlatformInfo {
            os: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            adapter: self.adapter.id(),
            environment: self.adapter.environment(),
            capabilities: self.adapter.capabilities(),
            desktop_dir: self
                .adapter
                .desktop_dir()
                .ok()
                .map(|p| p.to_string_lossy().into_owned()),
            data_dir: self.paths.data_dir.to_string_lossy().into_owned(),
        }
    }

    /// Roll back operations left `pending` by a crash or power loss.
    pub fn recover(&self) -> Result<RecoveryReport> {
        let pending = self.store().pending_ops()?;
        let mut report = RecoveryReport {
            rolled_back: vec![],
            failed: vec![],
        };
        for op in pending {
            let target = PathBuf::from(&op.target_path);
            let result = match (&op.pre_state_json, target.exists()) {
                (Some(pre), true) => serde_json::from_str(pre)
                    .map_err(CoreError::from)
                    .and_then(|state| self.adapter.restore(&target, &state)),
                (None, _) => Ok(()), // failed before anything was changed
                (_, false) => Err(CoreError::NotFound(op.target_path.clone())),
            };
            let store = self.store();
            match result {
                Ok(()) => {
                    store.journal_finish(
                        &op.id,
                        "rolled_back",
                        Some("Recovered after interruption"),
                    )?;
                    store.log(
                        "recover",
                        &op.target_path,
                        &name_of(&target),
                        "rolled_back",
                        Some("Interrupted change was undone"),
                        None,
                    )?;
                    report.rolled_back.push(op.target_path);
                }
                Err(e) => {
                    store.journal_finish(&op.id, "failed", Some(&e.to_string()))?;
                    report.failed.push(op.target_path);
                }
            }
        }
        Ok(report)
    }

    // ---------- discovery ----------

    pub fn list_desktop(&self) -> Result<Vec<DesktopItem>> {
        let dir = self.adapter.desktop_dir()?;
        self.list_folder(&dir)
    }

    pub fn list_folder(&self, dir: &Path) -> Result<Vec<DesktopItem>> {
        let dir = strip_verbatim(std::fs::canonicalize(dir)?);
        let mut items = platform::list_items(self.adapter.as_ref(), &dir)?;
        self.annotate(&mut items)?;
        Ok(items)
    }

    pub fn inspect(&self, path: &str) -> Result<DesktopItem> {
        let p = canonical_target(path)?;
        let c = self.adapter.classify(&p);
        let mut items = vec![DesktopItem {
            path: p.to_string_lossy().into_owned(),
            name: name_of(&p),
            kind: c.kind,
            supported: c.supported,
            note: c.note,
            customized: false,
            icon_hash: None,
            modified_unix: None,
        }];
        self.annotate(&mut items)?;
        Ok(items.remove(0))
    }

    fn annotate(&self, items: &mut [DesktopItem]) -> Result<()> {
        let store = self.store();
        for it in items.iter_mut() {
            if let Some(c) = store.active_customization(&it.path)? {
                it.customized = true;
                it.icon_hash = Some(c.icon_hash);
            }
        }
        Ok(())
    }

    /// Items IconMorph has customized (and can restore), including ones not on the desktop.
    pub fn customized_items(&self) -> Result<Vec<crate::store::CustomizationRow>> {
        self.store().active_customizations()
    }

    // ---------- images ----------

    fn load_source(&self, src: &SourceInput) -> Result<Option<RgbaImage>> {
        let (key, frame) = match src {
            SourceInput::None => return Ok(None),
            SourceInput::File { path, gif_frame } => {
                let meta = std::fs::metadata(path)?;
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok());
                (
                    format!("f:{path}:{}:{mtime:?}:{gif_frame:?}", meta.len()),
                    *gif_frame,
                )
            }
            SourceInput::Bytes { base64, gif_frame } => {
                if base64.len() > MAX_BASE64_LEN {
                    return Err(CoreError::invalid("Image data is too large"));
                }
                (
                    format!("b:{}:{gif_frame:?}", hash_hex(base64.as_bytes())),
                    *gif_frame,
                )
            }
        };
        if let Some((k, img)) = self
            .source_cache
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .as_ref()
        {
            if *k == key {
                return Ok(Some(img.clone()));
            }
        }
        let bytes = match src {
            SourceInput::File { path, .. } => image_io::read_source_file(Path::new(path))?,
            SourceInput::Bytes { base64, .. } => B64
                .decode(base64.trim())
                .map_err(|_| CoreError::invalid("Image data is not valid base64"))?,
            SourceInput::None => unreachable!(),
        };
        let img = image_io::decode(&bytes, frame)?;
        *self.source_cache.lock().unwrap_or_else(|p| p.into_inner()) = Some((key, img.clone()));
        Ok(Some(img))
    }

    /// Release cached decoded images (called when the Studio closes or on exit).
    pub fn release_memory(&self) {
        *self.source_cache.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }

    pub fn render_master_with_layout(
        &self,
        spec: &IconSpec,
        src: &SourceInput,
    ) -> Result<(RgbaImage, Option<crate::compose::LayerLayout>)> {
        let img = self.load_source(src)?;
        crate::compose::compose_with_layout(spec, img.as_ref())
    }

    pub fn render_master(&self, spec: &IconSpec, src: &SourceInput) -> Result<RgbaImage> {
        let img = self.load_source(src)?;
        compose(spec, img.as_ref())
    }

    /// PNG preview at `size` (64–1024).
    pub fn preview_png(&self, spec: &IconSpec, src: &SourceInput, size: u32) -> Result<Vec<u8>> {
        let master = self.render_master(spec, src)?;
        let size = size.clamp(16, 1024);
        encode::png_bytes(&encode::render_size(&master, size, spec.layer.pixel_art))
    }

    pub fn export(
        &self,
        spec: &IconSpec,
        src: &SourceInput,
        format: IconFormat,
        dest: &Path,
    ) -> Result<u64> {
        let master = self.render_master(spec, src)?;
        let bytes = encode::encode(&master, format, spec.layer.pixel_art)?;
        platform::atomic_write(dest, &bytes)?;
        Ok(bytes.len() as u64)
    }

    pub fn gif_info(&self, path: &str) -> Result<image_io::GifInfo> {
        image_io::gif_info(&image_io::read_source_file(Path::new(path))?)
    }

    pub fn gif_thumbnails(&self, path: &str, max_frames: usize) -> Result<Vec<(usize, String)>> {
        let bytes = image_io::read_source_file(Path::new(path))?;
        Ok(
            image_io::gif_thumbnails(&bytes, max_frames.clamp(1, 120), 96)?
                .into_iter()
                .map(|(i, png)| (i, B64.encode(png)))
                .collect(),
        )
    }

    /// Store the native icon file under its content hash; identical icons are stored once.
    fn store_icon(&self, bytes: &[u8], format: IconFormat) -> Result<(String, PathBuf)> {
        let hash = hash_hex(bytes);
        let path = self
            .paths
            .icons_dir
            .join(format!("{}.{}", &hash[..32], format.extension()));
        if !path.exists() {
            platform::atomic_write(&path, bytes)?;
        }
        self.store().upsert_asset(
            &hash,
            format.extension(),
            &path.to_string_lossy(),
            bytes.len() as u64,
        )?;
        Ok((hash, path))
    }

    // ---------- apply / restore ----------

    fn validate_target(&self, target: &str) -> Result<(PathBuf, String, String)> {
        let target = canonical_target(target)?;
        let class = self.adapter.classify(&target);
        if !class.supported {
            return Err(CoreError::unsupported(
                class
                    .note
                    .unwrap_or_else(|| "This item cannot be customized here".into()),
            ));
        }
        let s = target.to_string_lossy().into_owned();
        let name = name_of(&target);
        Ok((target, s, name))
    }

    pub fn apply(&self, req: &ApplyRequest) -> Result<ItemResult> {
        // Validate
        let (target, target_s, name) = self.validate_target(&req.target)?;

        // Generate (before touching anything on disk)
        let spec = req.spec.sanitized();
        let master = self.render_master(&spec, &req.source)?;
        let format = self.adapter.capabilities().icon_format;
        let native = encode::encode(&master, format, spec.layer.pixel_art)?;
        let (hash, icon_path) = self.store_icon(&native, format)?;
        let preview = encode::png_bytes(&encode::render_size(&master, 256, spec.layer.pixel_art))?;
        let spec_json = serde_json::to_string(&spec)?;
        self.commit_icon(
            "apply", &target, &target_s, &name, &hash, &icon_path, &spec_json, &preview,
        )
    }

    /// Backup → Apply → Verify → Commit for an icon file that already exists on disk.
    #[allow(clippy::too_many_arguments)]
    fn commit_icon(
        &self,
        action: &str,
        target: &Path,
        target_s: &str,
        name: &str,
        hash: &str,
        icon_path: &Path,
        spec_json: &str,
        preview: &[u8],
    ) -> Result<ItemResult> {
        // Backup
        let pre_state = self.adapter.read_state(target)?;
        let pre_json = serde_json::to_string(&pre_state)?;
        let op_id = uuid::Uuid::new_v4().to_string();
        let new_backup = {
            let store = self.store();
            let inserted = store.insert_backup_if_absent(target_s, self.adapter.id(), &pre_json)?;
            store.journal_begin(&op_id, action, target_s, Some(&pre_json))?;
            inserted
        };

        // Apply + verify
        let outcome = self
            .adapter
            .apply(target, icon_path)
            .and_then(|_| self.adapter.verify(target, icon_path))
            .and_then(|ok| {
                if ok {
                    Ok(())
                } else {
                    Err(CoreError::platform(
                        "The change was written but the system reports a different icon",
                    ))
                }
            });

        let store = self.store();
        match outcome {
            Ok(()) => {
                // Commit
                store.record_customization(target_s, name, hash, spec_json, preview)?;
                store.journal_finish(&op_id, "committed", None)?;
                store.log(action, target_s, name, "success", None, Some(hash))?;
                Ok(ItemResult {
                    target: target_s.to_string(),
                    name: name.to_string(),
                    ok: true,
                    message: "Icon applied".into(),
                    icon_hash: Some(hash.to_string()),
                })
            }
            Err(e) => {
                drop(store);
                let rollback = self.adapter.restore(target, &pre_state);
                let store = self.store();
                match &rollback {
                    Ok(()) => {
                        store.journal_finish(&op_id, "rolled_back", Some(&e.to_string()))?;
                        if new_backup {
                            store.delete_backup(target_s)?;
                        }
                    }
                    Err(re) => {
                        store.journal_finish(
                            &op_id,
                            "failed",
                            Some(&format!("{e}; rollback failed: {re}")),
                        )?;
                    }
                }
                store.log(
                    action,
                    target_s,
                    name,
                    "failed",
                    Some(&e.to_string()),
                    Some(hash),
                )?;
                Err(e)
            }
        }
    }

    /// Every design applied to an item (newest first), with whether it can be re-applied.
    pub fn designs_for(&self, target: &str) -> Result<Vec<DesignRow>> {
        let key = canonical_target(target)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| target.to_string());
        self.store().designs_for(&key)
    }

    /// Re-apply a previously applied design using its stored native icon file
    /// (no image source needed), through the same backed-up, verified transaction.
    pub fn reapply_design(&self, design_id: i64) -> Result<ItemResult> {
        let d = self
            .store()
            .design(design_id)?
            .ok_or_else(|| CoreError::NotFound(format!("design {design_id}")))?;
        let icon_path = d
            .icon_path
            .map(PathBuf::from)
            .filter(|p| p.exists())
            .ok_or_else(|| {
                CoreError::NotFound(format!(
                    "The icon file for this {} design was cleaned up, so it can no longer be re-applied",
                    d.target_name
                ))
            })?;
        let (target, target_s, name) = self.validate_target(&d.target_path)?;
        self.commit_icon(
            "reapply",
            &target,
            &target_s,
            &name,
            &d.icon_hash,
            &icon_path,
            &d.spec_json,
            &d.preview_png,
        )
    }

    // ---------- desktop snapshots ----------

    /// Remember every currently applied design under `name`.
    pub fn create_snapshot(&self, name: &str) -> Result<SnapshotRow> {
        let name = name.trim();
        if name.is_empty() || name.len() > 80 {
            return Err(CoreError::invalid("Snapshot name must be 1–80 characters"));
        }
        let store = self.store();
        if store.active_customizations()?.is_empty() {
            return Err(CoreError::invalid(
                "Nothing is customized yet, so there is nothing to snapshot",
            ));
        }
        let id = store.create_snapshot(name)?;
        store
            .snapshots()?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or_else(|| CoreError::NotFound("snapshot".into()))
    }

    pub fn snapshots(&self) -> Result<Vec<SnapshotRow>> {
        self.store().snapshots()
    }

    pub fn delete_snapshot(&self, id: i64) -> Result<()> {
        self.store().delete_snapshot(id)
    }

    /// Return the desktop to a snapshot: re-apply each saved design, and restore the original
    /// icon of items customized since then. Every item reports its own outcome.
    pub fn restore_snapshot(&self, id: i64) -> Result<Vec<ItemResult>> {
        let (items, current) = {
            let store = self.store();
            if !store.snapshot_exists(id)? {
                return Err(CoreError::NotFound(format!("snapshot {id}")));
            }
            (store.snapshot_items(id)?, store.active_customizations()?)
        };
        let fail = |t: &str, n: &str, e: CoreError| ItemResult {
            target: t.to_string(),
            name: n.to_string(),
            ok: false,
            message: e.to_string(),
            icon_hash: None,
        };
        let mut out = Vec::new();
        for it in &items {
            let already = current
                .iter()
                .any(|c| c.target_path == it.target_path && c.icon_hash == it.icon_hash);
            if already {
                out.push(ItemResult {
                    target: it.target_path.clone(),
                    name: it.target_name.clone(),
                    ok: true,
                    message: "Already matches the snapshot".into(),
                    icon_hash: Some(it.icon_hash.clone()),
                });
                continue;
            }
            out.push(
                self.reapply_design(it.customization_id)
                    .unwrap_or_else(|e| fail(&it.target_path, &it.target_name, e)),
            );
        }
        for c in current {
            if !items.iter().any(|i| i.target_path == c.target_path) {
                out.push(
                    self.restore(&c.target_path)
                        .unwrap_or_else(|e| fail(&c.target_path, &c.target_name, e)),
                );
            }
        }
        Ok(out)
    }

    // ---------- colour + thumbnails ----------

    /// Dominant colours of a source (computed once per selection by the UI).
    pub fn palette(&self, src: &SourceInput, k: usize) -> Result<Vec<Swatch>> {
        let img = self
            .load_source(src)?
            .ok_or_else(|| CoreError::invalid("No image selected"))?;
        Ok(crate::palette::dominant_colors(&img, k))
    }

    /// A downscaled PNG of any supported image (e.g. a wallpaper for Desktop Theatre).
    pub fn image_thumbnail(&self, path: &str, max: u32) -> Result<Vec<u8>> {
        let bytes = image_io::read_source_file(Path::new(path))?;
        let img = image_io::decode(&bytes, None)?;
        encode::png_bytes(&crate::raster::fit_within(&img, max.clamp(16, 1920), false))
    }

    /// Apply many requests sequentially. One failure never stops the batch; each item reports
    /// its real outcome. `cancel` is checked between items.
    pub fn apply_batch(
        &self,
        reqs: &[ApplyRequest],
        cancel: &AtomicBool,
        mut progress: impl FnMut(usize, usize, &ItemResult),
    ) -> Vec<ItemResult> {
        let mut out = Vec::with_capacity(reqs.len());
        for (i, r) in reqs.iter().enumerate() {
            let res = if cancel.load(Ordering::Relaxed) {
                ItemResult {
                    target: r.target.clone(),
                    name: name_of(Path::new(&r.target)),
                    ok: false,
                    message: "Cancelled".into(),
                    icon_hash: None,
                }
            } else {
                self.apply(r).unwrap_or_else(|e| ItemResult {
                    target: r.target.clone(),
                    name: name_of(Path::new(&r.target)),
                    ok: false,
                    message: e.to_string(),
                    icon_hash: None,
                })
            };
            progress(i + 1, reqs.len(), &res);
            out.push(res);
        }
        out
    }

    /// Put the item back exactly as it was before IconMorph first touched it.
    pub fn restore(&self, target: &str) -> Result<ItemResult> {
        let key = canonical_target(target)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| target.to_string());
        let path = PathBuf::from(&key);
        let name = name_of(&path);
        let backup = self
            .store()
            .backup(&key)?
            .ok_or_else(|| CoreError::NotFound(format!("No IconMorph backup for {name}")))?;
        if !path.exists() {
            return Err(CoreError::NotFound(format!(
                "{name} no longer exists at {key}. Use 'Forget' to remove it from the list."
            )));
        }
        let state: serde_json::Value = serde_json::from_str(&backup)?;
        let op_id = uuid::Uuid::new_v4().to_string();
        let current = self.adapter.read_state(&path).ok().map(|s| s.to_string());
        self.store()
            .journal_begin(&op_id, "restore", &key, current.as_deref())?;
        let result = self.adapter.restore(&path, &state);
        let store = self.store();
        match result {
            Ok(()) => {
                store.deactivate(&key)?;
                store.delete_backup(&key)?;
                store.journal_finish(&op_id, "committed", None)?;
                store.log("restore", &key, &name, "success", None, None)?;
                Ok(ItemResult {
                    target: key,
                    name,
                    ok: true,
                    message: "Original icon restored".into(),
                    icon_hash: None,
                })
            }
            Err(e) => {
                store.journal_finish(&op_id, "failed", Some(&e.to_string()))?;
                store.log("restore", &key, &name, "failed", Some(&e.to_string()), None)?;
                Err(e)
            }
        }
    }

    pub fn restore_all(&self) -> Result<Vec<ItemResult>> {
        let targets = self.store().backed_up_targets()?;
        Ok(targets
            .iter()
            .map(|t| {
                self.restore(t).unwrap_or_else(|e| ItemResult {
                    target: t.clone(),
                    name: name_of(Path::new(t)),
                    ok: false,
                    message: e.to_string(),
                    icon_hash: None,
                })
            })
            .collect())
    }

    /// Drop the record of an item that was deleted or moved outside IconMorph.
    pub fn forget(&self, target: &str) -> Result<()> {
        let store = self.store();
        store.deactivate(target)?;
        store.delete_backup(target)?;
        store.log(
            "forget",
            target,
            &name_of(Path::new(target)),
            "success",
            None,
            None,
        )?;
        Ok(())
    }

    pub fn history(&self, limit: u32) -> Result<Vec<HistoryRow>> {
        self.store().history(limit.clamp(1, 1000))
    }

    pub fn icon_preview(&self, icon_hash: &str) -> Result<Option<String>> {
        Ok(self.store().preview_png(icon_hash)?.map(|b| B64.encode(b)))
    }

    /// Delete generated icon files no active customization uses. Returns bytes freed.
    pub fn cleanup_unused_icons(&self) -> Result<u64> {
        let store = self.store();
        let mut freed = 0;
        for (hash, path) in store.unreferenced_assets()? {
            let p = PathBuf::from(&path);
            if p.starts_with(&self.paths.icons_dir) {
                freed += std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                let _ = std::fs::remove_file(&p);
            }
            store.delete_asset(&hash)?;
        }
        Ok(freed)
    }

    pub fn storage_bytes(&self) -> u64 {
        std::fs::read_dir(&self.paths.icons_dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok()?.metadata().ok())
                    .map(|m| m.len())
                    .sum()
            })
            .unwrap_or(0)
    }

    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        self.store().get_setting(key)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        if key.len() > 64 || value.len() > 4096 {
            return Err(CoreError::invalid("Setting is too large"));
        }
        self.store().set_setting(key, value)
    }
}

/// Canonicalise a user-chosen target and refuse anything that is not an existing file or
/// folder. Symlinks/junctions are resolved so the real item is customized and backed up.
pub fn canonical_target(path: &str) -> Result<PathBuf> {
    if path.trim().is_empty() {
        return Err(CoreError::invalid("No item selected"));
    }
    let p = std::fs::canonicalize(path).map_err(|_| CoreError::NotFound(path.to_string()))?;
    if p.parent().is_none() {
        return Err(CoreError::invalid(
            "Drive and filesystem roots cannot be customized",
        ));
    }
    Ok(strip_verbatim(p))
}

/// On Windows `canonicalize` yields `\\?\C:\...` paths; the Shell APIs and stored keys use
/// ordinary paths. A no-op elsewhere.
pub fn strip_verbatim(p: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let s = p.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            if !rest.starts_with("UNC\\") {
                return PathBuf::from(rest);
            }
        }
    }
    p
}

pub fn hash_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
