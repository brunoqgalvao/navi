# Connect Notion Skill

Guide users through connecting Notion to Navi. You have full context on Notion's API, authentication, and the critical step of connecting integrations to pages.

## Trigger Phrases
- "connect notion"
- "setup notion"
- "add notion integration"
- "notion api token"

## What Notion Enables
- Read and search pages and databases
- Create and update pages
- Query database entries with filters
- Access comments and discussions
- Manage blocks within pages

## Authentication

Notion uses **Internal Integration Tokens** for authentication.

### How to Get an Integration Token

1. Go to **https://www.notion.so/profile/integrations**
2. Click **New integration**
3. Fill in:
   - **Name**: "Navi" (or whatever you prefer)
   - **Associated workspace**: Select your workspace
4. Click **Submit**
5. Copy the **Internal Integration Secret** (starts with `ntn_`)

### CRITICAL: Connect Integration to Pages

**This step is required!** Notion integrations can only access pages they're explicitly connected to.

For each page/database you want Navi to access:
1. Open the page in Notion
2. Click the **•••** menu (top right)
3. Click **Connect to** → Select your integration ("Navi")

Without this step, the API will return empty results!

### Key Format
- Starts with: `ntn_` (newer) or `secret_` (older)
- Example: `ntn_abc123def456...`

## Saving the Credential

Once the user provides their token:

```bash
# Save globally (all projects)
curl -X POST http://localhost:3001/api/credentials/notion \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"integrationToken": "ntn_..."}}'

# Save for current project only
curl -X POST "http://localhost:3001/api/credentials/notion?projectId=PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"integrationToken": "ntn_..."}, "scope": "project"}'
```

## Testing the Connection

After saving, test the credentials:

```bash
curl -X POST http://localhost:3001/api/credentials/notion/test
```

A successful response:
```json
{"success": true, "provider": "notion", "message": "Connected as Navi Integration"}
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Invalid token | Check token format, regenerate |
| Empty results | Page not connected | Connect integration to pages (see above) |
| 403 Forbidden | Missing capabilities | Check integration capabilities in settings |
| "object not found" | Page not shared | Connect the specific page to integration |

## Notion API Quick Reference

The Notion MCP (`@notionhq/notion-mcp-server`) provides:

### Pages
- `notion_search` - Search across all connected pages
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

1. **Check if already connected**: `GET /api/credentials/notion`
2. **Guide to integrations page**: https://www.notion.so/profile/integrations
3. **Help create integration**: Name it, select workspace
4. **Wait for token**: User copies `ntn_...` or `secret_...`
5. **IMPORTANT**: Remind to connect pages!
6. **Save credential**: POST to credentials API
7. **Test connection**: POST to test endpoint
8. **If empty results**: Re-emphasize page connection step
9. **Confirm success**: Show what they can now do

## Troubleshooting "Can't See My Pages"

This is the #1 issue with Notion integrations. Always ask:

1. "Did you connect the integration to the specific pages you want to access?"
2. "Go to the page → ••• menu → Connect to → Select 'Navi'"
3. "You need to do this for EACH page or database you want me to see"
4. "Parent pages don't automatically share with child pages - connect the specific ones you need"
