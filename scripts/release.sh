#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./release.sh <version>"
  echo "Example: ./release.sh 0.2.0"
  exit 1
fi

VERSION=$1
SCRIPTS="$(dirname "$0")"

echo "=== Releasing v$VERSION ==="
echo ""

# Bump version
"$SCRIPTS/bump-version.sh" "$VERSION"

echo ""
echo "=== Building App ==="
# Set signing key for updater artifacts
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/navi.key)"
"$SCRIPTS/build-app.sh"

echo ""
echo "=== Generating Update Manifest ==="
"$SCRIPTS/generate-update-manifest.sh"

echo ""
echo "=== Deploying Landing Page ==="
"$SCRIPTS/deploy-landing.sh"

echo ""
echo "=== Publishing Release to Update Server ==="
"$SCRIPTS/publish-release.sh" "$VERSION"

echo ""
echo "=== Release v$VERSION Complete ==="
echo ""
echo "Download: https://navi-landing-639638599480.us-central1.run.app/downloads/Navi_${VERSION}_aarch64.dmg"
echo "Update API: https://navi-landing-639638599480.us-central1.run.app/api/updates/latest.json"
