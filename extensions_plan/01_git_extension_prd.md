# Git Extension PRD

## Overview
A Git extension for Claude Code Local UI that provides visual git repository management, allowing users to view repository status, manage branches, stage/commit changes, and navigate git history—all within the app interface.

## Problem Statement
Users working with Claude Code often need to switch between the app and terminal/git clients to manage version control. This context switching breaks flow and reduces productivity.

## Goals
- Provide at-a-glance git status for the current working directory
- Enable common git operations without leaving the app
- Visualize branch structure and commit history
- Integrate naturally with conversation context (e.g., "commit these changes")

## Non-Goals (v1)
- Full git GUI replacement (e.g., complex merge conflict resolution)
- Remote repository browsing (GitHub issues, PRs)
- Multi-repo management

---

## Features

### 1. Repository Status Panel
**Priority: P0**

Display current repository state:
- Current branch name
- Ahead/behind remote count
- Modified/staged/untracked file counts
- Clean/dirty indicator

**Technical Requirements:**
- Run `git status --porcelain -b` via backend
- Poll or watch for filesystem changes
- Display in collapsible sidebar panel

### 2. File Changes View
**Priority: P0**

Show detailed file changes:
- List of modified, staged, untracked, deleted files
- Click to view diff
- Checkbox to stage/unstage individual files
- "Stage All" / "Unstage All" actions

**Technical Requirements:**
- Run `git diff`, `git diff --staged`
- Parse diff output for display
- Run `git add <file>`, `git reset <file>` for staging

### 3. Commit Interface
**Priority: P0**

Simple commit workflow:
- Commit message input (with conventional commit hints)
- Staged files summary
- Commit button
- Option to amend last commit

**Technical Requirements:**
- Run `git commit -m "message"`
- Run `git commit --amend` when amending
- Validate non-empty message

### 4. Branch Management
**Priority: P1**

Basic branch operations:
- View all local branches
- Switch branches
- Create new branch
- Delete branch (with confirmation)

**Technical Requirements:**
- Run `git branch -a`, `git checkout`, `git branch -d`
- Handle uncommitted changes warning

### 5. Commit History
**Priority: P1**

View recent commits:
- List of last N commits (default 50)
- Show: hash (short), author, date, message
- Click to view commit details/diff
- Copy commit hash

**Technical Requirements:**
- Run `git log --oneline -n 50` or with format string
- Run `git show <hash>` for details

### 6. Stash Management
**Priority: P2**

Manage git stashes:
- List stashes
- Create stash (with optional message)
- Apply/pop stash
- Drop stash

**Technical Requirements:**
- Run `git stash list`, `git stash push`, `git stash pop`, etc.

---

## User Interface

### Placement Options
1. **Sidebar Panel** - Collapsible panel in left/right sidebar
2. **Bottom Panel** - Similar to terminal in VS Code
3. **Floating Widget** - Small status indicator that expands

**Recommendation:** Sidebar panel with status indicator in header

### Mockup Concept
```
┌─────────────────────────────────┐
│ 🔀 main ↑2 ↓0  ● 3 modified     │  <- Status bar (always visible)
├─────────────────────────────────┤
│ Changes (3)                     │
│  ├─ M src/App.svelte           │
│  ├─ M src/lib/api.ts           │
│  └─ ? new-file.ts              │
├─────────────────────────────────┤
│ Staged (0)                      │
├─────────────────────────────────┤
│ [Commit message...           ]  │
│ [        Commit              ]  │
├─────────────────────────────────┤
│ Recent Commits                  │
│  • abc123 fix: resolve bug     │
│  • def456 feat: add feature    │
└─────────────────────────────────┘
```

---

## Technical Architecture

### Backend Requirements
The extension needs to execute git commands locally. Options:

1. **Server-side execution** (Recommended for v1)
   - Add git API endpoints to existing Bun server
   - `/api/git/status`, `/api/git/diff`, `/api/git/commit`, etc.
   - Server executes commands via `Bun.spawn()` or child_process
   - Pros: Simpler, reuses existing server infrastructure
   - Cons: Requires server to have git access to working directory

2. **Claude tool delegation**
   - Ask Claude to run git commands via its Bash tool
   - Pros: No backend changes needed
   - Cons: Slow, uses API tokens, awkward UX

### Data Flow
```
UI Component → Extension API → Server Endpoint → git CLI → Response
```

### Permissions
- Read: Always allowed (status, log, diff)
- Write: Require confirmation for destructive ops (commit, branch delete, reset)

---

## Success Metrics
- Reduced context switches to external git tools
- Time saved on common git operations
- User adoption rate of git features

---

## Open Questions
1. Should we support multiple repositories (monorepo scenarios)?
2. How to handle long-running operations (large diffs, clones)?
3. Should commit messages integrate with Claude (AI-generated messages)?

---

## Timeline Estimate
- P0 features: 3-4 days
- P1 features: 2-3 days
- P2 features: 1-2 days
- Polish & testing: 2 days

**Total: ~8-11 days for full implementation**
