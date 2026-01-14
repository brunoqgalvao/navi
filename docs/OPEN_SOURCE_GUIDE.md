# Open Source Guide

## Overview

This document outlines which features in Navi are fully open-source, which require additional setup, and which are internal-only.

## Public Features (Fully Open Source)

These features work out of the box with just an Anthropic API key:

### Core Features
- **Chat Interface** - Full Claude Code integration with streaming
- **File Browser** - Navigate and edit project files
- **Terminal/PTY** - Run shell commands
- **Git Integration** - Status, commits, branches, worktrees
- **Preview Panel** - URLs, files, markdown, images
- **Multi-Agent System** - Spawn specialized agents for parallel tasks

### Built-in Skills
- `navi` - Control Navi GUI from Claude
- `codex` - OpenAI Codex CLI integration
- `gemini-cli` - Google Gemini CLI
- `stock-compare` - Stock price comparison charts
- `canvas-design` - Generate visual art
- `nano-banana-image-gen` - Image generation
- `navi-llm` - Dispatch to other LLMs

### Extensions (Sidebar Panels)
- Files
- Git
- Terminal
- Preview
- Processes (background task manager)
- Kanban (task board)
- Agents (hierarchy viewer)

## Optional Features (Require Setup)

These features require additional API keys or configuration:

### OAuth Integrations

Set up in **Settings → Integrations**:

| Service | Purpose | Setup |
|---------|---------|-------|
| **Gmail** | Read/send emails | Create OAuth app in Google Cloud Console |
| **Google Sheets** | Spreadsheet operations | Create OAuth app in Google Cloud Console |
| **Slack** | Post messages | Create Slack app with bot token |
| **Linear** | Issue tracking | Get API key from Linear settings |
| **Notion** | Page/database operations | Create integration at notion.dev |
| **GitHub** | Repo management | Create personal access token |

All integrations store tokens encrypted in the local database.

### Third-Party Services (Optional)

| Service | Purpose | Required | Setup |
|---------|---------|----------|-------|
| **AgentMail** | Autonomous agent email | Optional | Get key at agentmail.to |
| **E2B** | Cloud code execution | Optional (deprecated) | Get key at e2b.dev |

These are completely optional - Navi works fine without them.

## Internal Features (Not Open Source)

These features depend on internal Anthropic services or infrastructure:

### Z.AI Backend
- **Location:** `server/backends/codex-adapter.ts`
- **Purpose:** Internal Anthropic service for backend selection
- **Status:** Internal-only, not publicly documented
- **Action:** Remove or document clearly as experimental

### Navi Cloud
- **Location:** `packages/navi-cloud/`, `server/routes/deploy.ts`
- **Purpose:** One-click deployment to cloud infrastructure
- **Status:** Proprietary service (usenavi.app)
- **Action:** Document as enterprise feature or provide self-hosting guide

### Codex Models
- **Location:** `server/backends/codex-adapter.ts`
- **Purpose:** Experimental OpenAI Codex models (gpt-5.2-codex, etc.)
- **Status:** Internal/experimental
- **Action:** Mark as experimental in UI

## Deprecated Features

These features are scheduled for removal:

| Feature | Location | Reason |
|---------|----------|--------|
| **E2B Cloud Execution** | `server/services/e2b-executor.ts` | Replaced by Navi Cloud |
| **Experimental Agents** | `server/services/experimental-agents.ts` | Overlaps with multi-session |
| **Self-Healing Builds** | `server/services/self-healing-builds.ts` | Premature optimization |
| **Channels** | `server/routes/channels.ts` | Cut from roadmap |
| **Plugins** | `server/routes/plugins.ts` | Redundant with skills |

See `docs/STATUS.md` for full details.

## Feature Documentation

For detailed information on all features:

- **[Feature Status](STATUS.md)** - Complete feature inventory
- **[Architecture](../CLAUDE.md)** - System architecture guide
- **[Agents](AGENTS.md)** - Multi-agent system docs
- **[OAuth Setup](OAUTH_SETUP.md)** - Integration configuration

## Configuration

### Minimal Setup

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

This gives you full access to all core features.

### Full Setup

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-xxxxx
AGENTMAIL_API_KEY=am_xxxxx        # Optional: Email features
E2B_API_KEY=e2b_xxxxx             # Optional: Cloud execution (deprecated)
ZAI_API_KEY=xxxxx                 # Optional: Internal backend
```

Plus OAuth credentials for integrations (configured in UI).

## Development vs Production

### Development Mode
All features are available for experimentation. Features marked `@experimental` may change or be removed.

### Production Use
Stick to **CORE** and **STABLE** features as documented in `STATUS.md`. Experimental features are not guaranteed to be maintained.

## Self-Hosting

Navi is designed to work locally without external dependencies:

- **Database:** Local SQLite (`~/.claude-code-ui/data.db`)
- **Storage:** Local filesystem
- **API:** Direct to Anthropic (no proxy needed)

For cloud deployment:

1. **Navi Cloud:** Proprietary service (contact for access)
2. **Self-hosted:** Use `wrangler.toml.example` to deploy to your own Cloudflare account

## Future Plans

- [ ] Remove deprecated features (E2B, self-healing, etc.)
- [ ] Document self-hosting guide for Navi Cloud
- [ ] Public beta for Navi Cloud deployment
- [ ] Open source more internal backends

## Questions?

- **Documentation:** Check `docs/` folder
- **Issues:** [GitHub Issues](https://github.com/brunoqgalvao/navi/issues)
- **Discussions:** [GitHub Discussions](https://github.com/brunoqgalvao/navi/discussions)
