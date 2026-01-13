---
name: notion
description: Access Notion for reading/writing pages and databases. Use when the user asks about Notion pages, databases, or wants to create/update content. Requires Notion integration token in Settings > Integrations.
tools: Bash
model: sonnet
---

# Notion Skill

Access Notion to read pages, query databases, create content, and manage workspace information.

> **IMPORTANT**: This is Navi, not Claude Code CLI. Do NOT suggest `claude mcp add` commands.
> If not connected, guide user to **Settings > Integrations** or use the `connect-notion` skill.

## Prerequisites

Notion integration token must be configured in **Settings > Integrations > Notion**.

Check if connected:
```bash
curl -s http://localhost:3001/api/credentials/notion | jq '.hasCredentials'
```

If `false`, guide user to Settings > Integrations to add their Notion integration token.

## Using Notion

When Notion credentials are configured and the session has the Notion MCP loaded, you'll have access to Notion MCP tools.

### Available MCP Tools

If the Notion MCP is loaded, you'll have these tools available:

**Pages:**
- `notion_search` - Search across all connected pages and databases
- `notion_get_page` - Get page content and properties
- `notion_create_page` - Create new pages
- `notion_update_page` - Update page properties

**Databases:**
- `notion_query_database` - Query databases with filters and sorts
- `notion_get_database` - Get database schema and properties
- `notion_create_database_item` - Add new rows to databases

**Blocks:**
- `notion_get_block_children` - Get page content blocks
- `notion_append_block_children` - Add content to pages

### Check If MCP Is Available

The Notion MCP is loaded automatically when:
1. Notion integration token is configured in Settings > Integrations
2. The session was started AFTER the token was added

If you don't see `notion_*` tools in your available tools, the user may need to:
1. Add their Notion integration token in Settings > Integrations
2. Start a new session (MCP servers are loaded at session start)

## CRITICAL: Pages Must Be Connected to Integration

**This is the #1 issue with Notion integrations!**

Notion integrations can only access pages they're explicitly connected to. If a user reports empty results or "page not found" errors, remind them:

1. Open the page/database in Notion
2. Click the **•••** menu (top right)
3. Click **Connect to** → Select their integration (e.g., "Navi")
4. Repeat for EACH page/database they want to access

**Parent pages don't automatically share with child pages** - users must connect each specific page or database they want you to see.

## Page and Database IDs

Notion objects use UUID format:
- Example: `a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6`
- Users can find IDs in page URLs: `notion.so/Page-Title-{ID}`

## Error Handling

If you encounter errors:
1. **401 Unauthorized**: Check credentials: `curl http://localhost:3001/api/credentials/notion | jq`
2. **Test connection**: `curl -X POST http://localhost:3001/api/credentials/notion/test`
3. **Empty results**: Tell user: "The integration can't see any pages. Please connect the integration to your pages in Notion (••• menu → Connect to)"
4. **"object not found"**: "That page isn't connected to the integration. Please share it (••• menu → Connect to)"
5. **403 Forbidden**: "The integration doesn't have permission for that operation. Check capabilities in Notion integration settings"
6. **If not connected**: "Please connect Notion in Settings > Integrations"
7. **If connected but no tools**: "Please start a new session to load the Notion MCP"

## Database Queries

When querying databases, you can use:
- **Filters**: Property-based conditions (equals, contains, before, after, etc.)
- **Sorts**: Order by properties (ascending/descending)
- **Pagination**: Use `start_cursor` for results beyond 100 items

Example filters:
- Status equals "Done": `{"property": "Status", "status": {"equals": "Done"}}`
- Created this week: `{"property": "Created", "created_time": {"past_week": {}}}`

## Block Types

When creating or appending content, common block types:
- `paragraph` - Text paragraphs
- `heading_1`, `heading_2`, `heading_3` - Headers
- `bulleted_list_item` - Bullet points
- `numbered_list_item` - Numbered lists
- `to_do` - Checkboxes
- `code` - Code blocks
- `quote` - Blockquotes

## Example User Prompts

Once connected, users can ask:
- "What's in my Product Roadmap database?"
- "Create a new meeting notes page for today"
- "Search Notion for 'Q1 planning'"
- "Add a task to my Tasks database: Review PR #123"
- "Show me all pages tagged 'engineering'"
- "What are the incomplete items in my Todo database?"
- "Create a page in my Knowledge Base about API design"
- "Update the status of the Launch Plan page to 'In Progress'"
