#!/bin/bash
set -e

cd "$(dirname "$0")/../packages/navi-app"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64)
    TAURI_TARGET="aarch64-apple-darwin"
    BUN_TARGET="bun-darwin-arm64"
    ;;
  x86_64)
    TAURI_TARGET="x86_64-apple-darwin"
    BUN_TARGET="bun-darwin-x64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

find_bun_sidecar() {
  if [ -n "$NAVI_BUN_SIDECAR_PATH" ]; then
    echo "$NAVI_BUN_SIDECAR_PATH"
    return 0
  fi
  if [ -n "$NAVI_BUN_PATH" ]; then
    echo "$NAVI_BUN_PATH"
    return 0
  fi
  if [ -n "$BUN_INSTALL" ] && [ -x "$BUN_INSTALL/bin/bun" ]; then
    echo "$BUN_INSTALL/bin/bun"
    return 0
  fi
  if [ -n "$BUN_HOME" ] && [ -x "$BUN_HOME/bin/bun" ]; then
    echo "$BUN_HOME/bin/bun"
    return 0
  fi
  if [ -x "$HOME/.bun/bin/bun" ]; then
    echo "$HOME/.bun/bin/bun"
    return 0
  fi
  command -v bun 2>/dev/null || true
}

echo "Preparing bun sidecar..."
BUN_SRC="$(find_bun_sidecar)"
if [ -z "$BUN_SRC" ] || [ ! -x "$BUN_SRC" ]; then
  echo "Bun binary not found for sidecar." >&2
  echo "Set NAVI_BUN_SIDECAR_PATH or NAVI_BUN_PATH to the bun executable." >&2
  exit 1
fi

mkdir -p src-tauri/binaries
cp "$BUN_SRC" "src-tauri/binaries/bun-$TAURI_TARGET"
chmod +x "src-tauri/binaries/bun-$TAURI_TARGET"

echo "Bundling worker resource..."
mkdir -p src-tauri/resources
bun build ./server/query-worker.ts --outfile src-tauri/resources/query-worker.js --target bun

echo "Preparing Claude agent SDK resources..."
SDK_SRC="node_modules/@anthropic-ai/claude-agent-sdk"
SDK_DEST="src-tauri/resources/claude-agent-sdk"
if [ ! -d "$SDK_SRC" ]; then
  echo "Claude agent SDK not found at $SDK_SRC" >&2
  exit 1
fi
rm -rf "$SDK_DEST"
cp -R "$SDK_SRC" "$SDK_DEST"

echo "Compiling server sidecar..."
bun build ./server/index.ts --compile --outfile "src-tauri/binaries/navi-server-$TAURI_TARGET" --target "$BUN_TARGET"

echo "Building Tauri app..."
bun run tauri build

echo "Copying build to landing page downloads..."
cp src-tauri/target/release/bundle/dmg/*.dmg ../landing-page/public/downloads/

echo "Done! Build available at:"
ls -lh ../landing-page/public/downloads/
