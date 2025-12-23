#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./bump-version.sh <version>"
  echo "Example: ./bump-version.sh 0.2.0"
  exit 1
fi

VERSION=$1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "Bumping version to $VERSION..."

# Update claude-code-ui package.json
cd "$ROOT/claude-code-ui"
npm pkg set version="$VERSION"
echo "Updated claude-code-ui/package.json"

# Update Tauri config
TAURI_CONF="$ROOT/claude-code-ui/src-tauri/tauri.conf.json"
if [ -f "$TAURI_CONF" ]; then
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TAURI_CONF"
  echo "Updated src-tauri/tauri.conf.json"
fi

# Update Cargo.toml
CARGO_TOML="$ROOT/claude-code-ui/src-tauri/Cargo.toml"
if [ -f "$CARGO_TOML" ]; then
  sed -i '' "s/^version = \"[^\"]*\"/version = \"$VERSION\"/" "$CARGO_TOML"
  echo "Updated src-tauri/Cargo.toml"
fi

# Update landing page package.json
cd "$ROOT/landing-page"
npm pkg set version="$VERSION"
echo "Updated landing-page/package.json"

echo ""
echo "Version bumped to $VERSION"
echo "Next steps:"
echo "  1. ./scripts/build-app.sh      # Build the app"
echo "  2. ./scripts/deploy-landing.sh # Deploy to Cloud Run"
