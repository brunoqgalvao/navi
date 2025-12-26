# Extensions Plan Index

## Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [Git Extension PRD](./01_git_extension_prd.md) | Product requirements for Git integration |
| 02 | [Google Calendar Extension PRD](./02_calendar_extension_prd.md) | Google Calendar integration (read-only) |
| 03 | [Extension Framework PRD](./03_extension_framework_prd.md) | Framework architecture and APIs |
| 04 | [Implementation Plan](./04_implementation_plan.md) | Phased development approach |
| 05 | [Iteration Notes](./05_iteration_notes.md) | Cross-reference analysis and refinements |
| 06 | [Google Maps Extension PRD](./06_google_maps_extension_prd.md) | Interactive map embeds for locations/routes |
| 08 | [Git Extension Implementation](./08_git_extension_implementation.md) | **ACTUAL IMPLEMENTATION** - What was built |

## Implementation Status

### Git Extension - SHIPPED
The Git extension has been implemented as a **lightweight feature module** (not a full framework). See [08_git_extension_implementation.md](./08_git_extension_implementation.md) for full details.

**Features completed:**
- Repository status (branch, ahead/behind)
- File changes view (staged, modified, untracked)
- Stage/unstage files
- Commit interface with full-screen modal
- AI-generated commit messages (via `/api/ephemeral`)
- Branch selector with checkout
- Commit history view
- Diff viewer with syntax highlighting

**Architecture decision:** We chose to build features directly (not a framework) and extract patterns later when we have 3+ features. This follows the "Rule of Three" approach.

---

## Quick Summary

### What We're Building
A lightweight extension framework that enables modular features to be developed independently while sharing core app infrastructure.

### First Extensions
1. **Git** - Repository status, changes, commits, branches - **IMPLEMENTED**
2. **Google Calendar** - OAuth integration, today's events, meeting notifications
3. **Google Maps** - Interactive map embeds, routes, location pins

### Key Architecture Decisions
- ~~Build-time extension bundling (not runtime loading)~~
- **UPDATED:** No framework yet - just feature folders (`src/lib/features/git/`)
- Svelte-only components (not framework agnostic)
- Direct integration into App.svelte
- Server routes in `server/routes/{feature}.ts`

### Timeline (Revised)
- ~~**Framework MVP:** 7-10 days~~
- **Git Extension:** DONE
- **Calendar Extension:** TBD
- **Framework extraction:** When we have 3+ features

### Next Steps
1. ~~Review documents~~
2. ~~Decide priorities (Git vs Calendar first?)~~
3. ~~Start Phase 1: Minimal Framework + Git Status Widget~~
4. **NEW:** Build Calendar following same pattern as Git
5. **NEW:** Extract framework when patterns emerge

## Resolved Questions

1. ~~Should we build Git or Calendar first?~~ → **Git first - DONE**
2. ~~Any other extensions to consider?~~ → Calendar, Maps next
3. ~~Do we need external calendar sync (Google Calendar) in v1?~~ → TBD
4. ~~Should AI-generated commit messages be a feature?~~ → **YES - IMPLEMENTED**
5. ~~Should Claude output structured location data for better map detection?~~ → TBD
