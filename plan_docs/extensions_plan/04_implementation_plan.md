# Implementation Plan

## Overview

This document outlines the phased implementation approach for the extension framework and initial extensions. The strategy is to build the framework incrementally, validating each phase with a real extension.

---

## Implementation Strategy

**Approach: Framework + Extension Co-development**

Rather than building the entire framework first, we'll:
1. Build minimal framework
2. Implement Git extension (simplest, high value)
3. Iterate framework based on Git extension needs
4. Build Calendar extension
5. Iterate framework again
6. Finalize framework APIs

This ensures the framework solves real problems rather than imagined ones.

---

## Phase 1: Minimal Framework + Git Status Widget

**Duration: 4-5 days**

### Goals
- Prove the extension concept works
- Get something visible and useful quickly
- Establish patterns for extension development

### Tasks

#### Day 1: Extension Infrastructure
```
□ Create /extensions directory structure
□ Define manifest.json schema (TypeScript types)
□ Create ExtensionManager class (discovery only)
□ Add extension loading to app startup
□ Create extension context provider (Svelte context)
```

**Files to create:**
- `claude-code-ui/src/lib/extensions/types.ts`
- `claude-code-ui/src/lib/extensions/manager.ts`
- `claude-code-ui/src/lib/extensions/context.ts`
- `claude-code-ui/extensions/` (directory)

#### Day 2: Backend Shell Execution
```
□ Add shell execution utility to server
□ Create extension router factory
□ Implement basic permission checking
□ Add /api/ext/* route prefix handling
```

**Files to modify/create:**
- `claude-code-ui/server/index.ts` (add extension routes)
- `claude-code-ui/server/extensions/shell.ts`
- `claude-code-ui/server/extensions/router.ts`

#### Day 3: Git Extension - Backend
```
□ Create git extension manifest
□ Implement git status command wrapper
□ Parse git status output
□ Create GET /api/ext/git/status endpoint
□ Test endpoint manually
```

**Files to create:**
- `claude-code-ui/extensions/git/manifest.json`
- `claude-code-ui/extensions/git/api/routes.ts`
- `claude-code-ui/extensions/git/lib/parser.ts`

#### Day 4: Git Extension - Frontend Widget
```
□ Create GitStatus widget component
□ Add header slot rendering in main App
□ Wire up status polling
□ Style the widget
```

**Files to create:**
- `claude-code-ui/extensions/git/components/GitStatusWidget.svelte`
- `claude-code-ui/src/lib/extensions/slots.ts`

**Modify:**
- `claude-code-ui/src/App.svelte` (add slot rendering)

#### Day 5: Polish & Iteration
```
□ Error handling for non-git directories
□ Loading states
□ Refresh on focus
□ Fix issues found during testing
□ Document what we learned
```

### Deliverables
- Working extension framework (minimal)
- Git status widget showing branch + file counts
- Documented extension structure

---

## Phase 2: Git Extension Full Panel

**Duration: 4-5 days**

### Goals
- Complete Git P0 features (status, changes, commit)
- Validate sidebar panel slot
- Add extension settings support

### Tasks

#### Day 6-7: Sidebar Panel Infrastructure
```
□ Add sidebar-right slot to App layout
□ Create ExtensionPanel wrapper component
□ Implement panel toggle (show/hide)
□ Add panel to extension manifest schema
```

**Files to create/modify:**
- `claude-code-ui/src/lib/extensions/Panel.svelte`
- Update `App.svelte` layout

#### Day 7-8: Git Changes View
```
□ Implement git diff parsing
□ Create FileChanges component
□ Create DiffViewer component  
□ Add staging/unstaging API endpoints
□ Wire up stage/unstage actions
```

**Files to create:**
- `claude-code-ui/extensions/git/components/GitPanel.svelte`
- `claude-code-ui/extensions/git/components/FileChanges.svelte`
- `claude-code-ui/extensions/git/components/DiffViewer.svelte`

#### Day 9: Commit Interface
```
□ Create commit form component
□ Add commit API endpoint
□ Implement commit message validation
□ Add success/error feedback
□ Test full commit flow
```

**Files to create:**
- `claude-code-ui/extensions/git/components/CommitForm.svelte`

#### Day 10: Extension Settings
```
□ Add settings schema to manifest
□ Create settings storage (per-extension)
□ Build settings UI component
□ Add settings to Git extension (auto-refresh interval)
```

**Files to create:**
- `claude-code-ui/src/lib/extensions/Settings.svelte`
- Database: add `extension_settings` table

### Deliverables
- Git panel with file changes and commit
- Extension settings system
- Refined panel slot system

---

## Phase 3: Calendar Extension + Framework Refinement

**Duration: 5-6 days**

### Goals
- Build Calendar extension P0/P1
- Validate database access from extensions
- Validate notifications from extensions
- Refine extension APIs based on second use case

### Tasks

#### Day 11: Calendar Database Schema
```
□ Design calendar_events table
□ Design time_sessions table
□ Add database migration
□ Create database access wrapper for extensions
```

#### Day 12-13: Calendar Backend
```
□ Create calendar extension manifest
□ Implement CRUD endpoints for events
□ Implement natural language date parsing
□ Add reminder checking background job
```

**Files to create:**
- `claude-code-ui/extensions/calendar/manifest.json`
- `claude-code-ui/extensions/calendar/api/routes.ts`
- `claude-code-ui/extensions/calendar/lib/date-parser.ts`

#### Day 14: Calendar Frontend - Widget & Today View
```
□ Create time widget for header
□ Create Today view panel
□ Implement quick add modal
□ Add event list component
```

**Files to create:**
- `claude-code-ui/extensions/calendar/components/TimeWidget.svelte`
- `claude-code-ui/extensions/calendar/components/TodayPanel.svelte`
- `claude-code-ui/extensions/calendar/components/QuickAdd.svelte`

#### Day 15-16: Notifications & Polish
```
□ Implement notification permission request
□ Add notification sending to extensions API
□ Background reminder checking
□ Time session tracking (start/stop)
□ Polish and bug fixes
```

### Deliverables
- Working Calendar extension (time, events, reminders)
- Database access pattern for extensions
- Notification system for extensions

---

## Phase 4: Framework Finalization

**Duration: 3-4 days**

### Goals
- Stabilize extension APIs
- Add developer tooling
- Documentation

### Tasks

#### Day 17-18: Developer Experience
```
□ Create extension template generator CLI
□ Add extension development documentation
□ Implement extension hot reload (if feasible)
□ Create extension testing utilities
```

#### Day 19-20: Polish & Documentation
```
□ API cleanup and consistency pass
□ Error handling improvements
□ Performance review
□ Write extension development guide
□ Create example extension template
```

### Deliverables
- Extension template generator
- Development documentation
- Stable v1 APIs

---

## Technical Decisions Log

### Decision 1: Build-time Extension Loading
**Context:** Need to decide how extensions are loaded
**Decision:** Build-time bundling with Vite
**Rationale:** 
- Simpler implementation
- Better security (no runtime code injection)
- Better performance (no dynamic imports)
- Extensions are first-party for now

**Trade-off:** Need to rebuild app when adding extensions

### Decision 2: Shared Svelte Context
**Context:** How extensions access app state
**Decision:** Svelte context with getExtensionContext()
**Rationale:**
- Natural Svelte pattern
- Good reactivity support
- Simple implementation

**Trade-off:** Extensions must be Svelte components

### Decision 3: Simple Permission Model
**Context:** How to control extension capabilities
**Decision:** Manifest-declared permissions, checked at runtime
**Rationale:**
- Explicit capability declaration
- Simple enforcement
- Good enough for first-party extensions

**Trade-off:** Not suitable for untrusted extensions

### Decision 4: Extension-prefixed API Routes
**Context:** How extension backends register routes
**Decision:** All extension routes under /api/ext/{extension-id}/
**Rationale:**
- Clear namespace separation
- Easy to proxy/route
- Avoids conflicts

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Framework over-engineering | Co-develop with real extensions |
| Performance impact | Lazy load extension components |
| Extension conflicts | Clear slot ownership rules |
| Breaking changes | Lock APIs after Phase 4 |
| Scope creep | Strict P0/P1/P2 prioritization |

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Git status widget shows in header
- [ ] Status updates automatically
- [ ] Works in git repos, graceful in non-git

### Phase 2 Complete When:
- [ ] Can view file changes
- [ ] Can stage/unstage files
- [ ] Can create commits
- [ ] Settings persist

### Phase 3 Complete When:
- [ ] Calendar shows time in header
- [ ] Can add events/reminders
- [ ] Reminders trigger notifications
- [ ] Today view shows upcoming

### Phase 4 Complete When:
- [ ] Can create new extension from template
- [ ] Documentation covers all APIs
- [ ] Two extensions work without issues

---

## Resource Estimates

| Phase | Days | Complexity |
|-------|------|------------|
| Phase 1 | 4-5 | Medium |
| Phase 2 | 4-5 | Medium |
| Phase 3 | 5-6 | Medium-High |
| Phase 4 | 3-4 | Low-Medium |
| **Total** | **16-20** | - |

---

## Next Steps

1. Review this plan
2. Clarify any open questions
3. Start Phase 1, Day 1 tasks
4. Daily check-ins on progress
