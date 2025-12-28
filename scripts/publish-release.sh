#!/bin/bash
set -e

# Publish release to the landing page update server
# Usage: ./publish-release.sh <version>

if [ -z "$1" ]; then
  echo "Usage: ./publish-release.sh <version>"
  exit 1
fi

VERSION=$1
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RELEASES_DIR="$PROJECT_ROOT/releases"
MANIFEST="$RELEASES_DIR/latest.json"

# Landing page API
API_URL="https://navi-landing-639638599480.us-central1.run.app/api/releases"

# Check for ADMIN_KEY
if [ -z "$NAVI_ADMIN_KEY" ]; then
  # Try to read from .env file
  if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -E '^NAVI_ADMIN_KEY=' "$PROJECT_ROOT/.env" | xargs)
  fi
fi

if [ -z "$NAVI_ADMIN_KEY" ]; then
  echo "Error: NAVI_ADMIN_KEY environment variable is not set"
  echo "Set it in your environment or in .env file"
  exit 1
fi

# Check if manifest exists
if [ ! -f "$MANIFEST" ]; then
  echo "Error: Manifest not found at $MANIFEST"
  echo "Run generate-update-manifest.sh first"
  exit 1
fi

echo "Publishing release v$VERSION to update server..."

# Read the manifest and send to API
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Authorization: Bearer $NAVI_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d @"$MANIFEST")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
  echo "Successfully published release v$VERSION"
  echo "Response: $BODY"
else
  echo "Error publishing release: HTTP $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

# Verify the release is available
echo ""
echo "Verifying release..."
VERIFY=$(curl -s "https://navi-landing-639638599480.us-central1.run.app/api/updates/latest.json")
echo "Latest release: $VERIFY"
