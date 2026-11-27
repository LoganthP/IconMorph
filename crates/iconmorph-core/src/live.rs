//! Live (animated) GIF icons.
//!
//! Operating systems only show still icons, so the applied icon stays a normal still frame
//! and nothing here changes how icons are applied or restored. For items the user opts
//! in, iconmorph pre-renders every GIF frame through the same composer as the still icon
//! and lists them in `live.json`. The separate, opt-in *iconmorph Live* helper (Windows,
//! see `platform::windows_live`) reads that file and plays the frames over the item's
//! desktop icon. Removing an item here (or restoring it) stops its animation; the still
//! icon is untouched either way.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::compose::{compose, IconSpec};
use crate::engine::{hash_hex, AppPaths};
use crate::error::{CoreError, Result};
use crate::{encode, image_io};

pub const CONFIG_FILE: &str = "live.json";
/// Frames are stored at this size; the helper scales them to the desktop icon size.
pub const FRAME_SIZE: u32 = 256;
/// Upper bound per item (≈ 10 s at 24 fps) to keep disk and memory small.
pub const MAX_FRAMES: usize = 240;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LiveFrame {
    pub file: String,
    pub delay_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LiveItem {
    /// Canonical path of the folder / shortcut whose desktop icon is animated.
    pub target: String,
    /// Directory holding the frame PNGs.
    pub dir: String,
    pub frames: Vec<LiveFrame>,
    pub pixel_art: bool,
    /// True if the GIF had more frames than `MAX_FRAMES`.
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LiveConfig {
    pub version: u32,
    pub items: Vec<LiveItem>,
}

impl Default for LiveConfig {
    fn default() -> Self {
        Self {
            version: 1,
            items: Vec::new(),
        }
    }
}

pub fn config_path(paths: &AppPaths) -> PathBuf {
    paths.data_dir.join(CONFIG_FILE)
}

fn frames_root(paths: &AppPaths) -> PathBuf {
    paths.data_dir.join("live")
}

/// Missing or unreadable config means "nothing is live".
pub fn load(paths: &AppPaths) -> LiveConfig {
    std::fs::read(config_path(paths))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn save(paths: &AppPaths, cfg: &LiveConfig) -> Result<()> {
    let path = config_path(paths);
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(cfg)?)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Same comparison the helper uses to match desktop items: case-insensitive, `\` == `/`.
pub fn same_target(a: &str, b: &str) -> bool {
    norm(a) == norm(b)
}

fn norm(p: &str) -> String {
    p.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

/// GIF delays of 0–10 ms mean "as fast as possible"; browsers play them at 100 ms.
pub fn normalize_delay(ms: u32) -> u32 {
    if ms <= 10 {
        100
    } else {
        ms.min(10_000)
    }
}

/// Render every frame of `gif` through the composer with `spec` and store them for the
/// helper. Frames are rendered and written one at a time, so memory stays flat.
pub fn prepare(paths: &AppPaths, target: &str, spec: &IconSpec, gif: &[u8]) -> Result<LiveItem> {
    let info = image_io::gif_info(gif)?;
    if info.frame_count < 2 {
        return Err(CoreError::invalid(
            "This GIF has a single frame, so there is nothing to animate",
        ));
    }
    let id = &hash_hex(norm(target).as_bytes())[..16];
    let dir = frames_root(paths).join(id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)?;
    }
    std::fs::create_dir_all(&dir)?;

    let mut frames = Vec::new();
    let mut truncated = info.truncated;
    let result = image_io::for_each_gif_frame(gif, |i, img, delay| {
        if i >= MAX_FRAMES {
            truncated = true;
            return Ok(false);
        }
        let master = compose(spec, Some(&img))?;
        let small = encode::render_size(&master, FRAME_SIZE, spec.layer.pixel_art);
        let file = format!("{i:04}.png");
        std::fs::write(dir.join(&file), encode::png_bytes(&small)?)?;
        frames.push(LiveFrame {
            file,
            delay_ms: normalize_delay(delay),
        });
        Ok(true)
    });
    if let Err(e) = result {
        let _ = std::fs::remove_dir_all(&dir);
        return Err(e);
    }
    Ok(LiveItem {
        target: target.to_string(),
        dir: dir.to_string_lossy().into_owned(),
        frames,
        pixel_art: spec.layer.pixel_art,
        truncated,
    })
}

/// Add or replace the entry for `item.target`.
pub fn upsert(paths: &AppPaths, item: LiveItem) -> Result<LiveConfig> {
    let mut cfg = load(paths);
    cfg.items.retain(|i| !same_target(&i.target, &item.target));
    cfg.items.push(item);
    save(paths, &cfg)?;
    Ok(cfg)
}

/// Stop animating `target` and delete its frames. Returns whether it was live.
pub fn remove(paths: &AppPaths, target: &str) -> Result<bool> {
    let mut cfg = load(paths);
    let before = cfg.items.len();
    let (gone, keep): (Vec<_>, Vec<_>) = cfg
        .items
        .into_iter()
        .partition(|i| same_target(&i.target, target));
    cfg.items = keep;
    for g in &gone {
        remove_frames(paths, &g.dir);
    }
    if cfg.items.len() != before {
        save(paths, &cfg)?;
    }
    Ok(!gone.is_empty())
}

/// Keep only items for which `keep` returns true (e.g. still customized).
pub fn retain(paths: &AppPaths, keep: impl Fn(&str) -> bool) -> Result<usize> {
    let cfg = load(paths);
    let mut removed = 0;
    for item in cfg.items.iter().filter(|i| !keep(&i.target)) {
        remove(paths, &item.target)?;
        removed += 1;
    }
    Ok(removed)
}

// ─────────────── the helper process (Windows only; a no-op elsewhere) ───────────────

#[cfg(any(windows, feature = "typecheck-windows"))]
use crate::platform::windows_live as helper;

/// Live playback needs the Windows helper.
pub fn helper_supported() -> bool {
    cfg!(windows)
}

pub fn helper_running() -> bool {
    #[cfg(any(windows, feature = "typecheck-windows"))]
    {
        helper::is_running()
    }
    #[cfg(not(any(windows, feature = "typecheck-windows")))]
    {
        false
    }
}

/// Make the helper match `live.json`: start it if items exist, or tell a running one to
/// reload (it exits by itself when nothing is left to play).
pub fn sync_helper(paths: &AppPaths, exe: &Path) -> Result<()> {
    #[cfg(any(windows, feature = "typecheck-windows"))]
    {
        if !load(paths).items.is_empty() || helper::is_running() {
            helper::start_or_reload(exe)?;
        }
        Ok(())
    }
    #[cfg(not(any(windows, feature = "typecheck-windows")))]
    {
        let _ = (paths, exe);
        Ok(())
    }
}

pub fn stop_helper() {
    #[cfg(any(windows, feature = "typecheck-windows"))]
    helper::stop();
}

pub fn set_autostart(exe: &Path, on: bool) -> Result<()> {
    #[cfg(any(windows, feature = "typecheck-windows"))]
    {
        helper::set_autostart(exe, on)
    }
    #[cfg(not(any(windows, feature = "typecheck-windows")))]
    {
        let _ = (exe, on);
        Err(CoreError::unsupported(
            "Live icons are available on Windows",
        ))
    }
}

pub fn autostart_enabled() -> bool {
    #[cfg(any(windows, feature = "typecheck-windows"))]
    {
        helper::autostart_enabled()
    }
    #[cfg(not(any(windows, feature = "typecheck-windows")))]
    {
        false
    }
}

/// Body of `iconmorph --live`.
pub fn run_helper(paths: AppPaths) -> Result<()> {
    #[cfg(any(windows, feature = "typecheck-windows"))]
    {
        helper::run(paths)
    }
    #[cfg(not(any(windows, feature = "typecheck-windows")))]
    {
        let _ = paths;
        Err(CoreError::unsupported(
            "Live icons are available on Windows",
        ))
    }
}

/// Only ever delete directories inside our own `live/` folder.
fn remove_frames(paths: &AppPaths, dir: &str) {
    let dir = Path::new(dir);
    if dir.parent() == Some(frames_root(paths).as_path()) {
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Delay, Frame, Rgba, RgbaImage};

    fn gif(frames: usize, delay_ms: u32) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut enc = image::codecs::gif::GifEncoder::new(&mut out);
            enc.set_repeat(image::codecs::gif::Repeat::Infinite)
                .unwrap();
            for i in 0..frames {
                let c = (i * 40 % 255) as u8;
                let img = RgbaImage::from_pixel(32, 32, Rgba([c, 255 - c, 90, 255]));
                enc.encode_frame(Frame::from_parts(
                    img,
                    0,
                    0,
                    Delay::from_numer_denom_ms(delay_ms, 1),
                ))
                .unwrap();
            }
        }
        out
    }

    fn spec() -> IconSpec {
        serde_json::from_value(serde_json::json!({ "mode": "fullReplacement" })).unwrap()
    }

    #[test]
    fn prepares_every_frame_and_round_trips_config() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = AppPaths::at(tmp.path()).unwrap();
        let item = prepare(
            &paths,
            "C:\\Users\\me\\Desktop\\Docker.lnk",
            &spec(),
            &gif(5, 80),
        )
        .unwrap();
        assert_eq!(item.frames.len(), 5);
        assert!(item.frames.iter().all(|f| f.delay_ms == 80));
        for f in &item.frames {
            let png = image::open(Path::new(&item.dir).join(&f.file)).unwrap();
            assert_eq!((png.width(), png.height()), (FRAME_SIZE, FRAME_SIZE));
        }
        upsert(&paths, item.clone()).unwrap();
        assert_eq!(load(&paths).items, vec![item.clone()]);

        // Re-enabling the same target (any case / slash style) replaces, never duplicates.
        let again = prepare(
            &paths,
            "c:/users/me/desktop/docker.lnk",
            &spec(),
            &gif(3, 0),
        )
        .unwrap();
        assert!(
            again.frames.iter().all(|f| f.delay_ms == 100),
            "0 ms → 100 ms"
        );
        upsert(&paths, again).unwrap();
        assert_eq!(load(&paths).items.len(), 1);

        assert!(remove(&paths, "C:\\Users\\me\\Desktop\\Docker.lnk").unwrap());
        assert!(load(&paths).items.is_empty());
        assert!(!Path::new(&item.dir).exists(), "frames deleted");
    }

    #[test]
    fn single_frame_gifs_are_refused() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = AppPaths::at(tmp.path()).unwrap();
        assert!(prepare(&paths, "x", &spec(), &gif(1, 50)).is_err());
    }

    #[test]
    fn retain_drops_items_no_longer_customized() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = AppPaths::at(tmp.path()).unwrap();
        for t in ["/d/a", "/d/b"] {
            let i = prepare(&paths, t, &spec(), &gif(2, 50)).unwrap();
            upsert(&paths, i).unwrap();
        }
        assert_eq!(retain(&paths, |t| t == "/d/a").unwrap(), 1);
        let left: Vec<_> = load(&paths).items.into_iter().map(|i| i.target).collect();
        assert_eq!(left, vec!["/d/a".to_string()]);
    }

    #[test]
    fn corrupt_config_reads_as_empty_and_never_deletes_outside_live_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = AppPaths::at(tmp.path()).unwrap();
        std::fs::write(config_path(&paths), b"{nope").unwrap();
        assert!(load(&paths).items.is_empty());

        let outside = tmp.path().join("precious");
        std::fs::create_dir(&outside).unwrap();
        let cfg = LiveConfig {
            version: 1,
            items: vec![LiveItem {
                target: "/x".into(),
                dir: outside.to_string_lossy().into_owned(),
                frames: vec![],
                pixel_art: false,
                truncated: false,
            }],
        };
        save(&paths, &cfg).unwrap();
        remove(&paths, "/x").unwrap();
        assert!(outside.exists());
    }
}
