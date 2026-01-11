# Unified Agent Bundle Specification

**Version:** 2.0.0
**Status:** Draft
**Compatible with:** Claude Agent SDK, Navi

---

## Overview

This specification defines two distinct agent concepts that work together:

1. **SDK Subagents** - Lightweight agents spawned via the `Task` tool within a Claude session
2. **Navi Agents** - Full-featured agent bundles that create independent Navi sessions

### The Two-Tier Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NAVI AGENT SESSION                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     CLAUDE AGENT SDK                               │  │
│  │                                                                    │  │
│  │   Main Agent ──┬── Task("research") ──→ SDK Subagent (ephemeral)  │  │
│  │                ├── Task("code")     ──→ SDK Subagent (ephemeral)  │  │
│  │                └── Task("review")   ──→ SDK Subagent (ephemeral)  │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Can spawn_agent() ──→ NEW NAVI AGENT SESSION (independent, persisted)  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

| Aspect | SDK Subagent | Navi Agent |
|--------|--------------|------------|
| **Definition** | `agents:` in agent.yaml | Full bundle directory |
| **Spawning** | `Task` tool (SDK built-in) | `spawn_agent()` MCP tool |
| **Lifecycle** | Ephemeral, within parent session | Independent session, persisted |
| **Context** | Shares parent's context window | Own context window |
| **UI** | Inline results in parent chat | Separate panel, native UI cards |
| **Communication** | Direct return to parent | WebSocket, escalation, artifacts |
| **Persistence** | None (session-scoped) | Full history in database |
| **Deployability** | Part of parent config | Standalone deployable bundle |

### Design Goals

1. **Clear Separation** - SDK subagents vs Navi agents serve different purposes
2. **SDK-Compatible** - Subagents work with Claude Agent SDK out of the box
3. **Portable** - Navi agents bundle everything needed to run
4. **Shareable** - Import/export Navi agents between projects and users
5. **Deployable** - Ship Navi agents to cloud/edge environments
6. **Composable** - Both agent types can work together

---

## Part 1: SDK Subagents

SDK Subagents are lightweight agent definitions used by the Claude Agent SDK's `Task` tool. They run within the parent session's context.

### Definition Format

Subagents are defined in the `agents:` section of a Navi Agent's `agent.yaml`:

```yaml
# In agent.yaml
agents:
  researcher:
    description: "Research specialist for finding information"
    prompt: |
      You are a research specialist. Find and analyze information thoroughly.
      Always cite your sources.
    tools:
      - WebSearch
      - WebFetch
      - Read
    model: haiku  # Use faster model for quick tasks

  coder:
    description: "Implementation specialist for writing code"
    prompt: |
      You are a coding specialist. Write clean, tested code.
      Follow existing patterns in the codebase.
    tools:
      - Read
      - Write
      - Edit
      - Bash
      - Glob
      - Grep
    model: sonnet

  reviewer:
    description: "Code review specialist"
    prompt: |
      You are a code reviewer. Check for bugs, security issues, and best practices.
      Be thorough but constructive.
    tools:
      - Read
      - Glob
      - Grep
```

### Usage

The parent agent spawns subagents via the `Task` tool:

```typescript
// Claude automatically uses Task tool based on task complexity
Task({
  prompt: "Research the latest React 19 features",
  subagent_type: "researcher"  // Matches key in agents config
})
```

### Subagent Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `description` | string | ✅ | When to use this subagent (used for auto-selection) |
| `prompt` | string | ✅ | System prompt for the subagent |
| `tools` | string[] | ❌ | Allowed tools (defaults to parent's tools) |
| `model` | string | ❌ | Model preference (haiku/sonnet/opus) |

### Lifecycle

1. Parent calls `Task` tool with `subagent_type`
2. SDK creates ephemeral subagent with specified config
3. Subagent executes task within parent's context window
4. Result returned directly to parent
5. Subagent context is discarded

---

## Part 2: Navi Agents

Navi Agents are full-featured agent bundles that create independent sessions with their own lifecycle, persistence, and UI.

## Bundle Structure

### Simple Agent (Single File)

For basic agents, a single markdown file suffices:

```
agents/
└── my-agent.md          # YAML frontmatter + system prompt
```

### Complex Agent (Bundle Directory)

For agents with dependencies, use a directory bundle:

```
agents/
└── my-agent/
    ├── agent.yaml           # Main configuration (SDK-compatible)
    ├── prompt.md            # System prompt (Markdown)
    ├── navi.yaml            # Navi extensions (optional)
    │
    ├── skills/              # Bundled skills (optional)
    │   └── my-skill/
    │       └── SKILL.md
    │
    ├── mcps/                # MCP server definitions (optional)
    │   └── my-mcp.json
    │
    ├── commands/            # Slash commands (optional)
    │   └── deploy.md
    │
    ├── hooks/               # Lifecycle hooks (optional)
    │   └── pre-tool.ts
    │
    ├── scripts/             # Helper scripts (optional)
    │   └── setup.sh
    │
    └── ui/                  # Custom UI components (optional)
        └── widget.svelte
```

---

## agent.yaml (SDK-Compatible Core)

This file follows the Claude Agent SDK `AgentDefinition` structure:

```yaml
# agent.yaml - Claude Agent SDK compatible
name: my-agent
description: When to use this agent (triggers auto-selection)

# System prompt - can be inline or reference prompt.md
prompt: |
  You are a specialized agent for...
# OR
prompt: file:prompt.md

# Tool permissions
tools:
  allowed:
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
    - WebSearch
    - WebFetch
    - Task           # Required for spawning subagents
  disallowed:
    - mcp__dangerous-server__*

# Model preference
model: sonnet  # sonnet | opus | haiku

# Permission mode
permissionMode: default  # default | bypassPermissions | acceptEdits

# MCP servers
mcpServers:
  playwright:
    command: npx
    args: ["@playwright/mcp@latest"]

  custom-mcp:
    command: node
    args: ["./mcps/custom-mcp.js"]
    env:
      API_KEY: "${CUSTOM_API_KEY}"

# Subagents this agent can spawn
agents:
  researcher:
    description: Research specialist
    prompt: file:agents/researcher.md
    tools:
      allowed: [WebSearch, WebFetch, Read]
    model: haiku

  coder:
    description: Implementation specialist
    prompt: file:agents/coder.md
    tools:
      allowed: [Read, Write, Edit, Bash, Glob, Grep]

# Hooks (SDK-compatible format)
hooks:
  PreToolUse:
    - matcher: "Bash"
      action: log
  PostToolUse:
    - matcher: "Edit|Write"
      action: file:hooks/audit-changes.ts
  Stop:
    - action: file:hooks/on-complete.ts
```

---

## navi.yaml (Navi Extensions)

This file contains Navi-specific features not in the SDK:

```yaml
# navi.yaml - Navi-specific extensions
version: "1.0"

# UI Configuration
ui:
  icon: 🤖                    # Emoji or icon name
  color: emerald              # Tailwind color
  nativeUI: true              # Show specialized inline card

  # Custom widget for this agent's output
  widget: file:ui/widget.svelte

  # Panel configuration when agent is active
  panel:
    showPreview: true
    showTerminal: true
    defaultTab: files

# Skills to load (bundled or referenced)
skills:
  # Bundled skills (in ./skills/)
  - ./skills/my-custom-skill

  # Global skills (from ~/.claude/skills/)
  - global:playwright
  - global:browser-use

  # Project skills (from .claude/skills/)
  - project:stock-compare

# Required integrations (OAuth, API keys)
integrations:
  required:
    - name: github
      reason: "Needs GitHub access for PR operations"
      scopes: ["repo", "workflow"]

    - name: gmail
      reason: "Sends notification emails"
      scopes: ["gmail.send"]

  optional:
    - name: slack
      reason: "Post updates to Slack (optional)"

# Environment variables needed
env:
  required:
    - OPENAI_API_KEY      # For embeddings
    - DATABASE_URL        # For data storage

  optional:
    - SENTRY_DSN          # Error tracking

# Slash commands this agent provides
commands:
  - file:commands/deploy.md
  - file:commands/status.md

# Setup script (runs on first use)
setup:
  script: file:scripts/setup.sh
  requirements:
    - node >= 18
    - bun >= 1.0

  # Dependencies to install
  install:
    npm:
      - playwright
      - puppeteer
    pip:
      - browser-use

# Deployment configuration
deploy:
  # Where this agent can be deployed
  targets:
    - navi-cloud
    - cloudflare-workers
    - vercel

  # Resources needed
  resources:
    memory: 512MB
    timeout: 300s

  # Secrets to inject at deploy time
  secrets:
    - ANTHROPIC_API_KEY
    - DATABASE_URL

# Agent metadata
meta:
  author: "Your Name"
  version: "1.0.0"
  license: MIT
  repository: https://github.com/you/my-agent
  tags:
    - research
    - automation
    - coding
```

---

## prompt.md (System Prompt)

The system prompt as a separate Markdown file for readability:

```markdown
# My Agent

You are a specialized agent for [purpose].

## Capabilities

- **Capability 1**: Description
- **Capability 2**: Description

## Workflow

1. **Step 1** - Understand the request
2. **Step 2** - Plan approach
3. **Step 3** - Execute
4. **Step 4** - Verify
5. **Step 5** - Report

## Guidelines

- Guideline 1
- Guideline 2

## Output Format

When reporting, use this structure:

### Summary
Brief overview

### Details
Detailed findings

### Next Steps
Recommendations
```

---

## Simple Agent Format (Backwards Compatible)

For simple agents, use a single `.md` file with YAML frontmatter:

```yaml
---
# SDK-compatible fields
name: Simple Agent
description: A basic agent for quick tasks
tools: Read, Write, Edit, Bash
model: sonnet

# Navi extensions (optional, prefixed with navi_)
navi_icon: 🚀
navi_color: blue
navi_skills: playwright, browser-use
navi_integrations: github
---

# System Prompt

You are a simple agent for quick tasks.

## Capabilities
...
```

This format is converted to a virtual bundle at runtime.

---

## Loading Resolution

When an agent is invoked, Navi resolves it in this order:

1. **Explicit Path** - If a full path is given, load directly
2. **Project Agents** - `.claude/agents/{name}/` or `.claude/agents/{name}.md`
3. **Global Agents** - `~/.claude/agents/{name}/` or `~/.claude/agents/{name}.md`
4. **Built-in Agents** - Hardcoded defaults (browser, coding, runner, etc.)

Later definitions override earlier ones by name.

---

## Runtime Application

When an agent is selected, Navi applies its full configuration:

```typescript
// Pseudocode for agent application
function applyAgent(agent: AgentBundle, session: Session) {
  // 1. Set model preference
  session.model = agent.model ?? session.model;

  // 2. Apply tool permissions
  session.allowedTools = agent.tools.allowed;
  session.disallowedTools = agent.tools.disallowed;

  // 3. Connect MCP servers
  for (const [name, config] of Object.entries(agent.mcpServers)) {
    session.connectMCP(name, config);
  }

  // 4. Load skills
  for (const skill of agent.skills) {
    session.loadSkill(skill);
  }

  // 5. Register hooks
  session.hooks = mergeHooks(session.hooks, agent.hooks);

  // 6. Prepend system prompt
  session.systemPrompt = agent.prompt + session.systemPrompt;

  // 7. Register subagents
  session.agents = agent.agents;

  // 8. Check integrations
  for (const integration of agent.integrations.required) {
    if (!hasIntegration(integration.name)) {
      throw new Error(`Missing required integration: ${integration.name}`);
    }
  }
}
```

---

## Agent Spawning

Agents can spawn subagents via the `Task` tool:

```typescript
// In the main agent's execution
await spawn_agent({
  title: "Research competitors",
  role: "researcher",
  task: "Find and analyze top 5 competitors",
  agent_type: "researcher"  // Matches key in agents config
});
```

The spawned agent inherits:
- Parent's working directory
- Parent's environment variables
- Parent's integrations
- Its own tool/model/prompt configuration

---

## Export Format

When exporting an agent bundle for sharing:

```bash
# Export command
navi agent export my-agent --output my-agent.navi.tar.gz
```

The export:
1. Bundles all files in the agent directory
2. Resolves and includes referenced skills
3. Includes MCP server definitions (not the servers themselves)
4. Strips sensitive data (API keys, secrets)
5. Generates a `manifest.json` with checksums

---

## Import Format

When importing an agent bundle:

```bash
# Import command
navi agent import my-agent.navi.tar.gz
```

The import:
1. Validates the manifest
2. Checks for required integrations
3. Runs setup script if present
4. Installs dependencies
5. Places files in `.claude/agents/`

---

## Deployment

Agents can be deployed to cloud environments:

```bash
# Deploy to Navi Cloud
navi agent deploy my-agent --target navi-cloud

# Deploy to Cloudflare Workers
navi agent deploy my-agent --target cloudflare
```

Deployment:
1. Validates all requirements
2. Builds a deployable bundle
3. Injects secrets from environment
4. Provisions necessary resources
5. Returns endpoint URL

---

## Type Definitions

```typescript
// types/agent-bundle.ts

export interface AgentBundle {
  // Identity
  name: string;
  description: string;

  // SDK-compatible core
  prompt: string;
  model?: "sonnet" | "opus" | "haiku";
  tools?: {
    allowed?: string[];
    disallowed?: string[];
  };
  permissionMode?: "default" | "bypassPermissions" | "acceptEdits";
  mcpServers?: Record<string, MCPServerConfig>;
  agents?: Record<string, AgentDefinition>;
  hooks?: HooksConfig;

  // Navi extensions
  navi?: NaviExtensions;
}

export interface NaviExtensions {
  ui?: {
    icon?: string;
    color?: string;
    nativeUI?: boolean;
    widget?: string;
    panel?: PanelConfig;
  };
  skills?: string[];
  integrations?: {
    required?: IntegrationRequirement[];
    optional?: IntegrationRequirement[];
  };
  env?: {
    required?: string[];
    optional?: string[];
  };
  commands?: string[];
  setup?: SetupConfig;
  deploy?: DeployConfig;
  meta?: MetaConfig;
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface IntegrationRequirement {
  name: string;
  reason: string;
  scopes?: string[];
}

export interface SetupConfig {
  script?: string;
  requirements?: string[];
  install?: {
    npm?: string[];
    pip?: string[];
  };
}

export interface DeployConfig {
  targets?: string[];
  resources?: {
    memory?: string;
    timeout?: string;
  };
  secrets?: string[];
}

export interface MetaConfig {
  author?: string;
  version?: string;
  license?: string;
  repository?: string;
  tags?: string[];
}
```

---

## Migration from Current Format

### From Simple `.md` Agent

```yaml
# Before: .claude/agents/browser.md
---
name: Browser Agent
type: browser
description: Web research agent
tools: WebFetch, WebSearch, Read, Write
skills: playwright
model: sonnet
nativeUI: true
icon: 🌐
color: blue
---
System prompt here...
```

```yaml
# After: .claude/agents/browser/agent.yaml
name: browser
description: Web research agent
prompt: file:prompt.md
model: sonnet
tools:
  allowed: [WebFetch, WebSearch, Read, Write]
```

```yaml
# After: .claude/agents/browser/navi.yaml
ui:
  icon: 🌐
  color: blue
  nativeUI: true
skills:
  - global:playwright
```

### From Agent Builder

Agent Builder will be updated to write to `.claude/agents/` using the new bundle format instead of `~/.navi/agents/`.

---

## Compatibility Matrix

| Feature | SDK | Navi | Notes |
|---------|-----|------|-------|
| `name` | ✅ | ✅ | |
| `description` | ✅ | ✅ | |
| `prompt` | ✅ | ✅ | |
| `model` | ✅ | ✅ | |
| `tools.allowed` | ✅ | ✅ | |
| `tools.disallowed` | ✅ | ✅ | |
| `mcpServers` | ✅ | ✅ | |
| `agents` | ✅ | ✅ | Subagents |
| `hooks` | ✅ | ✅ | |
| `permissionMode` | ✅ | ✅ | |
| `ui.*` | ❌ | ✅ | Navi-only |
| `skills` | ❌ | ✅ | Navi-only |
| `integrations` | ❌ | ✅ | Navi-only |
| `commands` | ❌ | ✅ | Navi-only |
| `setup` | ❌ | ✅ | Navi-only |
| `deploy` | ❌ | ✅ | Navi-only |

---

## References

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Claude Agent SDK Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks)
- [Claude Agent SDK MCP](https://platform.claude.com/docs/en/agent-sdk/mcp)
