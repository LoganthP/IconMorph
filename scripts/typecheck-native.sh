#!/usr/bin/env bash
# Type-check and lint (clippy) the Windows and macOS adapters (and their native integration tests) from a
# Linux host. Nothing is linked or run; CI runs the real tests on Windows and macOS runners.
#
# The `windows` crate family and objc2/block2 refuse to build off-platform, so this script
# builds a throwaway workspace where those gates are lifted in local copies.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
REG="$(ls -d "${CARGO_HOME:-$HOME/.cargo}"/registry/src/index.crates.io-* | head -1)"

cp -r "$ROOT/crates/iconmorph-core" "$WORK/core"
( cd "$ROOT" && cargo fetch -q ) && ( cd "$WORK/core" && cargo fetch -q --manifest-path Cargo.toml 2>/dev/null || true )
cd "$WORK"

# Windows: stub windows-future (WinRT only) and lift #![cfg(windows)] in the crates we use.
mkdir -p stub/src && touch stub/src/lib.rs
printf '[package]\nname="windows-future"\nversion="0.3.2"\nedition="2021"\n[features]\ndefault=[]\nstd=[]\n' > stub/Cargo.toml
patch_entries='windows-future={path="stub"}'
for c in windows-0.62.2 windows-core-0.62.2 windows-strings-0.5.1 windows-result-0.4.1; do
  n="${c%-*}"
  cp -r "$REG/$c" "p-$n"; rm -f "p-$n/.cargo_vcs_info.json"
  grep -rl 'cfg(windows)\|cfg(not(windows))' "p-$n/src" | xargs -r sed -i 's/cfg(windows)/cfg(all())/g; s/cfg(not(windows))/cfg(any())/g'
  patch_entries+=$'\n'"$n={path=\"p-$n\"}"
done

# macOS: use the GNUstep runtime flavour of objc2/block2 so AppKit bindings type-check.
sed -i 's/^objc2 = { version = "0.6", optional = true }/objc2 = { version = "0.6", optional = true, features = ["gnustep-2-1"] }/' core/Cargo.toml
sed -i 's/^base64 = "0.22"/base64 = "0.22"\nblock2 = { version = "0.6", features = ["gnustep-2-1"] }/' core/Cargo.toml

cat > Cargo.toml <<TOML
[workspace]
resolver = "2"
members = ["core"]
[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
rust-version = "1.80"
[patch.crates-io]
$patch_entries
TOML

echo "==> Windows adapter + tests"
CARGO_TARGET_DIR="$ROOT/target/typecheck" cargo clippy -p iconmorph-core --tests --features typecheck-windows -- -D warnings
echo "==> macOS adapter + tests"
CARGO_TARGET_DIR="$ROOT/target/typecheck" cargo clippy -p iconmorph-core --tests --features typecheck-macos -- -D warnings
echo "OK: native adapters type-check"
