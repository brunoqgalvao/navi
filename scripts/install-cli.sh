#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${NAVI_REPO_URL:-https://github.com/brunoqgalvao/navi.git}"
REPO_REF="${NAVI_REPO_REF:-main}"
SOURCE_DIR="${NAVI_SOURCE_DIR:-}"
INSTALL_DIR="${NAVI_INSTALL_DIR:-$HOME/.navi}"
BUN_HOME_DIR="${BUN_INSTALL:-$HOME/.bun}"
BUN_BIN_DIR="$BUN_HOME_DIR/bin"
APP_DIR="$INSTALL_DIR/packages/navi-app"
WRAPPER_PATH="$BUN_BIN_DIR/navi"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd bun
require_cmd node

echo "Installing Navi CLI..."
if [ -n "$SOURCE_DIR" ]; then
  echo "  Source:  $SOURCE_DIR"
else
  echo "  Repo:    $REPO_URL"
  echo "  Ref:     $REPO_REF"
fi
echo "  Install: $INSTALL_DIR"

rm -rf "$INSTALL_DIR"

if [ -n "$SOURCE_DIR" ]; then
  mkdir -p "$INSTALL_DIR"
  tar \
    --exclude="packages/navi-app/build" \
    --exclude="packages/navi-app/src-tauri/target" \
    -C "$SOURCE_DIR" \
    -cf - packages/navi-app | tar -C "$INSTALL_DIR" -xf -
else
  git clone --depth=1 --branch "$REPO_REF" "$REPO_URL" "$INSTALL_DIR"
fi

if [ -d "$APP_DIR/node_modules" ]; then
  echo "Using copied app dependencies..."
else
  echo "Installing app dependencies..."
  (cd "$APP_DIR" && bun install)
fi

mkdir -p "$BUN_BIN_DIR"

cat >"$WRAPPER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec bun "$APP_DIR/bin/navi.ts" "\$@"
EOF

chmod +x "$WRAPPER_PATH"

echo
echo "Navi CLI installed."
echo "  Command: $WRAPPER_PATH"

case ":$PATH:" in
  *":$BUN_BIN_DIR:"*)
    echo "  Run: navi"
    ;;
  *)
    echo "  Add to PATH:"
    echo "    export PATH=\"$BUN_BIN_DIR:\$PATH\""
    echo "  Then run: navi"
    ;;
esac
