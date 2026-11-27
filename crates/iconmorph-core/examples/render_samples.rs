//! Renders a contact sheet of every customization mode: `cargo run --example render_samples -- <svg> <out.png>`
use iconmorph_core::compose::{Appearance, Mode, ShapeKind};
use iconmorph_core::*;
use image::{imageops, Rgba, RgbaImage};

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let src = image_io::decode(&std::fs::read(&args[1])?, None)?;
    let mut specs = Vec::new();
    let mut s = IconSpec {
        mode: Mode::ClassicFolder,
        ..Default::default()
    };
    specs.push(s.clone());
    s.mode = Mode::FolderDecoration;
    s.layer.scale = 0.9;
    specs.push(s.clone());
    s.fill.appearance = Appearance::Glass;
    specs.push(s.clone());
    let mut f = IconSpec {
        mode: Mode::FullReplacement,
        ..Default::default()
    };
    specs.push(f.clone());
    f.effects.sticker = true;
    f.layer.rotation = -8.0;
    specs.push(f.clone());
    for (kind, app) in [
        (ShapeKind::Squircle, Appearance::Gradient),
        (ShapeKind::Circle, Appearance::Flat),
        (ShapeKind::Hexagon, Appearance::Glass),
    ] {
        let mut c = IconSpec {
            mode: Mode::CustomShape,
            ..Default::default()
        };
        c.shape.kind = kind;
        c.fill.appearance = app;
        c.fill.color = "#86EFAC".into();
        c.fill.color2 = "#60A5FA".into();
        specs.push(c);
    }
    let cell = 256u32;
    let mut sheet = RgbaImage::from_pixel(cell * 4, cell * 2 + 80, Rgba([248, 250, 252, 255]));
    for (i, sp) in specs.iter().enumerate() {
        let m = compose(sp, Some(&src))?;
        let small = encode::render_size(&m, cell - 16, false);
        imageops::overlay(
            &mut sheet,
            &small,
            ((i as u32 % 4) * cell + 8) as i64,
            ((i as u32 / 4) * cell + 8) as i64,
        );
    }
    // Native small sizes of the full replacement, to judge legibility at 16–64 px.
    let m = compose(&specs[3], Some(&src))?;
    let mut x = 8;
    for sz in [16u32, 24, 32, 48, 64] {
        imageops::overlay(
            &mut sheet,
            &encode::render_size(&m, sz, false),
            x,
            (cell * 2 + 8) as i64,
        );
        x += sz as i64 + 16;
    }
    sheet.save(&args[2]).map_err(CoreError::from)?;
    Ok(())
}
