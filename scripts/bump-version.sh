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

# Update navi-app package.json
cd "$ROOT/packages/navi-app"
npm pkg set version="$VERSION"
echo "Updated packages/navi-app/package.json"

# Update Tauri config
TAURI_CONF="$ROOT/packages/navi-app/src-tauri/tauri.conf.json"
if [ -f "$TAURI_CONF" ]; then
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TAURI_CONF"
  echo "Updated src-tauri/tauri.conf.json"
fi

# Update Cargo.toml
CARGO_TOML="$ROOT/packages/navi-app/src-tauri/Cargo.toml"
if [ -f "$CARGO_TOML" ]; then
  sed -i '' "s/^version = \"[^\"]*\"/version = \"$VERSION\"/" "$CARGO_TOML"
  echo "Updated src-tauri/Cargo.toml"
fi

# Update landing page package.json
cd "$ROOT/packages/landing-page"
npm pkg set version="$VERSION"
echo "Updated packages/landing-page/package.json"

# Update landing page Hero.svelte download links and version display
HERO_SVELTE="$ROOT/packages/landing-page/src/lib/components/Hero.svelte"
if [ -f "$HERO_SVELTE" ]; then
  # Update download link: Navi_X.X.X_aarch64.dmg or Navi_X.X_aarch64.dmg
  sed -i '' "s/Navi_[0-9]*\.[0-9]*\(\.[0-9]*\)*_aarch64\.dmg/Navi_${VERSION}_aarch64.dmg/g" "$HERO_SVELTE"
  # Update all version displays: vX.X.X or vX.X
  sed -i '' "s/v[0-9]*\.[0-9]*\(\.[0-9]*\)*/v${VERSION}/g" "$HERO_SVELTE"
  echo "Updated packages/landing-page/src/lib/components/Hero.svelte"
fi

echo ""
echo "Version bumped to $VERSION"
echo "Next steps:"
echo "  1. ./scripts/build-app.sh      # Build the app"
echo "  2. ./scripts/deploy-landing.sh # Deploy to Cloud Run"
