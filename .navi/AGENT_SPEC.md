# Navi Agent Specification v0.1

## Overview

A Navi Agent is a reusable, shareable automation unit that combines:
- An LLM prompt (the "brain")
- Typed inputs and outputs (the "contract")
- Skills, tools, and scripts (the "capabilities")
- Triggers (when to run)

Agents are **filesystem-first** - stored as folders with markdown and code files.

## Directory Structure

```
~/.navi/agents/
└── blog-automation/
    ├── agent.md          # Main prompt + frontmatter config
    ├── schema.ts         # TypeScript types for Input/Output
    ├── skills/           # Inline skills for this agent
    │   └── search-component.md
    ├── scripts/          # Executable code
    │   ├── generate-cover.ts
    │   └── deploy.sh
    ├── sub-agents/       # Nested agents this one can invoke
    │   └── reviewer/
    │       └── agent.md
    └── triggers/         # Trigger configurations
        ├── cron.json
        └── webhook.json
```

## agent.md Format

```markdown
---
name: Blog Automation
description: Generates and publishes blog posts for components
version: 1.0.0
author: davila7

# Model preference
model: sonnet

# Tools this agent can use
tools:
  - Read
  - Write
  - Bash
  - WebFetch
  - WebSearch

# Skills (inline or from library)
skills:
  - ./skills/search-component.md
  - library:nano-banana-image-gen
  - library:github

# Sub-agents this agent can invoke
subAgents:
  - ./sub-agents/reviewer

# Scripts available to this agent
scripts:
  - ./scripts/generate-cover.ts
  - ./scripts/deploy.sh

# Environment variables required
env:
  - GITHUB_TOKEN
  - VERCEL_TOKEN
  - NANO_BANANA_API_KEY

# Triggers (optional - for scheduled/automated runs)
triggers:
  - type: cron
    schedule: "0 9 * * *"  # Daily at 9am
  - type: webhook
    event: pr_merged
    repo: davila7/claude-code-templates
---

# Blog Automation Agent

You are a technical blog writer that creates high-quality posts about
UI components. Your workflow:

1. Research the component using the search-component skill
2. Read Anthropic's documentation for context
3. Write a structured blog post with:
   - Introduction
   - Mermaid diagram showing component architecture
   - Installation instructions
   - Usage examples
   - Results/benefits

4. Generate a cover image using Nano Banana
5. Commit to GitHub and trigger Vercel deploy

## Guidelines

- Write for developers - be direct and technical
- Include working code examples
- Always validate the component exists before writing
- Use simple, clean cover images (not overly designed)

## Output Format

Return a JSON object with:
- `title`: Blog post title
- `content`: Full markdown content
- `cover_image`: Path to generated cover
- `component_name`: The component this post is about
```

## schema.ts Format

```typescript
// Input: What the agent receives when invoked
export interface Input {
  component_name: string;
  style?: "technical" | "beginner-friendly";
  include_diagram?: boolean;
}

// Output: What the agent produces
export interface Output {
  title: string;
  content: string;
  cover_image: FileRef;
  deployed_url?: string;
  metadata: {
    word_count: number;
    reading_time: number;
    component_version: string;
  };
}

// FileRef for file outputs
export interface FileRef {
  type: "file";
  path: string;
  mimeType?: string;
}
```

## Triggers

### Cron Trigger (triggers/cron.json)

```json
{
  "type": "cron",
  "schedule": "0 9 * * *",
  "timezone": "America/Sao_Paulo",
  "input": {
    "component_name": "{{random_from_list:popular_components}}",
    "style": "technical"
  }
}
```

### Webhook Trigger (triggers/webhook.json)

```json
{
  "type": "webhook",
  "source": "github",
  "event": "pull_request.merged",
  "filter": {
    "base": "main",
    "labels": ["new-component"]
  },
  "input_mapping": {
    "component_name": "{{payload.pull_request.title}}"
  }
}
```

### Manual Trigger (via CLI or API)

```bash
# CLI
navi run blog-automation --input '{"component_name": "shadcn-button"}'

# API
POST /api/agents/blog-automation/run
{
  "input": { "component_name": "shadcn-button" }
}
```

## Agent Composition

Agents can invoke other agents as sub-agents:

```markdown
---
subAgents:
  - ./sub-agents/reviewer
  - library:code-reviewer
---

# My Agent

When you finish writing, invoke the `reviewer` sub-agent to check quality.
If the review passes, proceed with deployment.
```

## Sharing Agents

Agents can be:
1. **Local**: In `~/.navi/agents/` or `.navi/agents/` (project-specific)
2. **Library**: Published to Navi Cloud for others to use
3. **GitHub**: Cloned from a repo

### Publishing to Library

```bash
navi publish blog-automation --public
```

### Installing from Library

```bash
navi install davila7/blog-automation
```

## Execution Model

1. **Parse**: Read agent.md, schema.ts, load skills/scripts
2. **Validate**: Check input against Input schema
3. **Execute**: Run the agent with Claude, providing:
   - System prompt from agent.md
   - Tools enabled per config
   - Skills injected into context
   - Scripts available for execution
4. **Output**: Validate output against Output schema
5. **Artifacts**: Save any FileRef outputs to temp/output directory

## State & Memory

Agents are stateless by default. For stateful workflows:

```yaml
state:
  type: sqlite  # or: memory, redis, file
  persist: true
  schema:
    last_run: timestamp
    components_written: string[]
```

## Future: Visual Builder

The Navi Agent Builder provides a visual interface for:
- Editing the prompt with syntax highlighting
- Selecting tools/skills from a sidebar
- Defining input/output schemas with a form builder
- Testing with the built-in harness
- Setting up triggers visually

---

## Example: Blog Automation Agent

See the reference implementation:
https://github.com/davila7/claude-code-templates

This agent demonstrates:
- Skill composition (search + image gen + deploy)
- Cron triggers (daily runs)
- GitHub integration
- Vercel deployment
- File output handling
