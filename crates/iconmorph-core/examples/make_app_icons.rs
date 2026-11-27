//! Generates IconMorph's own application icons with the IconMorph engine.
//! `cargo run --example make_app_icons -- assets/brand/mark.svg src-tauri/icons`
use iconmorph_core::compose::{Appearance, Mode, ShapeKind};
use iconmorph_core::*;
use std::path::Path;

fn main() -> Result<()> {
    let a: Vec<String> = std::env::args().collect();
    let glyph = image_io::decode(&std::fs::read(&a[1])?, None)?;
    let out = Path::new(&a[2]);
    std::fs::create_dir_all(out)?;
    let mut s = IconSpec {
        mode: Mode::CustomShape,
        ..Default::default()
    };
    s.shape.kind = ShapeKind::Squircle;
    s.fill.appearance = Appearance::Gradient;
    s.fill.color = "#33493E".into(); // forest charcoal tile
    s.fill.color2 = "#293B32".into();
    s.shape.padding = 0.14;
    s.layer.scale = 1.12;
    let m = compose(&s, Some(&glyph))?;
    for (name, size) in [
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("icon.png", 512),
    ] {
        std::fs::write(
            out.join(name),
            encode::png_bytes(&encode::render_size(&m, size, false))?,
        )?;
    }
    std::fs::write(out.join("icon.ico"), encode::to_ico(&m, false)?)?;
    std::fs::write(out.join("icon.icns"), encode::to_icns(&m, false)?)?;
    Ok(())
}
