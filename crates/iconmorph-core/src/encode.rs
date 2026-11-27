//! Native icon encoders: multi-resolution ICO (Windows), ICNS (macOS) and PNG (Linux).

use std::io::Cursor;

use image::imageops::FilterType;
use image::RgbaImage;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::raster::resize_premultiplied;

pub const ICO_SIZES: [u32; 7] = [16, 24, 32, 48, 64, 128, 256];
pub const PNG_LINUX_SIZE: u32 = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IconFormat {
    Ico,
    Icns,
    Png,
}

impl IconFormat {
    pub fn extension(self) -> &'static str {
        match self {
            IconFormat::Ico => "ico",
            IconFormat::Icns => "icns",
            IconFormat::Png => "png",
        }
    }
}

/// Downscale the master to `size`, using nearest-neighbour for pixel art.
pub fn render_size(master: &RgbaImage, size: u32, pixel_art: bool) -> RgbaImage {
    let filter = if pixel_art {
        FilterType::Nearest
    } else {
        FilterType::Lanczos3
    };
    resize_premultiplied(master, size, size, filter)
}

/// Renders many sizes from one master. Sizes up to 256 px come from a single high-quality
/// 256 px intermediate, which keeps Lanczos quality while avoiding repeated 1024 px passes.
pub struct SizeChain<'a> {
    master: &'a RgbaImage,
    pixel_art: bool,
    mid: Option<RgbaImage>,
}

impl<'a> SizeChain<'a> {
    pub fn new(master: &'a RgbaImage, pixel_art: bool) -> Self {
        Self {
            master,
            pixel_art,
            mid: None,
        }
    }

    pub fn get(&mut self, size: u32) -> RgbaImage {
        if size > 256 || size == self.master.width() {
            return render_size(self.master, size, self.pixel_art);
        }
        let pixel_art = self.pixel_art;
        let master = self.master;
        let mid = self
            .mid
            .get_or_insert_with(|| render_size(master, 256, pixel_art));
        if size == 256 {
            mid.clone()
        } else {
            render_size(mid, size, pixel_art)
        }
    }
}

pub fn png_bytes(img: &RgbaImage) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)?;
    Ok(out)
}

pub fn to_ico(master: &RgbaImage, pixel_art: bool) -> Result<Vec<u8>> {
    let mut dir = ico::IconDir::new(ico::ResourceType::Icon);
    let mut chain = SizeChain::new(master, pixel_art);
    for size in ICO_SIZES {
        let img = chain.get(size);
        let icon = ico::IconImage::from_rgba_data(size, size, img.into_raw());
        let entry = ico::IconDirEntry::encode(&icon)
            .map_err(|e| CoreError::invalid(format!("ICO encode failed: {e}")))?;
        dir.add_entry(entry);
    }
    let mut out = Vec::new();
    dir.write(&mut out)?;
    Ok(out)
}

pub fn to_icns(master: &RgbaImage, pixel_art: bool) -> Result<Vec<u8>> {
    use icns::IconType as T;
    let types = [
        (T::RGBA32_16x16, 16),
        (T::RGBA32_16x16_2x, 32),
        (T::RGBA32_32x32, 32),
        (T::RGBA32_32x32_2x, 64),
        (T::RGBA32_128x128, 128),
        (T::RGBA32_128x128_2x, 256),
        (T::RGBA32_256x256, 256),
        (T::RGBA32_256x256_2x, 512),
        (T::RGBA32_512x512, 512),
        (T::RGBA32_512x512_2x, 1024),
    ];
    let mut fam = icns::IconFamily::new();
    let mut chain = SizeChain::new(master, pixel_art);
    for (ty, size) in types {
        let img = chain.get(size);
        let image = icns::Image::from_data(icns::PixelFormat::RGBA, size, size, img.into_raw())
            .map_err(|e| CoreError::invalid(format!("ICNS image failed: {e}")))?;
        fam.add_icon_with_type(&image, ty)
            .map_err(|e| CoreError::invalid(format!("ICNS encode failed: {e}")))?;
    }
    let mut out = Vec::new();
    fam.write(&mut out)?;
    Ok(out)
}

pub fn encode(master: &RgbaImage, format: IconFormat, pixel_art: bool) -> Result<Vec<u8>> {
    match format {
        IconFormat::Ico => to_ico(master, pixel_art),
        IconFormat::Icns => to_icns(master, pixel_art),
        IconFormat::Png => png_bytes(&render_size(master, PNG_LINUX_SIZE, pixel_art)),
    }
}
