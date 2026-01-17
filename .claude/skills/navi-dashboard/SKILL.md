---
name: navi-dashboard
description: Create and customize Navi project dashboards. Use when the user asks to create a dashboard, add dashboard widgets, customize their project landing page, or asks about the dashboard.md file format.
tools: Read, Write, Edit
model: sonnet
---

# Navi Dashboard Skill

Create rich, interactive project dashboards using the `.claude/dashboard.md` file format.

## Overview

Navi dashboards are markdown files that render as interactive landing pages when a project is opened. They support:

- **Markdown content** - Standard markdown for text, tables, headers
- **Action buttons** - Clickable commands that run in the terminal
- **Widgets** - Interactive components (git log, service status, previews, files)

## File Location

```
.claude/dashboard.md
```

The dashboard file lives in the `.claude/` directory at your project root.

## Block Types

### 1. Markdown Blocks

Standard markdown is rendered as-is. Use for:
- Project titles and descriptions
- Tables and lists
- Links and documentation

```markdown
# My Project

A cool project that does things.

| Port | Service |
|------|---------|
| 3000 | Frontend |
| 3001 | Backend |
```

### 2. Actions Block

Create clickable command buttons using the `actions` code block:

````markdown
```actions
- name: "Start Dev"
  command: "npm run dev"
- name: "Run Tests"
  command: "npm test"
- name: "Build"
  command: "npm run build"
- name: "Dangerous Action"
  command: "rm -rf dist"
  confirm: true
```
````

**Action Properties:**
| Property | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Button label (supports emoji) |
| `command` | Yes | Shell command to execute |
| `confirm` | No | Show confirmation dialog (default: false) |

### 3. Widget Blocks

Widgets are interactive components. Use `widget:type` as the code block language:

#### Git Log Widget

Show recent commits:

````markdown
```widget:git-log
limit: 7
branch: main
```
````

**Config:**
| Property | Default | Description |
|----------|---------|-------------|
| `limit` | 5 | Number of commits to show |
| `branch` | current | Branch to show commits from |

#### Preview Widget

Embed a live URL preview (great for dev servers):

````markdown
```widget:preview
url: http://localhost:3000
height: 400
```
````

**Config:**
| Property | Required | Description |
|----------|----------|-------------|
| `url` | Yes | URL to preview |
| `height` | No | Height in pixels (default: 300) |

#### File Widget

Display a file's contents:

````markdown
```widget:file
path: ./README.md
collapsible: true
```
````

**Config:**
| Property | Required | Description |
|----------|----------|-------------|
| `path` | Yes | Relative path to file |
| `collapsible` | No | Allow collapse (default: false) |

#### Status Widget

Monitor service health:

````markdown
```widget:status
services:
  - name: "Frontend"
    url: http://localhost:3000
  - name: "API"
    url: http://localhost:3001/health
  - name: "Database"
    url: http://localhost:5432
```
````

**Config:**
| Property | Required | Description |
|----------|----------|-------------|
| `services` | Yes | Array of services to check |
| `services[].name` | Yes | Display name |
| `services[].url` | Yes | Health check URL |

#### Suggestions Widget

AI-powered project suggestions (placeholder - future feature):

````markdown
```widget:suggestions
context: auto
```
````

## Complete Example Dashboard

Here's a full dashboard example for a typical web project:

````markdown
# My Awesome Project

Full-stack web application with React frontend and Node.js backend.

**Stack:** React 18 · Node.js · PostgreSQL · TypeScript

---

## Quick Actions

```actions
- name: "Dev Mode"
  command: "npm run dev"
- name: "Type Check"
  command: "npm run typecheck"
- name: "Run Tests"
  command: "npm test"
- name: "Build"
  command: "npm run build"
- name: "Deploy"
  command: "./scripts/deploy.sh"
  confirm: true
```

## Service Status

```widget:status
services:
  - name: "Frontend (Vite)"
    url: http://localhost:5173
  - name: "Backend API"
    url: http://localhost:3001/health
  - name: "PostgreSQL"
    url: http://localhost:5432
```

## Recent Commits

```widget:git-log
limit: 5
```

## Live Preview

```widget:preview
url: http://localhost:5173
height: 350
```

## Quick Reference

| Port | Service | Description |
|------|---------|-------------|
| 5173 | Frontend | Vite dev server |
| 3001 | Backend | Express API |
| 5432 | Database | PostgreSQL |

## Documentation

```widget:file
path: ./docs/ARCHITECTURE.md
collapsible: true
```

---

*Customize this dashboard at `.claude/dashboard.md`*
````

## Tips

1. **Keep it scannable** - Users should get project context at a glance
2. **Prioritize common actions** - Put frequently used commands first
3. **Use status widgets** - Helps debug "is it running?" issues
4. **Embed key docs** - Use file widgets for important documentation
5. **Use confirm for dangerous commands** - Prevents accidents

## API Reference

The dashboard system uses these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard?path=X` | GET | Get dashboard content |
| `/api/dashboard` | POST | Save dashboard content |
| `/api/dashboard/action` | POST | Execute a command |
| `/api/dashboard/status-check` | POST | Check service status |
| `/api/dashboard/file` | GET | Get file for file widget |
| `/api/dashboard/capabilities` | GET | Get project skills/commands/MCPs |

## Creating a Dashboard

When asked to create a dashboard, follow this pattern:

1. **Ask about the project** if context is unclear:
   - What's the tech stack?
   - What commands are commonly used?
   - What services need monitoring?

2. **Read existing files** for context:
   - `package.json` for scripts
   - `README.md` for project description
   - Existing `.claude/` files for skills/commands

3. **Create a tailored dashboard**:
   ```
   .claude/dashboard.md
   ```

4. **Include at minimum**:
   - Project title and description
   - Quick action buttons for common commands
   - Service status for any servers/services
   - Git log widget for recent activity
