#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$ROOT_DIR/packages/navi-app"
BUNDLE_PATH="$APP_DIR/src-tauri/target/release/bundle/macos/Navi.app"

echo "=== Navi Tauri Installer ==="
echo

# Check prerequisites
check_prerequisites() {
    local missing=()

    if ! command -v rustc &> /dev/null; then
        missing+=("rustc")
    fi

    if ! command -v cargo &> /dev/null; then
        missing+=("cargo")
    fi

    if ! command -v bun &> /dev/null; then
        missing+=("bun")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        echo "Missing prerequisites: ${missing[*]}"
        echo "Please install them before continuing."
        exit 1
    fi

    echo "All prerequisites found."
}

# Install dependencies
install_deps() {
    echo
    echo "Installing dependencies..."
    cd "$APP_DIR"
    bun install
}

# Build the app
build_app() {
    echo
    echo "Building Tauri app (this may take a few minutes)..."
    cd "$APP_DIR"
    bun run tauri build
}

# Install to Applications
install_app() {
    if [ -d "$BUNDLE_PATH" ]; then
        echo
        echo "Build successful!"
        echo "App location: $BUNDLE_PATH"
        echo
        read -p "Install to /Applications? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if [ -d "/Applications/Navi.app" ]; then
                echo "Removing existing Navi.app..."
                rm -rf "/Applications/Navi.app"
            fi
            cp -R "$BUNDLE_PATH" /Applications/
            echo "Installed to /Applications/Navi.app"
        else
            echo "Skipping installation. You can find the app at:"
            echo "  $BUNDLE_PATH"
        fi
    else
        echo "Build failed - app bundle not found at $BUNDLE_PATH"
        exit 1
    fi
}

# Main
check_prerequisites
install_deps
build_app
install_app

echo
echo "Done!"
