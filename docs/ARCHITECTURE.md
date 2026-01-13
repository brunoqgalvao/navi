# Navi Architecture Guide

> A comprehensive map of the codebase for developers who want to understand and extend Navi.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [The 8 Component Categories](#the-8-component-categories)
3. [Directory Structure](#directory-structure)
4. [Core Module (`src/lib/core/`)](#core-module)
5. [Feature Modules (`src/lib/features/`)](#feature-modules)
6. [Extension System (Sidebar Panels)](#extension-system)
7. [Widget System (Inline Chat Renderers)](#widget-system)
8. [Server Architecture](#server-architecture)
9. [Database Schema](#database-schema)
10. [Multi-Agent System](#multi-agent-system)
11. [Skills, Agents, Commands & Hooks](#skills-agents-commands--hooks)
12. [Store Patterns](#store-patterns)
13. [WebSocket Protocol](#websocket-protocol)
14. [Experimental Features](#experimental-features)
15. [Where to Add New Features](#where-to-add-new-features)
16. [Key Files Quick Reference](#key-files-quick-reference)

---

## High-Level Overview

Navi is a desktop application providing a rich GUI for Claude Code. It's built with:

- **Frontend:** Svelte 5 + Vite + Tailwind CSS
- **Backend:** Bun + custom HTTP server + WebSocket
- **Desktop:** Tauri v2
- **Database:** sql.js (SQLite in-memory, persisted to disk)
- **AI:** @anthropic-ai/claude-agent-sdk

### Monorepo Structure

```
claude-code-local-ui/
├── packages/
│   ├── navi-app/           # Main application (this is where you'll work)
│   │   ├── src/            # Frontend (Svelte 5)
│   │   ├── server/         # Backend (Bun)
│   │   └── src-tauri/      # Desktop wrapper (Tauri v2)
│   ├── landing-page/       # Marketing website
│   └── navi-cloud/         # Cloud infrastructure
├── .claude/                # AI configuration
│   ├── agents/             # AI personas
│   ├── skills/             # Claude capabilities
│   ├── commands/           # Slash commands
│   └── settings.json       # Configuration
└── docs/                   # Documentation
```

### Ports

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 1420 | Vite dev server |
| Backend | 3001 | HTTP API + WebSocket |
| PTY Server | 3002 | Terminal emulation |

---

## The 8 Component Categories

Navi has **8 distinct categories** for extensible UI/UX components. Understanding these is crucial:

```
┌─────────────────────────────────────────────────────────────────┐
│                        NAVI UI TAXONOMY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │  EXTENSIONS   │  │MESSAGE WIDGETS│  │DASHBOARD WIDG.│       │
│  │ (Sidebar tabs)│  │ (Inline chat) │  │ (Landing page)│       │
│  │               │  │               │  │               │       │
│  │ Files, Git,   │  │ Mermaid,      │  │ QuickActions, │       │
│  │ Terminal, etc │  │ Stocks, Media │  │ RecentSessions│       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │  REFERENCES   │  │    SKILLS     │  │    AGENTS     │       │
│  │ (@ mentions)  │  │ (Capabilities)│  │ (AI personas) │       │
│  │               │  │               │  │               │       │
│  │ @file.ts      │  │ playwright,   │  │ browser,      │       │
│  │ @terminal     │  │ navi, ship-it │  │ coding, runner│       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐                          │
│  │   COMMANDS    │  │    HOOKS      │                          │
│  │ (/ commands)  │  │ (Lifecycle)   │                          │
│  │               │  │               │                          │
│  │ /review       │  │ pre-query,    │                          │
│  │ /deploy       │  │ post-tool     │                          │
│  └───────────────┘  └───────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Category | Description | Registry/Location | Example Use Case |
|----------|-------------|-------------------|------------------|
| **Extensions** | Sidebar panels | `extensionRegistry` | Add a "Logs" panel |
| **Message Widgets** | Inline chat renderers | `messageWidgetRegistry` | Render ```chart blocks |
| **Dashboard Widgets** | Project landing page | `dashboardWidgetRegistry` | Show project health |
| **References** | @ mentions in input | `references` store | @file.ts, @terminal |
| **Skills** | Claude capabilities | `.claude/skills/` | Add browser automation |
| **Agents** | AI personas | `.claude/agents/` | Custom research agent |
| **Commands** | Slash commands | `.claude/commands/` | /deploy shortcut |
| **Hooks** | Lifecycle handlers | `.claude/settings.json` | Auto-lint on save |

---

## Directory Structure

### Frontend (`packages/navi-app/src/`)

```
src/
├── lib/
│   ├── core/                    # 🔑 UNIFIED TYPES & REGISTRIES
│   │   ├── index.ts             # Barrel export (import from here)
│   │   ├── types.ts             # All type definitions
│   │   ├── registries.ts        # Extension/widget registries
│   │   ├── references.ts        # @ mention system
│   │   ├── message-widgets.ts   # Widget registration helpers
│   │   └── agent-types.ts       # Agent type system
│   │
│   ├── components/              # Shared components
│   │   ├── ChatView.svelte      # Main chat interface
│   │   ├── ChatInput.svelte     # Input with @ mentions
│   │   ├── AssistantMessage.svelte
│   │   ├── widgets/             # MESSAGE WIDGETS
│   │   │   ├── MermaidRenderer.svelte   # Diagrams
│   │   │   ├── StockChart.svelte        # Stock comparison
│   │   │   ├── MediaDisplay.svelte      # Images/audio/video
│   │   │   ├── GenerativeUI.svelte      # Interactive HTML
│   │   │   └── CopyableBlock.svelte     # Copy text
│   │   └── agents/              # Agent UI components
│   │       └── AgentCard.svelte
│   │
│   ├── features/                # 📦 FEATURE MODULES
│   │   ├── extensions/          # Sidebar panel system
│   │   ├── git/                 # Git integration
│   │   ├── kanban/              # Task board
│   │   ├── commands/            # Slash commands
│   │   ├── dashboard/           # Project landing page
│   │   ├── session-hierarchy/   # Multi-agent system
│   │   ├── proactive-hooks/     # 🧪 EXPERIMENTAL
│   │   ├── sessions-board/      # 🧪 EXPERIMENTAL
│   │   ├── email/               # 🧪 EXPERIMENTAL
│   │   └── ...
│   │
│   ├── stores/                  # Svelte stores
│   │   ├── session.ts           # Active session state
│   │   ├── projects.ts          # Project management
│   │   ├── ui.ts                # UI state
│   │   └── ...
│   │
│   └── api.ts                   # Main API client
│
├── routes/                      # SvelteKit-style routes
│   ├── +page.svelte             # Home page
│   └── project/[id]/+page.svelte
│
└── app.css                      # Global styles
```

### Backend (`packages/navi-app/server/`)

```
server/
├── index.ts                     # Main server (route dispatch)
├── db.ts                        # Database schema & helpers
├── query-worker.ts              # Claude SDK execution
├── pty-server.cjs               # Terminal emulation (Node)
│
├── routes/                      # 🛣️ API ROUTE HANDLERS
│   ├── sessions.ts              # Session CRUD
│   ├── projects.ts              # Project CRUD
│   ├── git.ts                   # Git operations
│   ├── skills.ts                # Skill loading
│   ├── agents.ts                # Agent loading
│   ├── kanban.ts                # Task board
│   ├── extensions.ts            # Extension settings
│   ├── experimental.ts          # 🧪 Experimental features
│   └── ...
│
├── services/                    # 🔧 BUSINESS LOGIC
│   ├── session-manager.ts       # Multi-agent orchestration
│   ├── multi-session-tools.ts   # Agent MCP tools
│   ├── agent-loader.ts          # Load .claude/agents/
│   ├── port-manager.ts          # Dev server ports
│   └── ...
│
├── backends/                    # Multi-model adapters
│   ├── openai-adapter.ts        # OpenAI/Codex
│   └── gemini-adapter.ts        # Google Gemini
│
├── integrations/                # OAuth integrations
│   ├── gmail.ts
│   ├── sheets.ts
│   └── ...
│
├── utils/                       # Utilities
│   └── response.ts              # json(), error() helpers
│
└── websocket/                   # Real-time communication
    └── handler.ts               # WebSocket message handling
```

---

## Core Module

The core module (`src/lib/core/`) provides the **unified foundation** for all extensible components.

### Importing from Core

```typescript
// Always import from the barrel export
import {
  // Types
  type Extension,
  type Reference,
  type MessageWidget,
  type AgentType,

  // Registries
  extensionRegistry,
  messageWidgetRegistry,
  dashboardWidgetRegistry,

  // References
  references,
  createFileReference,
  createTerminalReference,
  createChatReference,

  // Widget helpers
  registerCodeBlockWidget,
  registerToolWidget,

  // Agent types
  AGENT_TYPES,
  getAgentTypeConfig,
} from "$lib/core";
```

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.ts` | 210 | Barrel export - import everything from here |
| `types.ts` | 403 | Complete type definitions |
| `registries.ts` | 305 | BaseRegistry pattern + implementations |
| `references.ts` | 377 | Unified @ mention system |
| `message-widgets.ts` | 192 | Widget registration helpers |
| `agent-types.ts` | 445 | Agent type definitions |

### BaseRegistry Pattern

All registries extend the same base:

```typescript
class BaseRegistry<T extends { id: string }> {
  register(item: T): void;
  unregister(id: string): void;
  get(id: string): T | undefined;
  getAll(): T[];
  has(id: string): boolean;
}
```

---

## Feature Modules

Features are self-contained modules in `src/lib/features/`. Each follows a consistent structure:

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

### Feature Inventory

| Feature | Status | Purpose | Reference |
|---------|--------|---------|-----------|
| `git` | CORE | Git integration | **Use as template** |
| `extensions` | CORE | Sidebar panels | |
| `session-hierarchy` | CORE | Multi-agent system | |
| `kanban` | STABLE | Task board | |
| `commands` | STABLE | Slash commands | |
| `dashboard` | STABLE | Project landing | |
| `mcp` | STABLE | MCP server settings | |
| `agent-builder` | STABLE | Agent creation UI | |
| `proactive-hooks` | 🧪 EXP | AI suggestions | May change |
| `sessions-board` | 🧪 EXP | Visual sessions | May change |
| `email` | 🧪 EXP | AgentMail inbox | May change |

### Creating a New Feature

1. **Create the directory structure:**
```bash
mkdir -p src/lib/features/my-feature/components
```

2. **Create types.ts:**
```typescript
// src/lib/features/my-feature/types.ts
export interface MyItem {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface CreateMyItemDTO {
  name: string;
}
```

3. **Create api.ts:**
```typescript
// src/lib/features/my-feature/api.ts
import { getServerUrl } from '$lib/config';

const API_BASE = () => getServerUrl();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const myFeatureApi = {
  list: () => request<MyItem[]>('/api/my-feature'),
  create: (data: CreateMyItemDTO) => request<MyItem>('/api/my-feature', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request(`/api/my-feature/${id}`, {
    method: 'DELETE'
  }),
};
```

4. **Create components:**
```svelte
<!-- src/lib/features/my-feature/components/MyFeaturePanel.svelte -->
<script lang="ts">
  import { myFeatureApi } from '../api';
  import type { MyItem } from '../types';

  let items = $state<MyItem[]>([]);

  async function load() {
    items = await myFeatureApi.list();
  }

  $effect(() => {
    load();
  });
</script>

<div class="p-4">
  {#each items as item}
    <div>{item.name}</div>
  {/each}
</div>
```

5. **Create barrel export:**
```typescript
// src/lib/features/my-feature/index.ts
export * from './types';
export * from './api';
export { default as MyFeaturePanel } from './components/MyFeaturePanel.svelte';
```

6. **Create backend route:**
```typescript
// server/routes/my-feature.ts
import { json, error } from '../utils/response';

export async function handleMyFeatureRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  if (url.pathname === '/api/my-feature' && method === 'GET') {
    // Return list
    return json([]);
  }

  if (url.pathname === '/api/my-feature' && method === 'POST') {
    const body = await req.json();
    // Create and return
    return json({ id: 'new-id', ...body });
  }

  // Return null to pass to next handler
  return null;
}
```

7. **Register route in server/index.ts:**
```typescript
import { handleMyFeatureRoutes } from './routes/my-feature';

// In the route dispatch section:
response = await handleMyFeatureRoutes(url, method, req);
if (response) return response;
```

---

## Extension System

Extensions are **sidebar panels** that appear as tabs in the right sidebar.

### Built-in Extensions

| ID | Panel Mode | Icon | Default | Purpose |
|----|------------|------|---------|---------|
| `files` | files | 📁 | ✅ | File browser |
| `preview` | preview-unified | 👁️ | ✅ | URL/file preview |
| `git` | git | 🔀 | ✅ | Git status |
| `terminal` | terminal | 💻 | ✅ | Terminal output |
| `processes` | processes | ⚙️ | ✅ | Process manager |
| `kanban` | kanban | 📋 | ✅ | Task board |
| `agents` | agents | 🤖 | ✅ | Agent hierarchy |
| `email` | email | 📧 | ❌ | Email inbox (exp) |

### Extension Type Definition

```typescript
interface Extension {
  id: string;                    // Unique identifier
  panelMode: PanelMode;          // UI panel type
  name: string;                  // Display name
  icon: string;                  // Emoji or icon
  component: Component;          // Svelte component
  requiresProject?: boolean;     // Only show in project context
  defaultEnabled?: boolean;      // Enabled by default
  defaultOrder?: number;         // Sort order
  experimental?: boolean;        // Experimental flag
}
```

### Creating a New Extension

1. **Create the panel component:**
```svelte
<!-- src/lib/features/extensions/components/LogsPanel.svelte -->
<script lang="ts">
  interface Props {
    projectId?: string;
  }

  let { projectId }: Props = $props();
</script>

<div class="h-full overflow-auto p-4">
  <h3 class="font-bold mb-2">Logs</h3>
  <!-- Your panel content -->
</div>
```

2. **Register in core/registries.ts:**
```typescript
// In DEFAULT_EXTENSIONS array:
{
  id: 'logs',
  panelMode: 'logs' as PanelMode,  // Add to PanelMode type too
  name: 'Logs',
  icon: '📝',
  component: LogsPanel,
  requiresProject: true,
  defaultEnabled: true,
  defaultOrder: 8,
}
```

3. **Update PanelMode type in core/types.ts:**
```typescript
export type PanelMode =
  | 'files'
  | 'git'
  | 'logs'  // Add your new mode
  // ...
```

### Extension Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│                  EXTENSION LIFECYCLE                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. App Startup                                          │
│     └── initializeRegistries() in core/registries.ts    │
│         └── extensionRegistry.register() for each       │
│                                                          │
│  2. Project Load                                         │
│     └── Load extension_settings from database           │
│     └── Merge with defaults (enabled, order)            │
│                                                          │
│  3. UI Render                                            │
│     └── ExtensionTabs.svelte reads extensionRegistry    │
│     └── Renders enabled extensions in order             │
│                                                          │
│  4. User Interaction                                     │
│     └── Click tab → panelMode store updates             │
│     └── Drag to reorder → save to backend               │
│     └── Toggle enable → save to backend                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Widget System

Widgets render **inline within chat messages**. They're used for rich content like diagrams, charts, and interactive elements.

### Widget Types

#### Code Block Widgets

Triggered by special language identifiers in code blocks:

| Language | Component | Purpose |
|----------|-----------|---------|
| `mermaid` | MermaidRenderer | Flowcharts, diagrams |
| `stocks` | StockChart | Stock price charts |
| `media` | MediaDisplay | Images, audio, video |
| `genui` | GenerativeUI | Interactive HTML |
| `copyable` | CopyableBlock | Text with copy button |
| `json` | JsonTreeViewer | Collapsible JSON tree |

#### Tool Result Widgets

Triggered by specific tool outputs:

| Tool | Component | Purpose |
|------|-----------|---------|
| `Read` | FilePreview | File content display |
| `Write` | FileCreated | File creation confirmation |
| `Bash` | CommandOutput | Terminal output styling |

### How Widgets Work

```
┌─────────────────────────────────────────────────────────────┐
│                     WIDGET FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Claude outputs:                                         │
│     ```stocks                                               │
│     symbols: AAPL, GOOGL                                    │
│     period: 1y                                              │
│     ```                                                     │
│                                                             │
│  2. AssistantMessage.svelte receives content                │
│                                                             │
│  3. MermaidRenderer.svelte detects "stocks" language        │
│                                                             │
│  4. Parses YAML config from code block body                 │
│                                                             │
│  5. StockChart.svelte renders with parsed config            │
│                                                             │
│  6. User sees interactive stock chart                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Creating a New Widget

**Example: Creating a ```chart widget for data visualization**

1. **Create the widget component:**
```svelte
<!-- src/lib/components/widgets/ChartWidget.svelte -->
<script lang="ts">
  interface Props {
    config: {
      type: 'bar' | 'line' | 'pie';
      data: number[];
      labels: string[];
    };
  }

  let { config }: Props = $props();
</script>

<div class="p-4 bg-gray-100 rounded-lg">
  <!-- Render chart using Chart.js or similar -->
  <canvas id="chart"></canvas>
</div>
```

2. **Register in MermaidRenderer.svelte:**
```typescript
// In the language detection switch:
case 'chart':
  return { component: ChartWidget, config: parseYaml(content) };
```

3. **Use in Claude output:**
```
```chart
type: bar
labels: [Jan, Feb, Mar]
data: [100, 150, 200]
```
```

### Widget Configuration Formats

Widgets typically use YAML for configuration:

```yaml
# Media widget
src: /path/to/image.png
alt: Description
caption: Optional caption

# Stocks widget
symbols: AAPL, GOOGL, MSFT
period: 1y
type: comparison

# Copyable widget
label: API Key
sk-1234567890abcdef
```

---

## Server Architecture

### Route Dispatch Pattern

The server uses a chain-of-responsibility pattern:

```typescript
// server/index.ts
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;

  let response: Response | null = null;

  // Each handler returns Response or null
  response = await handleSessionRoutes(url, method, req);
  if (response) return response;

  response = await handleProjectRoutes(url, method, req);
  if (response) return response;

  response = await handleGitRoutes(url, method, req);
  if (response) return response;

  // ... more handlers ...

  return new Response('Not Found', { status: 404 });
}
```

### Route Handler Pattern

```typescript
// server/routes/my-feature.ts
import { json, error } from '../utils/response';
import { myTable } from '../db';

export async function handleMyFeatureRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // Match: GET /api/my-feature
  if (url.pathname === '/api/my-feature' && method === 'GET') {
    const items = myTable.list();
    return json(items);
  }

  // Match: GET /api/my-feature/:id
  const match = url.pathname.match(/^\/api\/my-feature\/([^\/]+)$/);
  if (match && method === 'GET') {
    const id = match[1];
    const item = myTable.get(id);
    if (!item) return error('Not found', 404);
    return json(item);
  }

  // Match: POST /api/my-feature
  if (url.pathname === '/api/my-feature' && method === 'POST') {
    const body = await req.json();
    const item = myTable.create(body);
    return json(item, 201);
  }

  // Match: DELETE /api/my-feature/:id
  if (match && method === 'DELETE') {
    myTable.delete(match[1]);
    return json({ success: true });
  }

  // Not matched - pass to next handler
  return null;
}
```

### Response Helpers

```typescript
// server/utils/response.ts
export function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

---

## Database Schema

The database uses sql.js (SQLite in WebAssembly). Data persists to `~/.claude-code-ui/data.db`.

### Core Tables

```sql
-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  folder_id TEXT,
  context_window INTEGER DEFAULT 200000,
  archived INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

-- Sessions (with multi-agent hierarchy)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  model TEXT DEFAULT 'sonnet',
  backend TEXT DEFAULT 'claude',

  -- Token tracking
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,

  -- Multi-agent hierarchy
  parent_session_id TEXT,      -- Parent session (if child agent)
  root_session_id TEXT,        -- Top-level session in tree
  depth INTEGER DEFAULT 0,     -- Nesting level (max 3)
  role TEXT,                   -- Agent role ("frontend", "researcher")
  task TEXT,                   -- Task description
  agent_status TEXT,           -- working | waiting | delivered | blocked
  agent_type TEXT,             -- browser | coding | runner | etc.

  created_at INTEGER,
  updated_at INTEGER,

  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,          -- user | assistant | system
  content TEXT NOT NULL,       -- JSON string
  parent_tool_use_id TEXT,     -- For tool results
  timestamp INTEGER NOT NULL,

  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### Extension Tables

```sql
-- Skills
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  enabled INTEGER DEFAULT 0,
  hash TEXT
);

-- Extension settings (per project)
CREATE TABLE extension_settings (
  project_id TEXT NOT NULL,
  extension_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (project_id, extension_id)
);

-- Kanban
CREATE TABLE kanban_cards (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0
);

-- Multi-agent decisions
CREATE TABLE session_decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  root_session_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  category TEXT,
  rationale TEXT,
  created_at INTEGER
);

-- Multi-agent artifacts
CREATE TABLE session_artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  root_session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  created_at INTEGER
);
```

### Database Access Pattern

```typescript
// server/db.ts exports helper objects
import { sessions, projects, messages, skills } from './db';

// List with filters
const projectSessions = sessions.listByProject(projectId);

// Get single item
const session = sessions.get(sessionId);

// Create
sessions.create(id, projectId, title, createdAt, updatedAt);

// Update
sessions.update(sessionId, { title: 'New Title' });

// Delete
sessions.delete(sessionId);
```

---

## Multi-Agent System

The most sophisticated feature - enables spawning child agents that work in parallel.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   MULTI-AGENT HIERARCHY                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Root Session (depth=0)                                     │
│  └── User request: "Build a full-stack app"                 │
│                                                             │
│      ┌───────────────────┐     ┌───────────────────┐       │
│      │ Child 1 (depth=1) │     │ Child 2 (depth=1) │       │
│      │ type: coding      │     │ type: runner      │       │
│      │ role: frontend    │     │ role: testing     │       │
│      │ status: working   │     │ status: waiting   │       │
│      └───────────────────┘     └───────────────────┘       │
│                │                                            │
│      ┌─────────┴─────────┐                                  │
│      │ Child 1.1 (d=2)   │                                  │
│      │ type: browser     │                                  │
│      │ role: research    │                                  │
│      └───────────────────┘                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Agent Types

| Type | Icon | Color | Native UI | Primary Tools |
|------|------|-------|-----------|---------------|
| `browser` | 🌐 | Blue | URLs, screenshots | WebFetch, WebSearch |
| `coding` | 🔧 | Emerald | File diffs | Read, Write, Edit, Bash |
| `runner` | ▶️ | Cyan | Command output | Bash, Read |
| `research` | 🔍 | Purple | Findings list | WebFetch, WebSearch |
| `planning` | 📋 | Amber | Task breakdown | Read, TodoWrite |
| `reviewer` | 👀 | Rose | Review checklist | Read, Grep |
| `general` | 🤖 | Gray | Generic | All tools |

### MCP Tools for Agent Coordination

```typescript
// Spawn a child agent
spawn_agent({
  title: "Build Login Form",
  role: "frontend",
  task: "Create React login component with validation",
  agent_type: "coding",
  model: "sonnet"  // Optional: haiku, sonnet, opus
});

// Get context from other agents
get_context({
  source: "sibling",          // parent | sibling | decisions | artifacts
  query: "auth API endpoint",
  sibling_role: "backend"     // Optional: filter by role
});

// Log decisions (visible to all agents in tree)
log_decision({
  decision: "Using JWT for authentication",
  category: "architecture",
  rationale: "Industry standard, easy validation"
});

// Escalate when blocked
escalate({
  type: "blocker",            // question | decision_needed | blocker | permission
  summary: "Missing API endpoint",
  context: "Need /api/auth/login but it doesn't exist"
});

// Deliver results to parent
deliver({
  type: "code",               // code | research | decision | artifact | error
  summary: "Login form completed",
  content: "Created LoginForm.tsx with email/password validation",
  artifacts: [{ path: "/src/LoginForm.tsx", description: "Login component" }]
});
```

### Key Files

| File | Purpose |
|------|---------|
| `server/services/session-manager.ts` | Orchestrates hierarchy |
| `server/services/multi-session-tools.ts` | MCP tool implementations |
| `server/services/agent-loader.ts` | Loads .claude/agents/*.md |
| `server/agent-types.ts` | Built-in agent definitions |
| `src/lib/core/agent-types.ts` | Frontend agent config |
| `src/lib/features/session-hierarchy/` | UI components |

---

## Skills, Agents, Commands & Hooks

### Skills

Skills extend Claude's capabilities. Located in `.claude/skills/`:

```
.claude/skills/{skill-name}/
├── SKILL.md            # Required: frontmatter + docs
├── package.json        # Optional: dependencies
├── index.ts            # Optional: executable
└── scripts/            # Optional: helpers
```

**SKILL.md format:**
```yaml
---
name: my-skill
description: When to trigger this skill (Claude uses this)
tools: Read, Write, Edit, Bash
model: sonnet
---

# Skill Documentation

Instructions for Claude when using this skill...
```

### Agents

Agent personas in `.claude/agents/`:

```yaml
---
name: Frontend Developer
type: coding
description: Specialized in React and modern frontend
icon: ⚛️
color: cyan
nativeUI: true
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

# System Prompt

You are a Frontend Developer Agent specialized in...
```

### Commands

Slash commands in `.claude/commands/`:

```yaml
---
name: review
description: Review code for quality issues
---

Review the following for:
- Bugs and edge cases
- Performance issues
- Security vulnerabilities
```

### Hooks

Lifecycle handlers in `.claude/settings.json`:

```json
{
  "hooks": {
    "pre-query": "echo 'Query starting...'",
    "post-tool": "npm run lint --fix",
    "on-error": "notify-send 'Error occurred'"
  }
}
```

| Hook | When Triggered |
|------|----------------|
| `pre-query` | Before sending to Claude |
| `post-query` | After Claude responds |
| `pre-tool` | Before tool execution |
| `post-tool` | After tool execution |
| `on-error` | On any error |

---

## Store Patterns

Svelte stores are organized by domain in `src/lib/stores/`:

### Key Stores

| Store | File | Purpose |
|-------|------|---------|
| `currentSession` | session.ts | Active session |
| `sessionMessages` | session.ts | Messages per session |
| `isExecuting` | session.ts | Query in progress |
| `projects` | projects.ts | Project list |
| `currentProject` | projects.ts | Active project |
| `panelMode` | ui.ts | Current sidebar panel |
| `references` | core/references.ts | @ mentions |

### Creating a Custom Store

```typescript
// src/lib/stores/my-store.ts
import { writable, derived } from 'svelte/store';

interface MyState {
  items: Item[];
  loading: boolean;
  filter: string;
}

function createMyStore() {
  const { subscribe, set, update } = writable<MyState>({
    items: [],
    loading: false,
    filter: '',
  });

  return {
    subscribe,

    setItems: (items: Item[]) => update(s => ({ ...s, items })),

    setFilter: (filter: string) => update(s => ({ ...s, filter })),

    addItem: (item: Item) => update(s => ({
      ...s,
      items: [...s.items, item],
    })),

    reset: () => set({ items: [], loading: false, filter: '' }),
  };
}

export const myStore = createMyStore();

// Derived store for filtered items
export const filteredItems = derived(myStore, $store =>
  $store.items.filter(item =>
    item.name.includes($store.filter)
  )
);
```

---

## WebSocket Protocol

Real-time communication via WebSocket at `/ws`.

### Client → Server Messages

```typescript
// Start Claude execution
{ type: "query", content: "Help me...", sessionId: "..." }

// Cancel execution
{ type: "cancel", sessionId: "..." }

// Approve/deny tool
{ type: "permission_response", requestId: "...", approved: true }

// Terminal operations
{ type: "terminal_create", sessionId: "...", shell: "/bin/zsh" }
{ type: "terminal_input", terminalId: "...", data: "ls -la\n" }
{ type: "terminal_resize", terminalId: "...", cols: 80, rows: 24 }
```

### Server → Client Messages

```typescript
// Assistant message (streaming)
{
  type: "assistant",
  sessionId: "...",
  content: [{ type: "text", text: "..." }],
  isStreaming: true
}

// Query completion
{
  type: "result",
  sessionId: "...",
  success: true,
  usage: { inputTokens: 100, outputTokens: 50 }
}

// Tool permission request
{
  type: "permission_request",
  requestId: "...",
  tool: "Write",
  params: { file_path: "/src/file.ts", content: "..." }
}

// Background process events
{
  type: "background_process_event",
  processId: "...",
  status: "running",
  output: "npm install complete"
}

// Agent status updates
{
  type: "agent_status",
  sessionId: "...",
  status: "delivered",
  deliverable: { summary: "Task complete", artifacts: [...] }
}
```

---

## Experimental Features

Features marked with 🧪 are experimental and may change significantly.

| Feature | Status | Description | Future |
|---------|--------|-------------|--------|
| **Proactive Hooks** | 🧪 | AI suggestions during chat | Keep, refine |
| **Sessions Board** | 🧪 | Visual session management | Keep, refine |
| **Email (AgentMail)** | 🧪 | Autonomous agent email | Keep, refine |
| **Browser Integration** | 🧪 | browser-use backend | Keep, expand |
| **Ensemble Consensus** | ⚠️ | Multi-LLM voting | Under review |
| **E2B Cloud Execution** | ❌ | Cloud sandboxes | Deprecated |
| **Self-Healing Builds** | ❌ | Auto-fix builds | Deprecated |
| **Channels** | ❌ | Cross-workspace collab | Cut |
| **Plugins** | ❌ | Plugin system | Cut |

### Experimental Code Markers

```typescript
// @experimental - This API may change
export function experimentalFeature() { ... }

// @deprecated - Will be removed
export function oldFeature() { ... }
```

---

## Where to Add New Features

### Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│              WHERE DOES MY FEATURE GO?                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Q: Is it a sidebar panel?                                  │
│  → Yes: EXTENSION (register in extensionRegistry)           │
│                                                             │
│  Q: Does it render inline in chat?                          │
│  → Yes: MESSAGE WIDGET (register in messageWidgetRegistry)  │
│                                                             │
│  Q: Does it appear on project landing page?                 │
│  → Yes: DASHBOARD WIDGET (register in dashboardWidgetRegistry)│
│                                                             │
│  Q: Is it an @ mention in input?                            │
│  → Yes: REFERENCE (add to references.ts)                    │
│                                                             │
│  Q: Does it extend Claude's capabilities?                   │
│  → Yes: SKILL (create .claude/skills/{name}/)               │
│                                                             │
│  Q: Is it an AI persona?                                    │
│  → Yes: AGENT (create .claude/agents/{name}.md)             │
│                                                             │
│  Q: Is it a slash command?                                  │
│  → Yes: COMMAND (create .claude/commands/{name}.md)         │
│                                                             │
│  Q: Is it a lifecycle hook?                                 │
│  → Yes: HOOK (add to .claude/settings.json)                 │
│                                                             │
│  Q: Is it a self-contained feature module?                  │
│  → Yes: FEATURE MODULE (create features/{name}/)            │
│                                                             │
│  Q: Is it backend-only functionality?                       │
│  → Yes: ROUTE + SERVICE (server/routes/ + server/services/) │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Quick Reference Table

| I want to... | Add this... | Location |
|--------------|-------------|----------|
| Add sidebar panel | Extension | `core/registries.ts` + component |
| Render ```special blocks | Code block widget | `components/widgets/` |
| Render tool results | Tool widget | `components/widgets/` |
| Add @ mention | Reference type | `core/references.ts` |
| Extend Claude | Skill | `.claude/skills/{name}/` |
| Create AI persona | Agent | `.claude/agents/{name}.md` |
| Add /command | Command | `.claude/commands/{name}.md` |
| Run on events | Hook | `.claude/settings.json` |
| New API endpoint | Route | `server/routes/{name}.ts` |
| Complex feature | Feature module | `features/{name}/` |

---

## Key Files Quick Reference

### Core Architecture

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/core/index.ts` | 210 | All core exports |
| `src/lib/core/types.ts` | 403 | Type definitions |
| `src/lib/core/registries.ts` | 305 | Registry implementations |
| `src/lib/core/references.ts` | 377 | @ mention system |
| `src/lib/core/agent-types.ts` | 445 | Agent type system |

### Server

| File | Lines | Purpose |
|------|-------|---------|
| `server/index.ts` | 545 | Main server |
| `server/db.ts` | 1000+ | Database schema |
| `server/query-worker.ts` | 604 | Claude SDK execution |
| `server/websocket/handler.ts` | 400+ | WebSocket messages |

### Multi-Agent

| File | Lines | Purpose |
|------|-------|---------|
| `server/services/session-manager.ts` | 176 | Hierarchy orchestration |
| `server/services/multi-session-tools.ts` | 491 | MCP tools |
| `server/services/agent-loader.ts` | 273 | Load agent definitions |
| `server/agent-types.ts` | 352 | Built-in agents |

### UI Components

| File | Purpose |
|------|---------|
| `src/lib/components/ChatView.svelte` | Main chat |
| `src/lib/components/ChatInput.svelte` | Input with mentions |
| `src/lib/components/AssistantMessage.svelte` | Message rendering |
| `src/lib/features/extensions/components/ExtensionTabs.svelte` | Sidebar |

### Widgets

| File | Trigger |
|------|---------|
| `widgets/MermaidRenderer.svelte` | ```mermaid |
| `widgets/StockChart.svelte` | ```stocks |
| `widgets/MediaDisplay.svelte` | ```media |
| `widgets/GenerativeUI.svelte` | ```genui |
| `widgets/CopyableBlock.svelte` | ```copyable |

---

## Data Locations

| Data | Path |
|------|------|
| Database | `~/.claude-code-ui/data.db` |
| Logs | `~/.claude-code-ui/logs/` |
| Global skills | `~/.claude/skills/` |
| Project skills | `.claude/skills/` |
| Global agents | `~/.claude/agents/` |
| Project agents | `.claude/agents/` |
| Settings | `.claude/settings.json` |

---

## Development Commands

```bash
# Start development
bun run dev:app        # Frontend + backend + PTY

# Type checking (ALWAYS run before committing)
bun run --cwd packages/navi-app check

# API testing
bun run --cwd packages/navi-app test:api

# Build for production
bun run build:app

# Tauri desktop build
bun run build:tauri
```

---

*This document is the source of truth for Navi's architecture. When in doubt, check this guide first.*
