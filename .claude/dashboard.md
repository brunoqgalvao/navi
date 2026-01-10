# Navi

Claude Code Local UI - A desktop app providing a rich GUI for Claude Code.

**Stack:** Svelte 5 · Tauri v2 · Bun · TypeScript

---

## Quick Actions

```actions
- name: "🚀 Dev Mode"
  command: "bun run dev:app"
- name: "🖥️ Tauri App"
  command: "bun run dev:tauri"
- name: "🔍 Type Check"
  command: "bun run --cwd packages/navi-app check"
- name: "🧪 API Tests"
  command: "bun run --cwd packages/navi-app test:api"
- name: "📦 Build"
  command: "bun run --cwd packages/navi-app build"
```

## Recent Commits

```widget:git-log
limit: 7
```

## Preview

```widget:preview
url: http://localhost:1420
height: 350
```

## Service Status

```widget:status
services:
  - name: "Frontend (Vite)"
    url: http://localhost:1420
  - name: "Backend API"
    url: http://localhost:3001/api/projects
  - name: "PTY Server"
    url: http://localhost:3002
```

## Quick Reference

| Port | Service |
|------|---------|
| 1420 | Frontend dev server |
| 3001 | Backend API |
| 3002 | PTY terminal server |
| 3011 | Tauri app backend |

## Documentation

```widget:file
path: ./CLAUDE.md
collapsible: true
```

---

*Edit at `.claude/dashboard.md` or ask Claude to customize*
