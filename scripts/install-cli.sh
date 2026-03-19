#!/usr/bin/env bash

set -euo pipefail

REPO="brunoqgalvao/navi"
INSTALL_DIR="${NAVI_INSTALL_DIR:-$HOME/.navi}"
BUN_HOME_DIR="${BUN_INSTALL:-$HOME/.bun}"
BUN_BIN_DIR="$BUN_HOME_DIR/bin"
APP_DIR="$INSTALL_DIR/navi-app"
WRAPPER_PATH="$BUN_BIN_DIR/navi"

# Colors
dim() { printf '\033[2m%s\033[0m' "$1"; }
green() { printf '\033[32m%s\033[0m' "$1"; }
cyan() { printf '\033[36m%s\033[0m' "$1"; }
bold() { printf '\033[1m%s\033[0m' "$1"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd bun
require_cmd node
require_cmd curl

echo ""
echo "  Installing Navi..."
echo ""

# Get latest release version
echo "  $(dim "Fetching latest release...")"
RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")
VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\([^"]*\)".*/\1/')
TARBALL_URL="https://github.com/$REPO/releases/download/v${VERSION}/navi-cli-${VERSION}.tar.gz"

echo "  $(dim "Version:")  $(cyan "v$VERSION")"
echo "  $(dim "Install:")  $(cyan "$INSTALL_DIR")"
echo ""

# Download and extract
echo "  $(dim "Downloading...")"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

curl -fsSL "$TARBALL_URL" | tar -xz -C "$INSTALL_DIR"

if [ ! -d "$APP_DIR" ]; then
  echo "  Error: Download failed or tarball structure unexpected." >&2
  echo "  Expected $APP_DIR to exist." >&2
  exit 1
fi

# Install dependencies
echo "  $(dim "Installing dependencies...")"
(cd "$APP_DIR" && bun install --silent)

# Create wrapper script
mkdir -p "$BUN_BIN_DIR"

cat >"$WRAPPER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec bun "$APP_DIR/bin/navi.ts" "\$@"
EOF

chmod +x "$WRAPPER_PATH"

echo ""
echo "  $(green "$(bold "Navi v$VERSION installed!")")"
echo ""
echo "  $(dim "Command:") $WRAPPER_PATH"

case ":$PATH:" in
  *":$BUN_BIN_DIR:"*)
    echo ""
    echo "  Run: $(cyan "navi")"
    ;;
  *)
    echo ""
    echo "  Add to PATH:"
    echo "    export PATH=\"$BUN_BIN_DIR:\$PATH\""
    echo "  Then run: $(cyan "navi")"
    ;;
esac
echo ""
