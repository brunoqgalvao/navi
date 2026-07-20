#!/bin/bash
set -uo pipefail

# Kill anything bound to Navi's dev ports and WAIT until they're actually free.
# Frontend: 1420 | Backend: 3021 | PTY server: 3022
PORTS=(1420 3021 3022)

kill_port() {
  local port="$1" sig="$2"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  [ -z "$pids" ] && return 0
  # shellcheck disable=SC2086
  kill "$sig" $pids 2>/dev/null || true
}

# First a polite TERM, then escalate to KILL, retrying until the ports release.
for port in "${PORTS[@]}"; do
  kill_port "$port" -TERM
done

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  busy=()
  for port in "${PORTS[@]}"; do
    if lsof -ti:"$port" >/dev/null 2>&1; then
      busy+=("$port")
      kill_port "$port" -KILL
    fi
  done

  if [ "${#busy[@]}" -eq 0 ]; then
    echo "✓ Ports free: ${PORTS[*]}"
    exit 0
  fi

  sleep 0.2
done

echo "✗ Ports still busy after retries: ${busy[*]}" >&2
exit 1
