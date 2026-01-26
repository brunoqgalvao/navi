# Navi - Claude Code Local UI

A desktop application providing a rich GUI for Claude Code, built with Svelte 5, Tauri, and Bun.

## Be snarky fun

VERY IMPORTANT CONTEXT:
- we're using Navi to develop Navi -> so don't close the process/try to run it again to test - we're the process ourselves.

---

## Product Vision & Principles

Navi is an **independent, standardizing harness** for interacting with coding agents. While currently focused on Claude Agent SDK, we secondarily support Codex and Gemini.

### Core Mission

**Be the best UI layer for AI coding agents** — not by reinventing the wheel, but by:
1. Supporting and enhancing the emerging standards
2. Providing excellent UX on top of those standards
3. Staying local-first
4. Enabling both ad-hoc and process-based workflows

### Key Principles

#### 1. Standards First
Support the emerging agent ecosystem standards in a unified way:
- **Plugins** = unified extensibility (skills + commands + hooks)
- **Templates** = bundles of plugins + config for specific use cases
- **Agents** = spawned AI workers for parallel/specialized tasks
- **MCP** = Model Context Protocol servers for tool integration

The goal: patterns proven in Navi should eventually standardize across Claude, Codex, Gemini, etc.

#### 2. Rich UI on Standards
Provide convenient harnesses and UI that abstract complexity:
- **Workspaces & Sessions** — navigate between many agents/projects
- **Extensions** — composable sidebar panels (Git, Terminal, Kanban, Deploy)
- **Inline Widgets** — rich rendering in chat (diagrams, charts, interactive UI)
- **Integrations** — OAuth flows abstracted from the user
- **Multi-account management** — API keys, providers, credentials

#### 3. Local First
Your data stays on your machine. Cloud features are opt-in enhancements, not requirements.

#### 4. Ad-hoc + Process-based
Support both:
- **Ad-hoc**: "help me debug this" — conversational, exploratory
- **Process-based**: defined input → defined output → reusable. Like `/deploy` always running the same pipeline.

#### 5. Native When Necessary, Plugin When Possible
The composability litmus test: **"Could I plug this into claude code anytime?"**

```
MCP Server + Native UI wrapper = best of both worlds
├── MCP = portable, standards-based, works in any agent
└── Native UI = enhanced UX when running in Navi
```

Examples:
- `askUserTool` = MCP server (portable) + native Navi UI (pretty prompts)
- Agent orchestration = native (needs deep UI integration)
- Deploy pipeline = plugin (reusable across tools)

We have native stuff (native plugins, native MCPs, native UI). But we build on standards first, native second.

---

## Quick Reference

```bash
# Development
bun run dev:app        # Frontend + backend + PTY server
bun run dev:tauri      # Desktop app mode (Tauri)

# Type checking
bun run --cwd packages/navi-app check

# API testing
bun run --cwd packages/navi-app test:api
```

**Ports:** Frontend dev: 1420 | Backend: 3001 | PTY server: 3002

---

## Architecture Overview

### UI/UX Component Taxonomy

Navi has **8 distinct component categories** defined in `src/lib/core/`:

| Category | Purpose | Location | Registry |
|----------|---------|----------|----------|
| **Extensions** | Sidebar panels (Files, Git, Terminal) | `features/extensions/` | `extensionRegistry` |
| **Message Widgets** | Inline chat renderers (code, media, tools) | `components/widgets/` | `messageWidgetRegistry` |
| **Dashboard Widgets** | Project landing page components | `features/dashboard/` | `dashboardWidgetRegistry` |
| **References** | @ mentions in input (files, terminals, chats) | `core/references.ts` | `references` store |
| **Plugins** | Unified extensibility (skills + commands + hooks) | `.claude/skills/`, `.claude/commands/` | File-based |
| **Templates** | Bundles of plugins + config for use cases | `.claude/templates/` | File-based |
| **Agents** | Spawned AI workers for parallel tasks | Runtime (multi-session) | `spawn_agent` MCP |
| **MCP Servers** | Tool providers via Model Context Protocol | `.claude/settings.json` | Config-based |

> **Note on terminology:** The `.claude/agents/` folder currently contains what we're migrating to call "templates" or "plugin bundles". Runtime spawned workers (via `spawn_agent`) are "agents".

**Important: Extensions vs Global Settings Feature Toggles**

- **Extensions** are **session/project-scoped** panels. They appear in the right sidebar, can be enabled/disabled per project, and are relevant to the current chat context (Files, Git, Terminal, Kanban, etc.).
- **Global Settings Features** are **app-wide toggles** (Settings → Features tab). Use these for features that monitor or affect the entire app, not specific sessions. Examples: Resource Monitor, Debug Mode, Advanced Mode, Telemetry.

When adding a new panel/feature:
- If it's contextual to a session/project → use **Extensions** (`extensionRegistry`)
- If it's app-wide monitoring/debugging → use **Settings Features** (`stores/ui.ts` toggle)

```typescript
// Import from core module
import {
  type Extension,
  type Reference,
  extensionRegistry,
  references,
  createFileReference,
} from "$lib/core";
```

### Monorepo Structure
```
packages/
├── navi-app/           # Main desktop application
│   ├── src/            # Svelte 5 frontend
│   ├── server/         # Bun backend (routes, services, websocket)
│   └── src-tauri/      # Tauri desktop wrapper
├── landing-page/       # Marketing website
└── navi-cloud/         # Cloud infrastructure (secondary)
```

### Tech Stack
- **Frontend:** Svelte 5 + Vite + Tailwind CSS
- **Backend:** Bun + custom HTTP server + WebSocket
- **Desktop:** Tauri v2
- **Database:** sql.js (SQLite in-memory, persisted to ~/.claude-code-ui/data.db)
- **AI:** @anthropic-ai/claude-agent-sdk

---

## Feature Status

See `docs/STATUS.md` for complete feature inventory. Quick summary:

| Status | Features |
|--------|----------|
| **CORE** | Sessions, Projects, Terminal, Git, Skills, Preview, **Multi-Agent System** |
| **STABLE** | Kanban, Commands, Extensions, OAuth Integrations, Backend Selector |
| **EXPERIMENTAL** | Proactive Hooks, Sessions Board, Ensemble Consensus, Email (AgentMail) |
| **DEPRECATED** | E2B Cloud Execution, Self-Healing Builds, Experimental Agents |
| **CUT** | Channels, Browser (standalone), Plugins |

**Experimental features** are marked with `@experimental` in code comments.
**Deprecated features** are marked with `@deprecated` and will be removed.

---

## Feature Module Pattern

New features follow the `/src/lib/features/{feature}/` structure:

```
features/{feature}/
├── api.ts              # Backend API client
├── types.ts            # TypeScript interfaces
├── stores.ts           # Svelte stores (optional)
├── index.ts            # Public exports (barrel file)
└── components/
    ├── FeaturePanel.svelte
    └── FeatureModal.svelte
```

**Reference implementation:** `src/lib/features/git/`

---

## Backend Route Pattern

Routes live in `/packages/navi-app/server/routes/`. Each exports a handler function:

```typescript
export async function handleFeatureRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // Return null to pass to next handler
  // Return Response for matched routes
}
```

**Key utilities:**
- `json(data, status)` - JSON response helper
- `error(message, status)` - Error response helper

---

## Store Patterns

Stores in `/src/lib/stores/` follow domains:

```typescript
// Creating a custom store
function createCustomStore() {
  const { subscribe, set, update } = writable<Type>(initialValue);
  return {
    subscribe,
    customMethod: (param) => update(state => ({ ...state, field: param })),
  };
}
```

**Key stores:**
- `sessionMessages` - Chat messages per session
- `currentSession` - Active session state
- `projects` / `currentProject` - Project management
- `notifications` - Toast notification system

---

## Core Module (`src/lib/core/`)

The core module provides unified types and registries for all extensible components.

### Extensions (Sidebar Panels)

Extensions appear as tabs in the right sidebar. Use the registry pattern:

```typescript
import { extensionRegistry, type Extension } from "$lib/core";

// Get all panel modes (derived from extensions)
const modes = extensionRegistry.getPanelModes(); // ["files", "browser", "git", ...]

// Get extension by panel mode
const gitExt = extensionRegistry.getByPanelMode("git");
```

#### Built-in Extensions

| ID | Panel Mode | Icon | Purpose |
|----|------------|------|---------|
| `files` | files | 📁 | File browser, project navigation |
| `preview` | preview | 👁️ | URL/file preview panel |
| `git` | git | 🔀 | Git status, branches, commits |
| `terminal` | terminal | 💻 | Terminal output viewer |
| `processes` | processes | ⚙️ | Background process manager |
| `kanban` | kanban | 📋 | Task board |
| `agents` | agents | 🤖 | Agent hierarchy viewer |
| `channels` | channels | 💬 | WhatsApp, Telegram & messaging inbox |

#### Creating a New Extension

1. Create component in `src/lib/features/extensions/components/`
2. Register in `src/lib/core/registries.ts`
3. Add to `DEFAULT_EXTENSIONS` array

```typescript
// In registries.ts
extensionRegistry.register({
  id: "my-extension",
  panelMode: "my-panel",
  label: "My Extension",
  icon: "🔧",
  component: MyExtensionPanel,
  defaultEnabled: true,
});
```

### Message Widgets (Inline Chat)

Register custom renderers for chat message content:

```typescript
import { registerCodeBlockWidget, registerToolWidget } from "$lib/core";

// Register a code block widget (```mermaid ... ```)
registerCodeBlockWidget("mermaid", MermaidRenderer);

// Register a tool result widget
registerToolWidget("Read", FilePreviewWidget);
```

#### Built-in Code Block Widgets

| Language | Component | Purpose |
|----------|-----------|---------|
| `mermaid` | MermaidRenderer | Flowcharts, diagrams |
| `stocks` | StockChart | Stock price comparison charts |
| `media` | MediaDisplay | Images, audio, video |
| `genui` | GenerativeUI | Interactive HTML components |
| `copyable` | CopyableBlock | Text with copy button |

#### Creating a New Widget

1. Create component in `src/lib/components/widgets/`
2. Register in `MermaidRenderer.svelte` (handles all special blocks)
3. Parse content from code block body

Example flow for `stocks` widget:
```
User asks → Claude outputs ```stocks {...} ``` → MermaidRenderer detects → StockChart renders
```

### Dashboard Widgets

Dashboard widgets appear on the project landing page. Located in `src/lib/features/dashboard/`:

| Widget | Purpose |
|--------|---------|
| `QuickActions` | Common actions (new chat, settings) |
| `RecentSessions` | Recently used sessions |
| `ProjectStats` | Token usage, cost stats |
| `SkillsList` | Enabled skills for project |

Dashboard can also render markdown widgets using code blocks:
```markdown
```widget:stats
title: Usage This Week
```
```

### References (@ Mentions)

Unified system for all input references:

```typescript
import {
  references,
  createFileReference,
  createTerminalReference,
} from "$lib/core";

// Add a file reference
references.add(createFileReference("/path/to/file.ts", "file.ts"));

// Add terminal reference
references.add(createTerminalReference("term-1", "Terminal 1", 100));

// Get all as prompt content
const prompt = references.toPromptContent();
```

---

## Skills System

Skills extend Claude's capabilities. Located in `.claude/skills/{skill-name}/`:

```
skill-name/
├── SKILL.md            # Required: frontmatter + documentation
├── package.json        # Optional: dependencies
├── index.ts            # Optional: executable
└── scripts/            # Optional: helper scripts
```

**SKILL.md format:**
```yaml
---
name: skill-name
description: When to use this skill (triggers Claude)
tools: Read, Write, Edit, Bash
model: sonnet
---

# Documentation here
```

### Built-in Skills

| Skill | Purpose |
|-------|---------|
| `stock-compare` | Fetch and compare stock prices |
| `playwright` | Browser automation, screenshots |
| `navi` | Control Navi GUI from Claude |
| `integrations` | OAuth services (Gmail, Sheets) |
| `ship-it` | Deploy apps to Navi Cloud |

### Creating a New Skill

1. Create folder `.claude/skills/{name}/`
2. Add `SKILL.md` with frontmatter
3. Optional: Add scripts/executables
4. Claude auto-discovers based on description

---

## Commands System

Commands are slash commands (e.g., `/review`, `/deploy`). Located in `.claude/commands/`:

```yaml
# .claude/commands/review.md
---
name: review
description: Review code for quality and issues
---

Review the code in the current file for:
- Bugs and edge cases
- Performance issues
- Security vulnerabilities
- Code style consistency
```

---

## Hooks System

Hooks are first-class filesystem objects (like skills and commands) that run at lifecycle events.

### Hook Locations

```
.claude/hooks/           # Project hooks (highest priority)
~/.claude/hooks/         # User/global hooks
plugins/{id}/hooks/      # Plugin hooks (legacy JSON format)
```

### Hook File Format

Located in `.claude/hooks/{hook-name}.md`:

```yaml
---
name: lint-on-edit
description: Runs ESLint after file edits
event: PostToolUse
matcher: "Edit|Write"     # Regex for tool names (tool events only)
type: command             # command | prompt
timeout: 30000
enabled: true
---

npm run lint --fix $FILE
```

### Available Events

| Event | When Triggered | Supports Matcher |
|-------|----------------|------------------|
| `SessionStart` | New session begins | ❌ |
| `PreToolUse` | Before tool execution | ✅ |
| `PostToolUse` | After tool execution | ✅ |
| `Stop` | Session ending | ❌ |
| `PreQuery` | Before sending to Claude | ❌ |
| `PostQuery` | After Claude responds | ❌ |

### Available Variables

| Variable | Description |
|----------|-------------|
| `$FILE` | File path from tool input |
| `$TOOL` | Tool name |
| `$SESSION_ID` | Current session ID |
| `$PROJECT_PATH` | Project root path |
| `$TOOL_INPUT` | Tool input as JSON |
| `$TOOL_OUTPUT` | Tool output as JSON |

### Hook Types

- **command**: Execute a shell command
- **prompt**: Inject text into the conversation

### API Endpoints

- `GET /api/hooks?projectId=xxx` - List all hooks
- `GET /api/hooks/events` - List available events
- `POST /api/hooks` - Create a new hook
- `DELETE /api/hooks/:name` - Delete a hook
- `GET /api/hooks/template` - Generate hook template

---

## Templates System

Project templates in `.claude/templates/{template-name}/`:

```
template-name/
├── CLAUDE.md           # Project instructions (copied to root)
└── .claude/
    ├── agents/         # AI personas for workflows
    └── skills/         # Template-bundled skills
```

**Initialize with:** `bun run .claude/templates/init-template.ts {template} ./path`

---

## Agents Framework

Agents are specialized AI personas that Navi can spawn for tasks. See `.claude/agents/AGENTS.md` for full spec.

### Agent Types

| Type | Icon | Native UI | Purpose |
|------|------|-----------|---------|
| `browser` | 🌐 | ✅ | Web research, URL analysis |
| `coding` | 🔧 | ✅ | Code implementation, file editing |
| `runner` | ▶️ | ✅ | Command execution, tests, builds |
| `research` | 🔍 | ❌ | Deep analysis, findings synthesis |
| `planning` | 📋 | ❌ | Task breakdown, architecture |
| `reviewer` | 👀 | ❌ | Code/document review |
| `general` | 🤖 | ❌ | Fallback for misc tasks |

### Agent File Format

Located in `.claude/agents/{name}.md`:

```yaml
---
name: Agent Display Name
type: browser | coding | runner | research | planning | reviewer | general
description: When to use this agent
icon: 🌐
color: blue | emerald | cyan | purple | amber | rose | gray
nativeUI: true | false
tools: WebFetch, WebSearch, Read, Write
skills: playwright
model: sonnet | opus | haiku
---

# System Prompt (markdown body)

You are a [Type] Agent specialized in...
```

### Spawning Agents

Agents are spawned via the `spawn_agent` MCP tool:

```typescript
spawn_agent({
  title: "Research Chart.js docs",
  role: "researcher",
  task: "Find multi-dataset examples",
  agent_type: "browser"  // Determines UI + capabilities
})
```

### Agent Loading Order

1. Built-in agents (`server/agent-types.ts`)
2. Project agents (`.claude/agents/*.md`)
3. Global agents (`~/.claude/agents/*.md`)

Later definitions override earlier ones by `type`.

---

## WebSocket Protocol

Client connects to `/ws` for real-time updates. Message types:

**Client → Server:**
- `query` - Start Claude execution
- `cancel` - Stop execution
- `permission_response` - Approve/deny tool
- `terminal_*` - PTY operations

**Server → Client:**
- `assistant` - Assistant messages (streaming)
- `result` - Query completion
- `permission_request` - Tool approval needed
- `background_process_*` - Process events

---

## Database Schema (Key Tables)

```sql
projects (id, name, path, description, folder_id, archived, context_window)
sessions (id, project_id, title, claude_session_id, model, total_cost_usd,
          parent_session_id, root_session_id, depth, role, task, agent_status, agent_type)
messages (id, session_id, role, content, timestamp, parent_tool_use_id)
skills (id, name, path, enabled, hash)
```

### Session Hierarchy Fields

| Field | Purpose |
|-------|---------|
| `parent_session_id` | Parent session (for child agents) |
| `root_session_id` | Top-level session in hierarchy |
| `depth` | Nesting level (max 3) |
| `role` | Agent role (e.g., "frontend", "researcher") |
| `task` | Task description |
| `agent_status` | `working` \| `waiting` \| `delivered` \| `blocked` |
| `agent_type` | `browser` \| `coding` \| `runner` \| etc. (for native UI) |

**Helper access:**
```typescript
import { projects, sessions, messages } from "../db";
const all = sessions.listByProject(projectId);
sessions.create(id, projectId, title, now, now);
```

---

## Component Patterns

### Modal
```svelte
<Modal open={isOpen} onClose={close} title="Title" size="lg">
  {#snippet children()}
    <!-- Content -->
  {/snippet}
  {#snippet footer()}
    <button onclick={save}>Save</button>
  {/snippet}
</Modal>
```

### Notifications
```typescript
import { showError, showSuccess } from "$lib/errorHandler";
showError({ title: "Failed", message: "Details here" });
showSuccess({ title: "Done", message: "Task completed" });
```

---

## API Client Pattern

Feature APIs follow this structure (`src/lib/features/*/api.ts`):

```typescript
const API_BASE = () => getServerUrl();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const featureApi = {
  list: () => request<Item[]>("/api/feature"),
  create: (data: CreateDTO) => request("/api/feature", {
    method: "POST",
    body: JSON.stringify(data)
  }),
};
```

---

## Styling

- **Framework:** Tailwind CSS with custom HSL-based accent colors
- **Config:** `packages/navi-app/tailwind.config.js`
- **Global styles:** `packages/navi-app/src/app.css`

Accent colors are dynamically generated from configurable hue/saturation values.

---

## Key Files Quick Reference

| Purpose | Location |
|---------|----------|
| **Core types & registries** | `packages/navi-app/src/lib/core/` |
| Main server | `packages/navi-app/server/index.ts` |
| WebSocket handler | `packages/navi-app/server/websocket/handler.ts` |
| Database | `packages/navi-app/server/db.ts` |
| Route utilities | `packages/navi-app/server/utils/response.ts` |
| Frontend stores | `packages/navi-app/src/lib/stores/` |
| API client | `packages/navi-app/src/lib/api.ts` |
| Router | `packages/navi-app/src/lib/router.ts` |
| Skills backend | `packages/navi-app/server/skills.ts` |
| **Agent types (server)** | `packages/navi-app/server/agent-types.ts` |
| **Agent types (frontend)** | `packages/navi-app/src/lib/core/agent-types.ts` |
| **Multi-session tools** | `packages/navi-app/server/services/multi-session-tools.ts` |
| **Session manager** | `packages/navi-app/server/services/session-manager.ts` |
| Extensions | `packages/navi-app/src/lib/features/extensions/` |
| Session hierarchy | `packages/navi-app/src/lib/features/session-hierarchy/` |
| Git feature | `packages/navi-app/src/lib/features/git/` |
| Dashboard | `packages/navi-app/src/lib/features/dashboard/` |
| **Message widgets** | `packages/navi-app/src/lib/components/widgets/` |
| **Stock chart widget** | `packages/navi-app/src/lib/components/widgets/StockChart.svelte` |

---

## Data Locations

- **Database:** `~/.claude-code-ui/data.db`
- **Logs:** `~/.claude-code-ui/logs/`
- **Global skills:** `~/.claude/skills/`
- **Project skills:** `.claude/skills/`
- **Global agents:** `~/.claude/agents/`
- **Project agents:** `.claude/agents/`
- **Agent spec:** `.claude/agents/AGENTS.md`
- **Settings:** `.claude/settings.json` (global), `.claude/settings.local.json` (project)

---

## Optimistic Updates Pattern

For snappy UI, use optimistic updates. Update UI immediately, persist in background, revert on failure.

```typescript
// BAD: Laggy (waits for server)
async function togglePin(item: Item) {
  await api.items.togglePin(item.id, !item.pinned);
  items = items.map(i => i.id === item.id ? { ...i, pinned: !i.pinned } : i);
}

// GOOD: Optimistic (instant feedback)
function togglePin(item: Item) {
  const previous = items;
  items = items.map(i => i.id === item.id ? { ...i, pinned: !i.pinned } : i);
  api.items.togglePin(item.id, !item.pinned).catch(() => {
    items = previous;  // Revert on failure
  });
}
```

**Use for:** Reordering, toggling (pin/favorite/archive), renaming, status changes
**Avoid for:** Creates needing server IDs, destructive deletes, actions requiring server validation

See `.claude/skills/optimistic-updates/SKILL.md` for full pattern.

---

## Development Tips

1. **Type checking:** Run `bun run --cwd packages/navi-app check` before committing
2. **Feature branches:** Use the git feature for branch management
3. **New routes:** Add handler to `server/routes/`, register in `server/index.ts`
4. **New features:** Follow the `features/git/` pattern for consistency
5. **Stores:** One store file per domain, export via barrel file
6. **Debugging:** Check `~/.claude-code-ui/logs/navi-server.log`
7. **Optimistic updates:** Use for toggles, reorders, renames - see pattern above
