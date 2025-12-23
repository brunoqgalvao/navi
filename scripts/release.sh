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
"$SCRIPTS/build-app.sh"

echo ""
echo "=== Deploying Landing Page ==="
"$SCRIPTS/deploy-landing.sh"

echo ""
echo "=== Release v$VERSION Complete ==="
echo ""
echo "Download: https://navi-landing-639638599480.us-central1.run.app/downloads/Navi_${VERSION}_aarch64.dmg"
