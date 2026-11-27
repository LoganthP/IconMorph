//! Safe decoding of untrusted image sources into straight-alpha RGBA buffers.

use std::io::Cursor;
use std::path::Path;

use image::codecs::gif::GifDecoder;
use image::{AnimationDecoder, ImageReader, Limits, RgbaImage};
use resvg::{tiny_skia, usvg};
use serde::Serialize;

use crate::error::{CoreError, Result};
use crate::limits::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceFormat {
    Png,
    Jpeg,
    Webp,
    Bmp,
    Gif,
    Ico,
    Icns,
    Svg,
}

/// Identify a source by its magic bytes (never by file extension).
pub fn sniff(bytes: &[u8]) -> Result<SourceFormat> {
    let b = bytes;
    let fmt = if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        SourceFormat::Png
    } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        SourceFormat::Jpeg
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        SourceFormat::Webp
    } else if b.starts_with(b"BM") {
        SourceFormat::Bmp
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        SourceFormat::Gif
    } else if b.starts_with(&[0, 0, 1, 0]) {
        SourceFormat::Ico
    } else if b.starts_with(b"icns") {
        SourceFormat::Icns
    } else if looks_like_svg(b) {
        SourceFormat::Svg
    } else {
        return Err(CoreError::invalid(
            "Unsupported image format. Use PNG, JPEG, WebP, BMP, GIF, ICO, ICNS or SVG.",
        ));
    };
    Ok(fmt)
}

fn looks_like_svg(b: &[u8]) -> bool {
    let head = &b[..b.len().min(2048)];
    let s = String::from_utf8_lossy(head).to_ascii_lowercase();
    s.contains("<svg")
}

/// Read a source file from disk with a size cap.
pub fn read_source_file(path: &Path) -> Result<Vec<u8>> {
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() {
        return Err(CoreError::invalid(format!(
            "{} is not a file",
            path.display()
        )));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(CoreError::invalid(format!(
            "Image is {} MB; the limit is {} MB",
            meta.len() / 1_048_576,
            MAX_FILE_BYTES / 1_048_576
        )));
    }
    Ok(std::fs::read(path)?)
}

fn limits() -> Limits {
    let mut l = Limits::default();
    l.max_image_width = Some(MAX_DIMENSION);
    l.max_image_height = Some(MAX_DIMENSION);
    l.max_alloc = Some(MAX_ALLOC_BYTES);
    l
}

/// Decode any supported source to RGBA. For GIFs, `gif_frame` picks the frame (default 0).
pub fn decode(bytes: &[u8], gif_frame: Option<u32>) -> Result<RgbaImage> {
    match sniff(bytes)? {
        SourceFormat::Svg => render_svg(bytes, CANVAS),
        SourceFormat::Gif => gif_frame_image(bytes, gif_frame.unwrap_or(0)),
        SourceFormat::Icns => decode_icns(bytes),
        _ => {
            let mut reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
            reader.limits(limits());
            let img = reader.decode()?;
            check_dims(img.width(), img.height())?;
            Ok(img.to_rgba8())
        }
    }
}

fn check_dims(w: u32, h: u32) -> Result<()> {
    if w == 0 || h == 0 {
        return Err(CoreError::invalid("Image has no pixels"));
    }
    if w > MAX_DIMENSION || h > MAX_DIMENSION {
        return Err(CoreError::invalid(format!(
            "Image is {w}x{h}; the limit is {MAX_DIMENSION}x{MAX_DIMENSION}"
        )));
    }
    Ok(())
}

fn decode_icns(bytes: &[u8]) -> Result<RgbaImage> {
    let family = icns::IconFamily::read(Cursor::new(bytes))
        .map_err(|e| CoreError::invalid(format!("Invalid ICNS file: {e}")))?;
    let best = family
        .available_icons()
        .into_iter()
        .max_by_key(|t| t.pixel_width())
        .ok_or_else(|| CoreError::invalid("ICNS file contains no icons"))?;
    let img = family
        .get_icon_with_type(best)
        .map_err(|e| CoreError::invalid(format!("Invalid ICNS image: {e}")))?;
    let img = img.convert_to(icns::PixelFormat::RGBA);
    let (w, h) = (img.width(), img.height());
    check_dims(w, h)?;
    RgbaImage::from_raw(w, h, img.into_data().into_vec())
        .ok_or_else(|| CoreError::invalid("Corrupt ICNS pixel data"))
}

/// Rasterise an SVG so its longest side is `target` pixels. External file references are
/// refused: only embedded data: URIs are resolved.
pub fn render_svg(bytes: &[u8], target: u32) -> Result<RgbaImage> {
    if bytes.len() > MAX_SVG_BYTES {
        return Err(CoreError::invalid("SVG is larger than 5 MB"));
    }
    let opt = usvg::Options {
        resources_dir: None,
        image_href_resolver: usvg::ImageHrefResolver {
            resolve_data: usvg::ImageHrefResolver::default_data_resolver(),
            resolve_string: Box::new(|_, _| None),
        },
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_data(bytes, &opt)
        .map_err(|e| CoreError::invalid(format!("Invalid SVG: {e}")))?;
    let size = tree.size();
    let scale = target as f32 / size.width().max(size.height());
    let w = (size.width() * scale).round().max(1.0) as u32;
    let h = (size.height() * scale).round().max(1.0) as u32;
    let mut pixmap =
        tiny_skia::Pixmap::new(w, h).ok_or_else(|| CoreError::invalid("SVG has no size"))?;
    resvg::render(
        &tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    Ok(crate::raster::pixmap_to_rgba(&pixmap))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GifInfo {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub delays_ms: Vec<u32>,
    pub truncated: bool,
}

fn gif_decoder(bytes: &[u8]) -> Result<GifDecoder<Cursor<&[u8]>>> {
    let mut dec = GifDecoder::new(Cursor::new(bytes))?;
    image::ImageDecoder::set_limits(&mut dec, limits())?;
    Ok(dec)
}

pub fn gif_info(bytes: &[u8]) -> Result<GifInfo> {
    let dec = gif_decoder(bytes)?;
    let (width, height) = image::ImageDecoder::dimensions(&dec);
    check_dims(width, height)?;
    let mut delays = Vec::new();
    let mut truncated = false;
    for (i, frame) in dec.into_frames().enumerate() {
        if i >= MAX_GIF_FRAMES {
            truncated = true;
            break;
        }
        let frame = frame?;
        let (n, d) = frame.delay().numer_denom_ms();
        delays.push(n.checked_div(d).unwrap_or(0));
    }
    Ok(GifInfo {
        width,
        height,
        frame_count: delays.len(),
        delays_ms: delays,
        truncated,
    })
}

/// Decode one composited GIF frame. Earlier frames are decoded and dropped immediately.
pub fn gif_frame_image(bytes: &[u8], index: u32) -> Result<RgbaImage> {
    let dec = gif_decoder(bytes)?;
    let (w, h) = image::ImageDecoder::dimensions(&dec);
    check_dims(w, h)?;
    let index = index as usize;
    if index >= MAX_GIF_FRAMES {
        return Err(CoreError::invalid(
            "GIF frame index is beyond the frame limit",
        ));
    }
    for (i, frame) in dec.into_frames().enumerate() {
        let frame = frame?;
        if i == index {
            return Ok(frame.into_buffer());
        }
    }
    Err(CoreError::invalid(format!("GIF has no frame {index}")))
}

/// Visit composited GIF frames in order with their delays (ms). Each frame is dropped
/// before the next is decoded. The callback returns `Ok(false)` to stop early.
pub fn for_each_gif_frame(
    bytes: &[u8],
    mut f: impl FnMut(usize, RgbaImage, u32) -> Result<bool>,
) -> Result<()> {
    let dec = gif_decoder(bytes)?;
    let (w, h) = image::ImageDecoder::dimensions(&dec);
    check_dims(w, h)?;
    for (i, frame) in dec.into_frames().enumerate() {
        if i >= MAX_GIF_FRAMES {
            break;
        }
        let frame = frame?;
        let (n, d) = frame.delay().numer_denom_ms();
        if !f(i, frame.into_buffer(), n.checked_div(d).unwrap_or(0))? {
            break;
        }
    }
    Ok(())
}

/// Small PNG thumbnails of up to `max_frames` evenly spaced frames, for the GIF timeline.
pub fn gif_thumbnails(bytes: &[u8], max_frames: usize, size: u32) -> Result<Vec<(usize, Vec<u8>)>> {
    let info = gif_info(bytes)?;
    let n = info.frame_count.max(1);
    let step = (n as f32 / max_frames.max(1) as f32).ceil().max(1.0) as usize;
    let dec = gif_decoder(bytes)?;
    let mut out = Vec::new();
    for (i, frame) in dec.into_frames().enumerate() {
        if i >= n {
            break;
        }
        let frame = frame?;
        if i % step == 0 {
            let thumb = crate::raster::fit_within(frame.buffer(), size, false);
            out.push((i, crate::encode::png_bytes(&thumb)?));
        }
    }
    Ok(out)
}
