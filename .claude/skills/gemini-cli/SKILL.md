---
name: gemini-cli
description: Use when the user asks to run Gemini CLI, Google Gemini for code tasks, or references Gemini for analysis, code generation, or automated editing
---

# Gemini CLI Skill Guide

## Available Models (December 2025)

| Model | Description | Best For |
|-------|-------------|----------|
| `gemini-2.5-pro` | Most capable, 1M token context | Complex tasks, large codebases (DEFAULT) |
| `gemini-2.5-flash` | Fast, efficient | Quick tasks, lower latency |
| `gemini-3-pro` | Latest agentic model | Advanced agent workflows |

## Authentication

Gemini CLI supports multiple auth methods (check with user if issues):
- **Google OAuth** (default): Free tier - 60 req/min, 1,000 req/day
- **API Key**: `GEMINI_API_KEY` env var - Free tier 100 req/day
- **Vertex AI**: Enterprise with `GOOGLE_GENAI_USE_VERTEXAI=true`

## Running a Task

1. Ask the user which model to use (default: `gemini-2.5-pro`) in a **single prompt**.
2. Determine if task needs file writes or shell commands (affects approval mode).
3. Assemble the command:
   - `-m, --model <MODEL>` (e.g., `-m gemini-2.5-pro`)
   - `-p "PROMPT"` (non-interactive mode)
   - `--yolo` (auto-approve all actions - USE WITH CAUTION)
   - `--include-directories PATH1,PATH2` (add context directories)
   - `--output-format json` (structured output for parsing)
   - `--output-format stream-json` (real-time event streaming)
4. For scripting/automation, always use `-p` flag for non-interactive mode.
5. **After completion**: Inform user they can continue interactively with just `gemini`.

### Quick Reference

| Use case | Command |
|----------|---------|
| Interactive session | `gemini` |
| Single prompt | `gemini -p "prompt"` |
| With specific model | `gemini -m gemini-2.5-pro -p "prompt"` |
| Auto-approve (yolo) | `gemini -m gemini-2.5-pro --yolo -p "prompt"` |
| JSON output | `gemini -m gemini-2.5-pro -p "prompt" --output-format json` |
| Stream events | `gemini -m gemini-2.5-pro -p "prompt" --output-format stream-json` |
| With extra dirs | `gemini -m gemini-2.5-pro --include-directories ./src,./tests -p "prompt"` |

## Interactive Commands (in-session)

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/memory` | View/manage conversation memory |
| `/stats` | Show token usage statistics |
| `/tools` | List available tools |
| `/mcp` | Manage MCP server connections |
| `/bug` | Report issues directly |
| `@server` | Call MCP server (e.g., `@github`, `@slack`) |

## Built-in Tools

Gemini CLI has these tools enabled by default:
- **File operations**: Read/write files in working directory
- **Shell commands**: Execute terminal commands
- **Web fetch**: Retrieve web content
- **Google Search**: Grounded search for current information

## MCP Integration

Configure MCP servers in `~/.gemini/settings.json`:
```json
{
  "mcpServers": {
    "github": { "command": "mcp-server-github" },
    "slack": { "command": "mcp-server-slack" }
  }
}
```

Usage: `@github List my open pull requests`

## Project Context

Create `GEMINI.md` in project root for project-specific instructions (similar to CLAUDE.md).

## Following Up

- After task completion, offer to continue interactively or with follow-up prompts.
- For complex multi-step tasks, suggest using interactive mode.
- Mention available MCP integrations if relevant to task.

## Error Handling

- Check authentication if getting 401/403 errors.
- Verify model availability - some models require specific auth tiers.
- For quota issues, suggest switching to API key auth or waiting.
- If tools fail, check `--yolo` vs approval mode settings.
- Stop and report failures; request direction before retry.

## Comparison with Other CLIs

| Feature | Gemini CLI | Codex CLI | Claude Code |
|---------|------------|-----------|-------------|
| Free tier | 1000 req/day | ChatGPT Plus | API credits |
| Context window | 1M tokens | Varies | 200K tokens |
| Web search | Built-in | --search flag | WebSearch tool |
| MCP support | Yes | Yes | Yes |
| Session resume | Checkpoints | resume --last | --resume |
