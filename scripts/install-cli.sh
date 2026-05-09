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

app_uses_sharp() {
  [ -f "$APP_DIR/package.json" ] && grep -q '"sharp"' "$APP_DIR/package.json"
}

sharp_can_load() {
  (
    cd "$APP_DIR"
    bun -e 'import sharp from "sharp"; if (!sharp?.versions?.vips) process.exit(1)'
  ) >/dev/null 2>&1
}

sharp_runtime_platform() {
  (
    cd "$APP_DIR"
    bun -e 'console.log(require("sharp/lib/libvips").runtimePlatformArch())'
  )
}

link_sharp_libvips() {
  local runtime libvips_dir nested_parent nested_dir
  runtime="$(sharp_runtime_platform 2>/dev/null || true)"
  if [ -z "$runtime" ]; then
    return 0
  fi

  libvips_dir="$APP_DIR/node_modules/@img/sharp-libvips-$runtime"
  nested_parent="$APP_DIR/node_modules/sharp/node_modules/@img"
  nested_dir="$nested_parent/sharp-libvips-$runtime"

  if [ -d "$libvips_dir" ] && [ -d "$nested_parent" ] && [ ! -e "$nested_dir" ] && [ ! -L "$nested_dir" ]; then
    (
      cd "$nested_parent"
      ln -s "../../../@img/sharp-libvips-$runtime" "sharp-libvips-$runtime"
    )
  fi
}

repair_sharp_optional_dependencies() {
  if ! app_uses_sharp || sharp_can_load; then
    return 0
  fi

  echo "  Repairing sharp optional dependencies..."
  link_sharp_libvips
  if sharp_can_load; then
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "  Error: sharp did not load after bun install, and npm is unavailable for repair." >&2
    return 1
  fi

  if ! (
    cd "$APP_DIR"
    npm install --include=optional --legacy-peer-deps --no-audit --no-fund sharp --silent
  ); then
    (
      cd "$APP_DIR"
      npm install --include=optional --legacy-peer-deps --no-audit --no-fund sharp
    )
  fi

  link_sharp_libvips

  if ! sharp_can_load; then
    echo "  Error: sharp still cannot load after optional dependency repair." >&2
    return 1
  fi
}

resolve_installed_claude_code() {
  (
    cd "$APP_DIR"
    bun -e 'import { resolveClaudeCodeExecutable } from "./server/utils/claude-code.ts"; const path = resolveClaudeCodeExecutable(); if (path) console.log(path);'
  ) 2>/dev/null || true
}

resolve_installed_codex_cli() {
  (
    cd "$APP_DIR"
    bun -e 'import { resolveCodexExecutable } from "./server/backends/codex-adapter.ts"; const path = resolveCodexExecutable(); if (path) console.log(path);'
  ) 2>/dev/null || true
}

resolve_installed_gemini_cli() {
  (
    cd "$APP_DIR"
    bun -e 'import { resolveGeminiExecutable } from "./server/backends/gemini-adapter.ts"; const path = resolveGeminiExecutable(); if (path) console.log(path);'
  ) 2>/dev/null || true
}

print_cli_status() {
  local label="$1"
  local executable_path="$2"
  local version_output

  if [ -z "$executable_path" ]; then
    echo "  $label: not found"
    return 0
  fi

  version_output="$("$executable_path" --version 2>/dev/null | head -n 1 || true)"
  if [ -n "$version_output" ]; then
    echo "  $label: $executable_path ($version_output)"
  else
    echo "  $label: $executable_path"
  fi
}

check_agent_cli_installations() {
  echo "  Checking bundled agent CLIs..."
  print_cli_status "Claude Code" "$(resolve_installed_claude_code | tail -n 1)"
  print_cli_status "Codex" "$(resolve_installed_codex_cli | tail -n 1)"
  print_cli_status "Gemini" "$(resolve_installed_gemini_cli | tail -n 1)"
}

check_claude_code_auth() {
  local claude_path auth_status

  echo "  Checking Claude Code auth..."
  claude_path="$(resolve_installed_claude_code | tail -n 1)"

  if [ -z "$claude_path" ]; then
    echo "  Claude Code: not found. Install Claude Code or add an Anthropic API key in Navi Settings."
    return 0
  fi

  echo "  Claude Code: $claude_path"

  auth_status="$("$claude_path" auth status --json 2>/dev/null || "$claude_path" auth status 2>/dev/null || true)"
  if printf '%s' "$auth_status" | grep -q '"loggedIn"[[:space:]]*:[[:space:]]*true'; then
    echo "  Claude login: active"
    return 0
  fi

  if printf '%s' "$auth_status" | grep -qi 'logged in'; then
    echo "  Claude login: active"
    return 0
  fi

  echo "  Claude login: not active yet."
  echo "  Run: $claude_path auth login"
  echo "  Or set an Anthropic API key in Navi Settings."
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
NODE_EXECUTABLE_PATH="$(command -v node)"

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
repair_sharp_optional_dependencies
check_agent_cli_installations
check_claude_code_auth

# Create wrapper script
mkdir -p "$BUN_BIN_DIR"

cat >"$WRAPPER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export NAVI_APP_DIR="$APP_DIR"
export NAVI_NODE_PATH="\${NAVI_NODE_PATH:-$NODE_EXECUTABLE_PATH}"
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
