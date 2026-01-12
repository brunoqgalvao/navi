---
name: linear
description: Access Linear for issue management, project tracking, and sprint workflows. Use when the user asks about Linear issues, wants to create/update issues, check sprints, or manage projects. Requires Linear API key in Settings > Integrations.
tools: Bash
model: sonnet
---

# Linear Skill

Access Linear to manage issues, projects, cycles (sprints), and team workflows.

## Prerequisites

Linear API key must be configured in **Settings > Integrations > Linear**.

Check if connected:
```bash
curl -s http://localhost:3001/api/credentials/linear | jq '.hasCredentials'
```

If `false`, guide user to Settings > Integrations to add their Linear API key.

## Using Linear

When Linear credentials are configured and the session has the Linear MCP loaded, you'll have access to Linear MCP tools.

### Available MCP Tools

If the Linear MCP is loaded, you'll have these tools available:
- `linear_getViewer` - Get current user info
- `linear_listIssues` - List issues with filters
- `linear_searchIssues` - Search issues by query
- `linear_getIssue` - Get issue details
- `linear_createIssue` - Create new issues
- `linear_updateIssue` - Update existing issues
- `linear_listTeams` - List teams
- `linear_listProjects` - List projects
- `linear_listCycles` - List cycles/sprints

### Check If MCP Is Available

The Linear MCP is loaded automatically when:
1. Linear API key is configured in Settings > Integrations
2. The session was started AFTER the key was added

If you don't see `linear_*` tools in your available tools, the user may need to:
1. Add their Linear API key in Settings > Integrations
2. Start a new session (MCP servers are loaded at session start)

## Issue Identifiers

Linear issues have two IDs:
- `id`: UUID (e.g., `a1b2c3d4-...`)
- `identifier`: Human-readable (e.g., `ENG-123`, `BUG-456`)

Always use the human-readable identifier when discussing issues with users.

## Priority Values

- 0: No priority
- 1: Urgent
- 2: High
- 3: Medium
- 4: Low

## Workflow States

Common states (names vary by team):
- **Backlog**: Not started, in backlog
- **Todo**: Ready to work on
- **In Progress**: Currently being worked on
- **In Review**: Awaiting review
- **Done**: Completed
- **Canceled**: Won't be done

## Error Handling

If you encounter errors:
1. Check credentials: `curl http://localhost:3001/api/credentials/linear | jq`
2. Test connection: `curl -X POST http://localhost:3001/api/credentials/linear/test`
3. If not connected, tell user: "Please connect Linear in Settings > Integrations"
4. If connected but no tools: "Please start a new session to load the Linear MCP"

## Example User Prompts

Once connected, users can ask:
- "Show my Linear issues"
- "What's in the current sprint?"
- "Create a bug: Login button broken on mobile"
- "Update ENG-123 to In Progress"
- "Add a comment to BUG-456"
- "Search Linear for 'authentication'"
- "Show me high priority issues assigned to me"
