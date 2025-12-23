#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
CURRENT=$(node -p "require('$ROOT/claude-code-ui/package.json').version")

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"

echo "Bumping $CURRENT -> $NEW_VERSION"
"$(dirname "$0")/release.sh" "$NEW_VERSION"
