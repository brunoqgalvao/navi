# Skill Specification (Claude Code Compliant)

## Directory Structure

Each skill is a directory containing at minimum a `SKILL.md` file:

```
my-skill/
├── SKILL.md              # Required - metadata + instructions
├── scripts/              # Optional - executable helpers
│   ├── lint.py
│   └── format.sh
├── references/           # Optional - loaded into context
│   ├── style-guide.md
│   └── examples.md
└── assets/               # Optional - templates, data files
    └── template.txt
```

## SKILL.md Format

```markdown
---
name: my-skill-name
description: Brief explanation of what this skill does and when Claude should use it
version: 1.0.0
allowed-tools: Read, Grep, Glob
---

# Skill Title

Detailed instructions for Claude when this skill is active.

## When to Apply

- Condition 1
- Condition 2

## Guidelines

1. Step one
2. Step two

## Examples

[Can reference other files in the skill directory]
```

## Frontmatter Fields

### Required Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `name` | string | lowercase, numbers, hyphens; max 64 chars | Unique identifier |
| `description` | string | max 1024 chars | When/why Claude should use this skill |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | string | "1.0.0" | Semver version |
| `allowed-tools` | string | all | Comma-separated tool list |
| `license` | string | - | License identifier (MIT, Apache-2.0, etc) |
| `disable-model-invocation` | boolean | false | Prevent auto-selection |

## Naming Conventions

- **Skill name**: lowercase, hyphens only (e.g., `debug-detective`, `code-reviewer`)
- **Directory name**: matches skill name
- **No spaces** in any file/folder names within skill

## How Claude Discovers Skills

1. **Startup**: Claude indexes all skills from `~/.claude/skills/` and `.claude/skills/`
2. **Metadata load**: Only `name` and `description` loaded initially
3. **Context matching**: Claude matches current task against skill descriptions
4. **Full load**: When relevant, loads complete SKILL.md content
5. **Application**: Instructions injected into conversation context

## Skill Types by Location

| Location | Scope | Priority |
|----------|-------|----------|
| `.claude/skills/` | Project only | Highest |
| `~/.claude/skills/` | All projects | Lower |
| Plugin skills | As configured | Varies |

Project skills override global skills with the same name.
