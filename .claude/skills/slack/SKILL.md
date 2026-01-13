---
name: slack
description: Access Slack for reading messages and posting to channels. Use when the user asks about Slack messages, channels, or wants to post updates. Requires Slack bot token in Settings > Integrations.
tools: Bash
model: sonnet
---

# Slack Skill

Access Slack to read messages, post to channels, search conversations, and interact with your workspace.

> **IMPORTANT**: This is Navi, not Claude Code CLI. Do NOT suggest `claude mcp add` commands.
> If not connected, guide user to **Settings > Integrations** or use the `connect-slack` skill.

## Prerequisites

Slack bot token must be configured in **Settings > Integrations > Slack**.

Check if connected:
```bash
curl -s http://localhost:3001/api/credentials/slack | jq '.hasCredentials'
```

If `false`, guide user to Settings > Integrations to add their Slack bot token.

## Using Slack

When Slack credentials are configured, you can use the Slack API through the integrations framework.

### Available Operations

With a properly configured Slack bot token, you can:

**Messages:**
- Read channel message history
- Post messages to channels
- Reply to messages in threads
- Add emoji reactions
- Search messages across workspace

**Channels:**
- List public and private channels
- Get channel information
- Join channels (if bot has permission)
- View channel members

**Users:**
- List workspace users
- Get user profiles
- Check user presence (online/away)

**Search:**
- Search messages by keyword
- Search files shared in workspace

### Check If Integration Is Available

The Slack integration is available when:
1. Slack bot token is configured in Settings > Integrations
2. The bot has been installed to the workspace

If integration is not working, the user may need to:
1. Add their Slack bot token in Settings > Integrations
2. Ensure the bot has required OAuth scopes
3. Verify the bot is installed to their workspace

## IMPORTANT: Bot Must Be Invited to Channels

**This is critical for channel access!**

The bot can only read and post in channels it's been added to. If a user reports "channel_not_found" or empty message results, remind them:

1. Go to the channel in Slack
2. Type `/invite @BotName` (replace with their bot's name)
3. Or: Click channel settings → Integrations → Add apps → Select bot

**The bot cannot see channels it hasn't been invited to**, even if it has the right scopes!

## Channel Identifiers

Slack channels can be referenced by:
- **Channel ID**: Unique identifier (e.g., `C01234ABCD`)
- **Channel name**: Without the # symbol (e.g., `engineering` not `#engineering`)

Channel IDs are more reliable and don't change if channel is renamed.

## Required OAuth Scopes

The bot token must have these scopes (configured when creating the Slack app):

**Essential:**
- `channels:read` - View basic channel info
- `chat:write` - Send messages
- `users:read` - View user profiles

**Recommended:**
- `channels:history` - Read channel messages
- `groups:read` - Access private channels
- `search:read` - Search messages
- `reactions:write` - Add reactions
- `files:read` - Access shared files

If operations fail due to missing scopes, the user needs to:
1. Go to **api.slack.com/apps** → Their app
2. **OAuth & Permissions** → **Bot Token Scopes**
3. Add the missing scope
4. **Reinstall the app** to workspace
5. Update the token in Navi (Settings > Integrations)

## Error Handling

If you encounter errors:
1. **`invalid_auth`**: Check credentials: `curl http://localhost:3001/api/credentials/slack | jq`
2. **Test connection**: `curl -X POST http://localhost:3001/api/credentials/slack/test`
3. **`not_in_channel`**: Tell user: "The bot needs to be invited to this channel. Type `/invite @BotName` in the channel"
4. **`channel_not_found`**: "Please check the channel name or ID. Make sure the bot is a member of this channel"
5. **`missing_scope`**: "The bot doesn't have permission for that action. Please add the required scope in your Slack app settings"
6. **`ratelimited`**: "Slack rate limit reached. Please wait a moment and try again"
7. **If not connected**: "Please connect Slack in Settings > Integrations"
8. **Empty results**: "The bot might not be in any channels yet. Invite it to channels using `/invite @BotName`"

## Message Formatting

When posting messages, you can use Slack's markdown-like formatting:
- `*bold*` - Bold text
- `_italic_` - Italic text
- `~strike~` - Strikethrough
- `` `code` `` - Inline code
- ` ```code block``` ` - Multi-line code
- `<url|text>` - Links
- `<@U12345>` - Mention users
- `<#C12345>` - Reference channels

## Threading

To reply in a thread, use the `thread_ts` (thread timestamp) of the parent message. This keeps conversations organized and doesn't clutter the main channel.

## Rate Limits

Slack has rate limits:
- **Tier 1** methods (posting messages): 1 request per second
- **Tier 2** methods (reading data): Higher limits
- **Tier 3** methods (search): Lower limits

If rate limited, wait and retry. Batch operations when possible.

## Example User Prompts

Once connected, users can ask:
- "What's been discussed in #engineering today?"
- "Post a message to #general: Team standup in 10 minutes"
- "Who's online in the workspace?"
- "Search Slack for 'deployment'"
- "Show me recent messages mentioning 'bug' in #dev-ops"
- "List all public channels"
- "Add a reaction to the latest message in #announcements"
- "Reply in the thread about the API docs"
