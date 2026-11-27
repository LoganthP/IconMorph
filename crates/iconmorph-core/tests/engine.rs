//! End-to-end tests of the engine: composition, encoders, safe decoding, and the full
//! backup → apply → verify → restore cycle on real temporary folders using the Linux
//! KDE (.directory) and launcher (.desktop) mechanisms, which need no desktop session.

use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use base64::Engine as _;
use iconmorph_core::compose::{Appearance, Mode, ShapeKind};
use iconmorph_core::compose::{FolderStyle, Texture};
use iconmorph_core::platform::linux::{Flavor, LinuxAdapter};
use iconmorph_core::platform::{Capabilities, Classification, ItemKind, PlatformAdapter};
use iconmorph_core::store::Store;
use iconmorph_core::*;
use image::{Rgba, RgbaImage};
use serde_json::Value;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

fn red_square(size: u32, pad: u32) -> RgbaImage {
    RgbaImage::from_fn(size, size, |x, y| {
        if x >= pad && y >= pad && x < size - pad && y < size - pad {
            Rgba([230, 30, 40, 255])
        } else {
            Rgba([0, 0, 0, 0])
        }
    })
}

fn png_b64(img: &RgbaImage) -> String {
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    B64.encode(out)
}

fn spec(mode: Mode) -> IconSpec {
    IconSpec {
        mode,
        ..Default::default()
    }
}

// ---------------------------------------------------------------- composition

#[test]
fn full_replacement_has_no_folder_graphic() {
    let mut s = spec(Mode::FullReplacement);
    s.effects.shadow = false;
    let out = compose(&s, Some(&red_square(64, 8))).unwrap();
    assert_eq!(out.dimensions(), (1024, 1024));
    // Corners stay transparent: the folder shape is gone entirely.
    assert_eq!(out.get_pixel(4, 4).0[3], 0);
    assert_eq!(out.get_pixel(1019, 1019).0[3], 0);
    // Trimmed source fills the box: centre and near-edge are red.
    let c = out.get_pixel(512, 512).0;
    assert!(c[0] > 200 && c[1] < 60 && c[3] == 255, "centre {c:?}");
    assert_eq!(
        out.get_pixel(130, 512).0[3],
        255,
        "trimmed source fills 85% of the box"
    );
    assert_eq!(out.get_pixel(100, 512).0[3], 0);
}

#[test]
fn folder_decoration_draws_folder_and_character() {
    let mut s = spec(Mode::FolderDecoration);
    s.fill.appearance = Appearance::Flat;
    s.fill.color = "#3366FF".into();
    s.layer.scale = 0.5;
    let out = compose(&s, Some(&red_square(32, 0))).unwrap();
    let front = out.get_pixel(120, 820).0; // folder front, away from the character
    assert_eq!(
        (front[0], front[1], front[2], front[3]),
        (0x33, 0x66, 0xFF, 255)
    );
    let mid = out.get_pixel(512, 590).0; // character on the folder front
    assert!(
        mid[0] > 200 && mid[2] < 80,
        "character expected, got {mid:?}"
    );
}

#[test]
fn classic_folder_needs_no_source_and_other_modes_do() {
    assert!(compose(&spec(Mode::ClassicFolder), None).is_ok());
    let err = compose(&spec(Mode::FullReplacement), None).unwrap_err();
    assert!(err.to_string().contains("Choose a character"));
}

#[test]
fn every_shape_renders() {
    for kind in [
        ShapeKind::RoundedSquare,
        ShapeKind::Squircle,
        ShapeKind::Circle,
        ShapeKind::Hexagon,
        ShapeKind::Capsule,
    ] {
        let mut s = spec(Mode::CustomShape);
        s.shape.kind = kind;
        s.shape.border_width = 12.0;
        s.fill.appearance = Appearance::Glass;
        let out = compose(&s, Some(&red_square(40, 4))).unwrap();
        assert_eq!(
            out.get_pixel(0, 0).0[3],
            0,
            "{kind:?} corner must be transparent"
        );
        assert!(out.get_pixel(512, 512).0[3] > 0);
    }
}

#[test]
fn flip_rotation_outline_and_pixel_art() {
    // Left half red, right half blue; flipping must swap them.
    let src = RgbaImage::from_fn(16, 16, |x, _| {
        if x < 8 {
            Rgba([255, 0, 0, 255])
        } else {
            Rgba([0, 0, 255, 255])
        }
    });
    let mut s = spec(Mode::FullReplacement);
    s.effects.shadow = false;
    s.layer.pixel_art = true;
    s.layer.flip_h = true;
    let out = compose(&s, Some(&src)).unwrap();
    assert_eq!(
        out.get_pixel(300, 512).0,
        [0, 0, 255, 255],
        "pixel art stays crisp and flipped"
    );
    assert_eq!(out.get_pixel(724, 512).0, [255, 0, 0, 255]);

    s.layer.flip_h = false;
    s.layer.rotation = 180.0;
    let rot = compose(&s, Some(&src)).unwrap();
    assert_eq!(rot.get_pixel(300, 512).0, [0, 0, 255, 255]);

    let mut o = spec(Mode::FullReplacement);
    o.effects.shadow = false;
    o.layer.scale = 0.6;
    o.effects.outline_width = 30.0;
    o.effects.outline_color = "#00FF00".into();
    let out = compose(&o, Some(&red_square(32, 0))).unwrap();
    // Just outside the character edge the outline colour appears.
    let edge = (512.0 - 0.6 * 922.0 / 2.0) as u32 - 10;
    let p = out.get_pixel(edge, 512).0;
    assert!(
        p[1] > 200 && p[0] < 60,
        "outline expected at x={edge}, got {p:?}"
    );
}

#[test]
fn hostile_spec_values_are_clamped() {
    let mut s = spec(Mode::FullReplacement);
    s.layer.scale = f32::NAN;
    s.layer.offset_x = 99.0;
    s.layer.opacity = -3.0;
    s.effects.outline_width = 1e9;
    let clean = s.sanitized();
    assert_eq!(clean.layer.scale, 0.85);
    assert_eq!(clean.layer.offset_x, 0.5);
    assert_eq!(clean.layer.opacity, 0.0);
    assert_eq!(clean.effects.outline_width, 64.0);
    // Fully transparent result is reported instead of producing an invisible icon.
    assert!(compose(&s, Some(&red_square(16, 0)))
        .unwrap_err()
        .to_string()
        .contains("transparent"));
    s.fill.color = "not-a-colour".into();
    s.mode = Mode::ClassicFolder;
    assert!(compose(&s, None).is_err());
}

// ---------------------------------------------------------------- encoders

#[test]
fn ico_contains_all_sizes_and_decodes() {
    let master = compose(&spec(Mode::ClassicFolder), None).unwrap();
    let ico_bytes = encode::to_ico(&master, false).unwrap();
    let dir = ico::IconDir::read(Cursor::new(&ico_bytes)).unwrap();
    let mut sizes: Vec<u32> = dir.entries().iter().map(|e| e.width()).collect();
    sizes.sort();
    assert_eq!(sizes, vec![16, 24, 32, 48, 64, 128, 256]);
    let img = image::load_from_memory(&ico_bytes).unwrap();
    assert_eq!(img.width(), 256);
    // Transparency survives the round trip.
    assert_eq!(img.to_rgba8().get_pixel(0, 0).0[3], 0);
}

#[test]
fn icns_contains_retina_sizes() {
    let master = compose(&spec(Mode::ClassicFolder), None).unwrap();
    let bytes = encode::to_icns(&master, false).unwrap();
    let fam = icns::IconFamily::read(Cursor::new(&bytes)).unwrap();
    let widths: Vec<u32> = fam
        .available_icons()
        .iter()
        .map(|t| t.pixel_width())
        .collect();
    assert!(widths.contains(&1024) && widths.contains(&16), "{widths:?}");
    // And IconMorph can import its own ICNS.
    let back = image_io::decode(&bytes, None).unwrap();
    assert_eq!(back.width(), 1024);
}

// ---------------------------------------------------------------- decoding safety

#[test]
fn rejects_garbage_and_oversized_images() {
    assert!(image_io::decode(b"definitely not an image", None).is_err());
    // A PNG header that claims 100000 x 100000 pixels.
    let mut png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR".to_vec();
    png.extend_from_slice(&100_000u32.to_be_bytes());
    png.extend_from_slice(&100_000u32.to_be_bytes());
    png.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
    let err = image_io::decode(&png, None).unwrap_err().to_string();
    assert!(!err.is_empty());
}

#[test]
fn svg_renders_and_external_files_are_not_read() {
    let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="20" height="10">
        <rect width="20" height="10" fill="#ff0000"/>
        <image href="/etc/hostname" width="20" height="10"/>
        <image xlink:href="file:///etc/passwd" width="20" height="10"/>
    </svg>"##;
    let img = image_io::decode(svg, None).unwrap();
    assert_eq!(img.dimensions(), (1024, 512));
    assert_eq!(
        img.get_pixel(500, 250).0,
        [255, 0, 0, 255],
        "external images must not be drawn"
    );
    let huge = vec![b' '; 6 * 1024 * 1024];
    let mut big = b"<svg ".to_vec();
    big.extend(huge);
    assert!(image_io::decode(&big, None).is_err());
}

fn three_frame_gif() -> Vec<u8> {
    use image::codecs::gif::GifEncoder;
    use image::{Delay, Frame};
    let mut out = Vec::new();
    {
        let mut enc = GifEncoder::new(&mut out);
        for c in [[255u8, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]] {
            let f = Frame::from_parts(
                RgbaImage::from_pixel(8, 8, Rgba(c)),
                0,
                0,
                Delay::from_numer_denom_ms(100, 1),
            );
            enc.encode_frame(f).unwrap();
        }
    }
    out
}

#[test]
fn gif_frames_can_be_selected() {
    let gif = three_frame_gif();
    let info = image_io::gif_info(&gif).unwrap();
    assert_eq!(info.frame_count, 3);
    assert_eq!(info.delays_ms, vec![100, 100, 100]);
    let f2 = image_io::gif_frame_image(&gif, 2).unwrap();
    let p = f2.get_pixel(4, 4).0;
    assert!(p[2] > 200 && p[0] < 50, "{p:?}");
    assert!(image_io::gif_frame_image(&gif, 7).is_err());
    assert_eq!(image_io::gif_thumbnails(&gif, 2, 32).unwrap().len(), 2);
}

// ---------------------------------------------------------------- engine + native

struct Fixture {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    engine: Engine,
}

fn fixture_with(adapter: Box<dyn PlatformAdapter>) -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    let paths = AppPaths::at(&root.join("appdata")).unwrap();
    let store = Store::open(&paths.db_path).unwrap();
    Fixture {
        engine: Engine::with_parts(paths, store, adapter),
        root,
        _tmp: tmp,
    }
}

fn kde() -> Fixture {
    fixture_with(Box::new(LinuxAdapter::new(Flavor::Kde, "KDE")))
}

fn req(target: &Path, mode: Mode) -> ApplyRequest {
    ApplyRequest {
        target: target.to_string_lossy().into_owned(),
        spec: spec(mode),
        source: SourceInput::Bytes {
            base64: png_b64(&red_square(48, 4)),
            gif_frame: None,
        },
    }
}

fn snapshot(dir: &Path) -> Vec<(String, Vec<u8>)> {
    let mut v: Vec<_> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap())
        .filter(|e| e.file_name() != ".directory")
        .map(|e| {
            (
                e.file_name().to_string_lossy().into_owned(),
                std::fs::read(e.path()).unwrap_or_default(),
            )
        })
        .collect();
    v.sort();
    v
}

#[test]
fn kde_folder_apply_verify_restore_cycle() {
    let fx = kde();
    let folder = fx.root.join("Personal");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("notes.txt"), b"hello").unwrap();
    let before = snapshot(&folder);

    // Apply full replacement
    let res = fx
        .engine
        .apply(&req(&folder, Mode::FullReplacement))
        .unwrap();
    assert!(res.ok);
    let dotdir = std::fs::read_to_string(folder.join(".directory")).unwrap();
    let icon = dotdir
        .lines()
        .find_map(|l| l.strip_prefix("Icon="))
        .unwrap()
        .to_string();
    assert!(
        Path::new(&icon).starts_with(&fx.engine.paths().icons_dir),
        "icon stored persistently"
    );
    let png = image::open(&icon).unwrap();
    assert_eq!(png.width(), 512);
    assert_eq!(snapshot(&folder), before, "folder contents unchanged");

    // Listing reports it as customized
    let items = fx.engine.list_folder(&fx.root).unwrap();
    let it = items.iter().find(|i| i.name == "Personal").unwrap();
    assert!(it.customized && it.kind == ItemKind::Folder);

    // Re-customize: the backup still holds the ORIGINAL state, not the first customization
    let mut second = req(&folder, Mode::CustomShape);
    second.spec.shape.kind = ShapeKind::Circle;
    let res2 = fx.engine.apply(&second).unwrap();
    assert_ne!(res.icon_hash, res2.icon_hash);

    // Restore removes the .directory file we created
    fx.engine.restore(&folder.to_string_lossy()).unwrap();
    assert!(!folder.join(".directory").exists());
    assert_eq!(snapshot(&folder), before);
    assert!(
        fx.engine.restore(&folder.to_string_lossy()).is_err(),
        "nothing left to restore"
    );

    let hist = fx.engine.history(10).unwrap();
    assert_eq!(
        hist.iter()
            .filter(|h| h.action == "apply" && h.outcome == "success")
            .count(),
        2
    );
    assert_eq!(hist[0].action, "restore");
}

#[test]
fn kde_restore_preserves_existing_directory_file() {
    let fx = kde();
    let folder = fx.root.join("Work");
    std::fs::create_dir(&folder).unwrap();
    let original = "[Dolphin]\nViewMode=1\n\n[Desktop Entry]\nIcon=folder-blue\n";
    std::fs::write(folder.join(".directory"), original).unwrap();
    fx.engine
        .apply(&req(&folder, Mode::FolderDecoration))
        .unwrap();
    let applied = std::fs::read_to_string(folder.join(".directory")).unwrap();
    assert!(applied.contains("ViewMode=1") && !applied.contains("folder-blue"));
    fx.engine.restore(&folder.to_string_lossy()).unwrap();
    assert_eq!(
        std::fs::read_to_string(folder.join(".directory")).unwrap(),
        original
    );
}

#[cfg(unix)]
#[test]
fn launcher_icon_is_replaced_and_restored_without_touching_other_keys() {
    use std::os::unix::fs::PermissionsExt;
    let fx = kde();
    let launcher = fx.root.join("Editor.desktop");
    let original = "[Desktop Entry]\nType=Application\nName=Editor\nExec=editor %F\nIcon=accessories-text-editor\n";
    std::fs::write(&launcher, original).unwrap();
    std::fs::set_permissions(&launcher, std::fs::Permissions::from_mode(0o755)).unwrap();

    let item = fx.engine.inspect(&launcher.to_string_lossy()).unwrap();
    assert_eq!(item.kind, ItemKind::Shortcut);
    assert_eq!(item.name, "Editor");

    fx.engine
        .apply(&req(&launcher, Mode::FullReplacement))
        .unwrap();
    let applied = std::fs::read_to_string(&launcher).unwrap();
    assert!(applied.contains("Exec=editor %F") && !applied.contains("accessories-text-editor"));
    assert_eq!(
        std::fs::metadata(&launcher).unwrap().permissions().mode() & 0o777,
        0o755
    );
    fx.engine.restore(&launcher.to_string_lossy()).unwrap();
    assert_eq!(std::fs::read_to_string(&launcher).unwrap(), original);
}

#[test]
fn unsupported_targets_are_refused_before_anything_changes() {
    let fx = kde();
    let file = fx.root.join("photo.txt");
    std::fs::write(&file, b"x").unwrap();
    let err = fx
        .engine
        .apply(&req(&file, Mode::FullReplacement))
        .unwrap_err();
    assert!(err.to_string().contains("Dolphin"), "{err}");
    assert!(fx
        .engine
        .apply(&req(&fx.root.join("missing"), Mode::FullReplacement))
        .is_err());
    assert!(fx.engine.history(10).unwrap().is_empty());
}

/// Adapter that writes a marker file but whose verification fails, to exercise rollback.
struct FlakyAdapter {
    verify_ok: bool,
    log: Mutex<Vec<String>>,
}

impl PlatformAdapter for FlakyAdapter {
    fn id(&self) -> &'static str {
        "flaky"
    }
    fn environment(&self) -> String {
        "test".into()
    }
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            folders: true,
            shortcuts: false,
            files: false,
            icon_format: IconFormat::Png,
            notes: vec![],
            status: "tested",
        }
    }
    fn desktop_dir(&self) -> Result<PathBuf> {
        Ok(std::env::temp_dir())
    }
    fn classify(&self, p: &Path) -> Classification {
        Classification {
            kind: ItemKind::Folder,
            supported: p.is_dir(),
            note: None,
        }
    }
    fn read_state(&self, t: &Path) -> Result<Value> {
        Ok(serde_json::json!({ "marker": std::fs::read_to_string(t.join("marker")).ok() }))
    }
    fn apply(&self, t: &Path, icon: &Path) -> Result<()> {
        self.log.lock().unwrap().push("apply".into());
        std::fs::write(t.join("marker"), icon.to_string_lossy().as_bytes())?;
        Ok(())
    }
    fn restore(&self, t: &Path, s: &Value) -> Result<()> {
        self.log.lock().unwrap().push("restore".into());
        match s["marker"].as_str() {
            Some(m) => std::fs::write(t.join("marker"), m)?,
            None => {
                let _ = std::fs::remove_file(t.join("marker"));
            }
        }
        Ok(())
    }
    fn verify(&self, _: &Path, _: &Path) -> Result<bool> {
        Ok(self.verify_ok)
    }
}

#[test]
fn failed_verification_rolls_back_and_drops_backup() {
    let fx = fixture_with(Box::new(FlakyAdapter {
        verify_ok: false,
        log: Mutex::new(vec![]),
    }));
    let folder = fx.root.join("Games");
    std::fs::create_dir(&folder).unwrap();
    let err = fx
        .engine
        .apply(&req(&folder, Mode::FullReplacement))
        .unwrap_err();
    assert!(err.to_string().contains("different icon"));
    assert!(!folder.join("marker").exists(), "change rolled back");
    assert!(
        fx.engine.restore(&folder.to_string_lossy()).is_err(),
        "no stale backup kept"
    );
    let h = fx.engine.history(5).unwrap();
    assert_eq!(h[0].outcome, "failed");
}

#[test]
fn interrupted_operation_is_rolled_back_on_next_start() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = AppPaths::at(&tmp.path().join("data")).unwrap();
    let folder = tmp.path().join("Research");
    std::fs::create_dir(&folder).unwrap();
    let key = std::fs::canonicalize(&folder)
        .unwrap()
        .to_string_lossy()
        .into_owned();
    {
        // Simulate a crash: the change reached disk but the journal was never committed.
        let store = Store::open(&paths.db_path).unwrap();
        store
            .journal_begin("op-1", "apply", &key, Some(r#"{"marker":null}"#))
            .unwrap();
        std::fs::write(folder.join("marker"), b"half-applied").unwrap();
    }
    let store = Store::open(&paths.db_path).unwrap();
    let engine = Engine::with_parts(
        paths,
        store,
        Box::new(FlakyAdapter {
            verify_ok: true,
            log: Mutex::new(vec![]),
        }),
    );
    let report = engine.recover().unwrap();
    assert_eq!(report.rolled_back, vec![key]);
    assert!(!folder.join("marker").exists());
    assert!(
        engine.recover().unwrap().rolled_back.is_empty(),
        "recovery is idempotent"
    );
}

#[test]
fn batch_reports_each_item_and_honours_cancel() {
    let fx = kde();
    let a = fx.root.join("A");
    let b = fx.root.join("B");
    std::fs::create_dir(&a).unwrap();
    std::fs::create_dir(&b).unwrap();
    let file = fx.root.join("c.txt");
    std::fs::write(&file, b"").unwrap();
    let reqs = vec![
        req(&a, Mode::FullReplacement),
        req(&file, Mode::FullReplacement),
        req(&b, Mode::ClassicFolder),
    ];
    let mut seen = 0;
    let results = fx
        .engine
        .apply_batch(&reqs, &AtomicBool::new(false), |done, total, _| {
            seen = done;
            assert_eq!(total, 3);
        });
    assert_eq!(seen, 3);
    assert_eq!(
        results.iter().map(|r| r.ok).collect::<Vec<_>>(),
        vec![true, false, true]
    );

    let cancelled = fx
        .engine
        .apply_batch(&reqs, &AtomicBool::new(true), |_, _, _| {});
    assert!(cancelled.iter().all(|r| !r.ok && r.message == "Cancelled"));

    let restored = fx.engine.restore_all().unwrap();
    assert_eq!(restored.len(), 2);
    assert!(restored.iter().all(|r| r.ok));
}

#[test]
fn identical_icons_are_stored_once_and_unused_icons_cleaned() {
    let fx = kde();
    let a = fx.root.join("A");
    let b = fx.root.join("B");
    std::fs::create_dir(&a).unwrap();
    std::fs::create_dir(&b).unwrap();
    fx.engine.apply(&req(&a, Mode::FullReplacement)).unwrap();
    fx.engine.apply(&req(&b, Mode::FullReplacement)).unwrap();
    assert_eq!(
        std::fs::read_dir(&fx.engine.paths().icons_dir)
            .unwrap()
            .count(),
        1,
        "deduplicated"
    );
    assert_eq!(
        fx.engine.cleanup_unused_icons().unwrap(),
        0,
        "in-use icons are kept"
    );
    fx.engine.restore_all().unwrap();
    assert!(fx.engine.cleanup_unused_icons().unwrap() > 0);
    assert_eq!(
        std::fs::read_dir(&fx.engine.paths().icons_dir)
            .unwrap()
            .count(),
        0
    );
}

#[test]
fn moved_items_can_be_forgotten() {
    let fx = kde();
    let a = fx.root.join("Travel");
    std::fs::create_dir(&a).unwrap();
    let res = fx.engine.apply(&req(&a, Mode::FullReplacement)).unwrap();
    std::fs::remove_dir_all(&a).unwrap();
    let err = fx.engine.restore(&res.target).unwrap_err().to_string();
    assert!(err.contains("Forget"), "{err}");
    fx.engine.forget(&res.target).unwrap();
    assert!(fx.engine.customized_items().unwrap().is_empty());
}

#[test]
fn preview_and_export_work_without_touching_the_system() {
    let fx = kde();
    let src = SourceInput::Bytes {
        base64: png_b64(&red_square(48, 4)),
        gif_frame: None,
    };
    let png = fx
        .engine
        .preview_png(&spec(Mode::FolderDecoration), &src, 256)
        .unwrap();
    assert_eq!(image::load_from_memory(&png).unwrap().width(), 256);
    for fmt in [IconFormat::Ico, IconFormat::Icns, IconFormat::Png] {
        let dest = fx.root.join(format!("out.{}", fmt.extension()));
        assert!(
            fx.engine
                .export(&spec(Mode::FullReplacement), &src, fmt, &dest)
                .unwrap()
                > 0
        );
        assert!(image_io::decode(&std::fs::read(&dest).unwrap(), None).is_ok());
    }
    let gif_path = fx.root.join("anim.gif");
    std::fs::write(&gif_path, three_frame_gif()).unwrap();
    let file_src = SourceInput::File {
        path: gif_path.to_string_lossy().into_owned(),
        gif_frame: Some(1),
    };
    assert!(fx
        .engine
        .preview_png(&spec(Mode::FullReplacement), &file_src, 128)
        .is_ok());
    assert!(fx.engine.history(10).unwrap().is_empty());
}

#[test]
fn schema_migrations_are_versioned() {
    let s = Store::open_in_memory().unwrap();
    assert_eq!(s.schema_version().unwrap(), 2);
    s.set_setting("theme", "dark").unwrap();
    s.set_setting("theme", "pastel").unwrap();
    assert_eq!(s.get_setting("theme").unwrap().as_deref(), Some("pastel"));
}

// ---------------------------------------------------------------- redesign additions

#[test]
fn layout_reports_where_the_character_really_is() {
    let mut s = spec(Mode::FullReplacement);
    s.effects.shadow = false;
    s.layer.offset_x = 0.1;
    let (img, lay) = compose_with_layout(&s, Some(&red_square(64, 8))).unwrap();
    let lay = lay.expect("layout for a character mode");
    assert!((lay.cx - (512.0 + 102.4)).abs() < 1.0, "cx {}", lay.cx);
    // The reported box edge matches the rendered pixels.
    let left = (lay.cx - lay.width / 2.0) as u32;
    assert_eq!(img.get_pixel(left + 2, lay.cy as u32).0[3], 255);
    assert_eq!(img.get_pixel(left - 3, lay.cy as u32).0[3], 0);
    assert!(compose_with_layout(&spec(Mode::ClassicFolder), None)
        .unwrap()
        .1
        .is_none());
}

#[test]
fn textures_folder_styles_corner_radius_and_padding_change_the_render() {
    let base = compose(&spec(Mode::ClassicFolder), None).unwrap();
    for t in [
        Texture::Dots,
        Texture::Stripes,
        Texture::Grid,
        Texture::Grain,
    ] {
        let mut s = spec(Mode::ClassicFolder);
        s.fill.texture = t;
        assert_ne!(compose(&s, None).unwrap(), base, "{t:?} must be visible");
    }
    for f in [FolderStyle::Rounded, FolderStyle::Minimal] {
        let mut s = spec(Mode::ClassicFolder);
        s.folder = f;
        assert_ne!(compose(&s, None).unwrap(), base, "{f:?} must differ");
    }
    // Corner radius 0 fills the tile corner; the default leaves it transparent.
    let mut sq = spec(Mode::CustomShape);
    sq.shape.kind = ShapeKind::RoundedSquare;
    let src = red_square(32, 0);
    assert_eq!(compose(&sq, Some(&src)).unwrap().get_pixel(60, 60).0[3], 0);
    sq.shape.corner_radius = 0.0;
    assert_eq!(
        compose(&sq, Some(&src)).unwrap().get_pixel(60, 60).0[3],
        255
    );
    // More padding means a smaller content box.
    let pad = |p: f32| {
        let mut s = spec(Mode::CustomShape);
        s.shape.padding = p;
        compose_with_layout(&s, Some(&src))
            .unwrap()
            .1
            .unwrap()
            .width
    };
    assert!(pad(0.35) < pad(0.1));
}

#[test]
fn previous_designs_can_be_reapplied_until_cleaned_up() {
    let fx = kde();
    let folder = fx.root.join("Music");
    std::fs::create_dir(&folder).unwrap();
    let first = fx
        .engine
        .apply(&req(&folder, Mode::FullReplacement))
        .unwrap();
    let mut r2 = req(&folder, Mode::CustomShape);
    r2.spec.shape.kind = ShapeKind::Hexagon;
    let second = fx.engine.apply(&r2).unwrap();

    let designs = fx.engine.designs_for(&first.target).unwrap();
    assert_eq!(designs.len(), 2);
    assert!(designs[0].active && !designs[1].active && designs[1].available);
    assert_eq!(designs[1].icon_hash, first.icon_hash.clone().unwrap());

    let back = fx.engine.reapply_design(designs[1].id).unwrap();
    assert_eq!(back.icon_hash, first.icon_hash);
    let active = fx.engine.customized_items().unwrap();
    assert_eq!(active[0].icon_hash, first.icon_hash.clone().unwrap());
    assert_eq!(fx.engine.history(1).unwrap()[0].action, "reapply");

    // The hexagon design is no longer active; cleanup removes its file, so it becomes unavailable.
    fx.engine.cleanup_unused_icons().unwrap();
    let designs = fx.engine.designs_for(&first.target).unwrap();
    assert!(designs
        .iter()
        .all(|d| d.icon_hash != second.icon_hash.clone().unwrap()));
}

#[test]
fn desktop_snapshots_restore_a_whole_arrangement() {
    let fx = kde();
    let [a, b, c] = ["A", "B", "C"].map(|n| {
        let p = fx.root.join(n);
        std::fs::create_dir(&p).unwrap();
        p
    });
    assert!(
        fx.engine.create_snapshot("empty").is_err(),
        "nothing to snapshot yet"
    );
    let ra = fx.engine.apply(&req(&a, Mode::FullReplacement)).unwrap();
    fx.engine.apply(&req(&b, Mode::FolderDecoration)).unwrap();
    let snap = fx.engine.create_snapshot("Spring desk").unwrap();
    assert_eq!(snap.item_count, 2);

    // Change things after the snapshot.
    fx.engine.apply(&req(&a, Mode::ClassicFolder)).unwrap();
    fx.engine.restore(&b.to_string_lossy()).unwrap();
    fx.engine.apply(&req(&c, Mode::CustomShape)).unwrap();

    // Snapshot-referenced icons survive cleanup.
    fx.engine.cleanup_unused_icons().unwrap();

    let results = fx.engine.restore_snapshot(snap.id).unwrap();
    assert_eq!(results.len(), 3, "{results:?}");
    assert!(results.iter().all(|r| r.ok), "{results:?}");
    let active = fx.engine.customized_items().unwrap();
    let hash_of = |p: &Path| {
        let target = iconmorph_core::engine::canonical_target(&p.to_string_lossy()).unwrap();
        active
            .iter()
            .find(|r| r.target_path == target.to_string_lossy())
            .map(|r| r.icon_hash.clone())
    };
    assert_eq!(hash_of(&a), ra.icon_hash);
    assert!(hash_of(&b).is_some(), "B re-customized");
    assert!(hash_of(&c).is_none(), "C back to original");
    assert!(!c.join(".directory").exists());

    fx.engine.delete_snapshot(snap.id).unwrap();
    assert!(fx.engine.snapshots().unwrap().is_empty());
    assert!(fx.engine.restore_snapshot(snap.id).is_err());
}

#[test]
fn palette_comes_from_the_selected_source() {
    let fx = kde();
    let src = SourceInput::Bytes {
        base64: png_b64(&red_square(48, 4)),
        gif_frame: None,
    };
    let p = fx.engine.palette(&src, 4).unwrap();
    assert_eq!(p[0].hex, "#E61E28");
    assert!(fx.engine.palette(&SourceInput::None, 4).is_err());
    let path = fx.root.join("wall.png");
    RgbaImage::from_pixel(800, 400, Rgba([10, 20, 30, 255]))
        .save(&path)
        .unwrap();
    let thumb = fx
        .engine
        .image_thumbnail(&path.to_string_lossy(), 200)
        .unwrap();
    assert_eq!(image::load_from_memory(&thumb).unwrap().width(), 200);
}

#[test]
fn v1_databases_migrate_without_losing_data() {
    let tmp = tempfile::tempdir().unwrap();
    let db = tmp.path().join("old.db");
    {
        let s = Store::open(&db).unwrap();
        s.upsert_asset("h1", "png", "/x.png", 10).unwrap();
        s.record_customization("/t", "T", "h1", "{}", b"png")
            .unwrap();
        s.insert_backup_if_absent("/t", "linux-kde", "{\"type\":\"kde\"}")
            .unwrap();
    }
    {
        // Turn it back into a v1 database.
        let c = rusqlite::Connection::open(&db).unwrap();
        c.execute_batch(
            "DROP TABLE snapshot_items; DROP TABLE desktop_snapshots; PRAGMA user_version = 1;",
        )
        .unwrap();
    }
    let s = Store::open(&db).unwrap();
    assert_eq!(s.schema_version().unwrap(), 2);
    assert_eq!(s.active_customizations().unwrap().len(), 1);
    assert!(
        s.backup("/t").unwrap().is_some(),
        "original backups preserved"
    );
    assert!(s.snapshots().unwrap().is_empty());
}
