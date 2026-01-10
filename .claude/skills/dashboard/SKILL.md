# Dashboard Skill

Create and edit project dashboards for Navi. Dashboards are markdown files that render as interactive landing pages when a project is opened.

## File Location

`.claude/dashboard.md` in the project root.

## Format

Standard GitHub-flavored markdown with special code blocks that become interactive widgets.

### Actions Block

Create buttons that execute shell commands:

```actions
- name: "🚀 Deploy"
  command: "bun run deploy"
  confirm: true
- name: "🧪 Run Tests"
  command: "bun test"
- name: "📦 Build"
  command: "bun run build"
```

**Properties:**
- `name` (required): Button label (supports emoji)
- `command` (required): Shell command to execute in project directory
- `confirm` (optional): Show confirmation dialog before running

### Git Log Widget

Show recent commits:

```widget:git-log
limit: 5
```

**Properties:**
- `limit` (optional, default 5): Number of commits to show

### Preview Widget

Embed an iframe preview:

```widget:preview
url: http://localhost:3000
height: 400
```

**Properties:**
- `url` (required): URL to embed
- `height` (optional, default 300): Height in pixels

### File Widget

Display file content inline:

```widget:file
path: ./README.md
collapsible: true
```

**Properties:**
- `path` (required): Relative path to file
- `collapsible` (optional, default false): Allow collapsing

### Status Widget

Show service health status:

```widget:status
services:
  - name: "API"
    url: https://api.example.com/health
  - name: "Database"
    url: https://db.example.com/ping
```

**Properties:**
- `services` (required): Array of services to check
  - `name`: Display name
  - `url`: Health check URL (HEAD request)

### Suggestions Widget

AI-powered suggestions placeholder:

```widget:suggestions
context: auto
```

---

## Complete Example

```markdown
# My Awesome App

A full-stack web application built with Svelte and Bun.

Quick links: [Production](https://myapp.com) | [Staging](https://staging.myapp.com) | [Docs](./docs)

## Quick Actions

```actions
- name: "🚀 Deploy to Production"
  command: "bun run deploy:prod"
  confirm: true
- name: "🧪 Run Tests"
  command: "bun test"
- name: "📦 Build"
  command: "bun run build"
- name: "🔧 Dev Server"
  command: "bun run dev"
```

## Recent Activity

```widget:git-log
limit: 5
```

## Preview

```widget:preview
url: http://localhost:5173
height: 300
```

## Service Status

```widget:status
services:
  - name: "API Server"
    url: http://localhost:3001/health
  - name: "Database"
    url: http://localhost:5432
```

## Documentation

```widget:file
path: ./docs/QUICKSTART.md
collapsible: true
```

---

*Edit this dashboard at `.claude/dashboard.md` or ask me to customize it!*
```

---

## When to Use

**Create dashboard when user says:**
- "Create a dashboard"
- "Add a dashboard to this project"
- "Set up a landing page"
- "I want quick actions for this project"

**Edit dashboard when user says:**
- "Add a deploy button"
- "Show git history on the dashboard"
- "Add a preview widget"
- "Put [feature] on my dashboard"

## Tips

1. **Keep it focused** - Dashboard should show the most important project info at a glance
2. **Use emoji** - Action buttons look better with descriptive emoji
3. **Add quick links** - Put important URLs (prod, staging, docs) at the top
4. **Test actions** - Make sure commands work before adding them
5. **Be project-specific** - Tailor the dashboard to the project type (web app, CLI, library, etc.)
