# Agents System

## Overview

Navi now supports **named agents** - specialized AI personas that can be called with @mentions. Each agent has its own personality, capabilities, and system prompt.

## How to Use

Simply start your message with `@agentname`:

```
@coder add dark mode to the settings page
@img3d convert logo.png to 3D model
@claude explain how authentication works
```

The agent name gets stripped from the message and its system prompt is injected into Claude's context.

## Available Agents

### @coder
**Purpose:** Code-first, action-oriented development

**Personality:**
- Writes code first, explains after
- Concise and pragmatic
- Runs tests after changes
- Uses git branches for significant work

**Use for:**
- Implementing features
- Fixing bugs
- Refactoring code
- Running test suites

**Location:** `~/.claude/agents/coder.md`

### @img3d
**Purpose:** Convert images to 3D models

**Capabilities:**
- Converts any image to 3D (GLB format)
- Removes backgrounds automatically
- Multiple quality levels (Trellis, Rodin, TripoSR)

**Use for:**
- Creating 3D assets from logos
- Converting photos to 3D models
- Generating game/AR assets

**Location:** `~/.claude/agents/img3d.md`

### @claude (default)
**Purpose:** General assistant

When no agent is specified, Claude uses its default behavior.

---

## Creating Custom Agents

### 1. Create Agent File

Create a markdown file in `~/.claude/agents/{name}.md`:

```markdown
---
name: researcher
description: Deep research specialist. Searches thoroughly before acting.
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - WebSearch
---

# Researcher Agent

You are a research specialist. Your job is to gather information thoroughly.

## Personality

- Read-heavy, write-light
- Thorough and methodical
- Summarizes findings clearly
- Never makes changes without explicit request

## Workflow

1. Search the codebase comprehensively
2. Use WebSearch for external information
3. Synthesize findings into clear summary
4. Ask clarifying questions when needed

## Don'ts

- Don't make code changes unless explicitly asked
- Don't assume - verify with grep/read
- Don't rush - thoroughness over speed
```

### 2. Restart Navi Server

The server scans `~/.claude/agents/` on startup.

### 3. Use Your Agent

```
@researcher how does our authentication system work?
```

---

## Agent File Format

```yaml
---
name: agent-slug          # Used in @mention
description: When to use  # Shows in picker
model: sonnet            # Optional: sonnet, opus, haiku
tools:                   # Optional: limit available tools
  - Read
  - Write
  - Bash
---

# Agent Instructions

Your system prompt goes here. This gets prepended to Claude's context
when this agent is called.

Can include:
- Personality traits
- Workflow steps
- Do's and don'ts
- Examples
```

---

## Architecture

### Frontend Flow

1. **Chat Input** detects `@agent` pattern
2. **Agent Picker** shows available agents (type `@agent` to see)
3. **Selection** replaces with `@agentslug` at message start
4. **Submit** extracts agent from message

### Backend Flow

1. **WebSocket** receives `{ prompt: "message", agentId: "coder" }`
2. **Query Worker** loads agent from `~/.claude/agents/coder.md`
3. **System Prompt** gets agent's prompt prepended
4. **Claude** responds with agent's personality

### Code Locations

| Component | Location |
|-----------|----------|
| Agent files | `~/.claude/agents/*.md` |
| Frontend store | `src/lib/stores/agents.ts` |
| Agent picker UI | `ChatInput.svelte` (lines 196-650) |
| Agent extraction | `App.svelte` sendMessage() |
| Backend loader | `server/routes/agents.ts` |
| System prompt injection | `server/query-worker.ts` (line 1235) |

---

## Tips

### Agent Specialization

Make agents **focused**:
- ✅ `@git` for version control
- ✅ `@deploy` for deployments
- ❌ `@everything` that does too much

### System Prompts

Keep agent prompts:
- **Clear** - specific instructions
- **Concise** - Claude has limited context
- **Actionable** - tell them what to do

### Tool Restrictions

Limit tools to agent's purpose:

```yaml
tools:
  - Read
  - Grep
  # No Write/Edit - read-only agent
```

---

## Agents vs Skills

| Feature | Agents | Skills |
|---------|--------|--------|
| **What** | AI personalities | Packaged capabilities |
| **How** | System prompts | Instructions + code |
| **When** | `@agent` mention | Auto-detected or explicit |
| **Where** | `~/.claude/agents/` | `~/.claude/skills/` |

**Use agents** when you want a different *personality*.
**Use skills** when you want *new capabilities*.

Can combine: `@img3d` agent uses the `img3d` skill.

---

## Roadmap

### Future Features

- **Agent memory** - persistent context per agent
- **Agent-to-agent delegation** - `@lead` calls `@coder` and `@ops`
- **Channels** - agents live in cross-workspace channels
- **Custom avatars** - visual identity for agents
- **Agent templates** - starter agents to customize

---

## Troubleshooting

### Agent not showing in picker

```bash
# Check agent file exists
ls ~/.claude/agents/

# Check file has valid frontmatter
cat ~/.claude/agents/your-agent.md

# Restart server
# Agents load on startup
```

### Agent not behaving as expected

The system prompt might conflict with base instructions. Keep agent prompts focused and don't contradict base Claude behavior.

### Want to see what prompt was used

Check the system message in chat - it shows which agent was selected.

---

## Examples

### Code Review Agent

```markdown
---
name: reviewer
description: Code review specialist. Checks for bugs, style, security.
tools: [Read, Grep]
---

# Code Reviewer

You review code for quality. Check for:
- Bugs and edge cases
- Security vulnerabilities
- Code style consistency
- Performance issues

Be constructive and specific.
```

Usage: `@reviewer check the auth module for security issues`

### Documentation Writer

```markdown
---
name: docs
description: Technical documentation writer. Clear, concise, examples.
tools: [Read, Write, Grep]
---

# Documentation Writer

You write clear technical documentation. Include:
- Purpose and overview
- Usage examples
- API reference
- Common pitfalls

Write for developers who are new to the codebase.
```

Usage: `@docs document the API routes in server/routes/`

---

**Happy agent building! 🤖**
