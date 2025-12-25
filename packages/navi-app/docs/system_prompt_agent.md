# Agent System Prompt Architecture

This document explains how the Claude Agent SDK system prompt, tools, and skills are configured in this application.

## System Prompt Configuration

The system prompt is configured in `server/query-worker.ts` using the Claude Agent SDK:

```typescript
systemPrompt: skillsMetadata 
  ? { type: 'preset', preset: 'claude_code', append: skillsMetadata }
  : { type: 'preset', preset: 'claude_code' }
```

### Prompt Structure

The final system prompt is assembled from multiple sources:

```
┌─────────────────────────────────────────────────────────┐
│  Claude Code Base System Prompt (preset: 'claude_code') │
│  - Agent role and behavioral guidelines                 │
│  - Tool descriptions and usage instructions             │
│  - Security and safety guidelines                       │
├─────────────────────────────────────────────────────────┤
│  CLAUDE.md Files (via settingSources)                   │
│  - ~/.claude/CLAUDE.md (user-level)                     │
│  - {project}/.claude/CLAUDE.md (project-level)          │
│  - {project}/CLAUDE.md (project root)                   │
├─────────────────────────────────────────────────────────┤
│  Skills Metadata (appended)                             │
│  - Skill names, descriptions, and paths                 │
│  - Instructions to read SKILL.md when triggered         │
└─────────────────────────────────────────────────────────┘
```

### Setting Sources

```typescript
settingSources: ['user', 'project', 'local']
```

| Source    | Location                          | Purpose                        |
|-----------|-----------------------------------|--------------------------------|
| `user`    | `~/.claude/`                      | Global user settings & skills  |
| `project` | `{cwd}/.claude/`                  | Project-specific settings      |
| `local`   | `{cwd}/.claude/settings.local.*`  | Local overrides (gitignored)   |

## Tools Configuration

Tools are configured in `server/query-worker.ts`:

```typescript
const allTools = [
  "Read",       // Read files from filesystem
  "Write",      // Write files to filesystem
  "Edit",       // Edit existing files (find/replace)
  "Bash",       // Execute shell commands
  "Glob",       // Find files by pattern
  "Grep",       // Search file contents
  "WebFetch",   // Fetch and analyze web pages
  "WebSearch",  // Search the web
  "TodoWrite",  // Manage task lists
];
```

### Tool Permissions

Tools can require user confirmation before execution:

```typescript
const requireConfirmation = permissionSettings?.requireConfirmation || [];
const autoAllowedTools = allTools.filter(t => !requireConfirmation.includes(t));
```

The `canUseTool` callback handles permission requests for tools in `requireConfirmation`.

## Skills System

Skills extend Claude's capabilities with domain-specific knowledge and procedures.

### Three-Level Loading

Skills follow a progressive disclosure pattern to minimize context usage:

| Level | When Loaded | Content | Token Cost |
|-------|-------------|---------|------------|
| **Level 1** | Always (startup) | Name + description from YAML frontmatter | ~100 tokens/skill |
| **Level 2** | When triggered | Full SKILL.md body | < 5k tokens |
| **Level 3** | As needed | Additional files in skill directory | Unlimited |

### Skill Discovery

Skills are loaded from two locations:

```
~/.claude/skills/           # Global skills (user-level)
{project}/.claude/skills/   # Project skills
```

Each skill is a directory containing at minimum a `SKILL.md` file:

```
skills/
├── my-skill/
│   ├── SKILL.md           # Required: main instructions
│   ├── helper.py          # Optional: scripts
│   └── templates/         # Optional: resources
│       └── example.md
```

### SKILL.md Format

```markdown
---
name: my-skill
description: Brief description of when to use this skill
---

# My Skill

Detailed instructions for Claude to follow...
```

### Level 1: Metadata Injection

At startup, skill metadata is injected into the system prompt:

```typescript
function buildSkillsMetadataPrompt(skills: SkillInfo[]): string {
  // Builds XML-formatted skills list with name, description, path
  // Instructs Claude to read SKILL.md when task matches description
}
```

The injected prompt looks like:

```xml
<skills>
You have access to the following skills...

<available_skills>
<skill name="my-skill" path="/path/to/SKILL.md">
Brief description of when to use this skill
</skill>
</available_skills>

IMPORTANT SKILL INSTRUCTIONS:
- When a task matches a skill's description, IMMEDIATELY use Read tool...
</skills>
```

### Level 2: On-Demand Loading

When Claude determines a skill is relevant, it reads the full SKILL.md via the `Read` tool. This content then enters the context window with full instructions.

### Level 3: Resource Access

Skills can reference additional files which Claude reads as needed:
- Additional markdown docs (REFERENCE.md, GUIDE.md)
- Scripts to execute via Bash
- Templates and examples

## Debugging

The Session Debug panel (sliders icon in chat toolbar) shows:

1. **SDK Init Data** - cwd, model, tools, skills reported by SDK
2. **CLAUDE.md** - Project instructions content
3. **Injected Skills Prompt** - Exact text appended to system prompt
4. **Full Skill Contents** - Complete SKILL.md for each skill
5. **Raw Chat Context** - All messages in conversation

## References

- [Claude Agent SDK - Skills](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Claude Agent SDK - System Prompts](https://platform.claude.com/docs/en/agent-sdk/modifying-system-prompts)
- [Claude Code Skills Deep Dive](https://mikhail.io/2025/10/claude-code-skills/)
