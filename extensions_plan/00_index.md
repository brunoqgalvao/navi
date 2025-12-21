# Extensions Plan Index

## Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [Git Extension PRD](./01_git_extension_prd.md) | Product requirements for Git integration |
| 02 | [Google Calendar Extension PRD](./02_calendar_extension_prd.md) | Google Calendar integration (read-only) |
| 03 | [Extension Framework PRD](./03_extension_framework_prd.md) | Framework architecture and APIs |
| 04 | [Implementation Plan](./04_implementation_plan.md) | Phased development approach |
| 05 | [Iteration Notes](./05_iteration_notes.md) | Cross-reference analysis and refinements |

## Quick Summary

### What We're Building
A lightweight extension framework that enables modular features to be developed independently while sharing core app infrastructure.

### First Extensions
1. **Git** - Repository status, changes, commits, branches
2. **Google Calendar** - OAuth integration, today's events, meeting notifications

### Key Architecture Decisions
- Build-time extension bundling (not runtime loading)
- Svelte-only components (not framework agnostic)
- Shared context model (not sandboxed)
- Extensions can execute shell commands and access database

### Timeline
- **Framework MVP:** 7-10 days
- **Git Extension:** 8-11 days
- **Calendar Extension:** 10-13 days
- **Total with iteration:** 17-21 days

### Next Steps
1. Review documents
2. Decide priorities (Git vs Calendar first?)
3. Start Phase 1: Minimal Framework + Git Status Widget

## Open Questions for Discussion

1. Should we build Git or Calendar first?
2. Any other extensions to consider? (Kanban, Notes, etc.)
3. Do we need external calendar sync (Google Calendar) in v1?
4. Should AI-generated commit messages be a feature?
