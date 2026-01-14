#!/bin/bash
set -e

echo "Installing poppler (provides pdftotext and pdfinfo)..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &> /dev/null; then
        brew install poppler
    else
        echo "Error: Homebrew not found. Install from https://brew.sh"
        exit 1
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y poppler-utils
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y poppler-utils
    elif command -v pacman &> /dev/null; then
        sudo pacman -S poppler
    else
        echo "Error: Unsupported package manager"
        exit 1
    fi
else
    echo "Error: Unsupported OS"
    exit 1
fi

echo ""
echo "Verifying installation..."
pdftotext -v 2>&1 | head -1
pdfinfo -v 2>&1 | head -1

echo ""
echo "PDF reader skill installed successfully!"
echo ""
echo "Usage examples:"
echo "  pdftotext -layout file.pdf -          # Read entire PDF"
echo "  pdftotext -f 1 -l 5 -layout file.pdf - # Read pages 1-5"
echo "  pdfinfo file.pdf                       # Get page count & metadata"
