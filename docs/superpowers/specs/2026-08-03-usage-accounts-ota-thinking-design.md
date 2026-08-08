# Usage + Multi-Account, OTA Updates, Thinking Restyle — Design

Date: 2026-08-03
Status: Approved by Bruno (chat), implementing.

## Context

Three independent workstreams approved in one brainstorm:

1. **Thinking block redesign** — the purple bordered card in chat looks bad and
   renders an empty body panel after collapse/while streaming.
2. **Usage + multi-account panel** — surface Claude Code usage (via ccx) and
   Codex usage in Navi, with account status and swap control.
3. **OTA updates** — Navi detects new commits on origin/main and offers
   one-click update + restart.

Decisions made with Bruno:

- ccx integration: **shell out to the ccx CLI** (`ccx status --json`,
  `ccx stats`, `ccx swap`). ccx stays the source of truth.
- Usage scope v1: **Claude (ccx) + Codex** (parsed from `~/.codex`).
- OTA: **git-based only, no Tauri** — Navi is used as a localhost web app.

## Runtime facts (verified)

- Navi runs as a launchd LaunchAgent `com.navi.app` in dev mode, pointed at
  this source repo. `KeepAlive = {Crashed: true, SuccessfulExit: false}`.
- `bin/navi.ts` is a supervisor (backend, pty, vite children, no --watch, no
  respawn; any child death tears the tree down).
- `launchctl kickstart -k gui/<uid>/com.navi.app` force-restarts the service —
  this is what `navi service restart` already uses.
- Server file edits do NOT hot-reload (safe to edit while live); frontend is
  vite HMR.
- `ccx status --json` returns per-account gauges (session / weekly_all /
  weekly_scoped: percent, severity, resetsAt, isActive), activeAccount, email.
- `ccx stats` is text-only (now/avg/peak + sparkline per account per gauge).
- Codex data lives in `~/.codex` (sessions/, session_index.jsonl,
  history.jsonl); token usage parsed from session rollout files.

## 1. Thinking block restyle

`src/lib/components/AssistantMessage.svelte` (~line 621) plus consistency pass
over `StreamingPreview`, `StepRenderer`, `EventTimeline`, `SubagentModal`.

- Collapsed: single unboxed muted-gray line — `Thinking · <first-line preview>`,
  subtle chevron on hover. No border, no emoji, no purple.
- Expanded: plain gray text, normal font (not mono-in-a-box), hairline gray
  left border, copy button visible on hover only.
- Bug fix: never render the expanded body when `thinking` is empty (streaming
  placeholder caused an empty pill).

## 2. Accounts + usage (ccx-backed)

**Server** — `server/routes/accounts.ts`:

- `GET /api/accounts/status` → `ccx status --json`, cached ~30s.
- `GET /api/accounts/usage` → parsed `ccx stats --since 7d` (text → structured)
  + Codex usage summary from `~/.codex`.
- `POST /api/accounts/swap {account}` → `ccx swap <name>`; invalidates cache.
- ccx resolved from PATH (launchd PATH includes ~/.bun/bin, /opt/homebrew/bin).
  Missing ccx → graceful `{available: false}`.

**Frontend** — `src/lib/features/accounts/` feature module. Top-bar badge
(next to ClaudeAuthBadge): active account + mini gauge. Popover: all accounts
with gauges/reset times/sparkline, Codex usage row, Swap button per account
(caveat surfaced: affects new sessions only). App-wide surface, not a session
extension, per component taxonomy.

## 3. OTA updates (git-based)

**Server** — `server/routes/update.ts`:

- `GET /api/update/status` → `git fetch` + `git rev-list --count HEAD..origin/main`
  + commit subjects. Cached; periodic check ~30min; `?force=1` bypass.
- `POST /api/update/apply` → guard: repo clean enough to ff (`git pull
  --ff-only`), then `bun install`, then detached
  `launchctl kickstart -k gui/<uid>/com.navi.app`.
- If not under launchd (`NAVI_MANAGED_BY !== "launchd"`), report that restart
  must be manual instead of attempting kickstart.

**Frontend** — "Update available (n)" pill near the top-bar badges; click shows
commit subjects + **Update & Restart**. After apply: "updating…" state; the
existing connectivity/reconnect handling covers the restart gap.

**Testing** — validated on the sandbox instance (ports 4020-4022). The live
:3021 instance is never restarted by the implementing agent (we run inside it).

## Order

Thinking fix → accounts/usage → OTA. Each independently shippable.
