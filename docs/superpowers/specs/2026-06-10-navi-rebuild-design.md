# Navi Rebuild — Design Spec

**Date:** 2026-06-10
**Status:** Draft for review
**Owner:** Bruno Galvão

## 1. Goal

Rebuild Navi (currently `claude-code-local-ui`, 159k LoC) as a stable, focused, local-first GUI for AI coding agents. Greenfield monorepo with selective porting of proven code. Old app stays untouched and runnable until the new app surpasses it.

**Core features (keep):** chat/sessions, multi-agent, terminal, git, skills, workflows/automations.
**Removed:** kanban, channels, email/WhatsApp, council, canvas-mode, plugins, inbox, Navi Cloud, E2B.

**Critical requirement:** first-class support for three backends — Claude Code (Claude models), Codex (OpenAI models), Gemini CLI (Gemini models) — including cross-backend multi-agent.

**Non-goals:** data migration from the old app (fresh start), publishing the gateway to npm in v1 (structured for it, published later), mobile/web-hosted deployment.

## 2. Architecture

New repo, Bun workspaces:

```
navi/
  packages/
    gateway/    # @navi/agent-gateway — standalone lib, zero UI/server deps
    shared/     # typed WS protocol + domain types (zod schemas)
    server/     # Bun HTTP + WebSocket, SQLite, workflow engine
    ui/         # Svelte 5 + Vite + Tailwind
    pty/        # Node PTY server (ported from old repo)
```

Stack unchanged from old app: Svelte 5, Vite, Tailwind, Bun. DB changes from sql.js (in-memory) to `bun:sqlite` (native, WAL mode).

Ports: ui 1420, server 3001, pty 3002 (same as old app; both can't run simultaneously by default — acceptable, document `NAVI_PORT_OFFSET` env var if needed).

## 3. Gateway package (`@navi/agent-gateway`)

The heart of the rebuild. One interface, three adapters, each using the backend's best native programmatic interface (verified June 2026):

| Backend | Transport | Permissions | Resume |
|---|---|---|---|
| Claude | `@anthropic-ai/claude-agent-sdk` (in-process) | native callbacks | native |
| Codex | `codex app-server`, JSON-RPC over stdio (`@openai/codex-sdk`) | server-initiated approval RPCs | `resumeThread()` |
| Gemini | `gemini --experimental-acp` (Agent Client Protocol over stdio) | ACP `request_permission` bridge — **partially console-based today; treated as degraded** | `--resume` |

### 3.1 Interface

```ts
interface AgentBackend {
  id: 'claude' | 'codex' | 'gemini'
  capabilities(): Capabilities
  detect(): Promise<DetectResult>            // CLI installed? authed? version?
  createSession(opts: SessionOptions): AgentSession
  resumeSession(backendSessionId: string, opts: SessionOptions): AgentSession
}

interface AgentSession {
  send(input: UserInput): AsyncIterable<GatewayEvent>
  respondToPermission(requestId: string, decision: PermissionDecision): void
  cancel(): Promise<void>
}
```

### 3.2 Normalized event stream

`GatewayEvent` discriminated union (zod-validated):
`text-delta | thinking-delta | tool-start | tool-output | tool-end | permission-request | usage | session-meta | agent-spawned | error | done`

**Normalized usage schema** (designed up front, not improvised):

```ts
type UsageEvent = {
  inputTokens: number; outputTokens: number;
  cacheReadTokens?: number; cacheWriteTokens?: number;
  costUsd?: number;          // computed from a per-model price table when the backend doesn't report cost
  model: string; raw: unknown;  // original payload preserved
}
```

### 3.3 Capabilities contract — honesty over parity theater

Each adapter declares what actually works:

```ts
type Capabilities = {
  streaming: boolean
  thinkingStream: boolean        // Gemini: false today (known ACP issue)
  permissions: 'callback' | 'modes-only'   // Gemini may start as 'modes-only'
  resume: boolean
  mcp: boolean
  models: ModelInfo[]
}
```

The UI renders from capabilities; it never special-cases backend IDs. When Gemini's ACP matures, flipping flags upgrades the UX with zero UI changes. **"Full parity" is defined as: identical UI contract, with degradations explicitly declared and visible to the user — not pretending all backends behave identically.**

### 3.4 Cross-backend multi-agent (via built-in MCP server)

The gateway runs one small local MCP server exposed to every session:

- `spawn_agent(backend, model, task, cwd)` → child session id
- `list_agents()`, `get_agent_result(id)`, `send_to_agent(id, message)`

All three CLIs support MCP, so any session on any backend can orchestrate children on any other backend. One mechanism, three backends.

**Guard rails (answering the critic):**
- **Child permissions:** child inherits parent's permission mode; any `permission-request` a child raises bubbles up the hierarchy to the root session's UI.
- **Depth limit:** default max depth 2, max concurrent children 5 (configurable).
- **Cost ceiling:** optional per-tree USD budget; gateway cancels children when exceeded.

**This entire mechanism is validated in Phase 0 (spike) before anything is built on it.**

### 3.5 Skills across backends

Skills remain markdown files, directory-compatible with `.claude/skills/`. Claude loads natively. For Codex/Gemini the gateway injects a skill index (name + description) into session context and exposes a `use_skill(name)` MCP tool returning full content. Same files serve all three backends. (Mapping to AGENTS.md/GEMINI.md natively is a possible v2 simplification — evaluated during Phase 0.)

### 3.6 Open-source posture

Built as a clean standalone package (own README, no app imports) from day one, but **publication, docs site, and semver commitment are deferred until the app is stable**. Open-sourcing during the rebuild would double scope.

## 4. Server

Bun HTTP + one WebSocket endpoint. Thin domain routes: `projects`, `sessions`, `git`, `skills`, `workflows`, `settings`.

- **WS protocol:** discriminated unions defined in `packages/shared`, zod-validated on both ends, protocol version field. One small handler module per message type — no monolithic handler.
- **Gateway relay:** `GatewayEvent`s stream to clients with minimal translation; events also persist to messages as they complete.
- **API keys:** stored in `settings` table, never logged; passed to CLIs via env at spawn. (Backends mostly use their own auth — `claude login`, `codex auth`, `gemini auth` — gateway `detect()` reports auth status and the UI links to fix-it instructions.)
- **Crash isolation:** an adapter subprocess dying fails that session with a visible error; the server and other sessions are unaffected.

## 5. Workflow engine (the redo)

A workflow = name, prompt, backend + model, trigger, optional gate (shell command with timeout), enabled flag.

**Triggers (v1 — cut from 7 to 4 per critique):**
1. `schedule` — cron / interval / once
2. `webhook` — local HTTP endpoint `POST /hooks/:workflowId` guarded by per-workflow token
3. `workflow-completed` — chaining (with cycle detection)
4. `manual` — run-now button

Deferred to v2: `file-change` (debounce/ignore complexity), `git-event` (installing hooks into user repos is invasive).

**Durability (the core fix):**
- `next_run_at` persisted in DB; timers are a projection of DB state, never the source of truth.
- On boot: reconcile DB vs wall clock; missed runs handled by per-workflow `catch_up` policy (`skip` default | `run-once`); re-arm timers.
- Every run recorded in `workflow_runs` (status, started/completed, output summary, cost, error).
- Failures produce visible notifications; `last_error` shown in UI.

**Execution:** each run creates a session through the gateway — workflows work on all three backends for free. Gates run with a 60s default timeout.

**UI:** real editor (create/edit/test-run/enable), run history with per-run transcript link, next-run countdown.

## 6. Data layer

`bun:sqlite`, WAL mode, foreign keys ON. Numbered SQL migrations (`migrations/001_init.sql`, ...) with `schema_version` table — no ALTER TABLE try/catch fallbacks ever.

Tables (~10): `projects`, `sessions` (incl. parent/root/depth for hierarchy), `messages`, `skills`, `workflows`, `workflow_runs`, `settings`, `cost_entries`, `schema_version`.

**Retention (answering the 406MB lesson):** messages older than N days (default 90) for non-pinned sessions are compacted — full content blocks replaced by text summary + token counts; `VACUUM` on idle. Configurable; off switch available.

## 7. UI

- `App.svelte` < 150 lines: shell, router, connection only.
- Feature folders: `chat/`, `agents/`, `terminal/`, `git/`, `skills/`, `workflows/`, `settings/`. One store per feature + a `connection` store.
- Backend/model picker rendered from gateway capabilities (auth status, model list, degradation badges).
- Agent tree view for multi-agent sessions (hierarchy, status, bubbled permissions).
- **Ported from old repo (proven code):** chat message rendering + markdown/code highlighting, xterm terminal setup, unified diff viewer, file browser. Ported file-by-file with imports rewired to new stores/protocol — port estimate treated as soft.

## 8. Error handling

- All adapter errors normalize to `GatewayEvent:error` with user-readable message + raw detail.
- WS reconnect with session re-attach; queries survive brief disconnects (server keeps streaming to DB, client catches up).
- Workflow failures: notification + run record, never silent.
- Zod validation at every boundary (WS messages, gateway events, workflow JSON columns).

## 9. Testing

- **Gateway:** unit tests + integration tests against recorded JSONL/RPC fixtures from real CLI sessions — protocol drift breaks tests, not users.
- **Fixture staleness canary:** a `bun run canary` script runs one live mini-session against each real CLI (run weekly / before releases) to catch upstream protocol changes that fixtures can't.
- **Server:** route tests against in-memory SQLite; workflow scheduler tests with injected clock (boot reconciliation, catch-up, chaining cycles).
- **E2E:** one Playwright smoke flow — create project → chat on each detected backend → create + manually run a workflow.

## 10. Phases

**Phase 0 — Spike (validates the bets before building on them):**
A terminal REPL (`packages/gateway/examples/repl.ts`) driving all three adapters. Exit criteria: streaming chat + a permission round-trip + resume on each backend, and one cross-backend `spawn_agent` via MCP (Claude parent → Codex child). If Gemini permissions can't round-trip via ACP, it ships as `permissions: 'modes-only'` — decided here, not discovered in production.

**Phase 1 — Gateway hardening:** full event normalization, capabilities, usage schema, fixtures + canary, MCP spawn guard rails.

**Phase 2 — Server + data:** schema/migrations, WS protocol, session lifecycle over gateway, PTY + git + skills routes (ported).

**Phase 3 — UI core:** shell, chat (ported rendering), terminal, git panel, skills editor, backend picker.

**Phase 4 — Workflows:** engine + durability + editor UI + run history.

**Phase 5 — Multi-agent UI + polish:** agent tree, bubbled permissions, cost ceilings, retention job, Playwright smoke, old-app retirement checklist.

Each phase ends with working, tested software; UI work never begins on an unproven gateway.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Gemini ACP experimental / permission gaps | Phase 0 decides its capability tier; degradation is declared, not hidden |
| Codex app-server protocol drift | official SDK + fixtures + live canary |
| Cross-backend MCP spawning doesn't work as imagined | Phase 0 spike before anything depends on it |
| Port estimate optimism (~30-40k LoC) | ports happen per-phase behind stable interfaces; any component can be rewritten if porting fights too hard |
| Scope creep back to 159k LoC | feature list in §1 is closed; new features need a new spec |
