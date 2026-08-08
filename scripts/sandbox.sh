#!/usr/bin/env bash
# Sandbox instance of Navi for agent-driven testing.
#
# Fully isolated from the live app: own data dir (~/.claude-code-ui-sandbox),
# own ports (backend 4021, pty 4022, frontend 4020 — far outside the live
# frontend's 3021-3030 port-discovery scan range so the live UI can never
# latch onto the sandbox backend).
#
# Usage: scripts/sandbox.sh {start|stop|restart|status|logs|url}
#   start [--frontend]   boot backend (+ pty); --frontend also boots vite
#   stop                 kill all sandbox processes
#   restart [--frontend] stop + start
#   status               health-check each process
#   logs [n]             tail last n lines (default 40) of backend log
#   url                  print the API base / frontend URLs
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$REPO/packages/navi-app"
SANDBOX_DIR="${NAVI_SANDBOX_DIR:-$HOME/.claude-code-ui-sandbox}"
LOG_DIR="$SANDBOX_DIR/logs"
PID_DIR="$SANDBOX_DIR/pids"
BACKEND_PORT=4021
PTY_PORT=4022
FRONTEND_PORT=4020

mkdir -p "$LOG_DIR" "$PID_DIR"

pidfile() { echo "$PID_DIR/$1.pid"; }

is_running() {
  local pf; pf="$(pidfile "$1")"
  [[ -f "$pf" ]] && kill -0 "$(cat "$pf")" 2>/dev/null
}

start_backend() {
  if is_running backend; then echo "backend: already running (pid $(cat "$(pidfile backend)"))"; return; fi
  ( cd "$APP" && NAVI_DATA_DIR="$SANDBOX_DIR" bun run server/index.ts "$BACKEND_PORT" \
      >> "$LOG_DIR/backend.log" 2>&1 & echo $! > "$(pidfile backend)" )
  for _ in $(seq 1 30); do
    curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1 && { echo "backend: up on :$BACKEND_PORT"; return; }
    sleep 0.5
  done
  echo "backend: FAILED to come up — last log lines:" >&2
  tail -20 "$LOG_DIR/backend.log" >&2
  exit 1
}

start_pty() {
  if is_running pty; then echo "pty: already running"; return; fi
  ( cd "$APP" && PTY_PORT="$PTY_PORT" node server/pty-server.cjs \
      >> "$LOG_DIR/pty.log" 2>&1 & echo $! > "$(pidfile pty)" )
  echo "pty: started on :$PTY_PORT"
}

start_frontend() {
  if is_running frontend; then echo "frontend: already running"; return; fi
  ( cd "$APP" && VITE_NAVI_SERVER_PORT="$BACKEND_PORT" VITE_NAVI_PTY_PORT="$PTY_PORT" \
      bunx vite --port "$FRONTEND_PORT" --strictPort \
      >> "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$(pidfile frontend)" )
  for _ in $(seq 1 30); do
    curl -sf "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1 && { echo "frontend: up on :$FRONTEND_PORT"; return; }
    sleep 0.5
  done
  echo "frontend: FAILED — last log lines:" >&2
  tail -20 "$LOG_DIR/frontend.log" >&2
  exit 1
}

stop_one() {
  local name="$1" pf; pf="$(pidfile "$name")"
  if [[ -f "$pf" ]]; then
    local pid; pid="$(cat "$pf")"
    # Kill the whole process group's children too (vite/bun spawn workers)
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    rm -f "$pf"
    echo "$name: stopped"
  fi
}

stop_all() {
  stop_one frontend
  stop_one pty
  stop_one backend
  # Belt & suspenders: free the sandbox ports
  lsof -ti:"$BACKEND_PORT","$PTY_PORT","$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
}

status() {
  for name in backend pty frontend; do
    if is_running "$name"; then echo "$name: running (pid $(cat "$(pidfile "$name")"))"; else echo "$name: stopped"; fi
  done
  curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1 \
    && echo "backend health: OK" || echo "backend health: unreachable"
}

case "${1:-}" in
  start)
    start_backend
    start_pty
    if [[ "${2:-}" == "--frontend" ]]; then start_frontend; fi
    ;;
  stop) stop_all ;;
  restart)
    stop_all
    sleep 1
    start_backend
    start_pty
    if [[ "${2:-}" == "--frontend" ]]; then start_frontend; fi
    ;;
  status) status ;;
  logs) tail -n "${2:-40}" "$LOG_DIR/backend.log" ;;
  url)
    echo "api:      http://localhost:$BACKEND_PORT/api"
    echo "frontend: http://localhost:$FRONTEND_PORT"
    echo "data:     $SANDBOX_DIR"
    ;;
  *) echo "usage: $0 {start|stop|restart|status|logs [n]|url} [--frontend]"; exit 2 ;;
esac
