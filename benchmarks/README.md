# Benchmarks

All numbers below were **measured**, not estimated. Reproduce them with the commands shown and please add results from your own hardware via a PR.

## Reference machine for these results
- Linux container, 2 vCPU Intel Xeon @ 2.30 GHz (shared cloud VM), 8 GB RAM, Ubuntu 24.04, WebKitGTK 2.52, software rendering under Xvfb
- IconMorph 0.1.0 and 0.2.0, release builds (`opt-level = "s"`, LTO), commit of this release
- This is a slow, shared machine; a typical desktop CPU will be faster. Windows (WebView2) and macOS (WKWebView) have not been measured yet.

## 0.1 → 0.2 redesign, before and after (release builds, same machine, same day)
Method: `benchmarks/profile-linux.sh <binary> <label>`: three launches with an empty data folder under Xvfb (KDE adapter); time until the X11 window is mapped, RSS 8 s after launch, CPU used over the next 10 idle seconds, then WM_DELETE_WINDOW and a process check. Raw output: `benchmarks/results/redesign-*.txt`. BEFORE is the 0.1 `.deb` build, AFTER the 0.2 build.

| Metric | 0.1 (before) | 0.2 (after) | Change |
|---|---|---|---|
| Window mapped, warm runs | 0.092 s, 0.178 s | 0.096 s, 0.112 s, 0.095 s | same (noise) |
| Window mapped, first run | 2.960 s (cold disk cache) | 0.096 s (cache already warm) | not comparable |
| Core process RSS, idle | 135–138 MB | 139 MB | +1–4 MB |
| WebKit web process RSS, idle | 182–184 MB | 195–196 MB | +12 MB (bundled fonts, larger CSS/DOM) |
| WebKit network process RSS | 45–47 MB | 47 MB | same |
| CPU over 10 idle seconds | 0 s core, 0–1 s web | 0 s core, 0 s web | same (`ps` resolution is 1 s) |
| Processes after closing | 0 | 0 | same |
| `.deb` | 3.76 MB | 3.93 MB | +0.17 MB |
| Executable (frontend embedded) | 7.98 MB | 8.24 MB | +0.26 MB |
| Frontend JS | 681 KB, one chunk | 808 KB total: 703 KB initial + Studio, Explore, Themes, Time Capsule, Theatre loaded on demand | +127 KB |
| Frontend CSS | 45 KB | 61 KB | +16 KB |
| Bundled fonts | none | 88 KB (3 variable woff2, Latin) | +88 KB |

**Memory after real use (found and fixed during the redesign).** Rendering previews allocates 4–16 MB buffers; glibc kept them in the heap once its dynamic mmap threshold had grown, so core RSS climbed with every render and stayed there. `benchmarks/memtest-linux.sh` (open Themes, select all 9 folders, switch presets: ~40 engine renders):

| Core RSS | Home | after Themes | after 2 more presets |
|---|---|---|---|
| 0.2 without fix | 183 MB | 318 MB | 318 MB |
| 0.2 with fixed `M_MMAP_THRESHOLD` (shipped) | 137 MB | 142 MB | 144 MB |

The fix (`tune_allocator` in `src-tauri/src/lib.rs`) applies to Linux/glibc only. 0.1 was not measured under this workload, so whether 0.1 had the same growth is unknown. Windows and macOS use different allocators and have not been measured.

## App (0.1 release build, Linux)
| Metric | Result | How |
|---|---|---|
| `.deb` installer | **3.58 MB** | `npm run tauri build -- --bundles deb` |
| Executable | **7.6 MB** (frontend embedded) | `ls -l target/release/iconmorph` |
| Window shown after launch | **~0.06 s** (3 runs: 0.061, 0.059, 0.059) | time until the X11 window is mapped |
| Idle memory, core process | **137 MB RSS** (3 runs) | `ps -o rss` on `iconmorph` 6 s after launch |
| Idle memory, WebKit web process | 182–188 MB RSS | `ps -C WebKitWebProcess` |
| Idle memory, WebKit network process | 47 MB RSS | `ps -C WebKitNetworkProcess` |
| Processes left after closing the window | **0** (`iconmorph` and all WebKit helpers gone within 1.5 s) | WM_DELETE_WINDOW sent to the window, then `pgrep` |
| Background CPU / RAM after exit with static icons applied | **0 / 0** (no process exists) | as above |

Note: RSS counts shared libraries (GTK, WebKit), so the processes' totals overstate unique memory. The 100–180 MB *active* target from the design brief is met by the core process alone, but not by core + WebView on Linux with software rendering. Expect different numbers with WebView2 on Windows.

## Engine (release, `cargo run --release -p iconmorph-core --example bench_engine`)
Median of 15 runs. The run below overlapped a parallel release build on the same 2 vCPUs, so it is pessimistic.

| Operation | Median |
|---|---|
| Decode + rasterise SVG to 1024 px | 7.7 ms |
| Compose full replacement (1024 px, shadow) | 178 ms |
| Compose folder + character (1024 px, shadow) | 162 ms |
| Compose custom shape (1024 px, shadow) | 166 ms |
| Encode ICO (16–256, 7 sizes) | 56 ms |
| Encode ICNS (16–1024 with @2x, 10 images) | 196 ms |
| Encode PNG 512 | 64 ms |
| Apply 20 folders, full transaction each (generate, backup, write, verify, journal, history) | 6.1 s total · 307 ms per item |
| Restore 20 folders | 3 ms total |
| Storage for 20 distinct icons (PNG 512) | 1.4 MB |

Optimisation history: placing the character by resampling it once to its final size, building the shadow at quarter resolution, and deriving ≤256 px sizes from one 256 px intermediate cut compose time by ~25–40 % and ICO encoding from 273 ms to 56 ms.
