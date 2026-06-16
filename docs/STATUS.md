# Navi Feature Status

> Feature inventory and status tracking

Last updated: June 16, 2026 (post-demolition refocus)

> **2026-06 refocus:** Navi was cut down to its core. A pile of half-finished
> features got demolished (see [Removed in 2026-06 refocus](#removed-in-2026-06-refocus)).
> The design rationale lives in
> [`docs/superpowers/specs/2026-06-12-navi-refocus-design.md`](superpowers/specs/2026-06-12-navi-refocus-design.md).

---

## Feature Categories

| Status | Meaning |
|--------|---------|
| **CORE** | Essential, actively maintained |
| **STABLE** | Working, low maintenance |
| **IN REBUILD** | Intentionally torn down, being rebuilt on the refocused core |

---

## CORE Features

These are essential to Navi's operation.

### Sessions & Projects
| Feature | Location | Notes |
|---------|----------|-------|
| Session management | `routes/sessions.ts`, `services/session-manager.ts` | Chat sessions |
| Project management | `routes/projects.ts` | Workspaces |
| Messages | `routes/messages.ts` | Chat history |
| WebSocket handler | `websocket/handler.ts` | Real-time communication |

### Multi-Agent Orchestration
**Production-ready hierarchical agent coordination.** Spawn and coordinate
multiple AI agents working in parallel.

| Component | Location | Purpose |
|-----------|----------|---------|
| Session hierarchy | `routes/session-hierarchy.ts` | Parent-child session management |
| Multi-session tools | `services/multi-session-tools.ts` | Agent comms (spawn, escalate, deliver) |
| Child sessions UI | `features/session-hierarchy/` | Real-time hierarchy visualization |
| Agent types (server) | `server/agent-types.ts` | Built-in agent definitions |
| Agent types (frontend) | `src/lib/core/agent-types.ts` | UI metadata per agent type |

**Key capabilities:**
- Spawn child agents for parallel subtasks (depth limit: 3)
- Inter-agent communication (get_context, log_decision, escalate, deliver)
- Shared decisions and artifacts across hierarchy
- Specialized native UIs for agent types (browser, coding, runner)

### Terminal & Processes
| Feature | Location | Notes |
|---------|----------|-------|
| Terminal/PTY | `routes/terminal.ts` | Shell integration |
| Background processes | `routes/background-processes.ts` | Process management |
| File browser | `routes/filesystem.ts` | Read/write files |

### Git Integration
| Feature | Location | Notes |
|---------|----------|-------|
| Git operations | `routes/git.ts` | Status, commit, branch, etc. |
| Git UI | `features/git/` | Frontend components |
| Worktrees | `routes/worktrees.ts` | Git worktree management |

### Skills System
| Feature | Location | Notes |
|---------|----------|-------|
| Skill loader | `routes/skills.ts`, `server/skills.ts` | Load from `.claude/skills/` |
| Core skills | See [Skills Inventory](#skills-inventory) | |

### Preview System
| Feature | Location | Notes |
|---------|----------|-------|
| Native preview | `services/native-preview.ts` | Dev server preview |
| Preview proxy | `routes/preview-proxy.ts` | Proxy for previews |

### MCP
**Model Context Protocol** — the standards-first integration layer.

| Component | Location | Purpose |
|-----------|----------|---------|
| MCP runtime | `server/mcp.ts` | MCP server wiring |
| MCP presets | `server/mcp-presets.ts` | Curated server presets |
| MCP settings | `server/mcp-settings.ts` | Per-project/global config |
| MCP OAuth provider | `server/mcp-oauth-provider.ts` | OAuth for MCP servers |

---

## STABLE Features

Working features that don't need active development.

### Extensions Framework
| Feature | Location | Notes |
|---------|----------|-------|
| Extension registry | `src/lib/core/registries.ts` | Sidebar panel registry |
| Extensions panel | `features/extensions/` | Right panel tabs |

Built-in panels: Files, Preview, Git, Terminal, Processes, Context, Browser/Browser-preview.

### Commands
| Feature | Location | Notes |
|---------|----------|-------|
| Slash commands | `routes/commands.ts` | `/command` system |
| Command UI | `features/commands/` | Frontend |

### Plugins
| Feature | Location | Notes |
|---------|----------|-------|
| Plugins | `routes/plugins.ts`, `features/plugins/` | Unified extensibility (skills + commands + hooks) |
| Hooks | `.claude/hooks/`, `routes/hooks.ts` | Lifecycle hook system |

### Raw Credentials
**Local, raw credential storage** — no managed OAuth subsystem, just encrypted
key storage you control.

| Component | Location | Purpose |
|-----------|----------|---------|
| Credentials store | `server/integrations/{credentials,crypto,db,types,registry}.ts` | Encrypted local credential CRUD |
| Credentials API | `routes/credentials.ts` | `/api/credentials/*` endpoints |

### Backend Selector
| Component | Location | Purpose |
|-----------|----------|---------|
| Backends routes | `routes/backends.ts` | API for model selection |
| Backends folder | `server/backends/` | Provider implementations |
| Selector UI | `components/BackendSelector.svelte` | Model picker UI |

---

## IN REBUILD

### Workflows
**Status:** IN REBUILD — torn down in the refocus, being rebuilt on the
refocused core (sessions + multi-agent orchestration + MCP).

See the refocus spec for the intended shape.

---

## Skills Inventory

| Skill | Purpose |
|-------|---------|
| `playwright` | Browser automation, screenshots |
| `navi` | Control Navi GUI from Claude |
| `stock-compare` | Stock charts in chat |
| `project-template` | Project scaffolding |
| `navi-llm` | Dispatch to other LLMs |
| `nano-banana-image-gen` | Image generation |
| `codex` | OpenAI Codex CLI |
| `gemini-cli` | Google Gemini CLI |
| `ensemble-consensus` | Multi-LLM voting |
| `navi-workflows` | Workflow control |
| `cron` | Scheduled tasks |

---

## Removed in 2026-06 refocus

These features were demolished (waves 1–5, ~36k LoC). They are gone, not
deprecated — don't go looking for them in `src/` or `server/`. Rationale and the
refocused-core design are in
[`docs/superpowers/specs/2026-06-12-navi-refocus-design.md`](superpowers/specs/2026-06-12-navi-refocus-design.md).

| Removed feature | What it was |
|-----------------|-------------|
| Kanban | Task board extension + API |
| Council | Multi-agent deliberation feature |
| Sessions Board | Visual multi-session board |
| Canvas mode / Project canvas | Spatial canvas surfaces |
| Comments | Inline message comments |
| Email (AgentMail) | Autonomous agent email + widget |
| Agent Builder | UI for authoring agents |
| Experimental Agents | Old experimental agents framework |
| Self-Healing Builds | Auto-fix build pipeline |
| E2B / Cloud Execution | Cloud sandbox execution |
| Proactive Hooks | AI-driven chat suggestions |
| Channels / Channel Inbox | WhatsApp/Telegram/messaging inbox |
| WhatsApp sync | WhatsApp-specific sync service |
| Inbox | Unified inbox surface |
| Navi Cloud | Cloud package + deploy client |
| Dashboard | Project landing-page widgets |
| Managed OAuth Integrations | Gmail/Sheets/Slack connectors + OAuth flow |

> **Note:** raw credential storage (`server/integrations/{credentials,crypto,db,...}`)
> and MCP OAuth (`mcp-oauth-provider.ts`) were **kept**. What got removed was the
> *managed connector* layer on top (Gmail/Sheets/Slack integrations, the OAuth
> connection UI), not credential storage itself.

---

*This document should be updated when features change status.*
