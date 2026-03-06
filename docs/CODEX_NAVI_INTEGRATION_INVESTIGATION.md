# Codex + Navi Integration Investigation

Date: March 6, 2026

## Executive Summary

Navi already has a usable Codex transport path, but not a first-class Codex runtime.

Today, Codex works in Navi as a normalized chat backend:

- model selection exists
- `codex exec --json` output is parsed
- assistant/tool messages render in the existing chat UI
- sessions can be tagged with `backend = "codex"`

What is missing is the rest of the product contract that currently makes Claude feel native inside Navi:

- durable resume semantics
- permission handling that matches the backend's real approval model
- backend-native project instructions, skills, MCP, and agent behavior
- multi-agent orchestration parity
- backend-specific auth and health diagnostics
- session operations such as fork/reset/prune that are not Claude-file specific

The most important conclusion is this:

Do not try to make Codex behave like Claude Agent SDK by force. Make Codex first-class on its own terms, then share only the parts of the Navi runtime that are truly backend-neutral.

## What I Verified

### In the repo

Navi already has a multi-backend abstraction and a Codex adapter:

- `packages/navi-app/server/backends/codex-adapter.ts`
- `packages/navi-app/server/websocket/handler.ts`
- `packages/navi-app/server/routes/backends.ts`

The app routes non-Claude backends through `handleQueryWithAdapter(...)` instead of the Claude worker path:

- `packages/navi-app/server/websocket/handler.ts:2095`
- `packages/navi-app/server/websocket/handler.ts:2336`

### On this machine

I verified the local CLI state directly:

- `codex --version` -> `codex-cli 0.101.0`
- `claude --version` -> `2.1.37 (Claude Code)`
- `codex login status` -> `Logged in using ChatGPT`

I also ran a real Codex JSONL probe. It succeeded outside the sandbox and emitted:

- `thread.started`
- `turn.started`
- `item.completed` with `reasoning`
- `item.completed` with `agent_message`
- `turn.completed`

That confirms Navi is targeting a real structured stream, not an imagined contract.

### Local Codex runtime health problems

The local Codex install is not clean. Before deeper Navi work, these two issues need to be treated as blockers:

1. Codex logs an invalid skill:
   - `/Users/brunogalvao/.codex/skills/stock-analyzer/SKILL.md`
   - The frontmatter has `description` and `capabilities`, but no `name`.

2. Codex logs a state DB migration mismatch:
   - `/Users/brunogalvao/.codex/state_5.sqlite`
   - Warning: migration 9 was previously applied but is missing in the resolved migrations.

Even when a query succeeds, those warnings fire on startup. That means Navi can look unstable even if its own code is correct.

## What Codex Officially Supports

From OpenAI's official Codex docs and repo:

- Codex has explicit approval modes such as Read Only, Auto Edit, and Full Auto.
- `codex exec` supports non-interactive execution, `--json`, `--sandbox`, `--full-auto`, `--skip-git-repo-check`, and `resume`.
- Codex has native support for `AGENTS.md`.
- Codex has native skills.
- Codex has MCP support.
- Codex has experimental multi-agent support.

Official sources:

- https://developers.openai.com/codex/
- https://developers.openai.com/codex/cli
- https://developers.openai.com/codex/non-interactive
- https://developers.openai.com/codex/agents-md
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/multi-agents
- https://platform.openai.com/docs/models/gpt-5.3-codex
- https://github.com/openai/codex

## Where Navi Is Claude-Centric Today

### 1. Session identity is still Claude-shaped

Navi persists `claude_session_id`, not a generic backend session/thread identifier.

- `packages/navi-app/server/db.ts:45`
- `packages/navi-app/src/lib/stores/session.ts:210`
- `packages/navi-app/src/lib/handlers/useMessageHandler.ts:39`

The Codex adapter supports resume internally:

- `packages/navi-app/server/backends/codex-adapter.ts:124`

But the adapter caller never passes a Codex resume token:

- `packages/navi-app/server/websocket/handler.ts:2148`

So Codex sessions are effectively treated as stateless in Navi, even though Codex itself supports resume.

### 2. Non-Claude history is rebuilt from text-only chat snapshots

For non-Claude backends, Navi reconstructs prior context from visible messages:

- `packages/navi-app/src/App.svelte:2453`

That fallback drops backend-native state and most structured execution context. It is good enough for lightweight continuation, but not for true session continuity.

### 3. Permission handling is not actually implemented for Codex confirm-mode

Codex is marked as not supporting callback permissions:

- `packages/navi-app/server/backends/codex-adapter.ts:21`
- `packages/navi-app/server/backends/codex-adapter.ts:258`

But Navi still sends `permissionMode: "confirm"` when auto-approve is off:

- `packages/navi-app/server/websocket/handler.ts:2153`

This is a semantic mismatch. For Codex, Navi currently has:

- `auto` -> roughly valid (`--full-auto`)
- `confirm` -> not truly bridged
- per-tool permission callbacks -> not implemented

### 4. Model support is hardcoded and stale

The Codex adapter hardcodes old model names and defaults to `gpt-5.2-codex`:

- `packages/navi-app/server/backends/codex-adapter.ts:24`
- `packages/navi-app/server/backends/codex-adapter.ts:44`

As of March 6, 2026, OpenAI's official model docs expose `gpt-5.3-codex`, so Navi's model catalog is already behind the official surface.

### 5. Auth UX is generic OpenAI-key UX, not Codex auth UX

Navi exposes a generic `OPENAI_API_KEY` setting:

- `packages/navi-app/server/routes/config.ts:38`
- `packages/navi-app/server/routes/config.ts:103`

The Codex adapter forwards `OPENAI_API_KEY` into the process:

- `packages/navi-app/server/backends/codex-adapter.ts:147`

But the live local Codex install is authenticated via ChatGPT login, not by an API key. Navi currently does not surface that distinction, detect it, or explain it in the UI.

### 6. Multi-agent parity is not there for adapter backends

Adapter-based child sessions are deliberately reduced:

- `packages/navi-app/server/websocket/handler.ts:1090`

The comment and behavior are explicit:

- they do not support multi-session tools
- they auto-deliver results
- they are treated as simple adapter children

That is far from Claude's current multi-agent/session-tree behavior.

### 7. Session operations are still Claude-file based

Reset context, fork, and prune operations all center on `claude_session_id` and Claude transcript files in `~/.claude/...`:

- reset context: `packages/navi-app/server/routes/sessions.ts:445`
- fork logic: `packages/navi-app/server/routes/sessions.ts:467`
- prune logic: `packages/navi-app/server/routes/sessions.ts:872`

This means some "session management" features are only truly native for Claude today.

### 8. Agent/skill/hook loading is Claude-specific

Navi's richer runtime is built around Claude's filesystem conventions and SDK concepts:

- agent loader: `packages/navi-app/server/services/agent-loader.ts:1`
- hook executor: `packages/navi-app/server/services/hook-executor.ts`
- project instructions UI: `CLAUDE.md` paths and modals throughout the app

Codex has official equivalents like `AGENTS.md`, skills, MCP, and multi-agents, but Navi is not yet wiring those into a backend-capability layer.

## Recommendation

### Product direction

Target this first:

`Codex as a first-class single-session backend in Navi`

Do not target this first:

`Full Claude Agent SDK parity across every advanced feature`

The first target is realistic and unlocks real usage. The second target will sprawl because too many current Navi features are Claude-shaped at the filesystem, SDK, and UI levels.

## Minimal Viable Codex Integration

### Phase 0: Stabilize the local Codex runtime

Before changing Navi:

1. Fix or remove the invalid Codex skill at `/Users/brunogalvao/.codex/skills/stock-analyzer/SKILL.md`.
2. Resolve the `state_5.sqlite` migration mismatch.
3. Add a Navi health check for Codex that reports:
   - CLI version
   - auth mode (`ChatGPT` vs API key)
   - skill parse failures
   - state DB warnings

If Phase 0 is skipped, Navi debugging will be contaminated by Codex-local failures.

### Phase 1: Make session state backend-neutral

Add a generic backend session identity instead of overloading `claude_session_id`.

Suggested shape:

- `backend_session_id`
- `backend_session_metadata` JSON column

For Codex, persist at least:

- `thread_id` from `thread.started`
- optional last resume handle if Codex exposes one in future versions

Then:

1. Resume Codex sessions using Codex's real resume path.
2. Keep `buildHistoryContextFromMessages(...)` only as a fallback.
3. Rename frontend/state concepts so they stop assuming "Claude session" everywhere.

### Phase 2: Make Codex permissions and auth honest

Codex should expose its own backend capabilities:

- auth mode
- approval model
- resume support
- model catalog freshness

For the first pass:

1. Detect auth via Codex itself, not only Navi's stored OpenAI key.
2. Surface "Logged in with ChatGPT" in Settings.
3. Disable per-tool confirm UX for Codex until it is truly implemented.
4. Offer only modes that map cleanly to Codex:
   - read only
   - auto edit / workspace write
   - full auto

Avoid pretending Codex has Claude-style permission callbacks when it does not.

### Phase 3: Backend-native project context

Introduce a backend capability interface for project context:

- instruction file(s)
- skills roots
- MCP configuration
- multi-agent support level
- fork/reset/prune support

For Codex, that should point to Codex-native concepts:

- `AGENTS.md`
- Codex skills
- Codex MCP config

Do not try to make `.claude/*` the universal source of truth for every backend.

### Phase 4: Multi-agent parity, but only after single-session parity

Once single-session Codex is solid:

1. Decide whether Navi should:
   - orchestrate Codex child sessions itself, or
   - let Codex's native multi-agent system run and render its events

2. Pick one.

The current half-state is the worst of both worlds:

- Navi offers multi-session architecture in the product
- Codex child sessions are reduced to simple auto-delivered adapter tasks

## What To Build First

If the goal is "properly integrated and running well", build this order:

1. Codex health diagnostics
2. Generic backend session identity and resume persistence
3. Correct Codex auth and approval UX
4. Dynamic or backend-owned model discovery
5. Backend-native instruction file support (`AGENTS.md`)

Everything else can wait.

## Critique Of The Bigger Plan

### Verdict

Trying to reach Claude feature parity in one pass would be too complex and would solve the wrong first problem.

### Problems

1. The deepest current issue is runtime health, not UI plumbing. If Codex itself starts with skill and state DB warnings, fixing Navi first will not produce a stable result.
2. The current schema and naming are Claude-shaped. Forcing Codex into `claude_session_id` semantics will keep producing edge cases around resume, fork, and context reset.
3. A "universal abstraction" can be overdone. Skills, AGENTS, MCP, approvals, and multi-agents are not identical across Claude and Codex, so pretending they are will create leaky behavior.
4. Multi-agent parity is too expensive as a first milestone. Single-session continuity and permissions matter more.

### Simpler Alternative

Ship a boring but strong Codex MVP:

- healthy runtime detection
- real resume
- correct approval modes
- correct auth surface
- `AGENTS.md` support

Then evaluate whether users still need full Claude-style multi-agent parity for Codex.

### What To Cut For Now

- full Codex parity for hooks/plugins
- Claude-style per-tool permission prompts
- Codex child-session orchestration parity
- transcript pruning/forking parity if resume is not yet generic

### What Is Still Missing

Two concrete product choices still need a decision:

1. Should Navi embrace backend-native project config (`CLAUDE.md` for Claude, `AGENTS.md` for Codex), or keep trying to unify them behind Navi-owned config?
2. For Codex multi-agent behavior, should Navi orchestrate it or just render Codex's own agent system?

Until those are decided, implementation can progress on single-session parity but should not lock in backend-wide abstractions too aggressively.
