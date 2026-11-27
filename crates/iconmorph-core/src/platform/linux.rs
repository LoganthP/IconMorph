//! Linux adapters.
//!
//! * GIO desktops (GNOME/Nautilus + Desktop Icons NG, Cinnamon/Nemo, MATE/Caja, XFCE/Thunar,
//!   Budgie, Pantheon): per-item `metadata::custom-icon` stored by gvfs. Set through the
//!   system `gio` tool with a fixed argument vector (no shell, no user-controlled program).
//! * KDE Plasma / Dolphin: folder `.directory` files with `[Desktop Entry] Icon=`.
//! * `.desktop` launchers on any desktop: the `Icon=` key is edited in place, all other
//!   lines preserved.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Value};

use super::desktop_entry;
use super::{atomic_write, file_uri, Capabilities, Classification, ItemKind, PlatformAdapter};
use crate::encode::IconFormat;
use crate::error::{CoreError, Result};

const GROUP: &str = "Desktop Entry";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flavor {
    Gio,
    Kde,
}

pub struct LinuxAdapter {
    flavor: Flavor,
    desktop_name: String,
}

/// Detect the running desktop environment from `XDG_CURRENT_DESKTOP`.
pub fn detect() -> Box<dyn PlatformAdapter> {
    let de = std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("DESKTOP_SESSION"))
        .unwrap_or_default();
    let lower = de.to_ascii_lowercase();
    let flavor = if lower.contains("kde") || lower.contains("plasma") {
        Flavor::Kde
    } else {
        Flavor::Gio
    };
    let name = if de.is_empty() {
        "Unknown desktop".to_string()
    } else {
        de
    };
    Box::new(LinuxAdapter::new(flavor, name))
}

impl LinuxAdapter {
    pub fn new(flavor: Flavor, desktop_name: impl Into<String>) -> Self {
        Self {
            flavor,
            desktop_name: desktop_name.into(),
        }
    }

    fn gio_available() -> bool {
        Command::new("gio")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn is_launcher(path: &Path) -> bool {
        path.is_file() && path.extension().map(|e| e == "desktop").unwrap_or(false)
    }

    fn gio_get(target: &Path) -> Result<Option<String>> {
        let out = Command::new("gio")
            .args(["info", "-a", "metadata::custom-icon", "--"])
            .arg(target)
            .output()
            .map_err(|e| CoreError::platform(format!("Could not run gio: {e}")))?;
        if !out.status.success() {
            return Err(CoreError::platform(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ));
        }
        let text = String::from_utf8_lossy(&out.stdout);
        Ok(text.lines().find_map(|l| {
            l.trim()
                .strip_prefix("metadata::custom-icon:")
                .map(|v| v.trim().to_string())
        }))
    }

    fn gio_set(target: &Path, uri: Option<&str>) -> Result<()> {
        let mut cmd = Command::new("gio");
        cmd.arg("set");
        match uri {
            Some(u) => cmd
                .args(["-t", "string", "--"])
                .arg(target)
                .args(["metadata::custom-icon", u]),
            None => cmd
                .args(["-t", "unset", "--"])
                .arg(target)
                .arg("metadata::custom-icon"),
        };
        let out = cmd
            .output()
            .map_err(|e| CoreError::platform(format!("Could not run gio: {e}")))?;
        if !out.status.success() {
            let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(CoreError::platform(format!(
                "gio could not set the icon ({msg}). The file manager's metadata service (gvfsd-metadata) may not be running."
            )));
        }
        // Nudge file managers to refresh by touching nothing: gvfs emits change events itself.
        Ok(())
    }

    fn directory_file(target: &Path) -> PathBuf {
        target.join(".directory")
    }

    fn launcher_icon(target: &Path) -> Result<Option<String>> {
        let content = std::fs::read_to_string(target)?;
        Ok(desktop_entry::get_key(&content, GROUP, "Icon"))
    }

    fn set_launcher_icon(target: &Path, icon: Option<&str>) -> Result<()> {
        let content = std::fs::read_to_string(target)?;
        let perms = std::fs::metadata(target)?.permissions();
        let updated = desktop_entry::set_key(&content, GROUP, "Icon", icon);
        atomic_write(target, updated.as_bytes())?;
        std::fs::set_permissions(target, perms)?; // keep the executable bit launchers need
        Ok(())
    }
}

impl PlatformAdapter for LinuxAdapter {
    fn id(&self) -> &'static str {
        match self.flavor {
            Flavor::Gio => "linux-gio",
            Flavor::Kde => "linux-kde",
        }
    }

    fn environment(&self) -> String {
        match self.flavor {
            Flavor::Gio => format!("{} (GIO metadata)", self.desktop_name),
            Flavor::Kde => format!("{} (Dolphin .directory)", self.desktop_name),
        }
    }

    fn capabilities(&self) -> Capabilities {
        match self.flavor {
            Flavor::Gio => {
                let gio = Self::gio_available();
                let mut notes = vec![
                    "Uses metadata::custom-icon, honoured by Nautilus, Desktop Icons NG, Nemo, Caja and Thunar.".into(),
                    ".desktop launchers get their Icon= key updated; other lines are kept.".into(),
                    "Experimental: not yet verified on every distribution.".into(),
                ];
                if !gio {
                    notes.insert(0, "The 'gio' tool was not found, so folder and file icons cannot be set. Install your distribution's glib2 / libglib2.0-bin package.".into());
                }
                Capabilities { folders: gio, shortcuts: true, files: gio, icon_format: IconFormat::Png, notes, status: "experimental" }
            }
            Flavor::Kde => Capabilities {
                folders: true,
                shortcuts: true,
                files: false,
                icon_format: IconFormat::Png,
                notes: vec![
                    "Folder icons are written to the folder's .directory file, which Dolphin and the Plasma desktop read.".into(),
                    "Dolphin does not support custom icons for individual files.".into(),
                    "Experimental: not yet verified on every distribution.".into(),
                ],
                status: "experimental",
            },
        }
    }

    fn desktop_dir(&self) -> Result<PathBuf> {
        directories::UserDirs::new()
            .and_then(|u| u.desktop_dir().map(Path::to_path_buf))
            .or_else(|| directories::BaseDirs::new().map(|b| b.home_dir().join("Desktop")))
            .ok_or_else(|| CoreError::NotFound("desktop folder".into()))
    }

    fn classify(&self, path: &Path) -> Classification {
        if path.is_dir() {
            let caps = self.capabilities();
            return Classification {
                kind: ItemKind::Folder,
                supported: caps.folders,
                note: (!caps.folders).then(|| "gio is not available".into()),
            };
        }
        if Self::is_launcher(path) {
            return Classification {
                kind: ItemKind::Shortcut,
                supported: true,
                note: None,
            };
        }
        match self.flavor {
            Flavor::Gio => {
                let ok = Self::gio_available();
                Classification {
                    kind: ItemKind::File,
                    supported: ok,
                    note: (!ok).then(|| "gio is not available".into()),
                }
            }
            Flavor::Kde => Classification {
                kind: ItemKind::File,
                supported: false,
                note: Some("Dolphin does not support per-file icons".into()),
            },
        }
    }

    fn read_state(&self, target: &Path) -> Result<Value> {
        if Self::is_launcher(target) {
            return Ok(json!({ "type": "launcher", "icon": Self::launcher_icon(target)? }));
        }
        match self.flavor {
            Flavor::Gio => Ok(json!({ "type": "gio", "customIcon": Self::gio_get(target)? })),
            Flavor::Kde => {
                let f = Self::directory_file(target);
                if f.exists() {
                    let content = std::fs::read_to_string(&f)?;
                    Ok(
                        json!({ "type": "kde", "existed": true, "icon": desktop_entry::get_key(&content, GROUP, "Icon") }),
                    )
                } else {
                    Ok(json!({ "type": "kde", "existed": false, "icon": null }))
                }
            }
        }
    }

    fn apply(&self, target: &Path, icon_file: &Path) -> Result<()> {
        let icon = icon_file.to_string_lossy();
        if Self::is_launcher(target) {
            return Self::set_launcher_icon(target, Some(&icon));
        }
        match self.flavor {
            Flavor::Gio => Self::gio_set(target, Some(&file_uri(icon_file))),
            Flavor::Kde => {
                if !target.is_dir() {
                    return Err(CoreError::unsupported(
                        "Dolphin only supports custom icons on folders",
                    ));
                }
                let f = Self::directory_file(target);
                let content = if f.exists() {
                    std::fs::read_to_string(&f)?
                } else {
                    String::new()
                };
                atomic_write(
                    &f,
                    desktop_entry::set_key(&content, GROUP, "Icon", Some(&icon)).as_bytes(),
                )
            }
        }
    }

    fn restore(&self, target: &Path, state: &Value) -> Result<()> {
        let icon = state.get("icon").and_then(Value::as_str);
        match state.get("type").and_then(Value::as_str) {
            Some("launcher") => Self::set_launcher_icon(target, icon),
            Some("gio") => Self::gio_set(target, state.get("customIcon").and_then(Value::as_str)),
            Some("kde") => {
                let f = Self::directory_file(target);
                let existed = state
                    .get("existed")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                if !f.exists() {
                    return Ok(());
                }
                let content = std::fs::read_to_string(&f)?;
                let updated = desktop_entry::set_key(&content, GROUP, "Icon", icon);
                if !existed && desktop_entry::is_effectively_empty(&updated) {
                    std::fs::remove_file(&f)?;
                    Ok(())
                } else {
                    atomic_write(&f, updated.as_bytes())
                }
            }
            _ => Err(CoreError::invalid(
                "Backup was not created by the Linux adapter",
            )),
        }
    }

    fn verify(&self, target: &Path, icon_file: &Path) -> Result<bool> {
        let state = self.read_state(target)?;
        let want_path = icon_file.to_string_lossy().into_owned();
        Ok(match state.get("type").and_then(Value::as_str) {
            Some("gio") => {
                state.get("customIcon").and_then(Value::as_str)
                    == Some(file_uri(icon_file).as_str())
            }
            _ => state.get("icon").and_then(Value::as_str) == Some(want_path.as_str()),
        })
    }
}
