# Navi

Svelte 5 · Tauri v2 · Bun

## Commands

```actions
- name: "Dev"
  command: "bun run dev:app"
- name: "Type Check"
  command: "bun run --cwd packages/navi-app check"
- name: "Build"
  command: "bun run --cwd packages/navi-app build"
```

## Status

```widget:status
services:
  - name: "Frontend"
    url: http://localhost:1420
  - name: "API"
    url: http://localhost:3001/api/projects
  - name: "PTY"
    url: http://localhost:3002
```

## Recent

```widget:git-log
limit: 5
```
