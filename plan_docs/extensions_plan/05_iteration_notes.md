# Iteration Notes & Cross-Reference Analysis

## Overview
This document captures insights from comparing the PRDs and identifies opportunities for framework improvements and shared patterns.

---

## Cross-Cutting Concerns Identified

### 1. Backend Execution Patterns

Both Git and Calendar need backend capabilities:

| Capability | Git | Calendar | Framework Solution |
|------------|-----|----------|-------------------|
| Shell execution | ✅ Heavy | ❌ None | `ctx.shell.exec()` |
| Database access | ❌ None | ✅ Heavy | `ctx.db.query()` |
| File system | ⚠️ Light | ❌ None | `ctx.fs.read/write()` |
| Notifications | ⚠️ Optional | ✅ Required | `ctx.notify()` |

**Insight:** The framework must support both shell-heavy and database-heavy extensions equally well.

**Action:** Ensure both patterns are first-class citizens in ExtensionServerContext.

---

### 2. UI Slot Usage

| Slot | Git | Calendar | Notes |
|------|-----|----------|-------|
| header-right | Status widget | Time widget | Both need small widgets |
| sidebar-right | Main panel | Today view | Both need panels |
| modal | Diff viewer? | Quick add, Week view | Both need modals |

**Insight:** The slot system covers both extensions well. Consider slot priority/ordering.

**Action:** Add `order` field to manifest for slot positioning.

---

### 3. Real-time Updates

| Extension | Update Trigger | Approach |
|-----------|---------------|----------|
| Git | File changes, git operations | Polling (5s) or file watcher |
| Calendar | Time passing, event due | Timer (1m) for reminders, reactive for UI |

**Insight:** Extensions need different update strategies.

**Action:** Provide both polling and event-based patterns in framework:
```typescript
// Polling
ctx.startPolling(5000, async () => { ... });

// Events (future: file watcher integration)
ctx.onFileChange((path) => { ... });
```

---

### 4. Settings Patterns

**Git Settings:**
- autoRefresh: boolean
- refreshInterval: number
- showBranchInHeader: boolean

**Calendar Settings:**
- timeFormat: '12h' | '24h'
- showSeconds: boolean
- reminderLeadTime: number
- notificationsEnabled: boolean

**Insight:** Settings are simple key-value pairs with types. A generic settings system works.

**Action:** Settings schema in manifest is sufficient:
```json
{
  "settings": {
    "fieldName": {
      "type": "boolean | number | string | select",
      "default": value,
      "label": "Human readable label",
      "options": ["a", "b"] // for select type
    }
  }
}
```

---

## Framework Refinements

### Refinement 1: Typed Extension Context

Instead of generic context, provide typed helpers:

```typescript
// Before (generic)
const result = await ctx.shell.exec('git status');

// After (typed helpers encouraged)
import { gitStatus } from '../lib/git-commands';
const result = await gitStatus(ctx);
```

Extensions should build their own typed abstractions on top of the generic context.

---

### Refinement 2: Extension Lifecycle Clarity

Clarify when lifecycle hooks fire:

```
App Start
  ↓
For each enabled extension:
  ↓
  onAppStart()     ← Extension can initialize state
  ↓
  Load components  ← Components render
  ↓
  Start timers     ← Polling begins
  
During runtime:
  onConversationChange() ← When user switches
  onMessageReceived()    ← When message arrives
  onSettingsChange()     ← When settings modified
  
App Stop:
  ↓
  Stop timers      ← Cleanup
  ↓
  onAppStop()      ← Extension cleanup
```

---

### Refinement 3: Error Boundaries

Extensions should not crash the main app:

```svelte
<!-- In slot renderer -->
<ExtensionErrorBoundary extension={ext}>
  <svelte:component this={ext.component} />
</ExtensionErrorBoundary>
```

If extension throws, show error UI in slot instead of crashing.

---

### Refinement 4: Shared UI Components

Both extensions need common UI patterns:

| Component | Usage |
|-----------|-------|
| List with actions | File list, Event list |
| Collapsible section | Changes/Staged, Today/Week |
| Status badge | Branch, Time |
| Form with validation | Commit msg, Event form |
| Confirmation dialog | Delete branch, Delete event |

**Action:** Provide `@/extensions/ui` library:
```typescript
import { 
  ActionList, 
  CollapsibleSection, 
  StatusBadge,
  ConfirmDialog 
} from '@/extensions/ui';
```

---

## API Surface Analysis

### Minimal Viable API (Phase 1)

**Frontend:**
```typescript
interface ExtensionContext {
  manifest: ExtensionManifest;
  api: {
    fetch: (path: string, init?: RequestInit) => Promise<Response>;
  };
  ui: {
    showToast: (msg: string, type: ToastType) => void;
  };
}
```

**Backend:**
```typescript
interface ExtensionServerContext {
  shell: {
    exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>;
  };
  json: (data: any) => Response;
  error: (status: number, msg: string) => Response;
}
```

### Full API (Phase 4)

**Frontend additions:**
```typescript
interface ExtensionContext {
  // ... minimal +
  stores: {
    conversations: Readable<Conversation[]>;
    currentConversation: Readable<Conversation | null>;
  };
  settings: Writable<ExtensionSettings>;
  ui: {
    showModal: (component, props) => void;
    showConfirm: (msg: string) => Promise<boolean>;
  };
  onDestroy: (fn: () => void) => void;
}
```

**Backend additions:**
```typescript
interface ExtensionServerContext {
  // ... minimal +
  db: {
    query: <T>(sql: string, params?: any[]) => Promise<T[]>;
    run: (sql: string, params?: any[]) => Promise<void>;
  };
  fs: {
    read: (path: string) => Promise<string>;
    exists: (path: string) => Promise<boolean>;
  };
  notify: (title: string, body: string) => Promise<void>;
  hasPermission: (perm: string) => boolean;
}
```

---

## Dependency Graph

```
                    ┌─────────────────┐
                    │  App Bootstrap  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ExtensionManager │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│  Extension A    │ │  Extension B    │ │  Extension N    │
│  (Git)          │ │  (Calendar)     │ │  (Future)       │
└────────┬────────┘ └────────┬────────┘ └─────────────────┘
         │                   │
         │    ┌──────────────┤
         │    │              │
┌────────▼────▼────┐ ┌───────▼────────┐
│  Shared UI Lib   │ │  Shared Utils  │
└──────────────────┘ └────────────────┘
```

---

## Open Design Questions (To Resolve During Implementation)

### Q1: How should extensions declare dependencies on each other?
**Context:** Future extension might depend on Git extension data.
**Options:**
- No cross-extension dependencies (simpler)
- Explicit dependency declaration in manifest
- Shared state bus for cross-extension communication

**Recommendation:** No dependencies for v1. Revisit if needed.

---

### Q2: How to handle conflicting shortcuts?
**Context:** Both extensions might want Cmd+G.
**Options:**
- First-registered wins
- Manifest priority field
- User-configurable shortcuts

**Recommendation:** Extensions shouldn't register global shortcuts in v1. Use buttons.

---

### Q3: Should extensions be able to add context menu items?
**Context:** Right-click on message → "Track time for this task"
**Current:** Not planned for v1.
**Future:** Add `contextMenus` to manifest schema.

---

### Q4: Mobile/responsive considerations?
**Context:** Sidebar panels don't work well on mobile.
**Options:**
- Extensions must handle responsiveness
- Framework provides responsive slot alternatives
- Different component per breakpoint

**Recommendation:** Desktop-first for v1. Revisit for mobile later.

---

## Updated Timeline with Insights

Original estimate: 16-20 days

Revised estimate with refinements:
- Phase 1: 4-5 days (unchanged)
- Phase 2: 5-6 days (+1 for shared UI components)
- Phase 3: 5-6 days (unchanged)
- Phase 4: 3-4 days (unchanged)

**New total: 17-21 days**

---

## Recommendation: Start Order

1. **Framework basics** (context, manager, slots)
2. **Git status widget** (proves header slot, shell exec)
3. **Git panel** (proves sidebar slot, more complex UI)
4. **Settings system** (needed by both)
5. **Calendar widget** (proves coexistence in header)
6. **Calendar panel** (proves DB access, notifications)
7. **Polish & docs**

This order maximizes learning per phase and delivers visible value early.
