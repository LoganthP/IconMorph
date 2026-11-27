//! macOS adapter: `NSWorkspace setIcon:forFile:options:`, the supported Finder API for
//! custom file and folder icons. Application bundles are refused so signatures stay valid.

#![allow(unsafe_code)]

use std::path::{Path, PathBuf};

use base64::Engine as _;
use objc2::AllocAnyThread;
use objc2_app_kit::{NSImage, NSWorkspace, NSWorkspaceIconCreationOptions};
use objc2_foundation::{NSData, NSString};
use serde_json::{json, Value};

use super::{Capabilities, Classification, ItemKind, PlatformAdapter};
use crate::encode::IconFormat;
use crate::error::{CoreError, Result};

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

pub struct MacAdapter;

impl MacAdapter {
    pub fn new() -> Self {
        MacAdapter
    }
}

impl Default for MacAdapter {
    fn default() -> Self {
        Self::new()
    }
}

fn is_bundle(p: &Path) -> bool {
    p.is_dir()
        && p.extension()
            .map(|e| {
                matches!(
                    e.to_string_lossy().to_lowercase().as_str(),
                    "app" | "framework" | "bundle" | "plugin"
                )
            })
            .unwrap_or(false)
}

/// A folder has a custom icon when it contains the hidden `Icon\r` file.
fn has_custom_icon(p: &Path) -> bool {
    p.is_dir() && p.join("Icon\r").exists()
}

fn set_icon(target: &Path, image: Option<&NSImage>) -> Result<()> {
    let ws = NSWorkspace::sharedWorkspace();
    let ok = ws.setIcon_forFile_options(
        image,
        &NSString::from_str(&target.to_string_lossy()),
        NSWorkspaceIconCreationOptions(0),
    );
    if ok {
        Ok(())
    } else {
        Err(CoreError::platform(
            "Finder refused the icon change (check permissions)",
        ))
    }
}

impl PlatformAdapter for MacAdapter {
    fn id(&self) -> &'static str {
        "macos"
    }

    fn environment(&self) -> String {
        "macOS (Finder)".into()
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            folders: true,
            shortcuts: true,
            files: true,
            icon_format: IconFormat::Icns,
            notes: vec![
                "Uses NSWorkspace setIcon, the same mechanism as Finder's Get Info paste.".into(),
                "Application bundles are skipped so code signatures stay intact.".into(),
                "Experimental: built but not yet verified on real hardware.".into(),
            ],
            status: "experimental",
        }
    }

    fn desktop_dir(&self) -> Result<PathBuf> {
        directories::UserDirs::new()
            .and_then(|u| u.desktop_dir().map(Path::to_path_buf))
            .ok_or_else(|| CoreError::NotFound("desktop folder".into()))
    }

    fn classify(&self, path: &Path) -> Classification {
        if is_bundle(path) {
            return Classification {
                kind: ItemKind::File,
                supported: false,
                note: Some("Application bundles are skipped to keep their signatures valid".into()),
            };
        }
        let kind = if path.is_dir() {
            ItemKind::Folder
        } else if path
            .extension()
            .map(|e| e == "alias" || e == "webloc")
            .unwrap_or(false)
        {
            ItemKind::Shortcut
        } else {
            ItemKind::File
        };
        Classification {
            kind,
            supported: true,
            note: None,
        }
    }

    fn read_state(&self, target: &Path) -> Result<Value> {
        if !has_custom_icon(target) {
            return Ok(json!({ "type": "mac", "custom": null }));
        }
        let ws = NSWorkspace::sharedWorkspace();
        let img = ws.iconForFile(&NSString::from_str(&target.to_string_lossy()));
        let tiff = img.TIFFRepresentation().map(|d| d.to_vec());
        Ok(json!({ "type": "mac", "custom": tiff.map(|b| B64.encode(b)) }))
    }

    fn apply(&self, target: &Path, icon_file: &Path) -> Result<()> {
        if is_bundle(target) {
            return Err(CoreError::unsupported(
                "Application bundles are not modified",
            ));
        }
        let img = NSImage::initWithContentsOfFile(
            NSImage::alloc(),
            &NSString::from_str(&icon_file.to_string_lossy()),
        )
        .ok_or_else(|| CoreError::invalid("Generated ICNS could not be loaded"))?;
        set_icon(target, Some(&img))
    }

    fn restore(&self, target: &Path, state: &Value) -> Result<()> {
        match state.get("custom").and_then(Value::as_str) {
            Some(b64) => {
                let bytes = B64
                    .decode(b64)
                    .map_err(|e| CoreError::invalid(e.to_string()))?;
                let data = NSData::with_bytes(&bytes);
                let img = NSImage::initWithData(NSImage::alloc(), &data)
                    .ok_or_else(|| CoreError::invalid("Backed-up icon could not be decoded"))?;
                set_icon(target, Some(&img))
            }
            None => set_icon(target, None),
        }
    }

    fn verify(&self, target: &Path, _icon_file: &Path) -> Result<bool> {
        // Finder stores the icon opaquely; confirm a custom icon is now present.
        Ok(!target.is_dir() || has_custom_icon(target))
    }
}
