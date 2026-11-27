//! Pixel-buffer helpers shared by the composer and encoders.

use image::imageops::FilterType;
use image::{Rgba, RgbaImage};
use resvg::tiny_skia::{self, Pixmap};

/// Convert straight RGBA to a premultiplied tiny-skia pixmap.
pub fn rgba_to_pixmap(img: &RgbaImage) -> Pixmap {
    let mut pm = Pixmap::new(img.width().max(1), img.height().max(1)).expect("non-zero size");
    for (dst, src) in pm.pixels_mut().iter_mut().zip(img.pixels()) {
        let [r, g, b, a] = src.0;
        *dst = tiny_skia::ColorU8::from_rgba(r, g, b, a).premultiply();
    }
    pm
}

/// Convert a premultiplied pixmap back to straight RGBA.
pub fn pixmap_to_rgba(pm: &Pixmap) -> RgbaImage {
    let mut img = RgbaImage::new(pm.width(), pm.height());
    for (dst, src) in img.pixels_mut().zip(pm.pixels()) {
        let c = src.demultiply();
        *dst = Rgba([c.red(), c.green(), c.blue(), c.alpha()]);
    }
    img
}

/// Bounding box of pixels with alpha above `threshold`.
pub fn alpha_bbox(img: &RgbaImage, threshold: u8) -> Option<(u32, u32, u32, u32)> {
    let (mut x0, mut y0, mut x1, mut y1) = (u32::MAX, u32::MAX, 0u32, 0u32);
    let mut any = false;
    for (x, y, p) in img.enumerate_pixels() {
        if p.0[3] > threshold {
            any = true;
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x);
            y1 = y1.max(y);
        }
    }
    any.then(|| (x0, y0, x1 - x0 + 1, y1 - y0 + 1))
}

/// Smart crop: trim fully transparent margins.
pub fn trim_transparent(img: &RgbaImage) -> RgbaImage {
    match alpha_bbox(img, 8) {
        Some((x, y, w, h)) if (w, h) != img.dimensions() => {
            image::imageops::crop_imm(img, x, y, w, h).to_image()
        }
        _ => img.clone(),
    }
}

/// Resize with premultiplied alpha so transparent edges do not pick up dark fringes.
pub fn resize_premultiplied(img: &RgbaImage, w: u32, h: u32, filter: FilterType) -> RgbaImage {
    if img.dimensions() == (w, h) {
        return img.clone();
    }
    let mut pre = img.clone();
    for p in pre.pixels_mut() {
        let a = p.0[3] as u32;
        for c in 0..3 {
            p.0[c] = ((p.0[c] as u32 * a + 127) / 255) as u8;
        }
    }
    let mut out = image::imageops::resize(&pre, w, h, filter);
    for p in out.pixels_mut() {
        let a = p.0[3] as u32;
        for c in 0..3 {
            let v = p.0[c] as u32;
            p.0[c] = (v.min(a) * 255 + a / 2)
                .checked_div(a)
                .unwrap_or(0)
                .min(255) as u8;
        }
    }
    out
}

/// Scale an image to fit inside `max` x `max`, preserving aspect ratio. Never upscales
/// unless `allow_upscale`.
pub fn fit_within(img: &RgbaImage, max: u32, allow_upscale: bool) -> RgbaImage {
    let (w, h) = img.dimensions();
    let longest = w.max(h);
    if longest <= max && !allow_upscale {
        return img.clone();
    }
    let s = max as f32 / longest as f32;
    let nw = ((w as f32 * s).round() as u32).max(1);
    let nh = ((h as f32 * s).round() as u32).max(1);
    resize_premultiplied(img, nw, nh, FilterType::Lanczos3)
}
