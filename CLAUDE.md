# Navi - Claude Code Local UI

A desktop application providing a rich GUI for Claude Code, built with Svelte 5, Tauri, and Bun.

## Be snarky fun

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
| **Message Widgets** | Inline chat renderers (code, media, tools) | `components/*.svelte` | `messageWidgetRegistry` |
| **Dashboard Widgets** | Project landing page components | `features/dashboard/` | `dashboardWidgetRegistry` |
| **References** | @ mentions in input (files, terminals, chats) | `core/references.ts` | `references` store |
| **Skills** | Claude capability extensions | `.claude/skills/` | File-based |
| **Agents** | AI personas for specialized tasks | `.claude/agents/` | File-based |
| **Commands** | Slash commands (/review, /deploy) | `.claude/commands/` | File-based |
| **Hooks** | Lifecycle event handlers | `.claude/settings.json` | Config-based |

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

### Message Widgets (Inline Chat)

Register custom renderers for chat message content:

```typescript
import { registerCodeBlockWidget, registerToolWidget } from "$lib/core";

// Register a code block widget (```mermaid ... ```)
registerCodeBlockWidget("mermaid", MermaidRenderer);

// Register a tool result widget
registerToolWidget("Read", FilePreviewWidget);
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

## Agents

Agents are specialized AI personas in `.claude/agents/{name}.md`:

```yaml
---
name: agent-name
description: What this agent does (determines when invoked)
tools: Read, Write, Edit, Bash
model: sonnet
---

# Agent instructions here
```

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
sessions (id, project_id, title, claude_session_id, model, total_cost_usd)
messages (id, session_id, role, content, timestamp, parent_tool_use_id)
skills (id, name, path, enabled, hash)
```

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
| Extensions | `packages/navi-app/src/lib/features/extensions/` |
| Git feature | `packages/navi-app/src/lib/features/git/` |
| Dashboard | `packages/navi-app/src/lib/features/dashboard/` |

---

## Data Locations

- **Database:** `~/.claude-code-ui/data.db`
- **Logs:** `~/.claude-code-ui/logs/`
- **Global skills:** `~/.claude/skills/`
- **Project skills:** `.claude/skills/`
- **Settings:** `.claude/settings.json` (global), `.claude/settings.local.json` (project)

---

## Development Tips

1. **Type checking:** Run `bun run --cwd packages/navi-app check` before committing
2. **Feature branches:** Use the git feature for branch management
3. **New routes:** Add handler to `server/routes/`, register in `server/index.ts`
4. **New features:** Follow the `features/git/` pattern for consistency
5. **Stores:** One store file per domain, export via barrel file
6. **Debugging:** Check `~/.claude-code-ui/logs/navi-server.log`
