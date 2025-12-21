# Extension Framework PRD

## Overview
A lightweight extension framework for Claude Code Local UI that enables modular features (like Git, Calendar, Kanban) to be developed, loaded, and managed independently while sharing core app infrastructure.

## Problem Statement
As we add more features (git integration, calendar, kanban, etc.), the main application will become bloated and harder to maintain. We need a clean separation between core functionality and optional extensions.

## Goals
- Enable modular development of features as extensions
- Provide consistent API for extensions to interact with the app
- Allow extensions to access both frontend (UI) and backend (local system)
- Keep extensions isolated but allow controlled communication
- Make it easy to develop new extensions

## Non-Goals (v1)
- Third-party extension marketplace
- Sandboxed/untrusted extension execution
- Extension versioning and updates
- Cross-extension communication

---

## Core Concepts

### Extension Definition
An extension is a self-contained module that:
1. Has a manifest declaring its capabilities and requirements
2. Provides UI components for rendering
3. Can register backend API routes
4. Can hook into app lifecycle events
5. Can access shared app state (with permissions)

### Extension Types

1. **Panel Extensions** - Render in sidebar/panel areas (Git, Calendar)
2. **Widget Extensions** - Small UI elements in header/footer (Clock, Status)
3. **Modal Extensions** - Full-screen or modal interfaces (Settings, Kanban board)
4. **Background Extensions** - No UI, just services (Sync, Notifications)

---

## Architecture

### Directory Structure
```
/extensions
  /git
    manifest.json        # Extension metadata
    index.ts             # Main entry point
    components/          # Svelte components
      GitPanel.svelte
      GitStatus.svelte
    api/                 # Backend routes
      routes.ts
    lib/                 # Shared utilities
      git-commands.ts
  /calendar
    manifest.json
    index.ts
    components/
    api/
  ...
```

### Manifest Schema
```json
{
  "id": "git",
  "name": "Git Integration",
  "version": "1.0.0",
  "description": "Git repository management within the app",
  "author": "Claude Code Team",
  
  "type": "panel",
  "placement": "sidebar-right",
  
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "shell:execute",
    "notifications"
  ],
  
  "components": {
    "panel": "./components/GitPanel.svelte",
    "widget": "./components/GitStatus.svelte"
  },
  
  "api": {
    "routes": "./api/routes.ts",
    "prefix": "/api/ext/git"
  },
  
  "hooks": [
    "onAppStart",
    "onConversationChange"
  ],
  
  "dependencies": [],
  
  "settings": {
    "autoRefresh": {
      "type": "boolean",
      "default": true,
      "label": "Auto-refresh status"
    },
    "refreshInterval": {
      "type": "number",
      "default": 5000,
      "label": "Refresh interval (ms)"
    }
  }
}
```

---

## Extension API

### Frontend API (Client-side)

```typescript
// Extension context provided to components
interface ExtensionContext {
  // Extension info
  id: string;
  manifest: ExtensionManifest;
  
  // App state access
  stores: {
    conversations: Readable<Conversation[]>;
    currentConversation: Readable<Conversation | null>;
    messages: Readable<Message[]>;
    settings: Writable<AppSettings>;
  };
  
  // API access
  api: {
    fetch: (path: string, options?: RequestInit) => Promise<Response>;
    // Scoped to extension's API prefix automatically
  };
  
  // UI utilities
  ui: {
    showToast: (message: string, type: 'info' | 'success' | 'error') => void;
    showModal: (component: SvelteComponent, props?: any) => void;
    showConfirm: (message: string) => Promise<boolean>;
  };
  
  // Extension settings
  settings: Writable<ExtensionSettings>;
  
  // Lifecycle
  onDestroy: (callback: () => void) => void;
}

// Usage in Svelte component
<script lang="ts">
  import { getExtensionContext } from '$lib/extensions';
  
  const ctx = getExtensionContext();
  const { stores, api, ui } = ctx;
  
  async function fetchStatus() {
    const res = await api.fetch('/status');
    return res.json();
  }
</script>
```

### Backend API (Server-side)

```typescript
// Extension route definition
import { ExtensionRouter } from '@/extensions/server';

export function registerRoutes(router: ExtensionRouter) {
  router.get('/status', async (ctx) => {
    const result = await ctx.shell.exec('git status --porcelain -b');
    return ctx.json(parseGitStatus(result));
  });
  
  router.post('/commit', async (ctx) => {
    const { message } = await ctx.body();
    
    // Permission check
    if (!ctx.hasPermission('shell:execute')) {
      return ctx.error(403, 'Permission denied');
    }
    
    const result = await ctx.shell.exec(`git commit -m "${message}"`);
    return ctx.json({ success: true, result });
  });
}

// Extension server context
interface ExtensionServerContext {
  // Shell execution (requires permission)
  shell: {
    exec: (command: string) => Promise<ShellResult>;
    spawn: (command: string, args: string[]) => ChildProcess;
  };
  
  // File system access (requires permission)
  fs: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
    list: (path: string) => Promise<string[]>;
  };
  
  // Database access
  db: {
    query: <T>(sql: string, params?: any[]) => Promise<T[]>;
    run: (sql: string, params?: any[]) => Promise<void>;
  };
  
  // App context
  app: {
    workingDirectory: string;
    config: AppConfig;
  };
  
  // Utilities
  json: (data: any) => Response;
  error: (status: number, message: string) => Response;
  hasPermission: (perm: string) => boolean;
}
```

---

## Lifecycle Hooks

Extensions can register for app lifecycle events:

```typescript
// Extension entry point (index.ts)
import type { ExtensionLifecycle } from '@/extensions';

export const lifecycle: ExtensionLifecycle = {
  onAppStart: async (ctx) => {
    // Called when app starts
    console.log('Git extension starting...');
  },
  
  onAppStop: async (ctx) => {
    // Called when app stops
  },
  
  onConversationChange: async (ctx, conversation) => {
    // Called when user switches conversations
  },
  
  onMessageReceived: async (ctx, message) => {
    // Called when a new message arrives
  },
  
  onSettingsChange: async (ctx, settings) => {
    // Called when extension settings change
  }
};
```

---

## Extension Manager

### Loading Extensions

```typescript
// ExtensionManager handles discovery and loading
class ExtensionManager {
  private extensions: Map<string, LoadedExtension> = new Map();
  
  async discoverExtensions(): Promise<ExtensionManifest[]> {
    // Scan /extensions directory for manifest.json files
  }
  
  async loadExtension(id: string): Promise<void> {
    // 1. Read manifest
    // 2. Validate permissions
    // 3. Load components
    // 4. Register API routes
    // 5. Initialize lifecycle
  }
  
  async unloadExtension(id: string): Promise<void> {
    // Clean up and remove extension
  }
  
  getExtension(id: string): LoadedExtension | undefined {
    return this.extensions.get(id);
  }
  
  listExtensions(): LoadedExtension[] {
    return Array.from(this.extensions.values());
  }
}
```

### Extension Settings UI

Built-in settings panel for managing extensions:
- Enable/disable extensions
- Configure extension-specific settings
- View extension info and permissions

---

## Permissions System

### Available Permissions

| Permission | Description |
|------------|-------------|
| `filesystem:read` | Read files from working directory |
| `filesystem:write` | Write files to working directory |
| `shell:execute` | Execute shell commands |
| `notifications` | Show desktop notifications |
| `network` | Make external HTTP requests |
| `database` | Access app database |
| `conversations:read` | Read conversation data |
| `conversations:write` | Modify conversation data |

### Permission Enforcement

```typescript
// Backend permission check
router.post('/commit', async (ctx) => {
  // Throws if permission not granted
  ctx.requirePermission('shell:execute');
  
  // Or check conditionally
  if (ctx.hasPermission('notifications')) {
    await sendNotification('Commit created');
  }
});
```

---

## UI Slots

Extensions render in predefined slots:

```
┌─────────────────────────────────────────────────────────┐
│ [header-left]    TITLE    [header-right: widgets]       │
├──────────┬──────────────────────────────┬───────────────┤
│          │                              │               │
│ sidebar  │                              │   sidebar     │
│  -left   │       main-content           │   -right      │
│          │                              │               │
│ [panels] │                              │   [panels]    │
│          │                              │               │
├──────────┴──────────────────────────────┴───────────────┤
│ [footer-left]                      [footer-right]       │
└─────────────────────────────────────────────────────────┘
```

### Slot Registration

```json
// In manifest.json
{
  "placement": "sidebar-right",
  "slots": {
    "header-right": "./components/StatusWidget.svelte"
  }
}
```

---

## Development Experience

### Extension Template

```bash
# Create new extension from template
npm run extension:create my-extension

# Creates:
# /extensions/my-extension/
#   manifest.json
#   index.ts
#   components/Panel.svelte
#   api/routes.ts
```

### Hot Reload

Extensions support hot module replacement during development:
- Component changes reload instantly
- API route changes require server restart

### Testing

```typescript
// Extension test utilities
import { createExtensionTestContext } from '@/extensions/testing';

describe('Git Extension', () => {
  it('should return repository status', async () => {
    const ctx = createExtensionTestContext({
      shell: mockShell({
        'git status --porcelain -b': '## main\nM file.txt'
      })
    });
    
    const result = await getStatus(ctx);
    expect(result.branch).toBe('main');
    expect(result.modified).toContain('file.txt');
  });
});
```

---

## Security Considerations

1. **No arbitrary code execution** - Extensions are bundled at build time, not runtime loaded from arbitrary sources
2. **Permission boundaries** - Extensions can only access what they're granted
3. **Path restrictions** - Filesystem access limited to working directory
4. **Shell command validation** - Dangerous commands can be blocked
5. **No network by default** - External requests require explicit permission

---

## Implementation Phases

### Phase 1: Core Framework (3-4 days)
- Extension manifest schema and loader
- Basic permission system
- Component slot rendering
- Extension context (stores, api)

### Phase 2: Backend Support (2-3 days)
- Extension router integration
- Shell execution wrapper
- Filesystem access wrapper
- Database access

### Phase 3: Developer Experience (2-3 days)
- Extension template generator
- Settings UI for extensions
- Hot reload support
- Documentation

### Phase 4: First Extensions (varies)
- Port features to extension format
- Validate framework with real use cases
- Iterate on APIs based on needs

---

## Open Questions

1. **Build-time vs Runtime loading?**
   - Build-time: Simpler, more secure, requires rebuild
   - Runtime: More flexible, more complex, security risks
   - **Recommendation:** Build-time for v1

2. **Svelte-only or framework agnostic?**
   - Svelte-only: Simpler, better integration
   - Agnostic: More flexible, more complexity
   - **Recommendation:** Svelte-only for v1

3. **Extension isolation level?**
   - Shared context: Simple, less isolation
   - Iframe sandbox: Complex, better isolation
   - **Recommendation:** Shared context for v1 (trusted extensions only)

4. **How to handle extension conflicts?**
   - Same slot registration
   - Conflicting keyboard shortcuts
   - Overlapping functionality

---

## Success Metrics
- Time to create new extension
- Extension code complexity vs standalone
- Performance impact of framework
- Developer satisfaction

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Core Framework | 3-4 days | 3-4 days |
| Backend Support | 2-3 days | 5-7 days |
| Developer Experience | 2-3 days | 7-10 days |
| First Extensions | varies | depends |

**Framework MVP: ~7-10 days**
