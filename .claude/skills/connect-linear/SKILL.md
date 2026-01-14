# Connect Linear Skill

Guide users through connecting Linear to Navi using OAuth 2.1. No API keys required!

> **IMPORTANT**: This is Navi, not Claude Code CLI. Do NOT suggest `claude mcp add` commands.
> Linear's MCP server uses **OAuth 2.1 with dynamic client registration** - authentication is handled automatically when you connect.
> Simply enable the Linear MCP server and you'll be prompted to authenticate via your browser.

## Trigger Phrases
- "connect linear"
- "setup linear"
- "add linear integration"
- "linear oauth"

## What Linear Enables
- Create, update, and close issues
- Search and filter issues across projects
- Manage projects, cycles, and roadmaps
- View team workload and priorities
- Link issues to code changes (PRs, commits)
- Access team and user information

## Authentication

Linear MCP uses **OAuth 2.1 with dynamic client registration**. This means:

- **No API keys to copy or manage**
- **No need to create personal access tokens**
- **The MCP server handles the OAuth flow automatically**

### How It Works

1. Enable the Linear MCP server in Navi's settings
2. When you first use a Linear tool, you'll be redirected to Linear's OAuth page
3. Click **Allow** to grant Navi access to your workspace
4. That's it! The MCP server stores the OAuth token securely

### OAuth Benefits

- **Security**: No API keys stored in Navi's database
- **Revocable**: Revoke access anytime from your Linear settings
- **Scoped**: You choose what permissions to grant
- **Refreshable**: Tokens auto-refresh when expired
- **Dynamic Client Registration**: No app registration needed

## Setup Steps

1. **Enable the MCP server**: Go to Navi Settings → Integrations → Linear
2. **Toggle "Enable MCP server"**: This activates the Linear MCP connection
3. **Use a Linear tool**: Try asking Navi to search your Linear workspace
4. **Complete OAuth**: You'll be redirected to Linear - click "Allow"
5. **Done!**: Start using Linear tools immediately

## Testing the Connection

After enabling the MCP server, try:

```bash
# Ask Navi to search Linear
"Show me my assigned issues in Linear"

# Or use a Linear tool directly
"What teams do I have access to in Linear?"
```

If the OAuth flow completed successfully, you'll see results from your workspace.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Not authenticated" | OAuth not completed | Use a Linear tool to trigger the OAuth flow |
| "Access denied" | OAuth was declined | Re-run the OAuth flow and click Allow |
| "No workspace found" | No Linear access | Ensure you have a Linear account with workspace access |

## Linear MCP Quick Reference

The Linear MCP server (`https://mcp.linear.app/sse`) provides:

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

1. **Check if MCP server is enabled**: Look in Navi Settings → Integrations
2. **Guide to enable**: If not enabled, tell user to enable Linear MCP
3. **Trigger OAuth**: Ask user to try a Linear command
4. **Complete authentication**: User will see browser OAuth prompt
5. **Verify success**: Test with a simple search or query
6. **Confirm capabilities**: Show what they can now do

## Troubleshooting

### "I don't see the OAuth prompt"
- Make sure the Linear MCP server is enabled in settings
- Try using a Linear tool to trigger the connection
- Check that your browser allows popups/redirects

### "OAuth keeps failing"
- Clear your browser's OAuth cache: `rm -rf ~/.mcp-auth`
- Make sure you're logged into Linear in your browser
- Try revoking access from Linear settings and reconnecting

### "Can't see my workspace"
- OAuth gives access to all workspaces you're a member of
- Make sure you're logged into the correct Linear account
- Check that you have workspace permissions (not just guest access)

## Alternative: API Key Authentication

Linear MCP also supports passing OAuth tokens or API keys directly via the `Authorization: Bearer <token>` header. This is useful for:
- App users with read-only access
- Restricted API keys
- Existing Linear OAuth applications

However, for most users, the OAuth flow is recommended.

## Sources

- [Linear MCP Documentation](https://linear.app/docs/mcp)
- [MCP OAuth 2.1 Guide](https://dev.to/composiodev/mcp-oauth-21-a-complete-guide-3g91)
- [Linear OAuth Callback Example](https://kriasoft.com/oauth-callback/examples/linear.html)
