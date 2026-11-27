//! Engine benchmark: `cargo run --release -p iconmorph-core --example bench_engine -- assets/characters/cat.svg`
//! Prints median timings. Apply/restore uses the Linux KDE mechanism on temp folders on Linux,
//! so it measures the engine path (generate, backup, write, verify, journal) without a desktop.
use iconmorph_core::compose::{Mode, ShapeKind};
use iconmorph_core::*;
use std::time::{Duration, Instant};

fn median(mut v: Vec<Duration>) -> f64 {
    v.sort();
    v[v.len() / 2].as_secs_f64() * 1000.0
}

fn time<T>(n: usize, mut f: impl FnMut() -> T) -> f64 {
    let _ = f();
    median(
        (0..n)
            .map(|_| {
                let t = Instant::now();
                let _ = f();
                t.elapsed()
            })
            .collect(),
    )
}

fn main() -> Result<()> {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "assets/characters/cat.svg".into());
    let bytes = std::fs::read(&path)?;
    let n = 15;
    println!("| Operation | Median (ms) |\n|---|---|");
    println!(
        "| Decode + rasterise SVG to 1024 px | {:.1} |",
        time(n, || image_io::decode(&bytes, None).unwrap())
    );
    let src = image_io::decode(&bytes, None)?;
    for (label, mode) in [
        ("Compose full replacement", Mode::FullReplacement),
        ("Compose folder + character", Mode::FolderDecoration),
        ("Compose custom shape", Mode::CustomShape),
    ] {
        let mut s = IconSpec {
            mode,
            ..Default::default()
        };
        s.shape.kind = ShapeKind::Squircle;
        println!(
            "| {label} (1024 px, shadow) | {:.1} |",
            time(n, || compose(&s, Some(&src)).unwrap())
        );
    }
    let master = compose(&IconSpec::default(), Some(&src))?;
    println!(
        "| Encode ICO (7 sizes) | {:.1} |",
        time(n, || encode::to_ico(&master, false).unwrap())
    );
    println!(
        "| Encode ICNS (10 images) | {:.1} |",
        time(n, || encode::to_icns(&master, false).unwrap())
    );
    println!(
        "| Encode PNG 512 | {:.1} |",
        time(n, || encode::encode(&master, IconFormat::Png, false)
            .unwrap())
    );

    #[cfg(target_os = "linux")]
    {
        use base64::Engine as _;
        use iconmorph_core::platform::linux::{Flavor, LinuxAdapter};
        let tmp = std::env::temp_dir().join(format!("iconmorph-bench-{}", std::process::id()));
        std::fs::create_dir_all(&tmp)?;
        let paths = AppPaths::at(&tmp.join("data"))?;
        let store = store::Store::open(&paths.db_path)?;
        let engine = Engine::with_parts(
            paths,
            store,
            Box::new(LinuxAdapter::new(Flavor::Kde, "bench")),
        );
        let b64 = base64::engine::general_purpose::STANDARD.encode(encode::png_bytes(&src)?);
        let folders: Vec<_> = (0..20)
            .map(|i| {
                let p = tmp.join(format!("F{i}"));
                std::fs::create_dir_all(&p).unwrap();
                p
            })
            .collect();
        let reqs: Vec<ApplyRequest> = folders
            .iter()
            .enumerate()
            .map(|(i, f)| {
                let mut spec = IconSpec::default();
                spec.layer.rotation = i as f32; // distinct icons, no dedup shortcut
                ApplyRequest {
                    target: f.to_string_lossy().into(),
                    spec,
                    source: SourceInput::Bytes {
                        base64: b64.clone(),
                        gif_frame: None,
                    },
                }
            })
            .collect();
        let t = Instant::now();
        let res = engine.apply_batch(
            &reqs,
            &std::sync::atomic::AtomicBool::new(false),
            |_, _, _| {},
        );
        let batch = t.elapsed().as_secs_f64() * 1000.0;
        assert!(res.iter().all(|r| r.ok));
        println!(
            "| Apply 20 folders (full transaction each) | {:.0} total · {:.1} per item |",
            batch,
            batch / 20.0
        );
        let t = Instant::now();
        engine.restore_all()?;
        println!(
            "| Restore 20 folders | {:.0} total |",
            t.elapsed().as_secs_f64() * 1000.0
        );
        println!(
            "| Icon storage for 20 icons | {} KB |",
            engine.storage_bytes() / 1024
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }
    Ok(())
}
