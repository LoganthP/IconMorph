//! Icon composition: turns a source image plus an [`IconSpec`] into a 1024x1024 master icon.
//!
//! Modes:
//! * `ClassicFolder`   – a styled folder with no character.
//! * `FolderDecoration` – a styled folder with the character placed on its front.
//! * `FullReplacement` – the character alone *is* the icon; no folder graphic.
//! * `CustomShape`     – the character on a circle / squircle / hexagon / capsule / tile.

use image::RgbaImage;
use resvg::tiny_skia::{
    self, Color, FillRule, FilterQuality, GradientStop, LinearGradient, Paint, Path, PathBuilder,
    Pixmap, PixmapPaint, Point, Rect, SpreadMode, Stroke, Transform,
};
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::limits::CANVAS;
use crate::raster;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    ClassicFolder,
    FolderDecoration,
    #[default]
    FullReplacement,
    CustomShape,
}

impl Mode {
    pub fn needs_layer(self) -> bool {
        !matches!(self, Mode::ClassicFolder)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Appearance {
    Flat,
    #[default]
    Gradient,
    Glass,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ShapeKind {
    #[default]
    RoundedSquare,
    Squircle,
    Circle,
    Hexagon,
    Capsule,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Fill {
    pub color: String,
    pub color2: String,
    pub appearance: Appearance,
    /// Subtle surface pattern on the folder front or shape.
    pub texture: Texture,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Texture {
    #[default]
    None,
    Dots,
    Stripes,
    Grid,
    Grain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum FolderStyle {
    /// Tab, back panel and a paper sheet.
    #[default]
    Classic,
    /// Softer, rounder silhouette with a wide tab.
    Rounded,
    /// No paper, flat tab, minimal folder.
    Minimal,
}

impl Default for Fill {
    fn default() -> Self {
        Self {
            color: "#E8A68C".into(),
            color2: "#E3C1D6".into(),
            appearance: Appearance::Gradient,
            texture: Texture::None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShapeStyle {
    pub kind: ShapeKind,
    pub border_width: f32,
    pub border_color: String,
    /// Corner radius of rounded squares as a fraction of the tile (0 – 0.5).
    pub corner_radius: f32,
    /// Space between the tile edge and the character as a fraction of the tile (0.02 – 0.4).
    pub padding: f32,
}

impl Default for ShapeStyle {
    fn default() -> Self {
        Self {
            kind: ShapeKind::RoundedSquare,
            border_width: 0.0,
            border_color: "#FFFFFF".into(),
            corner_radius: 0.22,
            padding: 0.19,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LayerTransform {
    /// Fraction of the available box the character occupies (0.1 – 1.5).
    pub scale: f32,
    /// Degrees, clockwise.
    pub rotation: f32,
    pub flip_h: bool,
    pub flip_v: bool,
    /// Offset as a fraction of the canvas (-0.5 – 0.5).
    pub offset_x: f32,
    pub offset_y: f32,
    pub opacity: f32,
    /// Nearest-neighbour scaling for pixel art.
    pub pixel_art: bool,
    /// Trim transparent margins before fitting.
    pub trim: bool,
}

impl Default for LayerTransform {
    fn default() -> Self {
        Self {
            scale: 0.85,
            rotation: 0.0,
            flip_h: false,
            flip_v: false,
            offset_x: 0.0,
            offset_y: 0.0,
            opacity: 1.0,
            pixel_art: false,
            trim: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Effects {
    pub shadow: bool,
    /// Outline thickness in master pixels (0 – 64).
    pub outline_width: f32,
    pub outline_color: String,
    /// Sticker look: thick white outline plus shadow.
    pub sticker: bool,
}

impl Default for Effects {
    fn default() -> Self {
        Self {
            shadow: true,
            outline_width: 0.0,
            outline_color: "#FFFFFF".into(),
            sticker: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct IconSpec {
    pub mode: Mode,
    pub folder: FolderStyle,
    pub fill: Fill,
    pub shape: ShapeStyle,
    pub layer: LayerTransform,
    pub effects: Effects,
}

impl IconSpec {
    /// Clamp all numeric inputs into safe ranges.
    pub fn sanitized(&self) -> IconSpec {
        let mut s = self.clone();
        let fin = |v: f32, d: f32| if v.is_finite() { v } else { d };
        s.layer.scale = fin(s.layer.scale, 0.85).clamp(0.1, 1.5);
        s.layer.rotation = fin(s.layer.rotation, 0.0).rem_euclid(360.0);
        s.layer.offset_x = fin(s.layer.offset_x, 0.0).clamp(-0.5, 0.5);
        s.layer.offset_y = fin(s.layer.offset_y, 0.0).clamp(-0.5, 0.5);
        s.layer.opacity = fin(s.layer.opacity, 1.0).clamp(0.0, 1.0);
        s.effects.outline_width = fin(s.effects.outline_width, 0.0).clamp(0.0, 64.0);
        s.shape.border_width = fin(s.shape.border_width, 0.0).clamp(0.0, 64.0);
        s.shape.corner_radius = fin(s.shape.corner_radius, 0.22).clamp(0.0, 0.5);
        s.shape.padding = fin(s.shape.padding, 0.19).clamp(0.02, 0.4);
        s
    }
}

/// Parse `#RGB`, `#RRGGBB` or `#RRGGBBAA`.
pub fn parse_color(s: &str) -> Result<Color> {
    let h = s.trim().trim_start_matches('#');
    let v = |i: usize| u8::from_str_radix(&h[i..i + 2], 16);
    let bad = || CoreError::invalid(format!("Invalid colour '{s}'"));
    let (r, g, b, a) = match h.len() {
        3 => {
            let e = |i: usize| u8::from_str_radix(&h[i..i + 1].repeat(2), 16);
            (
                e(0).map_err(|_| bad())?,
                e(1).map_err(|_| bad())?,
                e(2).map_err(|_| bad())?,
                255,
            )
        }
        6 => (
            v(0).map_err(|_| bad())?,
            v(2).map_err(|_| bad())?,
            v(4).map_err(|_| bad())?,
            255,
        ),
        8 => (
            v(0).map_err(|_| bad())?,
            v(2).map_err(|_| bad())?,
            v(4).map_err(|_| bad())?,
            v(6).map_err(|_| bad())?,
        ),
        _ => return Err(bad()),
    };
    Ok(Color::from_rgba8(r, g, b, a))
}

fn shade(c: Color, k: f32) -> Color {
    Color::from_rgba(
        (c.red() * k).clamp(0.0, 1.0),
        (c.green() * k).clamp(0.0, 1.0),
        (c.blue() * k).clamp(0.0, 1.0),
        c.alpha(),
    )
    .unwrap_or(c)
}

fn with_alpha(c: Color, a: f32) -> Color {
    let mut c = c;
    c.set_alpha((c.alpha() * a).clamp(0.0, 1.0));
    c
}

fn rrect(x: f32, y: f32, w: f32, h: f32, r: f32) -> Path {
    let r = r.min(w / 2.0).min(h / 2.0);
    let mut pb = PathBuilder::new();
    pb.move_to(x + r, y);
    pb.line_to(x + w - r, y);
    pb.quad_to(x + w, y, x + w, y + r);
    pb.line_to(x + w, y + h - r);
    pb.quad_to(x + w, y + h, x + w - r, y + h);
    pb.line_to(x + r, y + h);
    pb.quad_to(x, y + h, x, y + h - r);
    pb.line_to(x, y + r);
    pb.quad_to(x, y, x + r, y);
    pb.close();
    pb.finish().expect("valid rect path")
}

fn fill_paint(fill: &Fill, y0: f32, y1: f32) -> Result<Paint<'static>> {
    let c1 = parse_color(&fill.color)?;
    let c2 = parse_color(&fill.color2)?;
    let mut paint = Paint {
        anti_alias: true,
        ..Paint::default()
    };
    match fill.appearance {
        Appearance::Flat => paint.set_color(c1),
        Appearance::Gradient | Appearance::Glass => {
            let alpha = if fill.appearance == Appearance::Glass {
                0.55
            } else {
                1.0
            };
            paint.shader = LinearGradient::new(
                Point::from_xy(0.0, y0),
                Point::from_xy(0.0, y1),
                vec![
                    GradientStop::new(0.0, with_alpha(c1, alpha)),
                    GradientStop::new(1.0, with_alpha(c2, alpha)),
                ],
                SpreadMode::Pad,
                Transform::identity(),
            )
            .ok_or_else(|| CoreError::invalid("Could not build gradient"))?;
        }
    }
    Ok(paint)
}

fn glass_finish(pm: &mut Pixmap, path: &Path, y0: f32, y1: f32) {
    // Soft top highlight and a thin translucent rim.
    let mut hl = Paint {
        anti_alias: true,
        ..Paint::default()
    };
    if let Some(sh) = LinearGradient::new(
        Point::from_xy(0.0, y0),
        Point::from_xy(0.0, y0 + (y1 - y0) * 0.55),
        vec![
            GradientStop::new(0.0, Color::from_rgba8(255, 255, 255, 120)),
            GradientStop::new(1.0, Color::from_rgba8(255, 255, 255, 0)),
        ],
        SpreadMode::Pad,
        Transform::identity(),
    ) {
        hl.shader = sh;
        pm.fill_path(path, &hl, FillRule::Winding, Transform::identity(), None);
    }
    let mut rim = Paint {
        anti_alias: true,
        ..Paint::default()
    };
    rim.set_color(Color::from_rgba8(255, 255, 255, 170));
    pm.stroke_path(
        path,
        &rim,
        &Stroke {
            width: 8.0,
            ..Stroke::default()
        },
        Transform::identity(),
        None,
    );
}

/// Front panel of the folder; the decoration box sits inside it.
const FOLDER_FRONT: (f32, f32, f32, f32) = (72.0, 300.0, 880.0, 580.0);

fn fill_path(pm: &mut Pixmap, path: &Path, color: Color) {
    let mut p = Paint {
        anti_alias: true,
        ..Paint::default()
    };
    p.set_color(color);
    pm.fill_path(path, &p, FillRule::Winding, Transform::identity(), None);
}

/// Folder back panel with a tab whose shape depends on the style.
fn folder_back(style: FolderStyle) -> Path {
    let (l, t, r, b) = (88.0f32, 150.0f32, 936.0f32, 840.0f32);
    let (rad, tab_end, tab_h) = match style {
        FolderStyle::Classic => (48.0, 440.0, 68.0),
        FolderStyle::Rounded => (96.0, 520.0, 74.0),
        FolderStyle::Minimal => (40.0, 400.0, 40.0),
    };
    let t = if style == FolderStyle::Minimal {
        t + 40.0
    } else {
        t
    };
    let shelf = t + tab_h;
    let mut pb = PathBuilder::new();
    pb.move_to(l + rad, t);
    pb.line_to(tab_end - 40.0, t);
    pb.quad_to(tab_end - 12.0, t, tab_end, t + tab_h * 0.4);
    pb.quad_to(tab_end + 14.0, shelf, tab_end + 52.0, shelf);
    pb.line_to(r - rad, shelf);
    pb.quad_to(r, shelf, r, shelf + rad);
    pb.line_to(r, b - rad);
    pb.quad_to(r, b, r - rad, b);
    pb.line_to(l + rad, b);
    pb.quad_to(l, b, l, b - rad);
    pb.line_to(l, t + rad);
    pb.quad_to(l, t, l + rad, t);
    pb.close();
    pb.finish().expect("folder back")
}

fn draw_folder(pm: &mut Pixmap, fill: &Fill, style: FolderStyle) -> Result<()> {
    let base = parse_color(&fill.color)?;
    let glass = fill.appearance == Appearance::Glass;
    fill_path(
        pm,
        &folder_back(style),
        with_alpha(shade(base, 0.8), if glass { 0.6 } else { 1.0 }),
    );
    if style != FolderStyle::Minimal {
        let sheet = rrect(130.0, 250.0, 764.0, 300.0, 28.0);
        fill_path(pm, &sheet, Color::from_rgba8(255, 255, 255, 235));
    }
    let (x, y, w, h) = FOLDER_FRONT;
    let radius = match style {
        FolderStyle::Classic => 56.0,
        FolderStyle::Rounded => 120.0,
        FolderStyle::Minimal => 44.0,
    };
    let front = rrect(x, y, w, h, radius);
    let paint = fill_paint(fill, y, y + h)?;
    pm.fill_path(
        &front,
        &paint,
        FillRule::Winding,
        Transform::identity(),
        None,
    );
    apply_texture(pm, &front, fill.texture);
    if glass {
        glass_finish(pm, &front, y, y + h);
    } else {
        let lip = rrect(x + radius * 0.6, y + 14.0, w - radius * 1.2, 10.0, 5.0);
        fill_path(pm, &lip, Color::from_rgba8(255, 255, 255, 70));
    }
    Ok(())
}

/// Overlay a subtle pattern, clipped to `clip`.
fn apply_texture(pm: &mut Pixmap, clip: &Path, texture: Texture) {
    if texture == Texture::None {
        return;
    }
    let Some(mut mask) = tiny_skia::Mask::new(pm.width(), pm.height()) else {
        return;
    };
    mask.fill_path(clip, FillRule::Winding, true, Transform::identity());
    let c = CANVAS as f32;
    let mut pb = PathBuilder::new();
    let white = Color::from_rgba8(255, 255, 255, 46);
    match texture {
        Texture::Dots => {
            let step = 46.0;
            let mut yy = step / 2.0;
            let mut row = 0;
            while yy < c {
                let mut xx = if row % 2 == 0 { step / 2.0 } else { step };
                while xx < c {
                    pb.push_circle(xx, yy, 7.0);
                    xx += step;
                }
                yy += step * 0.866;
                row += 1;
            }
        }
        Texture::Stripes => {
            let mut k = -c;
            while k < c {
                pb.move_to(k, c);
                pb.line_to(k + 22.0, c);
                pb.line_to(k + 22.0 + c, 0.0);
                pb.line_to(k + c, 0.0);
                pb.close();
                k += 64.0;
            }
        }
        Texture::Grid => {
            let mut k = 0.0;
            while k < c {
                if let Some(r) = Rect::from_xywh(k, 0.0, 4.0, c) {
                    pb.push_rect(r);
                }
                if let Some(r) = Rect::from_xywh(0.0, k, c, 4.0) {
                    pb.push_rect(r);
                }
                k += 56.0;
            }
        }
        Texture::Grain => {
            // Deterministic speckle (xorshift) so the same design always renders the same.
            let mut st: u32 = 0x9E37_79B9;
            for _ in 0..5200 {
                st ^= st << 13;
                st ^= st >> 17;
                st ^= st << 5;
                let x = (st % 1024) as f32;
                let y = ((st >> 10) % 1024) as f32;
                if let Some(r) = Rect::from_xywh(x, y, 3.0, 3.0) {
                    pb.push_rect(r);
                }
            }
        }
        Texture::None => {}
    }
    if let Some(path) = pb.finish() {
        let mut p = Paint {
            anti_alias: true,
            ..Paint::default()
        };
        p.set_color(white);
        pm.fill_path(
            &path,
            &p,
            FillRule::Winding,
            Transform::identity(),
            Some(&mask),
        );
    }
}

const SHAPE_INSET: f32 = 56.0;

fn shape_path(shape: &ShapeStyle) -> Path {
    let c = CANVAS as f32;
    let s = c - 2.0 * SHAPE_INSET;
    match shape.kind {
        ShapeKind::RoundedSquare => rrect(SHAPE_INSET, SHAPE_INSET, s, s, s * shape.corner_radius),
        ShapeKind::Circle => PathBuilder::from_circle(c / 2.0, c / 2.0, s / 2.0).expect("circle"),
        ShapeKind::Capsule => {
            let h = s * 0.66;
            rrect(SHAPE_INSET, (c - h) / 2.0, s, h, h / 2.0)
        }
        ShapeKind::Squircle => {
            let (cx, r, n) = (c / 2.0, s / 2.0, 5.0f32);
            let mut pb = PathBuilder::new();
            for i in 0..=256 {
                let t = i as f32 / 256.0 * std::f32::consts::TAU;
                let (ct, st) = (t.cos(), t.sin());
                let x = cx + r * ct.signum() * ct.abs().powf(2.0 / n);
                let y = cx + r * st.signum() * st.abs().powf(2.0 / n);
                if i == 0 {
                    pb.move_to(x, y)
                } else {
                    pb.line_to(x, y)
                }
            }
            pb.close();
            pb.finish().expect("squircle")
        }
        ShapeKind::Hexagon => {
            let (cx, r) = (c / 2.0, s / 2.0);
            let mut pb = PathBuilder::new();
            for i in 0..6 {
                let a = std::f32::consts::FRAC_PI_3 * i as f32 - std::f32::consts::FRAC_PI_6;
                let (x, y) = (cx + r * a.cos(), cx + r * a.sin());
                if i == 0 {
                    pb.move_to(x, y)
                } else {
                    pb.line_to(x, y)
                }
            }
            pb.close();
            pb.finish().expect("hexagon")
        }
    }
}

fn draw_shape(pm: &mut Pixmap, fill: &Fill, shape: &ShapeStyle) -> Result<Rect> {
    let path = shape_path(shape);
    let b = path.bounds();
    let paint = fill_paint(fill, b.top(), b.bottom())?;
    pm.fill_path(
        &path,
        &paint,
        FillRule::Winding,
        Transform::identity(),
        None,
    );
    apply_texture(pm, &path, fill.texture);
    if fill.appearance == Appearance::Glass {
        glass_finish(pm, &path, b.top(), b.bottom());
    }
    if shape.border_width > 0.0 {
        let mut p = Paint {
            anti_alias: true,
            ..Paint::default()
        };
        p.set_color(parse_color(&shape.border_color)?);
        let stroke = Stroke {
            width: shape.border_width,
            ..Stroke::default()
        };
        pm.stroke_path(&path, &p, &stroke, Transform::identity(), None);
    }
    let k = shape.padding;
    Ok(Rect::from_xywh(
        b.left() + b.width() * k,
        b.top() + b.height() * k,
        b.width() * (1.0 - 2.0 * k),
        b.height() * (1.0 - 2.0 * k),
    )
    .expect("content box"))
}

/// Render the character into its own transparent layer, positioned inside `bx`.
///
/// The source is resampled once, directly to its final size (area-averaging when shrinking,
/// Catmull-Rom when enlarging, nearest for pixel art), and then only translated / rotated.
/// This is both sharper and much faster than a bicubic transform of the full-size source.
fn render_layer(src: &RgbaImage, bx: Rect, t: &LayerTransform) -> (Pixmap, LayerLayout) {
    use image::imageops::FilterType;
    let src = if t.trim {
        raster::trim_transparent(src)
    } else {
        src.clone()
    };
    let (w, h) = (src.width() as f32, src.height() as f32);
    let fit = (bx.width() / w).min(bx.height() / h) * t.scale;
    let tw = ((w * fit).round() as u32).clamp(1, CANVAS * 2);
    let th = ((h * fit).round() as u32).clamp(1, CANVAS * 2);
    let filter = if t.pixel_art {
        FilterType::Nearest
    } else if tw < src.width() {
        FilterType::Triangle
    } else {
        FilterType::CatmullRom
    };
    let sized = raster::rgba_to_pixmap(&raster::resize_premultiplied(&src, tw, th, filter));

    let cx = bx.left() + bx.width() / 2.0 + t.offset_x * CANVAS as f32;
    let cy = bx.top() + bx.height() / 2.0 + t.offset_y * CANVAS as f32;
    let rotated = t.rotation.rem_euclid(360.0) > 0.01;
    let (fx, fy) = (
        if t.flip_h { -1.0 } else { 1.0 },
        if t.flip_v { -1.0 } else { 1.0 },
    );
    // Snap to whole pixels when not rotating so the copy stays crisp.
    let (cx, cy) = if rotated {
        (cx, cy)
    } else {
        (
            (cx - tw as f32 / 2.0).round() + tw as f32 / 2.0,
            (cy - th as f32 / 2.0).round() + th as f32 / 2.0,
        )
    };
    let tr = Transform::from_translate(cx, cy)
        .pre_rotate(t.rotation)
        .pre_scale(fx, fy)
        .pre_translate(-(tw as f32) / 2.0, -(th as f32) / 2.0);
    let quality = if rotated && !t.pixel_art {
        FilterQuality::Bilinear
    } else {
        FilterQuality::Nearest
    };
    let mut layer = Pixmap::new(CANVAS, CANVAS).expect("canvas");
    let paint = PixmapPaint {
        opacity: t.opacity,
        quality,
        ..PixmapPaint::default()
    };
    layer.draw_pixmap(0, 0, sized.as_ref(), &paint, tr, None);
    let layout = LayerLayout {
        cx,
        cy,
        width: tw as f32,
        height: th as f32,
        rotation: t.rotation,
        content_box: [bx.left(), bx.top(), bx.width(), bx.height()],
        canvas: CANVAS,
    };
    (layer, layout)
}

/// Where the character ended up on the 1024 px master, so the UI can draw handles and
/// guides that match the real render exactly.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayerLayout {
    pub cx: f32,
    pub cy: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: f32,
    /// The box the character is fitted into: [x, y, w, h].
    pub content_box: [f32; 4],
    pub canvas: u32,
}

/// Solid-colour silhouette of a layer's alpha.
fn silhouette(layer: &Pixmap, color: Color) -> Pixmap {
    let mut out = Pixmap::new(layer.width(), layer.height()).expect("size");
    let c = color.to_color_u8();
    for (d, s) in out.pixels_mut().iter_mut().zip(layer.pixels()) {
        let a = ((s.alpha() as u32 * c.alpha() as u32) / 255) as u8;
        *d = tiny_skia::ColorU8::from_rgba(c.red(), c.green(), c.blue(), a).premultiply();
    }
    out
}

fn add_outline(layer: &Pixmap, width: f32, color: Color) -> Pixmap {
    let sil = silhouette(layer, color);
    let mut out = Pixmap::new(layer.width(), layer.height()).expect("size");
    let steps = 32;
    for ring in [width, width * 0.5] {
        for i in 0..steps {
            let a = i as f32 / steps as f32 * std::f32::consts::TAU;
            let (dx, dy) = (ring * a.cos(), ring * a.sin());
            out.draw_pixmap(
                0,
                0,
                sil.as_ref(),
                &PixmapPaint::default(),
                Transform::from_translate(dx, dy),
                None,
            );
        }
    }
    out.draw_pixmap(
        0,
        0,
        layer.as_ref(),
        &PixmapPaint::default(),
        Transform::identity(),
        None,
    );
    out
}

fn add_shadow(layer: &Pixmap) -> Pixmap {
    // Build and blur the shadow at quarter resolution, then scale it back up: a soft shadow
    // has no fine detail, so this is visually identical and ~10x cheaper.
    const Q: u32 = 4;
    let mut small = Pixmap::new(CANVAS / Q, CANVAS / Q).expect("size");
    let down = PixmapPaint {
        quality: FilterQuality::Bilinear,
        ..PixmapPaint::default()
    };
    small.draw_pixmap(
        0,
        0,
        layer.as_ref(),
        &down,
        Transform::from_scale(1.0 / Q as f32, 1.0 / Q as f32),
        None,
    );
    let sil = silhouette(&small, Color::from_rgba8(15, 23, 42, 110));
    let blurred = image::imageops::blur(&raster::pixmap_to_rgba(&sil), 4.5);
    let shadow = raster::rgba_to_pixmap(&blurred);
    let mut out = Pixmap::new(layer.width(), layer.height()).expect("size");
    let up = PixmapPaint {
        quality: FilterQuality::Bilinear,
        ..PixmapPaint::default()
    };
    out.draw_pixmap(
        0,
        0,
        shadow.as_ref(),
        &up,
        Transform::from_scale(Q as f32, Q as f32).post_translate(0.0, 22.0),
        None,
    );
    out.draw_pixmap(
        0,
        0,
        layer.as_ref(),
        &PixmapPaint::default(),
        Transform::identity(),
        None,
    );
    out
}

/// Compose the 1024x1024 master icon (straight RGBA).
pub fn compose(spec: &IconSpec, source: Option<&RgbaImage>) -> Result<RgbaImage> {
    compose_with_layout(spec, source).map(|(img, _)| img)
}

/// Compose the master and report the character's placement (None for the plain folder).
pub fn compose_with_layout(
    spec: &IconSpec,
    source: Option<&RgbaImage>,
) -> Result<(RgbaImage, Option<LayerLayout>)> {
    let spec = spec.sanitized();
    let mut canvas = Pixmap::new(CANVAS, CANVAS).expect("canvas");
    let c = CANVAS as f32;

    let content_box = match spec.mode {
        Mode::ClassicFolder | Mode::FolderDecoration => {
            draw_folder(&mut canvas, &spec.fill, spec.folder)?;
            let (x, y, w, h) = FOLDER_FRONT;
            Rect::from_xywh(x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.76).expect("box")
        }
        Mode::CustomShape => draw_shape(&mut canvas, &spec.fill, &spec.shape)?,
        Mode::FullReplacement => {
            let pad = c * 0.05;
            Rect::from_xywh(pad, pad, c - 2.0 * pad, c - 2.0 * pad).expect("box")
        }
    };

    let mut layout = None;
    if spec.mode.needs_layer() {
        let src = source.ok_or_else(|| {
            CoreError::invalid("Choose a character, emoji or image for this mode")
        })?;
        let (mut layer, lay) = render_layer(src, content_box, &spec.layer);
        layout = Some(lay);
        let (outline_w, outline_c) = if spec.effects.sticker {
            (
                spec.effects.outline_width.max(26.0),
                parse_color("#FFFFFF")?,
            )
        } else {
            (
                spec.effects.outline_width,
                parse_color(&spec.effects.outline_color)?,
            )
        };
        if outline_w > 0.0 {
            layer = add_outline(&layer, outline_w, outline_c);
        }
        if spec.effects.shadow || spec.effects.sticker {
            layer = add_shadow(&layer);
        }
        canvas.draw_pixmap(
            0,
            0,
            layer.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
    }

    let out = raster::pixmap_to_rgba(&canvas);
    if raster::alpha_bbox(&out, 0).is_none() {
        return Err(CoreError::invalid(
            "The resulting icon is completely transparent",
        ));
    }
    Ok((out, layout))
}
