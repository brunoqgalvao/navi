# Navi Agents Specification

Agents are specialized AI personas that Navi can spawn for specific tasks. Each agent has its own system prompt, capabilities, and UI representation.

## Directory Structure

```
.claude/agents/
├── AGENTS.md         # This spec file
├── browser.md        # Browser/research agent
├── coding.md         # Code implementation agent
├── runner.md         # Command execution agent
└── {custom}.md       # Your custom agents
```

## Agent File Format

Each agent is defined in a markdown file with YAML frontmatter:

```yaml
---
name: Agent Display Name
type: browser | coding | runner | research | planning | reviewer | general
description: When to use this agent (used for selection and search)
icon: 🌐
color: blue | emerald | cyan | purple | amber | rose | gray
nativeUI: true | false
tools: WebFetch, WebSearch, Read, Write
skills: playwright, stock-compare
mcps: browser-agent
model: sonnet | opus | haiku
---

# System Prompt

The markdown body becomes the agent's system prompt...
```

## Frontmatter Fields

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name shown in UI |
| `type` | enum | Agent type for capabilities/UI |
| `description` | string | When to use this agent |
| `tools` | string | Comma-separated list of allowed tools |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `icon` | string | 🤖 | Emoji shown in UI |
| `color` | string | gray | Tailwind color for theming |
| `nativeUI` | boolean | false | Show specialized UI card |
| `skills` | string | - | Comma-separated skills to load |
| `mcps` | string | - | Comma-separated MCP servers |
| `model` | string | sonnet | Default model for this agent |

## Agent Types

| Type | Icon | Native UI | Default Tools |
|------|------|-----------|---------------|
| `browser` | 🌐 | Yes | WebFetch, WebSearch, Read, Write |
| `coding` | 🔧 | Yes | Read, Write, Edit, Bash, Glob, Grep, TodoWrite |
| `runner` | ▶️ | Yes | Bash, Read |
| `research` | 🔍 | No | WebFetch, WebSearch, Read, Write |
| `planning` | 📋 | No | Read, Glob, Grep, TodoWrite |
| `reviewer` | 👀 | No | Read, Glob, Grep |
| `general` | 🤖 | No | All standard tools |

## Native UI Types

Agents with `nativeUI: true` get specialized inline cards:

- **browser**: Shows visited URLs, page thumbnails, link trail
- **coding**: Shows files changed, diff preview, line counts
- **runner**: Shows command output, progress, exit status

## System Prompt Best Practices

1. **Start with role definition**: "You are a [Type] Agent specialized in..."
2. **List capabilities**: What tools/skills are available
3. **Define workflow**: Step-by-step how to approach tasks
4. **Set guidelines**: Best practices and constraints
5. **Specify output format**: How to structure deliverables

## Example: Custom Database Agent

```yaml
---
name: Database Agent
type: coding
description: Manages database schemas, migrations, and queries
icon: 🗄️
color: amber
nativeUI: false
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

You are a Database Agent specialized in database operations.

## Your Capabilities
- Design and modify database schemas
- Write and optimize SQL queries
- Create and run migrations
- Analyze query performance

## Guidelines
1. Always backup before destructive operations
2. Use transactions for multi-step changes
3. Document schema changes
4. Consider indexing for frequently queried fields

## Output Format
- Schema changes as SQL files
- Migrations with up/down scripts
- Query explanations with EXPLAIN output
```

## How Agents Are Used

### Spawning via MCP Tool

When Navi decides to delegate work:

```
spawn_agent(
  title: "Research Chart.js docs",
  role: "researcher",
  task: "Find Chart.js multi-dataset examples",
  agent_type: "browser"  // <-- Selects the browser agent
)
```

### User-Initiated

Users can request specific agents:

```
"@browser find the latest React 19 features"
"@coding implement the stock chart component"
```

### Automatic Selection

Navi can infer agent type from the task:

- "Research X" → browser agent
- "Implement X" → coding agent
- "Run tests" → runner agent

## Overriding Built-in Agents

To customize a built-in agent, create a file with the same type:

```yaml
---
name: My Custom Browser Agent
type: browser  # <-- Same type overrides the built-in
description: Custom browser agent with extra capabilities
tools: WebFetch, WebSearch, Read, Write
skills: playwright, browser-use
---

Custom system prompt here...
```

User-defined agents take precedence over built-in ones.

## Loading Order

1. Built-in agents (from `server/agent-types.ts`)
2. Project agents (from `.claude/agents/*.md`)
3. Global agents (from `~/.claude/agents/*.md`)

Later definitions override earlier ones by `type`.
