# Project Dashboard - Implementation Plan

> Turn each project's landing page into a vibe-coded, markdown-driven control center.

## Overview

A `.claude/dashboard.md` file in a project root becomes the default landing page for that project in Navi. Standard markdown renders normally, special code blocks become interactive widgets.

---

## File Format

**Location:** `.claude/dashboard.md` (project root)

```markdown
# Project Name

Standard markdown content here - renders as-is.

## Quick Actions
```actions
- name: "🚀 Deploy"
  command: "bun run deploy"
- name: "🧪 Run Tests"
  command: "bun test"
```

## Status
```widget:deploy-status
provider: vercel
project_id: prj_xxx
```

## Suggestions
```widget:suggestions
context: auto
```

## Git Activity
```widget:git-log
limit: 5
```
```

---

## Widget Types (Initial Set)

### 1. `actions` - Quick Action Buttons
```yaml
- name: "Button Label"
  command: "shell command to run"
  confirm: false  # optional: show confirmation dialog
```
Renders as a row of buttons. Clicking executes command via backend.

### 2. `widget:git-log` - Recent Commits
```yaml
limit: 5
branch: main  # optional
```
Shows recent commits with author, message, time.

### 3. `widget:suggestions` - AI-Powered Next Steps
```yaml
context: auto  # reads codebase
prompt: "What should I work on next?"  # optional custom prompt
```
Claude analyzes project and suggests actionable next steps.

### 4. `widget:preview` - Embedded Preview
```yaml
url: http://localhost:3000
height: 400
```
Embeds an iframe preview of a running app.

### 5. `widget:metrics` - Custom Metrics Display
```yaml
source: api  # or 'file'
url: https://api.example.com/metrics
# or
file: ./metrics.json
display: grid  # or 'list'
```

### 6. `widget:file` - Render a File Inline
```yaml
path: ./TODO.md
collapsible: true
```

### 7. `widget:status` - Service Status Badges
```yaml
services:
  - name: "API"
    url: https://api.myapp.com/health
  - name: "Database"
    url: https://db.myapp.com/ping
```

---

## Architecture

### New Files

```
packages/navi-app/
├── src/lib/features/dashboard/
│   ├── index.ts                    # Public exports
│   ├── types.ts                    # Dashboard, Widget types
│   ├── parser.ts                   # Markdown → Dashboard AST
│   ├── api.ts                      # Backend API client
│   └── components/
│       ├── DashboardView.svelte    # Main container
│       ├── DashboardRenderer.svelte # Renders parsed markdown
│       ├── WidgetRenderer.svelte   # Routes to widget components
│       └── widgets/
│           ├── ActionsWidget.svelte
│           ├── GitLogWidget.svelte
│           ├── SuggestionsWidget.svelte
│           ├── PreviewWidget.svelte
│           ├── MetricsWidget.svelte
│           ├── FileWidget.svelte
│           └── StatusWidget.svelte
│
├── server/routes/
│   └── dashboard.ts                # Dashboard API routes
```

### Backend Routes

```
GET  /api/projects/:id/dashboard       # Get parsed dashboard or null
POST /api/projects/:id/dashboard       # Save dashboard.md content
POST /api/projects/:id/dashboard/action # Execute an action command

GET  /api/dashboard/widgets/git-log    # Widget-specific data endpoints
GET  /api/dashboard/widgets/suggestions
POST /api/dashboard/widgets/metrics
GET  /api/dashboard/widgets/status
```

### Types

```typescript
interface Dashboard {
  raw: string;                    // Original markdown
  blocks: DashboardBlock[];       // Parsed blocks
}

type DashboardBlock =
  | { type: 'markdown'; content: string }
  | { type: 'actions'; actions: Action[] }
  | { type: 'widget'; widget: WidgetType; config: Record<string, unknown> };

interface Action {
  name: string;
  command: string;
  confirm?: boolean;
}

type WidgetType =
  | 'git-log'
  | 'suggestions'
  | 'preview'
  | 'metrics'
  | 'file'
  | 'status';
```

---

## Implementation Steps

### Phase 1: Core Infrastructure
1. [ ] Create `features/dashboard/` directory structure
2. [ ] Implement markdown parser that extracts special code blocks
3. [ ] Create `DashboardView.svelte` component
4. [ ] Add backend route to read `.claude/dashboard.md` from project path
5. [ ] Modify project landing page to check for dashboard and render it

### Phase 2: Basic Widgets
6. [ ] Implement `ActionsWidget` - buttons that execute commands
7. [ ] Implement `GitLogWidget` - show recent commits
8. [ ] Implement `FileWidget` - render inline file content
9. [ ] Add widget routing in `WidgetRenderer.svelte`

### Phase 3: Advanced Widgets
10. [ ] Implement `PreviewWidget` - embedded iframe
11. [ ] Implement `StatusWidget` - service health checks
12. [ ] Implement `MetricsWidget` - fetch and display metrics
13. [ ] Implement `SuggestionsWidget` - AI-powered suggestions

### Phase 4: Editing & Vibe-Coding
14. [ ] Add "Edit Dashboard" button that opens file in editor
15. [ ] Add "Create Dashboard" prompt for projects without one
16. [ ] Ensure Claude can edit `.claude/dashboard.md` via normal Edit tool
17. [ ] Create dashboard skill at `.claude/skills/dashboard/SKILL.md`
18. [ ] Add dashboard format knowledge to Navi agent (`.claude/agents/navi.md`)

### Phase 5: Polish
18. [ ] Error handling for malformed dashboard files
19. [ ] Loading states for async widgets
20. [ ] Responsive layout for widget grid
21. [ ] Dark mode styling for all widgets
22. [ ] Documentation and examples

---

## UX Flow

1. **User opens project**
   - Backend checks if `.claude/dashboard.md` exists
   - If yes → Parse and return dashboard data
   - If no → Return null, show current default view

2. **Dashboard renders**
   - Markdown blocks render as styled HTML
   - Widget blocks render as interactive components
   - Chat input remains visible at bottom

3. **User clicks action button**
   - POST to `/api/projects/:id/dashboard/action`
   - Backend executes command in project directory
   - Show output in terminal or toast

4. **User wants to customize**
   - Click "Edit Dashboard" → Opens `.claude/dashboard.md`
   - Or ask Claude: "Add a deploy button to my dashboard"
   - Claude edits the file, dashboard re-renders

5. **Fallback**
   - Invalid markdown? Show error + "Edit to fix"
   - No dashboard? Show current view + "Create Dashboard"

---

## Security Considerations

- **Command execution**: Actions run in project directory with user permissions
- **External URLs**: Validate URLs in preview/metrics widgets
- **File access**: Only allow reading files within project directory
- **Rate limiting**: Suggestions widget shouldn't spam Claude API

---

## Navi Agent Dashboard Knowledge

The Navi agent (and Claude in general when working in Navi projects) needs to know how to create and edit dashboards. This should be added to:

1. **`.claude/skills/dashboard/SKILL.md`** - A skill Claude can invoke when asked to create/edit dashboards
2. **`.claude/agents/navi.md`** - The Navi agent's core knowledge

### Skill Content (Summary)

```markdown
# Dashboard Skill

Create and edit project dashboards for Navi.

## File Location
`.claude/dashboard.md` in project root

## Format
Standard markdown with special code blocks:

### Actions Block
\`\`\`actions
- name: "Button Label"
  command: "shell command"
  confirm: false
\`\`\`

### Widget Blocks
\`\`\`widget:git-log
limit: 5
\`\`\`

\`\`\`widget:suggestions
context: auto
\`\`\`

\`\`\`widget:preview
url: http://localhost:3000
height: 400
\`\`\`

\`\`\`widget:file
path: ./README.md
collapsible: true
\`\`\`

\`\`\`widget:status
services:
  - name: "API"
    url: https://api.example.com/health
\`\`\`

## Examples
[Include 2-3 complete dashboard examples for different project types]
```

### Navi Agent Addition

Add to the Navi agent's knowledge:

```markdown
## Dashboard Management

You can create and customize project dashboards by editing `.claude/dashboard.md`.

When users ask to:
- "Add a deploy button" → Edit dashboard, add actions block
- "Show my git history" → Add widget:git-log
- "Create a dashboard" → Generate full .claude/dashboard.md
- "Add a preview" → Add widget:preview with their URL

Always explain what you're adding and offer to customize further.
```

---

## Future Enhancements

- **Custom widgets**: Allow users to define widgets as Svelte components
- **Widget marketplace**: Share dashboard configurations
- **Templates**: Pre-built dashboards for common project types
- **Live reload**: Watch dashboard.md for changes
- **Drag-and-drop**: Visual dashboard editor
- **Widget state**: Persist collapsed/expanded states
