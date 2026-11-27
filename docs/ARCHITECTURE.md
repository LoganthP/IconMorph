# Architecture

```
React UI (src/)  ──Tauri IPC (typed, capability-gated)──▶  src-tauri (thin command layer)
                                                              │  spawn_blocking
                                                              ▼
                                      iconmorph-core::Engine (orchestrator, journal)
                     ┌───────────────┬──────────────┬──────────────┬────────────────┐
                 image_io        compose          encode          store         platform::*
          (safe decode, SVG,  (4 modes, shapes,  (ICO, ICNS,   (SQLite: backups,  (Windows, macOS,
           GIF frames, limits) effects, 1024 px)  PNG, hashing)  journal, history)  Linux GIO/KDE)
                                                                                     │
                                                                          native OS metadata
                                                        (desktop.ini · .lnk · NSWorkspace · gio · .directory)
```

## Principles

1. **One renderer.** Every preview in the UI is produced by the same `compose` + `encode` path that writes the real icon. The UI never re-implements rendering, so what you see is what gets applied (this is why the Studio uses an engine-rendered canvas instead of a JavaScript canvas library).
2. **The OS draws the icon.** IconMorph only writes supported metadata and a persistent icon file. After that it can exit; there is no overlay and no resident process.
3. **Reversible by construction.** The adapter's `read_state` snapshots exactly what `apply` will change. The first snapshot for an item is kept as the *original* until the item is restored.
4. **Untrusted input.** Imported images, SVGs and GIFs are sniffed by magic bytes, size- and dimension-limited, decoded with allocation limits; SVG external references are never resolved.

## Transaction

```
apply(target, spec, source)
  validate   canonicalise path, classify via adapter, refuse unsupported items
  generate   compose 1024 px master → native format → store by SHA-256 (dedup)
  backup     read_state → original_backups (first time only) + journal row 'pending' with pre-state
  apply      adapter.apply(target, icon_file)
  verify     adapter.verify re-reads native metadata
  commit     customizations row, journal 'committed', history 'success'
  on error   adapter.restore(pre-state), journal 'rolled_back' (or 'failed'), history 'failed'
startup      Engine::recover() rolls back any journal rows still 'pending' (crash/power loss)
```

## Platform adapter contract

```rust
trait PlatformAdapter {
    fn id(&self) -> &'static str;              // stored with each backup
    fn capabilities(&self) -> Capabilities;     // shown in the UI, gates actions
    fn desktop_dir(&self) -> Result<PathBuf>;
    fn classify(&self, path: &Path) -> Classification;
    fn read_state(&self, target: &Path) -> Result<Value>;
    fn apply(&self, target: &Path, icon_file: &Path) -> Result<()>;
    fn restore(&self, target: &Path, state: &Value) -> Result<()>;
    fn verify(&self, target: &Path, icon_file: &Path) -> Result<bool>;
}
```

Adding a desktop environment means adding one adapter; no image code is duplicated.

## Data

SQLite (`iconmorph.db` in the per-user data dir, WAL mode, versioned migrations via `PRAGMA user_version`):
`icon_assets`, `original_backups`, `customizations`, `operation_journal`, `activity_history`, `app_settings` (v1), plus `desktop_snapshots` and `snapshot_items` (v2, 0.2). Migrations are additive; a v1 database opens unchanged and gains the new tables.

**Previous designs.** Every applied design stays in `customizations` with its icon hash, so the Time Capsule can show an item's history and `reapply_design` can bring one back from the stored icon file (no re-render).

**Snapshots.** `create_snapshot` records the active design of every customized item. `restore_snapshot` re-applies each one through the normal transaction and restores to the original any item customized after the snapshot. Unused-icon cleanup keeps every icon a snapshot references.

Generated icons: `<data dir>/icons/<first 32 hex of sha256>.<ico|icns|png>`.

| OS | Data dir |
|---|---|
| Windows | `%APPDATA%\IconMorph\IconMorph\data` |
| macOS | `~/Library/Application Support/dev.IconMorph.IconMorph` |
| Linux | `$XDG_DATA_HOME/iconmorph` (usually `~/.local/share/iconmorph`) |

Uninstalling the app does not delete this folder, so applied icons keep working. To remove everything, use **Restore → Restore all**, then **Remove unused icons**, then delete the folder.

## IPC surface

Commands added in 0.2 (all additive; 0.1 calls are unchanged):

| Command | Purpose |
|---|---|
| `preview_icon(spec, source, sizes?)` | Now also returns the layer `layout` (centre, size, rotation, content box) so Studio handles sit exactly on the engine's render |
| `designs_for(path)` / `reapply_design(id)` | Previous designs of an item; bring one back |
| `create_snapshot(name)` / `list_snapshots` / `delete_snapshot(id)` / `restore_snapshot(id)` | Desktop snapshots |
| `source_palette(source)` | Dominant colours (deterministic k-means) for Chameleon accents and "match character colours" |
| `image_thumbnail(path, max)` | Small PNG thumbnails for Personal imports and wallpapers, decoded with the same safety limits |

The UI derives Chameleon accents in `src/lib/chameleon.ts` (OKLCH via culori, contrast-clamped) from `source_palette`, called once per asset change, never per frame.

All commands are declared in `src-tauri/build.rs` and must be granted in `src-tauri/capabilities/default.json`. The frontend has no filesystem plugin; it can only open native file dialogs, reveal an item in the file manager, and call these commands. Export refuses destinations whose extension does not match the chosen icon format.


## Live GIF icons (0.3, Windows, opt-in)
Desktop icons are still images on every OS, so animation is layered on top instead of replacing the icon mechanism:

1. **Apply** writes the chosen frame as a normal still icon (unchanged transaction).
2. `live_enable` (src-tauri/src/live.rs) checks the item is customized, then `iconmorph_core::live::prepare` renders every GIF frame through the same `compose()` with the same spec (256 px PNGs in `<data>/live/<id>/`, max 240 frames, GIF delays ≤ 10 ms → 100 ms like browsers) and records it in `<data>/live.json`.
3. `live::sync_helper` starts `iconmorph.exe --live` or posts `WM_LIVE_RELOAD` to it. `main.rs` routes `--live` to `platform::windows_live::run` before Tauri starts, so the helper has no WebView.
4. The helper finds the desktop's `IFolderView` through `IShellWindows::FindWindowSW(SWC_DESKTOP)`, maps item paths to list-view indices, and reads each icon's rectangle with `LVM_GETITEMRECT(LVIR_ICON)` through a small buffer in Explorer's process. Each animated item gets a `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` popup **owned by the desktop host window**, so it stays on the desktop layer and comes forward with it on Win+D. Frames are drawn with `UpdateLayeredWindow` (premultiplied BGRA, scaled to the icon size × DPI).
5. Every 750 ms it re-checks positions; frames are skipped while the icon is covered (`WindowFromPoint`), and playback stops on session lock. Restore / restore all / snapshot restore / reapplying an older design prune `live.json` (`live::retain` / `live::remove`) and the helper reloads, exiting when nothing is left.
