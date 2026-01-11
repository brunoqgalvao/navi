#!/bin/bash
# Launch Chrome with remote debugging enabled
# This allows Playwright to connect to YOUR browser with YOUR saved passwords/cards

set -e

PORT=9222
CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Check if Chrome is already running with debugging
if lsof -i :$PORT > /dev/null 2>&1; then
    echo "Chrome is already running with remote debugging on port $PORT"
    echo ""
    echo "To verify connection, run:"
    echo "  node ~/.claude/skills/browser-agent/scripts/connect.js"
    exit 0
fi

# Check if regular Chrome is running
if pgrep -x "Google Chrome" > /dev/null; then
    echo "WARNING: Chrome is running but NOT with remote debugging."
    echo ""
    echo "Options:"
    echo "  1. Close Chrome completely, then run this script again"
    echo "  2. Or manually restart Chrome with: $0 --force"
    echo ""
    read -p "Close Chrome and relaunch with debugging? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Closing Chrome..."
        osascript -e 'quit app "Google Chrome"'
        sleep 2
    else
        echo "Aborted. Please close Chrome manually and try again."
        exit 1
    fi
fi

# Get the user's Chrome profile directory
PROFILE_DIR="$HOME/Library/Application Support/Google/Chrome"

if [ ! -d "$PROFILE_DIR" ]; then
    echo "ERROR: Chrome profile not found at $PROFILE_DIR"
    echo "Make sure you have Google Chrome installed and have used it at least once."
    exit 1
fi

echo "Launching Chrome with remote debugging..."
echo "  Port: $PORT"
echo "  Profile: $PROFILE_DIR"
echo ""

# Launch Chrome with remote debugging
"$CHROME_APP" \
    --remote-debugging-port=$PORT \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    &

# Wait a moment for Chrome to start
sleep 2

# Verify it's running
if lsof -i :$PORT > /dev/null 2>&1; then
    echo "Chrome launched successfully!"
    echo ""
    echo "Your browser is now ready for the Browser Agent."
    echo "All your saved passwords, cards, and sessions are available."
    echo ""
    echo "To verify connection:"
    echo "  node ~/.claude/skills/browser-agent/scripts/connect.js"
else
    echo "ERROR: Chrome doesn't seem to be listening on port $PORT"
    echo "Try closing all Chrome windows and running this script again."
    exit 1
fi
