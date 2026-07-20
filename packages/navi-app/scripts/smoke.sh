#!/usr/bin/env bash
# Boots the server on an alternate port and verifies core API surface.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${SMOKE_PORT:-3777}"
# The server silently bumps to the next port if taken; ensure ours is free.
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
bun run server/index.ts "$PORT" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/api/projects" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "http://localhost:$PORT/api/projects" >/dev/null
curl -sf "http://localhost:$PORT/api/models" | grep -q "claude"
curl -sf "http://localhost:$PORT/api/sessions/recent" >/dev/null
echo "SMOKE OK"
