#!/bin/bash
set -e

# Generate the latest.json manifest for Tauri updater
# This script should be run after building the app

SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$PROJECT_ROOT/packages/navi-app/src-tauri"
BUILD_DIR="$TAURI_DIR/target/release/bundle"

# Read version from tauri.conf.json
VERSION=$(grep -o '"version": "[^"]*"' "$TAURI_DIR/tauri.conf.json" | head -1 | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
  echo "Error: Could not determine version from tauri.conf.json"
  exit 1
fi

echo "Generating update manifest for version $VERSION..."

# Base URL for downloads (update this to your actual release URL)
BASE_URL="${UPDATE_BASE_URL:-https://github.com/brunogalvao/navi-releases/releases/download/v$VERSION}"

# Generate ISO 8601 timestamp
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Read release notes from CHANGELOG if it exists
NOTES=""
if [ -f "$PROJECT_ROOT/CHANGELOG.md" ]; then
  # Extract notes for current version (simple extraction)
  NOTES=$(sed -n "/## \[$VERSION\]/,/## \[/p" "$PROJECT_ROOT/CHANGELOG.md" | head -n -1 | tail -n +2)
fi
if [ -z "$NOTES" ]; then
  NOTES="Release v$VERSION"
fi

# Escape notes for JSON
NOTES_ESCAPED=$(echo "$NOTES" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')

# Check for signature files and read them
MACOS_SIG=""
MACOS_INTEL_SIG=""
WINDOWS_SIG=""
LINUX_SIG=""

# macOS ARM64 signature
if [ -f "$BUILD_DIR/macos/Navi.app.tar.gz.sig" ]; then
  MACOS_SIG=$(cat "$BUILD_DIR/macos/Navi.app.tar.gz.sig")
fi

# Windows signature (if exists)
if [ -f "$BUILD_DIR/nsis/Navi_${VERSION}_x64-setup.exe.sig" ]; then
  WINDOWS_SIG=$(cat "$BUILD_DIR/nsis/Navi_${VERSION}_x64-setup.exe.sig")
fi

# Linux signature (if exists)
if [ -f "$BUILD_DIR/appimage/Navi_${VERSION}_amd64.AppImage.sig" ]; then
  LINUX_SIG=$(cat "$BUILD_DIR/appimage/Navi_${VERSION}_amd64.AppImage.sig")
fi

# Build platforms object
PLATFORMS=""

# macOS ARM64
if [ -n "$MACOS_SIG" ]; then
  PLATFORMS="$PLATFORMS
    \"darwin-aarch64\": {
      \"url\": \"$BASE_URL/Navi.app.tar.gz\",
      \"signature\": \"$MACOS_SIG\"
    }"
fi

# macOS Intel (if you build for it)
if [ -n "$MACOS_INTEL_SIG" ]; then
  if [ -n "$PLATFORMS" ]; then PLATFORMS="$PLATFORMS,"; fi
  PLATFORMS="$PLATFORMS
    \"darwin-x86_64\": {
      \"url\": \"$BASE_URL/Navi-x86_64.app.tar.gz\",
      \"signature\": \"$MACOS_INTEL_SIG\"
    }"
fi

# Windows
if [ -n "$WINDOWS_SIG" ]; then
  if [ -n "$PLATFORMS" ]; then PLATFORMS="$PLATFORMS,"; fi
  PLATFORMS="$PLATFORMS
    \"windows-x86_64\": {
      \"url\": \"$BASE_URL/Navi_${VERSION}_x64-setup.exe\",
      \"signature\": \"$WINDOWS_SIG\"
    }"
fi

# Linux
if [ -n "$LINUX_SIG" ]; then
  if [ -n "$PLATFORMS" ]; then PLATFORMS="$PLATFORMS,"; fi
  PLATFORMS="$PLATFORMS
    \"linux-x86_64\": {
      \"url\": \"$BASE_URL/Navi_${VERSION}_amd64.AppImage\",
      \"signature\": \"$LINUX_SIG\"
    }"
fi

# Output directory
OUTPUT_DIR="$PROJECT_ROOT/releases"
mkdir -p "$OUTPUT_DIR"

# Generate the manifest
cat > "$OUTPUT_DIR/latest.json" << EOF
{
  "version": "$VERSION",
  "notes": "$NOTES_ESCAPED",
  "pub_date": "$PUB_DATE",
  "platforms": {$PLATFORMS
  }
}
EOF

echo "Generated $OUTPUT_DIR/latest.json"
echo ""
echo "Contents:"
cat "$OUTPUT_DIR/latest.json"
echo ""
echo ""
echo "Next steps:"
echo "1. Upload the .tar.gz and .sig files to your release URL"
echo "2. Upload latest.json to the updater endpoint"
echo "3. The app will check $BASE_URL/latest.json for updates"
