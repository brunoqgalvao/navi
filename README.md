# Navi

A beautiful GUI for Claude Code with real-time preview capabilities.

## Structure

```
packages/
├── navi-app/      # Main desktop application (Svelte + Tauri)
└── landing-page/  # Marketing website

scripts/           # Build & deploy scripts
plan_docs/         # Planning documentation
```

## Features

- Real-time conversation streaming with Claude Code
- Built-in preview panel for URLs, files, markdown, and images
- File browser with syntax highlighting
- Markdown rendering with code blocks
- Desktop app via Tauri

## Quick Start

```bash
cd packages/navi-app
bun install
bun run dev:all
```

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/build-app.sh` | Build Tauri app |
| `./scripts/deploy-landing.sh` | Deploy landing page |
| `./scripts/deploy-all.sh` | Build app + deploy landing |
| `./scripts/release.sh <version>` | Full release workflow |
| `./scripts/bump-version.sh <version>` | Bump version across packages |

## Development (navi-app)

| Command | Description |
|---------|-------------|
| `bun run dev:all` | Run frontend + backend |
| `bun run tauri:dev` | Run as desktop app |
| `bun run build` | Production build |

## Tech Stack

- **Frontend**: Svelte 5, Vite, Tailwind CSS
- **Backend**: Bun, WebSocket
- **Desktop**: Tauri v2
- **AI**: Claude Code Agent SDK
