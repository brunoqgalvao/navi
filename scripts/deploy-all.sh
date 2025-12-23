#!/bin/bash
set -e

SCRIPTS="$(dirname "$0")"

echo "=== Building App ==="
"$SCRIPTS/build-app.sh"

echo ""
echo "=== Deploying Landing Page ==="
"$SCRIPTS/deploy-landing.sh"

echo ""
echo "=== All Done ==="
