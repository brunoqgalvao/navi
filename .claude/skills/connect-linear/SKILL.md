# Connect Linear Skill

Guide users through connecting Linear to Navi. You have full context on Linear's API, authentication, and capabilities.

> **IMPORTANT**: This is Navi, not Claude Code CLI. Do NOT suggest `claude mcp add` commands.
> Navi has its own integration system. Use the credentials API at `localhost:3001` to save credentials.
> The MCP server loads automatically once credentials are saved.

## Trigger Phrases
- "connect linear"
- "setup linear"
- "add linear integration"
- "linear api key"

## What Linear Enables
- Create, update, and close issues
- Search and filter issues across projects
- Manage projects, cycles, and roadmaps
- View team workload and priorities
- Link issues to code changes (PRs, commits)
- Access team and user information

## Authentication

Linear uses **Personal API Keys** for authentication.

### How to Get an API Key

1. Go to **https://linear.app/settings/account/api** (or click your avatar → Settings → Account → API)
2. Under "Personal API keys", click **Create key**
3. Give it a label like "Navi"
4. Click **Create**
5. **Copy the key immediately** - it starts with `lin_api_` and you won't see it again

### Key Format
- Starts with: `lin_api_`
- Example: `lin_api_abc123def456...`

## Saving the Credential

Once the user provides their API key, save it using the credentials API:

```bash
# Save globally (all projects)
curl -X POST http://localhost:3001/api/credentials/linear \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"apiKey": "lin_api_..."}}'

# Save for current project only
curl -X POST "http://localhost:3001/api/credentials/linear?projectId=PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"apiKey": "lin_api_..."}, "scope": "project"}'
```

## Testing the Connection

After saving, test the credentials:

```bash
curl -X POST http://localhost:3001/api/credentials/linear/test
```

A successful response includes the user's name:
```json
{"success": true, "provider": "linear", "message": "Connected as Bruno Galvao"}
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Invalid API key | Check key format, regenerate if needed |
| "API key not found" | Key not saved | Ensure POST succeeded |
| Network error | Linear API unreachable | Check internet connection |

## Linear API Quick Reference

The Linear MCP (via SSE at `mcp.linear.app/mcp`) provides these capabilities:

### Issues
- `linear_createIssue` - Create new issues
- `linear_updateIssue` - Update existing issues
- `linear_searchIssues` - Search with filters
- `linear_getIssue` - Get issue by ID

### Projects & Cycles
- `linear_listProjects` - List all projects
- `linear_listCycles` - List sprints/cycles
- `linear_getCurrentCycle` - Get active sprint

### Teams
- `linear_listTeams` - List all teams
- `linear_getTeam` - Get team details

## Example Prompts After Setup

Once connected, users can try:
- "Show me my assigned issues in Linear"
- "Create a bug report: Login button not working on mobile"
- "What's in the current sprint?"
- "Close issue ENG-123 as completed"
- "Show issues assigned to me that are high priority"

## Workflow

1. **Check if already connected**: `GET /api/credentials/linear`
2. **Guide to API key page**: https://linear.app/settings/account/api
3. **Wait for key**: User copies and pastes `lin_api_...`
4. **Validate format**: Must start with `lin_api_`
5. **Save credential**: POST to credentials API
6. **Test connection**: POST to test endpoint
7. **Confirm success**: Show user what they can now do
