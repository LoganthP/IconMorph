# Roadmap

**Shipped in 0.1 and 0.2 (redesign)**: see CHANGELOG. Priority now is verifying Windows and macOS on real hardware (docs/TESTING.md).

## Next
- [ ] Windows/macOS real-hardware verification; flip README matrix entries to *Verified*
- [ ] Show the item's real native icon (Shell / NSWorkspace / theme lookup) in Explore and as "Before" in Studio
- [ ] `.iconpack` import/export (ZIP + JSON manifest, ZIP-slip and size limits, checksums)
- [x] Desktop snapshots (0.2)
- [ ] Save, duplicate, export and import Themes
- [ ] `.url` internet shortcuts on Windows; Thunar-specific fallback
- [ ] Bundled optional collections (OpenMoji, Kenney) with per-asset manifests
- [ ] Text overlays and multi-layer editing in Studio
- [ ] Multi-layer editing (the Layers popover currently shows the fixed character/folder stack)
- [ ] Translations

## Later / optional
- [ ] Offline background removal as a separately downloaded ONNX module (not in the core installer)
- [ ] CLI (`iconmorph apply <path> --emoji 🐱 --mode full`)
- [ ] Explorer / Finder / Nautilus context-menu entry
- [ ] Experimental live animated overlays: opt-in, clearly labelled as requiring a running process
- [ ] WinGet, Scoop, Homebrew, AUR packages
