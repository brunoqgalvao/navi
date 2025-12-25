#!/bin/bash
set -e

cd "$(dirname "$0")/../packages/navi-app"

echo "Compiling server sidecar..."
bun build ./server/index.ts --compile --outfile src-tauri/binaries/navi-server-aarch64-apple-darwin --target bun-darwin-arm64

echo "Building Tauri app..."
bun run tauri build

echo "Copying build to landing page downloads..."
cp src-tauri/target/release/bundle/dmg/*.dmg ../landing-page/public/downloads/

echo "Done! Build available at:"
ls -lh ../landing-page/public/downloads/
