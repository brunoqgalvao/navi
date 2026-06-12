# Navi Refocus — In-Place Stabilization Design

**Date:** 2026-06-12
**Status:** Approved by Bruno (pending spec review)
**Owner:** Bruno Galvão
**Relationship to prior spec:** `2026-06-10-navi-rebuild-design.md` (greenfield rebuild) remains the long-term destination. This spec is the bridge: stabilize and refocus the existing repo in place. Decisions here deliberately adopt the rebuild spec's target shapes (§3 gateway interface, §5 workflow engine) so the eventual port shrinks. The rebuild spec gets a status note pointing here.

## 1. Goal

Cut Navi (159k LoC) down to its core identity — a **multi-harness, multi-agent orchestration UI** for Claude Code, Codex, and Gemini — and stabilize what remains, in place, while the app stays daily-drivable.

**Keep:** chat/sessions, multi-agent orchestration (spawn_agent + session hierarchy), terminal, git, skills, preview (fixed), workflows (rebuilt), MCP config, extensions framework (the sidebar panel system).

**Cut:** kanban, email/AgentMail, channels + channel-inbox + WhatsApp sync, inbox, council, canvas-mode, project-canvas, sessions-board, comments, E2B/cloud-execution, self-healing builds, proactive hooks, agent personas/agent-builder/experimental-agents, `packages/navi-cloud`, dashboard (project landing widgets), managed OAuth integrations layer (integration-mcp, mcp-oauth-provider, integration-status; plain MCP server config stays), Docker container-preview + LLM port management.

**Non-goals:** new features (closed list above; new features need a new spec), the greenfield rebuild itself, data migration changes beyond what cuts require, App.svelte rewrite (slims opportunistically as cuts remove its state; full restructure is the greenfield's job).

Anything not named in either list (plugins, commands, context, non-proactive hooks, templates, …) is untouched by this effort.

## 2. Evidence base

- Entanglement audit (2026-06-11): cut features total ~20k LoC of feature code + `navi-cloud`; imports from keep features into cut features are limited to **one known counterexample** — `services/workflow-scheduler.ts` imports `createProjectInboxItem` from inbox-service (Wave 4 must remove that call site). All other deletions are one-way safe. Highest-risk deletions: inbox (websocket message-loop surgery + the workflow-scheduler call site), channels (4 DB tables + Sidebar/App wiring), proactive-hooks (chat message flow hooks).
- Preview audit: three parallel systems (native, container, port-manager) behind a 636-line proxy; port conflicts resolved by LLM calls (`services/port-fixer.ts` 561 + `services/port-manager-preview.ts` 748 + `routes/port-manager-preview.ts` 143 ≈ 1.45k LoC, 1–2s nondeterministic latency in the hot path).
- Workflow audit: **four** overlapping schedulers (cron-scheduler 624 LoC, loop-manager 736 LoC, workflow-scheduler 464 LoC, plus the workflows routes) with in-memory `setTimeout`/`setInterval` as source of truth — schedules die on restart.
- Session-layer bugs already found while dogfooding (both fixed 2026-06-12, commits `0778212`, `9e424da`): model selection clobbered to NULL on query completion; context recall blind to tool content; compact-after-overflow self-defeating. These confirm the session layer needs the systematic pass in Phase 3.

## 3. Phase 1 — Demolition

Delete in waves, cleanest first. Each wave: delete code → drop its DB tables/columns → `bun run check` → boot + smoke test → commit. Orphaned tables are dropped, never abandoned. Note for planning: the current DB layer (sql.js) has no migration framework — column drops on SQLite mean table rebuilds; the Phase 1 plan defines the drop mechanism (a one-shot cleanup on boot is acceptable; a full migration framework is the rebuild's job).

| Wave | Features | Surgery |
|---|---|---|
| 1 | kanban, council, sessions-board, canvas-mode, project-canvas | rm -rf + registration lines (index.ts, App.svelte, RightPanel) |
| 2 | comments (+comment-responder), email (+AGENTMAIL refs in auth.ts) | ~20 LoC each |
| 3 | agent-builder, experimental-agents + self-healing-builds, E2B/cloud-execution (incl. `execution_mode`, `cloud_repo_url`, `cloud_branch`, `e2b_sandbox_id` session columns) | App.svelte state, websocket handler ~100 LoC, column migration |
| 4 | proactive-hooks, channels + channel-inbox + whatsapp-sync (4 tables), inbox (`createProjectInboxItem` / `processAssistantInboxDirectives` in the websocket message loop, plus the call site in `services/workflow-scheduler.ts`) | one commit per feature; smoke test after each |
| 5 | `packages/navi-cloud`, dashboard feature, managed OAuth integrations layer | package removal + feature folders |

Wave 4 items each get their own commit and manual chat smoke test because they touch the live message path. Exit: cut features gone, typecheck green, app boots, chat/terminal/git/skills work, STATUS.md + CLAUDE.md updated to match reality.

## 4. Phase 2 — Backend gateway hardening

`server/backends/` (adapter interface + normalized events, ~2.2k LoC) is the keeper. Close the gaps against the rebuild spec's §3 so the future port is mechanical:

- **`capabilities()` per adapter:** `{ streaming, thinkingStream, permissions: 'callback' | 'modes-only', resume, mcp, models }`. UI renders pickers and degradation badges from capabilities; **no UI code special-cases backend IDs.**
- **Normalized usage schema** on `result` events: input/output/cache tokens, `costUsd` computed from a per-model price table when the backend doesn't report cost, original payload preserved in `raw`.
- **Fixture tests per adapter:** recorded JSONL/RPC sessions from real CLIs (Codex has partial coverage today); protocol drift breaks tests, not users. Plus a `bun run canary` script running one live mini-session per detected CLI, run before releases.
- **Crash isolation:** adapter subprocess death fails that session with a visible error event; server and sibling sessions unaffected. Verified by a test that kills a fake adapter process mid-stream.

Exit: fixture suites green for all three adapters; capabilities-driven model/backend picker shipped; canary passes against installed CLIs.

## 5. Phase 3 — Session & orchestration stabilization

The core product value ("orchestrating/keeping sessions"). Hardening, not rewrite:

- **One audited lifecycle path:** create → stream → persist → resume → reattach. WS reconnect re-attaches to a live query (server streams to DB regardless of client presence; client catches up from DB). Tests for resume, reattach, and mid-query reload.
- **DB write discipline:** completion-time writes must never erase user state (the `0778212` COALESCE pattern); audit remaining `UPDATE sessions` calls for the same class of bug.
- **Cross-backend children:** `spawn_agent` goes through the adapter layer so a Claude parent can run Codex/Gemini children. Depth (max 3) and concurrency limits enforced in one place (session-manager), with tests for hierarchy invariants (`root_session_id`, `depth`).
- **Bubbled permissions:** a child's permission request surfaces in the root session's UI with child attribution.
- **Context lifecycle:** recall + prune + compact path (fixed in `9e424da`) gets integration tests: overflow a fixture session, verify prune→compact recovery and that recall returns tool-aware content.

Exit: lifecycle + hierarchy + recall tests green; cross-backend spawn demonstrated from the UI; a UI reload mid-query loses nothing.

## 6. Phase 4 — Workflow engine rebuild

One `workflow-engine` service replaces the four overlapping systems — `services/cron-scheduler.ts`, `services/loop-manager.ts`, `services/workflow-scheduler.ts`, and `routes/workflows.ts`/`routes/cron.ts`/`routes/loops.ts` — all deleted at the end of this phase.

- **Durability:** `next_run_at` persisted in `workflows`; timers are projections of DB state, re-armed on boot. Boot reconciliation handles missed runs per workflow `catch_up` policy (`skip` default | `run-once`).
- **Triggers v1:** `schedule` (cron/interval/once), `manual`, `workflow-completed` (chaining with cycle detection), `webhook` (`POST /hooks/:workflowId`, per-workflow token). `file-change` and `git-event` deferred.
- **Runs:** every run creates a session through the adapter layer (workflows work on all three backends), recorded in `workflow_runs` (status, timestamps, cost, error, session link). Failures notify visibly; `last_error` shown in the editor.
- **UI:** editor (create/edit/enable/test-run), run history with transcript links, next-run countdown.
- **Migration:** existing cron/loop definitions map into the new tables where possible; unmappable ones export to a JSON archive file with a notification — nothing silently dropped.
- **Tests:** scheduler with injected clock — boot reconciliation, catch-up policies, chain cycles, restart survival.

Exit: a cron workflow survives server restart; a chained workflow fires; a failing workflow notifies; old scheduler services deleted.

## 7. Phase 5 — Preview fix

Subtraction first: keep **native-preview** (dev-server spawn, framework detection, log buffer) and **preview-proxy**; delete the container path (`routes/container-preview.ts` and the container manager inside `services/preview/` — the rest of that directory stays), `routes/port-manager-preview.ts` + `services/port-manager-preview.ts`, and `services/port-fixer.ts` (the LLM port logic).

- **Deterministic ports:** allocate from a configured range, persist per-project assignments, detect conflicts with `lsof` and fail with an actionable error (which process, which port, suggested action) instead of LLM arbitration.
- **Visible failure states:** dev-server crash → panel shows last log lines + restart button, never a blank iframe. Reserved-port list derived from runtime config, not hardcoded.
- **Proxy slim-down:** remove container/port-manager branches from preview-proxy; keep HTML injection + auth-domain new-window logic.

Exit: one preview path; port allocation deterministic and tested; kill-the-dev-server smoke test shows logs + restart affordance.

## 8. Continuous: stability baseline

- `bun run check` + `bun test` green is the merge gate from Phase 1 onward (pre-push hook if no CI).
- Smoke script: boot server → create project → mini-session per detected backend → manual workflow run.
- Every bug fixed during this work lands with a regression test (pattern already in place: `db.model-persistence.test.ts`, `sessions.inspect.test.ts`).

## 9. Risks

| Risk | Mitigation |
|---|---|
| Wave-4 deletions regress live chat path | One commit per feature, smoke test between, easy revert |
| Dogfooding (Navi develops Navi) | Server has no hot-reload; changes go live only when Bruno restarts — each wave leaves a bootable commit |
| Gemini/Codex CLI protocol drift during hardening | Fixtures + pre-release canary (Phase 2) |
| Workflow migration loses user automations | Map what's mappable, archive the rest to JSON, notify — never silent |
| Scope creep | Keep/cut lists in §1 are closed; additions require a new spec |

## 10. Out of scope (explicitly)

Greenfield rebuild execution, gateway npm publication, new triggers beyond §6, push/pull/merge git UI, terminal sharing/replay, data retention/compaction policy changes (rebuild spec §6 handles that), mobile/web deployment.
