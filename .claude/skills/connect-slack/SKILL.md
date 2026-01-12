# Connect Slack Skill

Guide users through connecting Slack to Navi. You have full context on creating Slack apps, OAuth scopes, and bot tokens.

## Trigger Phrases
- "connect slack"
- "setup slack"
- "add slack integration"
- "slack bot token"

## What Slack Enables
- Read messages from channels
- Post messages to channels
- View user profiles and presence
- Search messages and files
- React to messages
- Access workspace information

## Authentication

Slack uses **Bot User OAuth Tokens** from a Slack App.

### How to Create a Slack App and Get Token

#### Step 1: Create the App
1. Go to **https://api.slack.com/apps**
2. Click **Create New App**
3. Choose **From scratch**
4. Enter:
   - **App Name**: "Navi" (or your preference)
   - **Workspace**: Select your workspace
5. Click **Create App**

#### Step 2: Configure Bot Scopes
1. In the left sidebar, click **OAuth & Permissions**
2. Scroll to **Bot Token Scopes**
3. Click **Add an OAuth Scope** and add these:

**Required Scopes:**
- `channels:read` - View basic channel info
- `chat:write` - Send messages
- `users:read` - View user profiles

**Recommended Additional Scopes:**
- `channels:history` - Read channel messages
- `groups:read` - Access private channels (if needed)
- `search:read` - Search messages
- `reactions:write` - Add reactions
- `files:read` - Access shared files

#### Step 3: Install to Workspace
1. Scroll up to **OAuth Tokens for Your Workspace**
2. Click **Install to Workspace**
3. Review permissions and click **Allow**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Key Format
- Starts with: `xoxb-`
- Example: `xoxb-1234567890-1234567890123-abcdefghijklmnop`

## Saving the Credential

Once the user provides their bot token:

```bash
# Save globally (all projects)
curl -X POST http://localhost:3001/api/credentials/slack \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"botToken": "xoxb-..."}}'

# Save for current project only
curl -X POST "http://localhost:3001/api/credentials/slack?projectId=PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"botToken": "xoxb-..."}, "scope": "project"}'
```

## Testing the Connection

After saving, test the credentials:

```bash
curl -X POST http://localhost:3001/api/credentials/slack/test
```

A successful response:
```json
{"success": true, "provider": "slack", "message": "Connected as navi-bot (Acme Corp)"}
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_auth` | Bad token | Check token format, reinstall app |
| `missing_scope` | Scope not added | Add required scope in app settings |
| `not_in_channel` | Bot not in channel | Invite bot to channel with `/invite @Navi` |
| `channel_not_found` | Wrong channel name | Use channel ID or exact name |
| `ratelimited` | Too many requests | Wait and retry |

## Important: Bot Must Be in Channels

The bot can only read/write in channels it's been added to:
1. Go to the channel in Slack
2. Type `/invite @YourBotName` or
3. Click channel settings → Integrations → Add apps

## Slack API Quick Reference

With the bot token, you can use:

### Messages
- Post messages: `chat.postMessage`
- Read history: `conversations.history`
- Reply in thread: Use `thread_ts` parameter
- Add reactions: `reactions.add`

### Channels
- List channels: `conversations.list`
- Get channel info: `conversations.info`
- Join channel: `conversations.join`

### Users
- List users: `users.list`
- Get user info: `users.info`
- Get presence: `users.getPresence`

### Search
- Search messages: `search.messages`
- Search files: `search.files`

## Example Prompts After Setup

Once connected, users can try:
- "What's been discussed in #engineering today?"
- "Post a message to #general: Team standup in 10 minutes"
- "Who's online in the workspace?"
- "Search Slack for 'deployment'"
- "Show me recent messages mentioning 'bug'"

## Workflow

1. **Check if already connected**: `GET /api/credentials/slack`
2. **Guide to apps page**: https://api.slack.com/apps
3. **Walk through app creation**: Step by step
4. **Emphasize scopes**: List required ones
5. **Wait for token**: User copies `xoxb-...`
6. **Save credential**: POST to credentials API
7. **Test connection**: POST to test endpoint
8. **Remind about channel access**: Bot must be invited
9. **Confirm success**: Show what they can now do

## Scopes Reference

| Scope | What it allows |
|-------|---------------|
| `channels:read` | See channel list and info |
| `channels:history` | Read messages in public channels |
| `chat:write` | Send messages as the bot |
| `users:read` | See user profiles |
| `groups:read` | Access private channels |
| `search:read` | Search messages and files |
| `reactions:write` | Add emoji reactions |
| `files:read` | Access shared files |
| `im:read` | Access DMs (if needed) |
