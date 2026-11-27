# Testing

## Automated
| Suite | Where | What it proves |
|---|---|---|
| `crates/iconmorph-core/tests/engine.rs` | all OSes | Composition of every mode, ICO/ICNS validity, decoding limits, SVG external-file refusal, GIF frames, full apply → verify → restore on real temp folders and launchers, rollback on failed verification, crash recovery, batch + cancel, dedup and cleanup |
| `tests/ipc_contract.rs` | all OSes | The JSON the UI sends matches the engine's types, and 0.1 specs still parse |
| `tests/windows_native.rs` | Windows CI | desktop.ini written by the Shell, unrelated entries kept, byte-exact restore, `.lnk` arguments preserved, `.url` icon change and byte-exact restore, programs are not customizable |
| `tests/macos_native.rs` | macOS CI | Finder `Icon\r` created and removed, app bundles refused |
| `src/test/*.test.ts(x)` | Node | Undo/redo coalescing, source mapping, emoji suggestions, settings validation and migration, theme contrast for every theme (parsed from `index.css`), Chameleon contrast, collections ↔ manifest, contextual Inspector, Morph Wheel keyboard, View Transitions gate |
| `scripts/typecheck-native.sh` | Linux | Windows + macOS adapters and tests type-check against real bindings |

## Manual checklist for a real machine (please report results in an issue)
1. Install the release build. Launch; Home → *This computer* shows your OS and desktop.
2. Create a test folder with a file in it. Explore → click it → choose 🐱 → Full replacement → Apply.
3. Check the desktop / file manager shows the cat instead of a folder. Double-click: the folder opens, the file is there.
4. Close IconMorph. Confirm no `iconmorph` process remains (Task Manager / Activity Monitor / `pgrep iconmorph`). The icon is still shown.
5. Restart the computer. The icon is still shown.
6. Reopen IconMorph → Restore → Restore. The original folder icon returns.
7. **Live GIF (Windows):** Studio → GIF frame → choose a GIF → Frames → tick *Animate on the desktop* → Apply to a folder on the desktop. Expect: a still icon, then the GIF playing over it within a second, an iconmorph Live icon in the notification area, clicks and double-clicks reaching the folder, animation following the icon when you drag it, hidden behind app windows, visible after Win+D. Tray → Stop ends it; Time Capsule → Original stops it too.
8. Repeat 2–6 with a shortcut (`.lnk` on Windows, alias on macOS, `.desktop` on Linux). On Windows use Home → *Customize a shortcut* and pick an app shortcut such as Docker Desktop or Jupyter Notebook: the Studio target must show the shortcut's name, not `….exe`. Also try a Steam/Epic `.url` game shortcut.
9. Themes → select 5 folders → Apply. Then Time Capsule → Restore all.
10. Apply two different designs to one folder. Time Capsule → click the earlier one → *Bring this design back*.
11. Time Capsule → *Snapshot now*. Change or restore a few items, then restore the snapshot.
12. Resize the window to its minimum (980×660) and check Studio controls do not overlap.

## UI QA performed for 0.2 (Linux, KDE adapter, Xvfb)
Run against the real app (not a browser mock): every workspace in Warm Studio and Midnight, at 980×660, 1320×860 and 1920×1080; drag move/scale handles; Morph Wheel by keyboard; Morph Reveal; Desktop Theatre with a wallpaper; apply → `.directory` written; second design → reapply earlier design; snapshot → restore original → restore snapshot (`.directory` rewritten with the snapshot's icon); inspector collapse; full-screen.
