# Contributing to IconMorph

Thanks for helping. Good first areas: platform adapters, icon collections, translations, editor tools.

## Ground rules
- **Never fake success.** Buttons must do what they say; errors must surface with a useful message.
- **Native changes must be reversible.** Every adapter change needs `read_state` → `restore` coverage and, where possible, a native integration test that runs in CI on that OS.
- **No background processes** for static icons. No tray, autostart or polling.
- **Licensed assets only.** Add each bundled file to `assets/manifests/assets.json` with source, license and SHA-256. No copyrighted characters.

## Setup
See README → Develop. Before opening a PR:

```bash
npm run lint && npm run typecheck && npm run test
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

## Adding a platform adapter
1. Implement `PlatformAdapter` in `crates/iconmorph-core/src/platform/<name>.rs`.
2. Select it in `platform::native_adapter()` / `linux::detect()`.
3. Report honest `Capabilities` (`status: "experimental"` until verified on real systems).
4. Add a `tests/<name>_native.rs` that applies and restores on temp items.
5. Update `docs/PLATFORMS.md` and the README matrix.

## Commit style
Small, focused commits with an imperative subject (`Add Thunar fallback for metadata errors`).
