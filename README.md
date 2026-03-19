# Navi

**Already on it.**

A local-first GUI for AI coding agents. Sessions, multi-agent orchestration, terminal, git, skills, extensions — all running on your machine through the browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/brunoqgalvao/navi?style=social)](https://github.com/brunoqgalvao/navi/stargazers)
[![Built with Svelte](https://img.shields.io/badge/Svelte-5.0-FF3E00?logo=svelte)](https://svelte.dev)

---

## Quick Start

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/brunoqgalvao/navi/main/scripts/install-cli.sh | bash

# Run
navi

# Update
navi update
```

The install script downloads a lightweight tarball (~7MB) from the latest release. If the tarball isn't available, it falls back to a sparse git clone of just the app source.

### Manual Install (no curl)

```bash
git clone --depth=1 https://github.com/brunoqgalvao/navi.git ~/.navi-repo
cd ~/.navi-repo/packages/navi-app
bun install
bun run start
```

This starts only the app stack at **http://localhost:1420**. The landing page package is not involved.

### Requirements

| Tool | Install |
|------|---------|
| [Bun](https://bun.sh) | `curl -fsSL https://bun.sh/install \| bash` |
| [Node.js](https://nodejs.org) | Required for terminal (PTY) server |
| [Claude API Key](https://console.anthropic.com) | Set in Navi's settings UI |

---

## What You Get

**Core**
- Rich chat interface with streaming, code highlighting, markdown
- Multi-agent system — spawn browser, coder, runner, researcher agents in parallel
- Integrated terminal with full PTY support
- Git — branches, diffs, commits from the UI
- File browser with syntax highlighting
- Live preview panel for URLs, files, images

**Extensibility**
- **Skills** — reusable prompts and scripts (`.claude/skills/`)
- **Agents** — AI personas for specialized tasks (`.claude/agents/`)
- **Extensions** — sidebar panels (Files, Git, Terminal, Kanban, Processes)
- **MCP Servers** — plug in any Model Context Protocol tool
- **Commands** — slash commands for quick actions

**Integrations**
- Gmail, Google Sheets, Slack, Linear, Notion, GitHub (OAuth)
- WhatsApp, Email (AgentMail)

---

## Architecture

```
packages/
  navi-app/       # Main app (Svelte 5 frontend + Bun backend)
  landing-page/   # Website
```

| Port | Service |
|------|---------|
| 1420 | Frontend (Vite dev server) |
| 3001 | Backend (Bun HTTP + WebSocket) |
| 3002 | PTY Server (Node.js) |

**Stack:** Svelte 5 + Vite + Tailwind CSS + Bun + sql.js (SQLite) + @anthropic-ai/claude-agent-sdk

Data lives in `~/.claude-code-ui/`. Your data stays on your machine.

---

## Development

App-only launcher:

```bash
cd packages/navi-app
bun install
bun run start
```

Repo-root development commands:

```bash
bun run dev:app
bun run --cwd packages/navi-app check
bun run --cwd packages/navi-app test:api
```

---

## License

MIT

---

**Made by [Bruno Galvao](https://github.com/brunoqgalvao)**
