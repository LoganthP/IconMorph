//! Dominant-colour extraction for the UI's adaptive "Chameleon" accents.
//! Runs once per selected asset on a small downsample (≤ 64 px), never continuously.

use image::imageops::FilterType;
use image::RgbaImage;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Swatch {
    /// `#RRGGBB`
    pub hex: String,
    /// Share of opaque pixels (0 – 1).
    pub weight: f32,
}

/// Up to `k` dominant colours of the opaque pixels, most common first.
pub fn dominant_colors(img: &RgbaImage, k: usize) -> Vec<Swatch> {
    let k = k.clamp(1, 8);
    let small = if img.width().max(img.height()) > 64 {
        let s = 64.0 / img.width().max(img.height()) as f32;
        image::imageops::resize(
            img,
            ((img.width() as f32 * s).round() as u32).max(1),
            ((img.height() as f32 * s).round() as u32).max(1),
            FilterType::Nearest, // no blending: blended edges would invent colours
        )
    } else {
        img.clone()
    };
    let px: Vec<[f32; 3]> = small
        .pixels()
        .filter(|p| p.0[3] >= 160)
        .map(|p| [p.0[0] as f32, p.0[1] as f32, p.0[2] as f32])
        .collect();
    if px.is_empty() {
        return vec![];
    }

    // Deterministic init: k-means++-style farthest-point seeding from the mean.
    let mean = px
        .iter()
        .fold([0.0; 3], |a, p| [a[0] + p[0], a[1] + p[1], a[2] + p[2]]);
    let n = px.len() as f32;
    let mut centers = vec![[mean[0] / n, mean[1] / n, mean[2] / n]];
    while centers.len() < k {
        let far = px
            .iter()
            .max_by(|a, b| nearest(&centers, a).1.total_cmp(&nearest(&centers, b).1))
            .copied()
            .unwrap_or(centers[0]);
        if nearest(&centers, &far).1 < 1.0 {
            break; // fewer distinct colours than k
        }
        centers.push(far);
    }

    let mut counts = vec![0usize; centers.len()];
    for _ in 0..10 {
        let mut sums = vec![[0.0f32; 3]; centers.len()];
        counts.iter_mut().for_each(|c| *c = 0);
        for p in &px {
            let (i, _) = nearest(&centers, p);
            counts[i] += 1;
            for c in 0..3 {
                sums[i][c] += p[c];
            }
        }
        for (i, c) in centers.iter_mut().enumerate() {
            if counts[i] > 0 {
                *c = [
                    sums[i][0] / counts[i] as f32,
                    sums[i][1] / counts[i] as f32,
                    sums[i][2] / counts[i] as f32,
                ];
            }
        }
    }

    let mut out: Vec<Swatch> = centers
        .iter()
        .zip(&counts)
        .filter(|(_, &c)| c > 0)
        .map(|(c, &cnt)| Swatch {
            hex: format!(
                "#{:02X}{:02X}{:02X}",
                c[0].round() as u8,
                c[1].round() as u8,
                c[2].round() as u8
            ),
            weight: cnt as f32 / n,
        })
        .collect();
    out.sort_by(|a, b| b.weight.total_cmp(&a.weight));
    out
}

fn nearest(centers: &[[f32; 3]], p: &[f32; 3]) -> (usize, f32) {
    centers
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let d = (c[0] - p[0]).powi(2) + (c[1] - p[1]).powi(2) + (c[2] - p[2]).powi(2);
            (i, d)
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .unwrap_or((0, 0.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn finds_the_two_colours_and_their_shares() {
        let img = RgbaImage::from_fn(100, 100, |x, _| {
            if x < 75 {
                Rgba([240, 160, 40, 255])
            } else {
                Rgba([30, 90, 200, 255])
            }
        });
        let p = dominant_colors(&img, 4);
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].hex, "#F0A028");
        assert!((p[0].weight - 0.75).abs() < 0.03);
        assert_eq!(p[1].hex, "#1E5AC8");
    }

    #[test]
    fn ignores_transparent_pixels() {
        let img = RgbaImage::from_fn(10, 10, |x, _| {
            if x == 0 {
                Rgba([255, 0, 0, 255])
            } else {
                Rgba([0, 255, 0, 0])
            }
        });
        let p = dominant_colors(&img, 3);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].hex, "#FF0000");
        assert!(dominant_colors(&RgbaImage::new(4, 4), 3).is_empty());
    }
}
