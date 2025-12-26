# Git Extension - Implementation Status

## Overview
The Git extension has been implemented as a **lightweight feature module** rather than a full extension framework. This follows the "build features, extract patterns later" approach recommended during planning discussions.

## Architecture Decision

### What We Built
Instead of a full extension framework with manifests, permissions, and runtime loading, we implemented:

1. **Feature folder structure** - Clean code organization without framework overhead
2. **Server routes** - Git API endpoints in `server/routes/git.ts`
3. **Frontend components** - Svelte components in `src/lib/features/git/`
4. **Direct integration** - Imported directly into App.svelte

### Why This Approach
- No third-party extensions yet = no need for sandboxing
- First-party code = trust yourself
- Simpler = faster to ship
- Can extract patterns later when we have 3+ features

---

## File Structure

```
packages/navi-app/
├── server/
│   └── routes/
│       └── git.ts                    # All git API endpoints
│
└── src/lib/features/git/
    ├── index.ts                      # Barrel exports
    ├── types.ts                      # TypeScript interfaces
    ├── api.ts                        # Frontend API wrappers
    └── components/
        ├── GitPanel.svelte           # Main panel component
        ├── GitDiffViewer.svelte      # Diff display with diff2html
        ├── GitCommitModal.svelte     # Full-screen commit interface
        ├── GitChangesPanel.svelte    # File changes list (optional)
        └── GitHistoryPanel.svelte    # Commit history list (optional)
```

---

## API Endpoints

All endpoints are prefixed with `/api/git/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Current branch, staged/modified/untracked files, ahead/behind |
| `/log` | GET | Commit history (default 50 commits) |
| `/branches` | GET | Local and remote branches |
| `/diff` | GET | File diff (staged or unstaged) |
| `/diff-commit` | GET | Show diff for a specific commit |
| `/checkout` | POST | Switch branches |
| `/stage` | POST | Stage specific files |
| `/unstage` | POST | Unstage specific files |
| `/stage-all` | POST | Stage all changes (`git add -A`) |
| `/commit` | POST | Create a commit with message |
| `/generate-commit-message` | POST | AI-generated commit message |

### Example API Usage

```typescript
// Frontend (src/lib/features/git/api.ts)
import * as gitApi from "./api";

const status = await gitApi.getStatus("/path/to/repo");
const commits = await gitApi.getLog("/path/to/repo", 50);
await gitApi.stageFiles("/path/to/repo", ["file1.ts", "file2.ts"]);
await gitApi.commit("/path/to/repo", "feat: add new feature");

// AI-generated commit message
const message = await gitApi.generateCommitMessage("/path/to/repo");
```

---

## UI Components

### GitPanel.svelte
Main container component with:
- Branch selector dropdown
- Ahead/behind indicators
- Refresh button
- Tabs: Changes | History
- Bottom action bar (Stage All, Commit buttons)

### GitDiffViewer.svelte
Displays git diffs using `diff2html` library:
- Line-by-line diff view
- Syntax highlighting
- Sticky headers for commit info

### GitCommitModal.svelte
Full-screen modal for committing:
- Large textarea for commit message
- "Generate with AI" button
- List of staged files
- Keyboard shortcuts (Cmd+Enter to commit, Escape to close)

---

## AI Commit Message Generation

The `/api/git/generate-commit-message` endpoint:

1. Gets staged diff (`git diff --cached`)
2. Truncates if over 8000 characters
3. Calls `/api/ephemeral` (internal LLM endpoint)
4. Returns conventional commit message

### Prompt Used
```
Analyze this git diff and generate a concise, conventional commit message.

Rules:
- Use conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore
- Keep the first line under 72 characters
- Be specific about what changed
- Only respond with the commit message, nothing else
```

---

## Integration Points

### App.svelte
```svelte
import { GitPanel } from "./lib/features/git";

<!-- In right panel tabs -->
<button onclick={() => rightPanelMode = 'git'}>Git</button>

<!-- Panel content -->
{#if rightPanelMode === "git" && currentProject}
  <GitPanel rootPath={currentProject.path} />
{/if}
```

### Keyboard Shortcut
- `Cmd+G` - Toggle Git panel

---

## Features Implemented

### P0 (Complete)
- [x] Repository status (branch, ahead/behind)
- [x] File changes view (staged, modified, untracked)
- [x] Stage/unstage individual files
- [x] Stage all changes
- [x] Commit interface with message input
- [x] AI-generated commit messages

### P1 (Complete)
- [x] Branch selector with checkout
- [x] Commit history view
- [x] View commit diffs
- [x] View file diffs

### P2 (Not Implemented)
- [ ] Stash management
- [ ] Push/pull operations
- [ ] Branch creation/deletion
- [ ] Merge conflict resolution

---

## Technical Notes

### Auto-refresh
- Status polls every 10 seconds
- Manual refresh button available

### Diff Display
- Uses `diff2html` library
- Line-by-line output format
- Custom CSS for consistent styling

### Error Handling
- API errors displayed in UI
- Console logging for debugging
- Graceful fallbacks for non-git directories

---

## Future Improvements

1. **Push/Pull buttons** - Add remote operations
2. **Stash management** - List, create, apply stashes
3. **Branch creation** - Create/delete branches from UI
4. **Better diff navigation** - File list in multi-file diffs
5. **Blame view** - Show line-by-line blame
6. **Search in history** - Filter commits by message/author

---

## Learnings for Future Features

When building Calendar, Maps, or other features:

1. Create `src/lib/features/{name}/` folder
2. Add types, api wrapper, components
3. Add server routes in `server/routes/{name}.ts`
4. Import and integrate in App.svelte
5. Only extract into framework when patterns emerge across 3+ features
