# Phase 1: Demolition Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete all cut features from the Navi refocus spec (~25k LoC) in entanglement-ordered waves, leaving a bootable, type-clean, smoke-tested commit after every feature.

**Architecture:** Pure subtraction in a git worktree (the live working tree serves a running Vite dev server — deleting files in place would hot-reload breakage into the UI the owner is using). Each feature is one task: inventory references → remove frontend wiring → remove server wiring → delete files → drop DB tables → verify → commit. DB tables are dropped via a `dropLegacyTables()` one-shot in `db.ts` (no migration framework exists; sql.js + SQLite).

**Tech Stack:** Bun, Svelte 5, sql.js. Verification: `bun run check` (svelte-check), `bun test server/ shared/`, `scripts/smoke.sh`.

**Spec:** `docs/superpowers/specs/2026-06-12-navi-refocus-design.md`

---

## Ground rules (read first)

- **Work in the worktree, never the main checkout.** The owner's app runs from the main checkout; Vite watches `src/`.
- **All paths below are relative to `packages/navi-app/` unless they start with `packages/` or `docs/`.**
- **After EVERY task:** `bun run check` must report 0 errors, `bun test server/ shared/` must pass, `scripts/smoke.sh` must pass. Then commit. Never start the next task on a red tree.
- **Line numbers are not given — they drift as waves delete code.** Locate wiring by identifier with grep; each task lists the identifiers and known host files.
- **The reference-inventory grep in each task is your completion check:** rerun it at the end of the task; non-test hits must be zero (hits inside `.claude/skills/`, `docs/`, and this plan are fine).
- **Unlisted features are untouched** (plugins, commands, templates, hooks, work-items, MCP config, extensions framework). If a deletion seems to require touching one, stop and re-read; you're probably deleting too much.
- Don't chase `docs/STATUS.md`/`CLAUDE.md` per task; Task 16 updates docs once.

## Chunk 1: Setup + Waves 1–2 (clean deletions)

### Task 0: Worktree + smoke script

**Files:**
- Create: `scripts/smoke.sh` (repo root: `packages/navi-app/scripts/smoke.sh`)

- [ ] **Step 1: Create worktree branch**

```bash
cd /Users/brunogalvao/Documents/dev-bruno/claude-code-local-ui
git worktree add .worktrees/phase1-demolition -b phase1-demolition
cd .worktrees/phase1-demolition
bun install
bun install --cwd packages/navi-app   # root has NO workspaces field; app deps install separately (postinstall runs repair-sharp)
```

(`.worktrees/` is already gitignored.)

- [ ] **Step 2: Write the smoke script**

```bash
#!/usr/bin/env bash
# Boots the server on an alternate port and verifies core API surface.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${SMOKE_PORT:-3777}"
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
```

- [ ] **Step 3: Run it to verify it passes on the untouched tree**

Run: `chmod +x packages/navi-app/scripts/smoke.sh && packages/navi-app/scripts/smoke.sh`
Expected: `SMOKE OK`. (Notes: the server reads the port from argv[2] / `Bun.env.PORT` — `server/index.ts` `PREFERRED_PORT`; `run-with-bun.mjs` is just a bun locator, plain `bun run server/index.ts 3777` is equivalent. The server silently bumps to the next port if 3777 is taken — kill anything on `$SMOKE_PORT` before starting. The smoke DB is the real `~/.claude-code-ui/data.db`; smoke only does reads.)

- [ ] **Step 4: Commit**

```bash
git add packages/navi-app/scripts/smoke.sh
git commit -m "chore: add API smoke script for demolition gates"
```

### Task 1: Delete kanban + `dropLegacyTables` scaffold

**Files:**
- Delete: `server/routes/kanban.ts`, `src/lib/features/kanban/`
- Modify: `server/index.ts`, `server/db.ts`, `src/App.svelte`, `src/lib/layout/RightPanel.svelte`, `src/lib/core/registries.ts` (extension entry, if present)

- [ ] **Step 1: Inventory** — `grep -rni "kanban" --include="*.ts" --include="*.svelte" packages/navi-app/src packages/navi-app/server` — note every hit; this list is your checklist.
- [ ] **Step 2: Frontend** — remove KanbanPanel/KanbanBoard imports, state, panel-mode entries, and keyboard shortcuts from `App.svelte` and `RightPanel.svelte`; remove the `kanban` extension registration from `core/registries.ts` and its `DEFAULT_EXTENSIONS` entry.
- [ ] **Step 3: Server** — remove `handleKanbanRoutes` import + dispatch from `server/index.ts`; delete `server/routes/kanban.ts`.
- [ ] **Step 4: DB** — in `db.ts`: remove the `kanban_cards` CREATE TABLE and its helper object (grep `kanban` in db.ts). Add the one-shot cleanup (this scaffold is reused by later tasks):

```ts
// One-shot cleanup of tables owned by features removed in the 2026-06 refocus.
// No migration framework exists (rebuild-spec §6 owns that); DROP IF EXISTS is idempotent.
const LEGACY_TABLES = ["kanban_cards"];
function dropLegacyTables() {
  for (const table of LEGACY_TABLES) {
    try { db.run(`DROP TABLE IF EXISTS ${table}`); } catch (e) { console.error(`drop ${table}:`, e); }
  }
}
```

Insert the `dropLegacyTables()` call inside `initDb()` immediately before its final `saveDb()` call (that's the established persistence pattern after DDL).
- [ ] **Step 5: Delete** — `rm -rf packages/navi-app/src/lib/features/kanban`
- [ ] **Step 6: Verify** — inventory grep ≈ 0 non-test hits; `bun run check` 0 errors; `bun test server/ shared/` pass; `scripts/smoke.sh` → `SMOKE OK`.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "demolition: remove kanban"`

### Task 2: Delete council

Same step pattern as Task 1. Identifiers: `council`, `CouncilModal`, `CouncilPanel`, `handleCouncilRoutes`.
**Files:** Delete `server/routes/council.ts`, `src/lib/features/council/`. Modify `server/index.ts`, `src/App.svelte`. No DB tables.
- [ ] Steps 1–6 (inventory → frontend → server → delete → verify)
- [ ] Commit: `demolition: remove council`

### Task 3: Delete sessions-board

Identifiers: `sessions-board`, `sessionsBoard`, `SessionsBoard`. **Files:** Delete `server/routes/sessions-board.ts`, `src/lib/features/sessions-board/`. Modify `server/index.ts`, `src/App.svelte`. No DB tables.
- [ ] Steps 1–6
- [ ] Commit: `demolition: remove sessions-board`

### Task 4: Delete canvas-mode + project-canvas

Identifiers: `canvas-mode`, `canvasMode`, `CanvasMode`, `project-canvas`, `projectCanvas`, `ProjectCanvas`. **Files:** Delete `src/lib/features/canvas-mode/`, `src/lib/features/project-canvas/`. Modify `src/App.svelte` (UI routing/state only — no server code exists).
- [ ] Steps 1–6
- [ ] Commit: `demolition: remove canvas-mode and project-canvas`

### Task 5: Delete comments + comment-responder

Identifiers: `comments`, `messageComments`, `commentResponder`, `handleCommentsRoutes`. **Files:** Delete `server/routes/comments.ts`, `server/services/comment-responder.ts`, `src/lib/features/comments/`. Modify `server/index.ts`, frontend hosts per inventory. DB: add `message_comments` to `LEGACY_TABLES`, remove its CREATE TABLE + helpers.
- [ ] Steps 1–6 (beware: the plural identifier `comments` will hit unrelated code — verify each hit before editing)
- [ ] Commit: `demolition: remove comments`

### Task 6: Delete email (AgentMail)

Identifiers: `email`, `agentmail`, `AGENTMAIL`, `browser-email-init`, `EmailPanel`. **Files:** Delete `server/routes/email.ts`, `src/lib/features/email/`, `src/lib/features/browser-email-init.ts`. Modify `server/index.ts`, `src/App.svelte` (incl. the `browser-email-init` onMount call), and `server/routes/auth.ts` (remove `AGENTMAIL_API_BASE` and its error message — auth.ts otherwise stays). No DB tables.
**Do NOT touch:** `.claude/skills/navi-email` (external skill, unlisted = untouched), `mcp__navi-email` MCP references in skills/docs.
- [ ] Steps 1–6 (the bare identifier `email` hits unrelated code — title-generator, auth flows, docs — verify each hit before editing)
- [ ] Commit: `demolition: remove email/AgentMail feature`

## Chunk 2: Waves 3–4 (surgery)

### Task 7: Delete agent-builder

Identifiers: `agent-builder`, `agentBuilder`, `AgentBuilder`, `showAgentBuilder`. **Files:** Delete `server/routes/agent-builder.ts`, `src/lib/features/agent-builder/` (14 files). Modify `server/index.ts`, `src/App.svelte` (imports, `showAgentBuilder` state, Cmd+Shift+A shortcut, `onOpenAgentBuilder` callbacks, modal). No DB tables.
**Do NOT touch:** `server/agent-types.ts`, `src/lib/core/agent-types.ts`, `services/multi-session-tools.ts`, `services/agent-loader.ts` — those are kept multi-agent orchestration. Only the builder UI/route goes.
- [ ] Steps 1–6
- [ ] Commit: `demolition: remove agent-builder`

### Task 8: Delete experimental agents + self-healing builds

Identifiers: `experimental`, `experimentalAgents`, `selfHealing`, `self-healing`, `initExperimentalWebSocket`. **Files:** Delete `server/routes/experimental.ts`, `server/services/experimental-agents.ts`, `server/services/self-healing-builds.ts`, and exactly three files from `src/lib/components/agents/`: `ExperimentalAgentsPanel.svelte`, `QuickAgentButtons.svelte`, `SelfHealingWidget.svelte` — the rest of that directory (`AgentCard`, `BrowserAgentCard`, `CodingAgentCard`, …) is kept multi-agent UI. Modify `server/index.ts` (route + `initExperimentalWebSocket`). No DB tables.
**Do NOT touch:** `src/lib/components/experimental/GenerativeUI.svelte` — that's the `genui` message widget, part of the kept inline-widgets system, despite living in a folder named "experimental".
- [ ] Steps 1–6 (the word `experimental` appears in comments/docs broadly — only delete the feature's code paths)
- [ ] Commit: `demolition: remove experimental agents and self-healing builds`

### Task 9: Delete E2B / cloud execution

Identifiers: `e2b`, `cloud-execution`, `cloudExecution`, `executeInCloud`, `execution_mode`, `e2b_sandbox_id`. **Files:** Delete `server/routes/cloud-execution.ts`, `server/services/e2b-executor.ts`. Modify `server/index.ts` and `server/websocket/handler.ts` (remove the `executeInCloud` import and the cloud-execution branch in the query flow, ~100 LoC — read the whole branch before cutting; the local-execution path must be the unconditional path afterward). Modify frontend hosts per inventory (execution-mode toggle UI if present).
DB: add `cloud_executions` to `LEGACY_TABLES`, remove CREATE TABLE + helpers. **Leave the orphaned `sessions` columns (`execution_mode`, `cloud_repo_url`, `cloud_branch`, `e2b_sandbox_id`) in place** — SQLite column drops need table rebuilds; not worth it pre-rebuild. Specifically in `db.ts`: keep the ALTER TABLE migration lines and the TS type fields for these columns (mark with `// orphaned by 2026-06 refocus`), but delete the now-unused `UPDATE sessions` helper functions for them. These db.ts-only identifier hits are **exempt** from the zero-hit completion grep.
- [ ] Steps 1–6 + manual read of the handler diff before committing (live chat path)
- [ ] Commit: `demolition: remove E2B cloud execution`

### Task 10: Delete proactive-hooks

Identifiers: `proactive-hooks`, `proactiveHooks`, `setupProactiveHooks`, `onUserMessage`, `onAssistantMessage`, `startSessionTracking`, `buildHookContext`, `SuggestionPanel`, `hooksEnabled`. **Files:** Delete `server/routes/proactive-hooks.ts`, `server/routes/memory.ts` (the "Project Memory" route exists solely for the Memory Builder proactive hook — registered in index.ts with that comment; it goes with this feature), `src/lib/features/proactive-hooks/`. Modify `server/index.ts` (both route registrations), `src/App.svelte` (8 imports + calls inside the chat message flow — remove call sites cleanly, keep surrounding flow intact), `src/lib/components/Settings.svelte` (`hooksEnabled` toggle).
**Do NOT touch:** `.claude/hooks` lifecycle system (`server/routes/hooks.ts`, `services/hook-executor.ts`, `services/hook-loader.ts`, `services/query-hooks.ts`) — different feature, kept. `routes/skills.ts` `/api/skills/generate` (used by the Skill Scout hook) also stays — skills are kept.
- [ ] Steps 1–6 + manually send a chat message in smoke-priority (the message flow was edited)
- [ ] Commit: `demolition: remove proactive-hooks`

### Task 11: Delete channels + channel-inbox + WhatsApp sync

Identifiers: `channel`, `channels`, `channelInbox`, `channel-inbox`, `whatsapp-sync`, `whatsappSync`, `channelProviders`, `currentChannelId`, `ChannelView`, `CreateChannelModal`. **Files:** Delete `server/routes/channels.ts`, `server/routes/channel-inbox.ts`, `server/services/channel-providers.ts`, `server/services/whatsapp-sync.ts`, `src/lib/features/channels/`, `src/lib/features/channel-inbox/`. Modify `server/index.ts`, `src/App.svelte`, `src/lib/components/sidebar/Sidebar.svelte`, `src/lib/layout/RightPanel.svelte`, `core/registries.ts` (channels extension entry).
DB: add `channels`, `channel_workspaces`, `channel_threads`, `channel_messages` to `LEGACY_TABLES`; remove CREATE TABLEs + helpers. (The server handler is `handleChannelRoutes` — singular.)
- [ ] Steps 1–6 (the singular `channel` hits WebSocket/BroadcastChannel code — verify each hit)
- [ ] Commit: `demolition: remove channels, channel-inbox, whatsapp-sync`

### Task 12: Delete inbox (highest risk — websocket message loop)

Identifiers: `inbox`, `inboxItems`, `inbox_items`, `createProjectInboxItem`, `processAssistantInboxDirectives`, `broadcastInboxItemsCreated`, `InboxPanel`. **Files:** Delete `server/routes/inbox-items.ts`, `server/services/inbox-service.ts` (+ `inbox-service.test.ts`), inbox frontend feature dir(s) (`src/lib/features/inbox/` — confirm name via inventory). Modify:
- `server/websocket/handler.ts`: remove the inbox-directive parsing in the assistant message processing loop (`processAssistantInboxDirectives`, `createProjectInboxItem`, `broadcastInboxItemsCreated`). The sanitized-content variable (`assistantContentForPostProcessing`) feeds BOTH search indexing and `generateChatTitle` — after removal, feed `msg.lastAssistantContent` to both. Read the whole block before cutting.
- `src/lib/features/workflows/components/WorkflowMonitorView.svelte` (KEPT feature — strip only its `inboxItems` references, leave the rest intact) and `src/lib/components/ProjectCoordinationPanel.svelte` (check consumers; strip inbox references).
- `server/services/workflow-scheduler.ts`: remove the `createProjectInboxItem` import and its call site (replace with a `console.error`/notification if the call reported failures — read it first; the spec's reviewer flagged this exact spot).
- `server/index.ts`, Sidebar/RightPanel/App.svelte wiring.
DB: add `inbox_items` to `LEGACY_TABLES`; remove CREATE TABLE + helpers.
- [ ] Steps 1–6 + after green checks, send a real chat message against a dev boot and confirm the assistant reply persists and renders (the message loop was edited)
- [ ] Commit: `demolition: remove inbox`

## Chunk 3: Wave 5 + docs

### Task 13: Delete `packages/navi-cloud` + deploy/ship-it server surface

**Files:** Delete `packages/navi-cloud/`. Inventory `grep -rn "navi-cloud\|naviCloud" --include="*.ts" --include="*.svelte" --include="*.json" packages/ --exclude-dir=node_modules` — remove workspace references (root `package.json` workspaces if listed, lockfile regenerates on `bun install`), and any `server/routes/deploy.ts` dependency on navi-cloud (read `deploy.ts` first: if it's purely a navi-cloud client, delete it + its `index.ts` wiring; if it has local deploy logic, only strip the cloud parts).
**Do NOT touch:** `.claude/skills/ship-it` (external skill).
- [ ] Steps 1–6 + `bun install` to refresh the lockfile
- [ ] Commit: `demolition: remove navi-cloud package`

### Task 14: Delete dashboard

Identifiers: `dashboard`, `dashboardWidget`, `DashboardWidget`, `handleDashboardRoutes`. **Files:** Delete `server/routes/dashboard.ts`, `src/lib/features/dashboard/`. Modify `server/index.ts`, `src/App.svelte` (project landing now goes straight to chat/new-session view — pick the simplest existing non-dashboard landing: the new-chat state), `core/registries.ts` + `core/index.ts` (remove `dashboardWidgetRegistry` and its types).
**Do NOT touch:** `.claude/skills/navi-dashboard` (external skill).
- [ ] Steps 1–6 + confirm in smoke-priority that opening a project lands somewhere sensible
- [ ] Commit: `demolition: remove dashboard`

### Task 15: Delete managed OAuth integrations layer

Identifiers: `integration-mcp`, `integrationMcp`, `integration-status`, `integrationStatus`, `mcp-oauth-provider`, `mcpOAuthProvider`, `handleIntegrationsRoutes`. **Files:** Delete `server/routes/integrations.ts`, `server/services/integration-mcp.ts`, `server/services/integration-status.ts`, `server/services/mcp-oauth-provider.ts`, and the OAuth/provider parts of `server/integrations/` only (incl. `cli.ts`; remove the `navi-integrations` bin entry from `package.json`). Modify `server/index.ts`, Settings UI (Integrations tab), and any extension panel per inventory.
**KEEP inside `server/integrations/`:** `credentials.ts`, `crypto.ts`, `registry.ts`, `db.ts` — they are load-bearing for KEPT features: `server/routes/credentials.ts` (unlisted = untouched; imports from `integrations/credentials` and `integrations/registry`), `services/mcp-settings.ts` (uses `getCredential`/`setCredential` to resolve credential refs in plain MCP server env vars), and `routes/mcp.ts` (imports `getIntegrationsRegistry`). After deleting the provider files, prune `registry.ts` to whatever those three consumers still need — typecheck is the arbiter.
**Do NOT touch:** `server/routes/mcp.ts`, `services/mcp-presets.ts`, `services/mcp-settings.ts` (plain MCP config is a keep) — if `mcp-presets` lists presets that required Navi-managed OAuth, remove those preset entries only. `.claude/skills/integrations` (external skill) stays.
- [ ] Steps 1–6
- [ ] Commit: `demolition: remove managed OAuth integrations layer`

### Task 16: Docs + final sweep

**Files:** Modify `docs/STATUS.md`, `CLAUDE.md` (root), `packages/navi-app/CLAUDE.md` if it references cut features.

- [ ] **Step 1:** Rewrite `docs/STATUS.md` to the post-demolition feature list (CORE: sessions, multi-agent, terminal, git, skills, preview, workflows-being-rebuilt; the cut features get a "Removed 2026-06, see refocus spec" section).
- [ ] **Step 2:** Update root `CLAUDE.md`: remove kanban/channels/email/dashboard/plugins-CUT rows from tables, extension list, and feature-status summary; point Product Vision at the refocus spec.
- [ ] **Step 3:** Final sweep: `bun run check`, `bun test server/ shared/`, `scripts/smoke.sh`, plus one grep per deleted feature name across `packages/navi-app/{src,server}` — all ≈0 non-test hits.
- [ ] **Step 4:** Report LoC delta: `git diff --shortstat main...HEAD`.
- [ ] **Step 5:** Commit: `demolition: update docs to post-demolition reality`
- [ ] **Step 6:** STOP. Do not merge. Hand back to the main session: the owner merges + restarts the app on their own schedule (dogfooding — the running app must not be yanked).

## Completion criteria (whole plan)

- Every cut feature from spec §1: zero non-test references under `packages/navi-app/{src,server}`
- `bun run check`: 0 errors; `bun test server/ shared/`: all pass; `scripts/smoke.sh`: SMOKE OK
- `LEGACY_TABLES` covers: kanban_cards, message_comments, cloud_executions, channels, channel_workspaces, channel_threads, channel_messages, inbox_items
- Branch `phase1-demolition` has one commit per task, each independently bootable
