#!/usr/bin/env bash
# Boots the server on an alternate port and verifies core API surface.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${SMOKE_PORT:-3777}"
# Isolated data dir: fast boot (no giant live DB) and zero risk to live data.
export NAVI_DATA_DIR="$(mktemp -d /tmp/navi-smoke.XXXXXX)"
trap 'rm -rf "$NAVI_DATA_DIR"' EXIT
# The server silently bumps to the next port if taken; ensure ours is free.
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
bun run server/index.ts "$PORT" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; rm -rf "$NAVI_DATA_DIR"' EXIT
# Boot can take ~20s when the DB is large; allow up to 60s.
for i in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/api/projects" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf "http://localhost:$PORT/api/projects" >/dev/null
curl -sf "http://localhost:$PORT/api/models" | grep -q "claude"
curl -sf "http://localhost:$PORT/api/sessions/recent" >/dev/null
echo "SMOKE OK"
