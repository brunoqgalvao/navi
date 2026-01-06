#!/bin/bash
# Playwright setup verification script

set -e

echo "Checking Playwright installation..."

# Check if playwright is available
if ! command -v npx &> /dev/null; then
    echo "ERROR: npx not found. Please install Node.js first."
    exit 1
fi

# Check if playwright is installed
if ! npx playwright --version &> /dev/null 2>&1; then
    echo "ERROR: Playwright is not installed."
    echo ""
    echo "To install Playwright, run:"
    echo "  npm install -g playwright"
    echo "  # or locally in your project:"
    echo "  npm install playwright"
    echo ""
    echo "Then install browsers:"
    echo "  npx playwright install"
    exit 1
fi

PLAYWRIGHT_VERSION=$(npx playwright --version 2>/dev/null)
echo "Playwright version: $PLAYWRIGHT_VERSION"

# Check if browsers are installed
BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    BROWSERS_PATH="$HOME/.cache/ms-playwright"
fi

if [ ! -d "$BROWSERS_PATH" ] || [ -z "$(ls -A $BROWSERS_PATH 2>/dev/null)" ]; then
    echo ""
    echo "WARNING: Playwright browsers may not be installed."
    echo ""
    echo "To install browsers, run:"
    echo "  npx playwright install"
    echo ""
    echo "Or install just Chromium (faster):"
    echo "  npx playwright install chromium"
    exit 1
fi

# Check for at least one browser
if ls "$BROWSERS_PATH"/chromium-* &> /dev/null 2>&1; then
    echo "Chromium: installed"
elif ls "$BROWSERS_PATH"/firefox-* &> /dev/null 2>&1; then
    echo "Firefox: installed"
elif ls "$BROWSERS_PATH"/webkit-* &> /dev/null 2>&1; then
    echo "WebKit: installed"
else
    echo ""
    echo "WARNING: No browsers found in $BROWSERS_PATH"
    echo ""
    echo "To install browsers, run:"
    echo "  npx playwright install"
    exit 1
fi

echo ""
echo "Playwright is ready to use!"
