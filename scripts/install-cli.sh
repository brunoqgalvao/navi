#!/usr/bin/env bash

set -euo pipefail

REPO="brunoqgalvao/navi"
REPO_URL="https://github.com/$REPO.git"
INSTALL_DIR="${NAVI_INSTALL_DIR:-$HOME/.navi}"
BUN_HOME_DIR="${BUN_INSTALL:-$HOME/.bun}"
BUN_BIN_DIR="$BUN_HOME_DIR/bin"
APP_DIR="$INSTALL_DIR/navi-app"
WRAPPER_PATH="$BUN_BIN_DIR/navi"
SOURCE_DIR="${NAVI_SOURCE_DIR:-}"
START_AT_LOGIN="${NAVI_START_AT_LOGIN:-ask}"

usage() {
  cat <<EOF
Usage: install-cli.sh [options]

Options:
  --start-at-login     Install and start the macOS LaunchAgent after install
  --no-start-at-login  Skip LaunchAgent setup
  -h, --help           Show this help

Environment:
  NAVI_START_AT_LOGIN=yes|no|ask  Control LaunchAgent setup (default: ask)
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --start-at-login|--login-item|--launch-agent)
      START_AT_LOGIN="yes"
      ;;
    --no-start-at-login|--no-login-item|--no-launch-agent)
      START_AT_LOGIN="no"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

app_is_complete() {
  [ -f "$APP_DIR/package.json" ] && \
  [ -f "$APP_DIR/src/main.ts" ] && \
  [ -f "$APP_DIR/src/App.svelte" ]
}

is_macos() {
  [ "$(uname -s 2>/dev/null || echo "")" = "Darwin" ]
}

is_truthy() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

is_falsey() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    0|false|no|n|off) return 0 ;;
    *) return 1 ;;
  esac
}

can_prompt() {
  [ -z "${CI:-}" ] && [ -r /dev/tty ] && [ -w /dev/tty ]
}

should_start_at_login() {
  local choice
  choice="$(printf '%s' "$START_AT_LOGIN" | tr '[:upper:]' '[:lower:]')"

  if is_truthy "$choice"; then
    return 0
  fi

  if is_falsey "$choice"; then
    return 1
  fi

  case "$choice" in
    ""|ask|prompt)
      if ! is_macos || ! can_prompt; then
        return 1
      fi

      local reply
      printf "  Start Navi automatically at login? [y/N] " >/dev/tty
      read -r reply </dev/tty || reply=""
      is_truthy "$reply"
      ;;
    *)
      echo "  Error: NAVI_START_AT_LOGIN must be yes, no, or ask." >&2
      exit 1
      ;;
  esac
}

validate_start_at_login() {
  local choice
  choice="$(printf '%s' "$START_AT_LOGIN" | tr '[:upper:]' '[:lower:]')"
  if is_truthy "$choice" || is_falsey "$choice"; then
    return 0
  fi
  case "$choice" in
    ""|ask|prompt) return 0 ;;
    *)
      echo "  Error: NAVI_START_AT_LOGIN must be yes, no, or ask." >&2
      exit 1
      ;;
  esac
}

install_start_at_login() {
  if ! is_macos; then
    echo "  Start at login is only supported on macOS right now. Skipping."
    return 0
  fi

  if ! command -v launchctl >/dev/null 2>&1; then
    echo "  launchctl was not found, so start at login could not be enabled." >&2
    return 0
  fi

  echo ""
  echo "  Setting Navi to start at login..."
  if "$WRAPPER_PATH" service install --dev; then
    echo ""
    echo "  Navi will start automatically at login."
  else
    echo ""
    echo "  Navi installed, but start-at-login setup failed." >&2
    echo "  Retry later with: $WRAPPER_PATH service install --dev" >&2
  fi
}

validate_start_at_login

require_cmd bun
require_cmd node

echo ""
echo "  Installing Navi..."
echo ""

mkdir -p "$INSTALL_DIR"
if [ -e "$APP_DIR" ]; then
  OLD_APP_DIR="$INSTALL_DIR/.navi-app.old.$$"
  mv "$APP_DIR" "$OLD_APP_DIR"
  rm -rf "$OLD_APP_DIR" 2>/dev/null || true
fi

INSTALLED=false

# Local development install. This is intentionally opt-in so the public
# installer keeps using releases/git, while maintainers can test this checkout.
if [ -n "$SOURCE_DIR" ]; then
  require_cmd tar
  SOURCE_APP_DIR="$SOURCE_DIR"
  if [ -d "$SOURCE_DIR/packages/navi-app" ]; then
    SOURCE_APP_DIR="$SOURCE_DIR/packages/navi-app"
  fi
  if [ ! -f "$SOURCE_APP_DIR/package.json" ]; then
    echo "  Error: NAVI_SOURCE_DIR does not point to navi-app or the repo root." >&2
    exit 1
  fi

  echo "  Copying app from $SOURCE_APP_DIR..."
  mkdir -p "$APP_DIR"
  (
    cd "$SOURCE_APP_DIR"
    tar \
      --exclude="./node_modules" \
      --exclude="./build" \
      --exclude="./src-tauri/target" \
      -cf - .
  ) | (
    cd "$APP_DIR"
    tar -xf -
  )

  if app_is_complete; then
    INSTALLED=true
    VERSION=$(grep '"version"' "$APP_DIR/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
    echo "  Copied v${VERSION}"
  else
    echo "  Error: source app is missing required files." >&2
    exit 1
  fi
fi

# Strategy 1: Download tarball from latest release (small, no git needed)
if [ "$INSTALLED" = false ] && command -v curl >/dev/null 2>&1; then
  RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null || echo "")
  if [ -n "$RELEASE_JSON" ]; then
    VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\([^"]*\)".*/\1/')
    TARBALL_URL="https://github.com/$REPO/releases/download/v${VERSION}/navi-cli-${VERSION}.tar.gz"

    echo "  Found release v${VERSION}, downloading tarball..."
    if curl -fsSL "$TARBALL_URL" 2>/dev/null | tar -xz -C "$INSTALL_DIR" 2>/dev/null; then
      if app_is_complete; then
        INSTALLED=true
        echo "  Downloaded v${VERSION}"
      else
        echo "  Release tarball is missing app files, falling back to git..."
        rm -rf "$APP_DIR"
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

  if app_is_complete; then
    INSTALLED=true
    VERSION=$(grep '"version"' "$APP_DIR/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
    echo "  Cloned v${VERSION}"
  else
    echo "  Error: cloned app is missing required files." >&2
    exit 1
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
export NAVI_APP_DIR="$APP_DIR"
exec bun "$APP_DIR/bin/navi.ts" "\$@"
EOF

chmod +x "$WRAPPER_PATH"

if should_start_at_login; then
  install_start_at_login
fi

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
if is_macos; then
  echo ""
  echo "  Start at login: $WRAPPER_PATH service install --dev"
fi
echo ""
