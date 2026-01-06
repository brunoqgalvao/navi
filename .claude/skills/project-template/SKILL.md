---
name: project-template
description: Initialize new projects from templates. Use when the user wants to create a new project, start a new app, use a template, or scaffold a project with pre-configured skills and agents.
---

# Project Template Skill

Create new projects from pre-configured templates with skills, agents, and CLAUDE.md files.

## Available Templates

### 1. vibe-coding
Full vibe coding pipeline with 3 specialized agents:
- **spec-interrogator** - Turn ideas into bulletproof specs
- **implementation-planner** - Deep research and architecture
- **code-implementer** - Execute with precision

Best for: Building apps from scratch, MVPs, feature development

### 2. nano-banana
AI image generation setup with creative agents:
- **image-creator** - General image generation
- **logo-designer** - Professional branding assets
- **art-director** - Creative visual art

Best for: Image generation projects, design work, branding

## Usage

```bash
# Initialize a vibe coding project
bun run /Users/brunogalvao/Documents/dev-bruno/claude-code-local-ui/.claude/templates/init-template.ts vibe-coding ./my-new-app

# Initialize an image generation project
bun run /Users/brunogalvao/Documents/dev-bruno/claude-code-local-ui/.claude/templates/init-template.ts nano-banana ./design-project

# List available templates
bun run /Users/brunogalvao/Documents/dev-bruno/claude-code-local-ui/.claude/templates/init-template.ts --list
```

## What Gets Created

```
my-new-app/
├── CLAUDE.md          # Project-specific instructions
└── .claude/
    ├── agents/        # Specialized AI agents for this project type
    │   ├── agent1.md
    │   └── agent2.md
    └── skills/        # Skill references
        ├── skill1.md
        └── skill2.md
```

## Example Workflow

When user says "create a new vibe coding project called habit-tracker":

```bash
# 1. Create the project from template
bun run /Users/brunogalvao/Documents/dev-bruno/claude-code-local-ui/.claude/templates/init-template.ts vibe-coding ./habit-tracker

# 2. Navigate to project
cd habit-tracker

# 3. Start building with the vibe coder pipeline!
```

## Template Structure

Each template in `.claude/templates/` contains:

```
template-name/
├── CLAUDE.md           # Project instructions copied to new project
└── .claude/
    ├── agents/         # Agent definitions
    │   └── *.md
    └── skills/         # Skill references
        └── *.md
```

## Adding New Templates

To create a new template:

1. Create a new directory in `.claude/templates/`
2. Add a `CLAUDE.md` with project-specific instructions
3. Add `.claude/agents/` with agent definitions
4. Add `.claude/skills/` with skill references
5. Update this skill documentation
