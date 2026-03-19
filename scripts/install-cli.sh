#!/usr/bin/env bash

set -euo pipefail

REPO="brunoqgalvao/navi"
REPO_URL="https://github.com/$REPO.git"
INSTALL_DIR="${NAVI_INSTALL_DIR:-$HOME/.navi}"
BUN_HOME_DIR="${BUN_INSTALL:-$HOME/.bun}"
BUN_BIN_DIR="$BUN_HOME_DIR/bin"
APP_DIR="$INSTALL_DIR/navi-app"
WRAPPER_PATH="$BUN_BIN_DIR/navi"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd bun
require_cmd node

echo ""
echo "  Installing Navi..."
echo ""

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

INSTALLED=false

# Strategy 1: Download tarball from latest release (small, no git needed)
if command -v curl >/dev/null 2>&1; then
  RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null || echo "")
  if [ -n "$RELEASE_JSON" ]; then
    VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\([^"]*\)".*/\1/')
    TARBALL_URL="https://github.com/$REPO/releases/download/v${VERSION}/navi-cli-${VERSION}.tar.gz"

    echo "  Found release v${VERSION}, downloading tarball..."
    if curl -fsSL "$TARBALL_URL" 2>/dev/null | tar -xz -C "$INSTALL_DIR" 2>/dev/null; then
      if [ -d "$APP_DIR" ]; then
        INSTALLED=true
        echo "  Downloaded v${VERSION}"
      fi
    fi
  fi
fi

# Strategy 2: Sparse git clone (only packages/navi-app/)
if [ "$INSTALLED" = false ]; then
  require_cmd git
  echo "  Tarball not available, cloning from git (sparse)..."

  TEMP_CLONE=$(mktemp -d)
  git clone --depth=1 --filter=blob:none --sparse "$REPO_URL" "$TEMP_CLONE" 2>/dev/null
  (cd "$TEMP_CLONE" && git sparse-checkout set packages/navi-app)

  cp -r "$TEMP_CLONE/packages/navi-app" "$APP_DIR"
  rm -rf "$TEMP_CLONE"

  if [ -d "$APP_DIR" ]; then
    INSTALLED=true
    VERSION=$(grep '"version"' "$APP_DIR/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
    echo "  Cloned v${VERSION}"
  fi
fi

if [ "$INSTALLED" = false ]; then
  echo "  Error: Installation failed." >&2
  exit 1
fi

# Install dependencies
echo "  Installing dependencies..."
(cd "$APP_DIR" && bun install --silent 2>/dev/null || bun install)

# Create wrapper script
mkdir -p "$BUN_BIN_DIR"

cat >"$WRAPPER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec bun "$APP_DIR/bin/navi.ts" "\$@"
EOF

chmod +x "$WRAPPER_PATH"

echo ""
echo "  Navi v${VERSION:-unknown} installed!"
echo ""
echo "  Command: $WRAPPER_PATH"

case ":$PATH:" in
  *":$BUN_BIN_DIR:"*)
    echo "  Run: navi"
    ;;
  *)
    echo ""
    echo "  Add to PATH:"
    echo "    export PATH=\"$BUN_BIN_DIR:\$PATH\""
    echo "  Then run: navi"
    ;;
esac
echo ""
