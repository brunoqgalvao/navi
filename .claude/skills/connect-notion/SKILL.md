# Connect Notion Skill

Guide users through connecting Notion to Navi using OAuth. No API tokens required!

> **IMPORTANT**: This is Navi, not Claude Code CLI. Do NOT suggest `claude mcp add` commands.
> Notion's MCP server uses **OAuth 2.1 with dynamic client registration** - authentication is handled automatically when you connect.
> Simply enable the Notion MCP server and you'll be prompted to authenticate via your browser.

## Trigger Phrases
- "connect notion"
- "setup notion"
- "add notion integration"
- "notion oauth"

## What Notion Enables
- Read and search pages and databases
- Create and update pages
- Query database entries with filters
- Access comments and discussions
- Manage blocks within pages

## Authentication

Notion MCP uses **OAuth 2.1 with dynamic client registration**. This means:

- **No API tokens to copy or manage**
- **No need to create integrations manually**
- **The MCP server handles the OAuth flow automatically**

### How It Works

1. Enable the Notion MCP server in Navi's settings
2. When you first use a Notion tool, you'll be redirected to Notion's OAuth page
3. Click **Allow** to grant Navi access to your workspace
4. That's it! The MCP server stores the OAuth token securely

### OAuth Benefits

- **Security**: No API keys stored in Navi's database
- **Revocable**: Revoke access anytime from your Notion settings
- **Scoped**: You choose what permissions to grant
- **Refreshable**: Tokens auto-refresh when expired

## Setup Steps

1. **Enable the MCP server**: Go to Navi Settings → Integrations → Notion
2. **Toggle "Enable MCP server"**: This activates the Notion MCP connection
3. **Use a Notion tool**: Try asking Navi to search your Notion workspace
4. **Complete OAuth**: You'll be redirected to Notion - click "Allow"
5. **Done!**: Start using Notion tools immediately

## Testing the Connection

After enabling the MCP server, try:

```bash
# Ask Navi to search Notion
"Search my Notion workspace for 'project roadmap'"

# Or use a Notion tool directly
"What databases do I have access to in Notion?"
```

If the OAuth flow completed successfully, you'll see results from your workspace.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Not authenticated" | OAuth not completed | Use a Notion tool and complete the OAuth flow |
| "Access denied" | OAuth was declined | Re-run the OAuth flow and click Allow |
| "No pages found" | No workspace access | Ensure you have a Notion account with workspace access |

## Notion MCP Quick Reference

The Notion MCP server (`https://mcp.notion.com/sse`) provides:

### Pages
- `notion_search` - Search across all pages in your workspace
- `notion_get_page` - Get page content
- `notion_create_page` - Create new page
- `notion_update_page` - Update page properties

### Databases
- `notion_query_database` - Query with filters/sorts
- `notion_get_database` - Get database schema
- `notion_create_database_item` - Add new row

### Blocks
- `notion_get_block_children` - Get page content blocks
- `notion_append_block_children` - Add content to page

## Example Prompts After Setup

Once connected, users can try:
- "What's in my Product Roadmap database?"
- "Create a new meeting notes page for today"
- "Search Notion for 'Q1 planning'"
- "Add a task to my Tasks database: Review PR #123"
- "Show me recent pages I've edited"

## Workflow

1. **Check if MCP server is enabled**: Look in Navi Settings → Integrations
2. **Guide to enable**: If not enabled, tell user to enable Notion MCP
3. **Trigger OAuth**: Ask user to try a Notion command
4. **Complete authentication**: User will see browser OAuth prompt
5. **Verify success**: Test with a simple search or query
6. **Confirm capabilities**: Show what they can now do

## Troubleshooting

### "I don't see the OAuth prompt"
- Make sure the Notion MCP server is enabled in settings
- Try using a Notion tool to trigger the connection
- Check that your browser allows popups/redirects

### "OAuth keeps failing"
- Clear your browser's OAuth cache (`~/.mcp-auth` on some systems)
- Make sure you're logged into Notion in your browser
- Try revoking access from Notion settings and reconnecting

### "Can't see my pages"
- OAuth gives access to your entire workspace
- Make sure you're logged into the correct Notion account
- Check that you have workspace permissions (not just guest access)

## Sources

- [Notion MCP Documentation](https://developers.notion.com/docs/mcp)
- [MCP OAuth 2.1 Guide](https://dev.to/composiodev/mcp-oauth-21-a-complete-guide-3g91)
