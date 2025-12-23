#!/bin/bash
# Run Claude Code with API request logging

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting mitmproxy on port 8080..."
echo "Logs will be saved to: $SCRIPT_DIR/../logs/"
echo ""
echo "In another terminal, run:"
echo "  export HTTPS_PROXY=http://localhost:8080"
echo "  export HTTP_PROXY=http://localhost:8080"
echo "  claude"
echo ""
echo "Press Ctrl+C to stop"
echo ""

mitmdump -s "$SCRIPT_DIR/log-requests.py" --ssl-insecure -p 8080
