#!/bin/bash
set -e

cd "$(dirname "$0")/../claude-code-ui"

echo "Building Tauri app..."
bun run tauri build

echo "Copying build to landing page downloads..."
cp src-tauri/target/release/bundle/dmg/*.dmg ../landing-page/public/downloads/

echo "Done! Build available at:"
ls -lh ../landing-page/public/downloads/
