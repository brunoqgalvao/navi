# Launch Posts

## Twitter/X Launch Thread

**Tweet 1 (Main):**
```
🚀 Navi is now open source!

A beautiful desktop GUI for Claude Code with:
- Multi-agent coordination
- Real-time previews
- Git worktree management
- Extensible skills system

Built with Svelte 5 + Tauri + Bun

github.com/brunoqgalvao/navi

🧵 Thread on what makes it special...
```

**Tweet 2:**
```
🤖 Multi-Agent System

Navi lets you spawn specialized AI agents that work in parallel:

• Browser agents for research
• Coding agents for implementation
• Runner agents for testing

Each agent has its own context and UI. They can coordinate on complex tasks.

Watch them work together in real-time! 🎯
```

**Tweet 3:**
```
⚡ Skills System

Extend Navi with custom capabilities:

.nv/skills/
├── playwright/    # Browser automation
├── integrations/  # OAuth (Gmail, Slack, etc.)
├── stock-compare/ # Stock charts
└── navi-llm/      # Dispatch to other LLMs

Each skill is self-contained with its own SKILL.md config.

Adding a new skill? Just drop it in the folder!
```

**Tweet 4:**
```
📁 Live Previews

No more tab-switching. Preview anything right next to your chat:

• URLs → Rendered preview
• Files → Syntax highlighted
• Markdown → Formatted output
• Images → Inline display

Works for both local files and web URLs.
```

**Tweet 5:**
```
🔀 Git Integration

Navi speaks Git fluently:

• Status, commits, branches
• Worktree management (create, switch, prune)
• Visual diff viewer
• Cherry-pick workflows

Manage multiple code branches without leaving the chat.
```

**Tweet 6:**
```
🏗️ Architecture

Built for performance:

• Svelte 5 for reactive UI
• Tauri v2 for native desktop
• Bun for fast backend
• SQLite for local storage
• claude-agent-sdk for AI

No cloud dependencies. Your data stays on your machine.
```

**Tweet 7 (CTA):**
```
🙏 Help Us Grow!

We're just getting started:

⭐ Star the repo
🐛 Report issues
💡 Request features
📖 Submit PRs

github.com/brunoqgalvao/navi

Built with love by @brunogalvao

#OpenSource #AI #ClaudeAI #Svelte #Tauri #DeveloperTools
```

---

## Reddit Posts

### r/ClaudeAI
```
Title: Open sourced my Claude Code desktop GUI – Navi

I've been building Navi for a few months as a better way to work with Claude Code.
Today I'm open sourcing it!

**Features:**
- Beautiful desktop app (Svelte + Tauri)
- Multi-agent system for parallel AI tasks
- Live previews, file browser, integrated terminal
- Git integration with worktrees
- Extensible via Skills and Extensions

**Tech Stack:**
- Svelte 5 (frontend)
- Tauri v2 (desktop)
- Bun (backend runtime)
- claude-agent-sdk (AI)

GitHub: https://github.com/brunoqgalvao/navi

Happy to answer questions!
```

### r/SideProject
```
Title: Built a desktop GUI for Claude Code – just open sourced it!

Hey everyone,

I've been working on Navi, a desktop app that gives you a beautiful GUI for Claude Code.

**Why I built it:**
I love Claude Code, but wanted:
- Visual previews of what I'm building
- Easy file navigation
- Multiple AI agents working in parallel
- Everything local and fast

**Key features:**
- Multi-agent coordination (spawn specialists for coding, research, testing)
- Live preview panel (URLs, files, markdown)
- Git integration (worktrees, branches, commits)
- Extensible skills system

**Tech:** Svelte 5 + Tauri + Bun

Just launched as open source (MIT license).

Would love feedback from fellow builders!

GitHub: https://github.com/brunoqgalvao/navi
```

### r/Svelte
```
Title: Show HN: Navi – Svelte 5 desktop app for Claude Code

Hey Svelte folks!

Just open sourced Navi, a desktop GUI I built for Claude Code using:
- Svelte 5 (runes syntax)
- Tauri v2 for desktop wrapping
- Bun for the backend

**Highlights:**
- Real-time chat streaming with Claude
- Multi-agent system (each agent has isolated UI state)
- Live previews alongside chat
- Git worktree management

All the Svelte components follow the new runes pattern ($state, $derived, $effect).

GitHub: https://github.com/brunoqgalvao/navi

Would love to hear what you think of the architecture!
```

### r/rust
```
Title: Using Tauri v2 for a Claude Code desktop GUI – now open source

Hi Rustaceans,

Just open sourced Navi, a desktop app for Claude Code built with Tauri v2.

**Why Tauri:**
- Tiny bundle sizes compared to Electron
- Rust backend for native performance
- Great TypeScript/Svelte interop
- Built-in updater and signing

**The app:**
- Svelte 5 frontend
- Bun-based server (spawned as sidecar)
- Multi-agent AI coordination system
- Git integration, live previews, extensible skills

GitHub: https://github.com/brunoqgalvao/navi

Check it out if you're interested in Tauri v2 + Svelte apps!
```

---

## Hacker News

**Title:** Show HN: Navi – Open source desktop GUI for Claude Code

**Post:**
```
Navi – github.com/brunoqgalvao/navi

A beautiful desktop GUI for Claude Code with real-time preview,
multi-agent coordination, and Git worktree management.

Built with Svelte 5 + Tauri + Bun.
```

**Comment (post immediately):**
```
Hey HN! I built Navi because I wanted a better way to work with Claude Code.

Key features:
- Rich chat interface with code highlighting and live previews
- Multi-agent system – spawn specialized AI agents for parallel tasks
- Git integration with worktree management
- Extensible via Skills (custom capabilities) and Extensions (sidebar panels)
- Local-first: SQLite database, no data sent anywhere except Anthropic API

Tech stack: Svelte 5 + Tauri + Bun + claude-agent-sdk

Would love feedback on the architecture and any feature requests!
```

---

## Dev.to / Hashnode Article

```
---
title: "Building Navi: An Open Source Desktop GUI for Claude Code"
published: true
date: 2025-01-13
tags: svelte, tauri, claude, opensource
canonical_url: https://github.com/brunoqgalvao/navi
---

# Building Navi: An Open Source Desktop GUI for Claude Code

## Why I Built Navi

I love Claude Code. But I kept finding myself wanting more:

- **Visual feedback** – See what I'm building, not just text output
- **Better context** – Easy file navigation and preview
- **Parallel work** – Multiple AI agents working on different tasks
- **Local-first** – My data on my machine

So I built Navi.

![Navi Demo](https://github.com/brunoqgalvao/navi/raw/main/docs/demo-screenshot.png)

## What is Navi?

Navi is a beautiful desktop application that provides a rich GUI for Claude Code. It combines:

- **Real-time chat** with Claude
- **Live previews** of URLs, files, and markdown
- **Multi-agent coordination** for parallel AI tasks
- **Git integration** with worktree management
- **Extensible system** via Skills and Extensions

## Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Svelte 5 + Vite |
| Desktop | Tauri v2 |
| Backend | Bun + custom HTTP server |
| Database | SQLite (sql.js) |
| AI | @anthropic-ai/claude-agent-sdk |

### Why Svelte 5?

Svelte 5's new runes syntax ($state, $derived, $effect) makes reactive UI so much cleaner:

```svelte
<script>
let messages = $state([]);
let filtered = $derived(messages.filter(m => m.visible));
</script>

{#each filtered as msg}
  <Message {msg} />
{/each}
```

No more complex stores. Just simple, readable reactivity.

### Why Tauri v2?

Tauri gives us:
- Tiny bundle sizes (~10MB vs ~200MB for Electron)
- Native performance via Rust
- Built-in updater and code signing
- Great TypeScript support

The backend server runs as a sidecar process, spawned by Tauri:

```rust
// src-tauri/src/lib.rs
tauri::Builder::default()
    .setup(|app| {
        // Spawn navi-server as sidecar
        tauri_plugin_shell::init()
    })
```

## Multi-Agent System

One of Navi's most powerful features is the ability to spawn specialized AI agents.

### Agent Types

| Type | Purpose | Native UI |
|------|---------|-----------|
| `browser` | Web research, URL analysis | ✅ |
| `coding` | Code implementation, file editing | ✅ |
| `runner` | Command execution, tests, builds | ✅ |
| `research` | Deep analysis, findings synthesis | ❌ |
| `planning` | Task breakdown, architecture | ❌ |

### How It Works

Agents are spawned via the `spawn_agent` MCP tool. Each agent gets:
- Isolated session state
- Its own chat thread
- Specialized tools and permissions
- Visual feedback in the UI

```typescript
spawn_agent({
  title: "Research Chart.js docs",
  role: "researcher",
  task: "Find multi-dataset examples",
  agent_type: "browser"
})
```

### Visual Hierarchy

The UI shows the agent hierarchy in a tree structure:

```
Root Session (You)
├── 🌐 Frontend (browser agent)
├── 🔧 Backend (coding agent)
└── ▶️ Tests (runner agent)
```

You can see what each agent is working on, their status, and their output.

## Skills System

Skills extend Navi's capabilities. Each skill is a self-contained folder:

```
.claude/skills/
├── playwright/       # Browser automation
│   ├── SKILL.md      # Metadata + documentation
│   ├── package.json  # Dependencies
│   └── index.ts      # Implementation
├── integrations/     # OAuth (Gmail, Slack, etc.)
└── stock-compare/    # Stock price charts
```

### Creating a Skill

1. Create folder: `.claude/skills/my-skill/`
2. Add `SKILL.md` with frontmatter
3. Implement functionality
4. Claude auto-discovers it

Example SKILL.md:

```yaml
---
name: my-skill
description: When to use this skill
tools: Read, Write, Bash
model: sonnet
---

# My Skill

Documentation here...
```

## Live Previews

No more tab-switching. Navi shows previews right next to your chat.

Supported preview types:
- **URLs** → Rendered web pages
- **Files** → Syntax highlighted code
- **Markdown** → Formatted output
- **Images** → Inline display

## Git Integration

Navi speaks Git fluently:

- Status, commits, branches
- Worktree management (create, switch, prune)
- Visual diff viewer
- Cherry-pick workflows

Manage multiple code branches without leaving your chat.

## Local-First Philosophy

Navi stores everything locally:

- **Database:** SQLite at `~/.claude-code-ui/data.db`
- **API keys:** In-memory only (never logged)
- **Settings:** Local `.claude/` directories
- **Tokens:** Encrypted for OAuth integrations

No data sent to external servers except:
- API requests to Anthropic (required)
- Optional cloud services you explicitly configure

## What's Next

I'm excited to see what the community builds!

**Near-term:**
- [ ] More agent types
- [ ] Enhanced skills library
- [ ] Plugin marketplace
- [ ] Windows support

**Long-term:**
- [ ] Collaborative sessions
- [ ] Cloud sync (optional)
- [ ] Mobile companion app

## How to Contribute

We welcome contributions! Check out [CONTRIBUTING.md](https://github.com/brunoqgalvao/navi/blob/main/CONTRIBUTING.md) for guidelines.

**Quick start:**

```bash
git clone https://github.com/brunoqgalvao/navi.git
cd navi
bun install
bun run dev:all
```

## Acknowledgments

Built with amazing tools:
- [Claude Code](https://github.com/anthropics/claude-code)
- [Svelte](https://svelte.dev)
- [Tauri](https://tauri.app)
- [Bun](https://bun.sh)

---

**Made with ❤️ by Bruno Galvao**

GitHub: https://github.com/brunoqgalvao/navi
```
