# Navi

> A beautiful desktop GUI for Claude Code with real-time preview, multi-agent coordination, and powerful developer tools.

![Navi Screenshot](Screenshot%202026-01-12%20at%2016.59.12.png)

## ✨ Features

### Core Capabilities

- **Rich Chat Interface** - Real-time streaming with Claude, code highlighting, and markdown rendering
- **Live Previews** - Preview URLs, files, markdown, and images in a dedicated panel
- **File Browser** - Navigate projects with syntax highlighting and quick access
- **Integrated Terminal** - Run commands directly within the app
- **Git Integration** - Status, commits, branches, and worktree management
- **Multi-Agent System** - Spawn specialized AI agents for parallel tasks

### Extensibility

- **Skills** - Extend Claude with custom capabilities (`.claude/skills/`)
- **Agents** - AI personas for specialized tasks (coding, research, browsing)
- **Extensions** - Sidebar panels for custom tools
- **Message Widgets** - Custom inline renderers for chat content
- **Commands** - Slash commands for quick actions

### Integrations

- **Gmail** - Read and send emails
- **Google Sheets** - Spreadsheet operations
- **Slack** - Message posting and channel management
- **Linear** - Issue tracking and project management
- **Notion** - Page and database operations
- **GitHub** - Repository and issue management

## 🚀 Quick Start

### Prerequisites

- **Bun** - Fast JavaScript runtime ([install](https://bun.sh))
- **Rust** - For desktop app builds ([install](https://rustup.rs))
- **macOS** or **Linux** (Windows support planned)

### Installation

```bash
# Clone the repository
git clone https://github.com/brunoqgalvao/navi.git
cd navi

# Install dependencies
bun install

# Set up your environment
cp .env.example .env
cp packages/navi-app/.env.example packages/navi-app/.env

# Edit .env and add your Anthropic API key
# ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Running

```bash
# Run web version (frontend + backend)
bun run dev:all

# Run as desktop app (Tauri)
bun run tauri:dev
```

Visit `http://localhost:1420` for the web version.

### Building

```bash
# Build web app
bun run --cwd packages/navi-app build

# Build desktop app
./scripts/build-app.sh
```

## 📁 Project Structure

```
navi/
├── packages/
│   ├── navi-app/           # Main desktop application
│   │   ├── src/            # Svelte 5 frontend
│   │   ├── server/         # Bun backend (routes, services, websocket)
│   │   └── src-tauri/      # Tauri desktop wrapper
│   ├── landing-page/       # Marketing website
│   └── navi-cloud/         # Cloud infrastructure (optional)
├── docs/                   # Documentation
├── .claude/                # Claude Code configuration
└── scripts/                # Build & deploy scripts
```

## 🏗️ Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Svelte 5, Vite, Tailwind CSS |
| **Backend** | Bun, WebSocket, sql.js (SQLite) |
| **Desktop** | Tauri v2 |
| **AI** | @anthropic-ai/claude-agent-sdk |

### Key Concepts

#### Extensions
Sidebar panels that provide specialized views (Files, Git, Terminal, Preview, Kanban, Agents).

#### Skills
Extend Claude's capabilities with custom tools and workflows. Located in `.claude/skills/`.

#### Agents
Specialized AI personas that can be spawned for parallel tasks. Types include:
- `browser` - Web research and URL analysis
- `coding` - Code implementation and file editing
- `runner` - Command execution and testing
- `research` - Deep analysis and findings synthesis
- `planning` - Task breakdown and architecture design

#### Features
Self-contained modules following `/src/lib/features/{feature}/` pattern with:
- `api.ts` - Backend API client
- `types.ts` - TypeScript interfaces
- `stores.ts` - Svelte stores
- `components/` - UI components

## 🔧 Configuration

### Environment Variables

See `.env.example` files for all available options:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Optional services
ZAI_API_KEY=xxxxx           # Internal Anthropic backend
E2B_API_KEY=xxxxx           # Cloud code execution (deprecated)
AGENTMAIL_API_KEY=xxxxx     # Email integration
```

### Settings

Configure Navi behavior in `.claude/settings.json`:

```json
{
  "hooks": {
    "pre-query": "echo 'Starting...'",
    "post-tool": "npm run lint --fix"
  },
  "disabledFeatures": ["channels"]
}
```

## 📚 Documentation

- **[Architecture Guide](CLAUDE.md)** - Detailed system architecture
- **[Feature Status](docs/STATUS.md)** - Feature inventory and roadmap
- **[Contributing](CONTRIBUTING.md)** - How to contribute
- **[Security Policy](SECURITY.md)** - Security and vulnerability reporting

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Contribution Checklist

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run type checking (`bun run check`)
5. Submit a pull request

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with amazing open-source tools:
- [Claude Code](https://github.com/anthropics/claude-code) - AI-powered coding assistant
- [Svelte](https://svelte.dev) - Reactive UI framework
- [Tauri](https://tauri.app) - Desktop app framework
- [Bun](https://bun.sh) - Fast JavaScript runtime

---

**Made with ❤️ by [Bruno Galvao](https://github.com/brunoqgalvao)**
