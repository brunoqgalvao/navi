# Integration Setup Skill

Guide users through connecting integrations to Navi. Use when the user wants to connect Linear, Notion, Slack, GitHub, or Google services.

## Trigger Phrases
- "connect linear"
- "setup integration"
- "add notion"
- "connect slack"
- "setup github"
- "connect google"
- "integrate with..."

## Overview

This skill helps users connect external services to Navi. Each integration enables specific capabilities.

## Available Integrations

### Linear
- **What it enables**: Issue management, sprint tracking, project workflows
- **Auth type**: API Key
- **Setup URL**: https://linear.app/settings/account/api (Settings → Account → API)
- **Key format**: `lin_api_...`
- **Steps**:
  1. Click gear icon (bottom-left) → Settings
  2. Go to Account → API
  3. Under Personal API keys, click Create key
  4. Name it (e.g., "Navi") and click Create
  5. Copy the key immediately (you won't see it again)

### Notion
- **What it enables**: Page/database access, content management
- **Auth type**: Integration Token
- **Setup URL**: https://www.notion.so/profile/integrations
- **Key format**: `ntn_...`
- **Steps**:
  1. Go to notion.so/profile/integrations
  2. Click "New integration"
  3. Name it (e.g., "Navi") and select your workspace
  4. Click Submit
  5. Copy the "Internal Integration Secret"
  6. **CRITICAL**: Go to pages you want Navi to access
  7. Click ••• menu → Connect to → Select your integration

### Slack
- **What it enables**: Channel access, messaging, notifications
- **Auth type**: Bot Token
- **Setup URL**: https://api.slack.com/apps
- **Key format**: `xoxb-...`
- **Steps**:
  1. Go to api.slack.com/apps → Create New App
  2. Choose "From scratch", name it, select workspace
  3. Go to OAuth & Permissions (left sidebar)
  4. Under Bot Token Scopes, add: `channels:read`, `chat:write`, `users:read`
  5. Click "Install to Workspace" and authorize
  6. Copy the "Bot User OAuth Token"

### GitHub
- **What it enables**: Repo access, PR/issue management, code search
- **Auth type**: CLI (gh auth login)
- **No API key needed** - uses the `gh` CLI which should already be authenticated

### Google (OAuth)
- **What it enables**: Gmail, Calendar, Sheets, Drive
- **Auth type**: OAuth (handled by Navi's OAuth flow)
- **Setup**: Use Settings → Integrations → Google → Connect

## How to Use This Skill

When a user asks to connect an integration:

1. **Identify the provider** they want to connect
2. **Check current status** by calling the credentials API
3. **Guide them through setup** with clear step-by-step instructions
4. **Save the credential** when they provide it
5. **Test the connection** to verify it works
6. **Confirm success** and show what they can now do

## API Endpoints

### Check provider status
```bash
curl http://localhost:3001/api/credentials/{provider}
```

### Save credentials
```bash
curl -X POST http://localhost:3001/api/credentials/{provider} \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"apiKey": "the_key_here"}}'
```

For project-specific credentials:
```bash
curl -X POST "http://localhost:3001/api/credentials/{provider}?projectId={projectId}" \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"apiKey": "the_key_here"}, "scope": "project"}'
```

### Test credentials
```bash
curl -X POST http://localhost:3001/api/credentials/{provider}/test
```

### List all providers
```bash
curl http://localhost:3001/api/credentials/providers
```

## Credential Keys by Provider

| Provider | Credential Key | Example Value |
|----------|---------------|---------------|
| linear | `apiKey` | `lin_api_xxx...` |
| notion | `integrationToken` | `ntn_xxx...` |
| slack | `botToken` | `xoxb-xxx...` |
| github | (none - uses CLI) | N/A |
| google | (OAuth) | N/A |

## Example Interaction

**User**: Connect Linear

**Assistant**: I'll help you connect Linear to Navi. This will let me manage your issues, projects, and sprints.

**Step 1**: Go to https://linear.app/settings/account/security/api-keys/new

**Step 2**: Create a new API key with a label like "Navi"

**Step 3**: Copy the key (starts with `lin_api_`) and paste it here

Once you give me the key, I'll save it securely and test the connection.

---

**User**: lin_api_abc123xyz

**Assistant**: *[Saves credential via API]*

Connected successfully as [User Name]! You can now:
- "Show my Linear issues"
- "Create a bug report"
- "What's in the current sprint?"

## Scope Options

When setting up credentials, you can choose:

1. **User-level (default)**: Available across all projects
2. **Project-specific**: Only used in the current project (overrides user-level)

If the user is in a project context and wants different credentials than their default, use the project-scoped option.

## Security Notes

- Credentials are encrypted at rest using AES-256-GCM
- Stored locally in ~/.claude-code-ui/data.db
- Never log or display the actual credential values
- Test endpoint returns success/failure without exposing keys
