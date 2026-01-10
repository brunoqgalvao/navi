---
name: integrations
description: Access user's OAuth-connected services (Gmail, Google Sheets, Google Drive). Use when the user wants to read emails, search inbox, read spreadsheets, or access Google Drive files. Requires connected integrations in Navi Settings.
tools: Bash
model: sonnet
---

# Integrations Skill

This skill provides access to OAuth-connected services through the `navi-integrations` CLI tool.

## Prerequisites

The user must have connected their accounts via **Navi Settings > Integrations** before you can use this skill. If commands fail with "not connected" errors, guide the user to connect their accounts first.

## Available Services

### Gmail
- Read and search emails from the user's inbox
- Great for finding specific emails, getting context from conversations

### Google Sheets
- Read spreadsheet data
- Access any sheet the user has access to

### Google Drive
- List files and folders
- Read document contents

## CLI Commands

### List Connected Integrations
```bash
bun run packages/navi-app/server/integrations/cli.ts list
```

### Gmail Operations

**List recent emails:**
```bash
bun run packages/navi-app/server/integrations/cli.ts gmail list [count]
```
Returns: Email ID, From, Subject, Date

**Read specific email:**
```bash
bun run packages/navi-app/server/integrations/cli.ts gmail read <email-id>
```
Returns: Full email headers and body text

**Search emails:**
```bash
bun run packages/navi-app/server/integrations/cli.ts gmail search "query" [count]
```
Supports Gmail search syntax like:
- `from:person@example.com`
- `subject:meeting`
- `is:unread`
- `after:2024/01/01`
- `has:attachment`

### Google Sheets Operations

**List spreadsheets:**
```bash
bun run packages/navi-app/server/integrations/cli.ts sheets list
```
Returns: Spreadsheet name, ID, last modified date

**Read spreadsheet data:**
```bash
bun run packages/navi-app/server/integrations/cli.ts sheets read <spreadsheet-id> [range]
```
- If no range specified, reads the first sheet
- Range examples: "Sheet1", "A1:D10", "Sheet2!A:B"
- Returns: Tab-separated values (TSV)

### Google Drive Operations

**List files:**
```bash
bun run packages/navi-app/server/integrations/cli.ts drive list [folder-id]
```
Returns: File name, ID, type, size

**Read file content:**
```bash
bun run packages/navi-app/server/integrations/cli.ts drive read <file-id>
```
- Google Docs exported as plain text
- Google Sheets exported as CSV
- Regular files downloaded as-is

## Usage Patterns

### Finding Recent Emails About a Topic
```bash
# Search for emails about a topic
bun run packages/navi-app/server/integrations/cli.ts gmail search "project updates from:team" 5

# Read a specific email for details
bun run packages/navi-app/server/integrations/cli.ts gmail read <email-id>
```

### Getting Data from a Spreadsheet
```bash
# Find the spreadsheet
bun run packages/navi-app/server/integrations/cli.ts sheets list

# Read specific range
bun run packages/navi-app/server/integrations/cli.ts sheets read <id> "A1:F100"
```

### Accessing Documents
```bash
# List Drive files
bun run packages/navi-app/server/integrations/cli.ts drive list

# Read a document
bun run packages/navi-app/server/integrations/cli.ts drive read <file-id>
```

## Error Handling

If you get authentication errors:
1. Check if the integration is connected: `navi-integrations list`
2. If not listed, tell the user: "I need access to Gmail/Sheets/Drive. Please connect your Google account in Navi Settings > Integrations."
3. If connected but still failing, the token may have expired - user should reconnect.

## Privacy Notes

- Only access data the user explicitly asks about
- Don't store sensitive email content
- Summarize rather than quote full emails when possible
- Ask permission before reading personal emails
