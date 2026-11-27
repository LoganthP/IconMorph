# Platform notes

## Windows 10 / 11
- **Folders**: `SHGetSetFolderCustomSettings(FCSM_ICONFILE, FCS_FORCEWRITE)` writes `[.ShellClassInfo] IconResource=` into `desktop.ini`, marks it hidden/system and sets the folder's read-only attribute, exactly as Explorer's *Properties → Customize → Change Icon* does. Other `desktop.ini` entries are kept. Backup stores the original bytes and attributes; restore writes them back byte-for-byte (or deletes the file if there was none).
- **Shortcuts (.lnk)**: only `SetIconLocation` is called, so target, arguments, working directory and hotkey are untouched.
- **Desktop**: `SHGetKnownFolderPath(FOLDERID_Desktop)` follows OneDrive redirection.
- **Refresh**: `SHChangeNotify(SHCNE_UPDATEDIR / SHCNE_UPDATEITEM)`. Explorer is never restarted. Because every new icon has a new content-hashed file name, the icon cache cannot serve a stale image for the new path.
- **Not supported**: per-file icons (OS limitation), `.url` internet shortcuts (planned), the public desktop (needs admin).

## macOS 11+
- `NSWorkspace setIcon:forFile:options:` with a generated ICNS (16–1024 px with @2x variants).
- Folders with an existing custom icon (`Icon\r`) have that icon backed up as TIFF and restored; otherwise restore removes the custom icon.
- `.app`, `.framework`, `.bundle` and `.plugin` bundles are refused so code signatures stay valid.

## Linux
Detected from `XDG_CURRENT_DESKTOP`.

| Desktop | Mechanism | Notes |
|---|---|---|
| KDE Plasma / Dolphin | `<folder>/.directory` → `[Desktop Entry] Icon=/abs/path.png` | Only the `Icon` key is touched; a `.directory` file that IconMorph created is removed on restore. Dolphin has no per-file icons. |
| GNOME (Nautilus, Desktop Icons NG), Cinnamon (Nemo), MATE (Caja), XFCE (Thunar), Budgie, Pantheon | `gio set <path> metadata::custom-icon file:///…` | Requires the gvfs metadata daemon of a normal desktop session. IconMorph runs the system `gio` tool with a fixed argument list (no shell). |
| Any | `.desktop` launchers: `Icon=` key | All other keys, comments, localized keys, line endings and the executable bit are preserved. On GNOME you may need *Allow Launching* again after editing a launcher. |

The Flatpak sandbox would block writing metadata on arbitrary folders, so Flathub distribution is deferred.

## Windows: choosing shortcuts
The common Open dialog dereferences `.lnk` files by default, so picking "Docker Desktop" returns `Docker Desktop.exe`. iconmorph's target picker (`pick_target`) uses `IFileOpenDialog` with `FOS_NODEREFERENCELINKS` so the shortcut itself is returned. As a fallback, a picked program is matched to a `.lnk` on the user's Desktop or the Public Desktop whose target is that program (`platform::windows::shortcuts_to`). Image pickers still use the regular dialog.

Shortcuts on the Public Desktop (`FOLDERID_PublicDesktop`) are writable only by administrators; `classify` opens the file for writing (without truncating or writing) to detect this and reports it before any icon is generated.
