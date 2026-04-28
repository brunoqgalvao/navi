#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

DRY_RUN=0
AGGRESSIVE=0

usage() {
  cat <<'EOF'
Usage: ./scripts/clean-build-artifacts.sh [--dry-run] [--aggressive]

Safely removes large generated artifacts from this repo.

Default cleanup:
  - packages/navi-app/build
  - packages/navi-app/src-tauri/target/debug
  - packages/navi-app/src-tauri/target/release/bundle
  - packages/landing-page/dist

Aggressive cleanup additionally removes:
  - packages/navi-app/src-tauri/target/release
  - packages/navi-app/src-tauri/binaries
  - packages/navi-app/src-tauri/resources/claude-agent-sdk
  - packages/landing-page/public/downloads

Examples:
  ./scripts/clean-build-artifacts.sh --dry-run
  ./scripts/clean-build-artifacts.sh --aggressive
EOF
}

human_kb() {
  awk -v kb="$1" 'BEGIN {
    split("KB MB GB TB", units, " ");
    size = kb + 0;
    unit = 1;
    while (size >= 1024 && unit < 4) {
      size /= 1024;
      unit++;
    }
    printf "%.1f%s", size, units[unit];
  }'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --aggressive)
      AGGRESSIVE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

declare -a PATHS=(
  "packages/navi-app/build"
  "packages/navi-app/src-tauri/target/debug"
  "packages/navi-app/src-tauri/target/release/bundle"
  "packages/landing-page/dist"
)

if [ "$AGGRESSIVE" -eq 1 ]; then
  PATHS+=(
    "packages/navi-app/src-tauri/target/release"
    "packages/navi-app/src-tauri/binaries"
    "packages/navi-app/src-tauri/resources/claude-agent-sdk"
    "packages/landing-page/public/downloads"
  )
fi

total_kb=0
removed_any=0

for path in "${PATHS[@]}"; do
  if [ ! -e "$path" ]; then
    continue
  fi

  size_kb="$(du -sk "$path" 2>/dev/null | awk '{print $1}')"
  total_kb=$((total_kb + size_kb))
  removed_any=1

  printf "%-8s %s\n" "$(human_kb "$size_kb")" "$path"

  if [ "$DRY_RUN" -eq 0 ]; then
    rm -rf "$path"
  fi
done

if [ "$removed_any" -eq 0 ]; then
  echo "No matching generated artifacts found."
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run only. No files were removed."
else
  echo "Removed generated artifacts."
fi

echo "Potentially reclaimed: $(human_kb "$total_kb")"
