---
name: navi
description: Control the Navi GUI from Claude Code. Create/fork chats, manage projects/folders, open previews, change settings, and more. Use when Claude needs to interact with the Navi UI itself.
---

# Navi Control Skill

Control the Navi GUI directly from Claude Code. This skill lets you manage sessions, projects, folders, open previews, and configure settings programmatically.

## API Base

**Dynamic URL Discovery**: The API base URL varies depending on how Navi is running:
- Dev mode: `http://localhost:3001/api`
- Tauri app: `http://localhost:3011/api`

To discover the correct URL programmatically:
```bash
# Try dev port first, fall back to app port
NAVI_API=$(curl -s http://localhost:3001/api/navi-url 2>/dev/null | jq -r '.apiUrl' || echo "http://localhost:3011")
```

For simplicity in examples below, we use `http://localhost:3001` but substitute the correct URL for your environment.

## Quick Reference

| Action | Endpoint | Method |
|--------|----------|--------|
| **Send message to chat** | `/sessions/{id}/messages` | POST |
| **Inspect chat (lazy load)** | `/sessions/{id}/inspect` | GET |
| Create new chat | `/projects/{id}/sessions` | POST |
| Fork chat | `/sessions/{id}/fork` | POST |
| **Open preview panel** | `/ui/preview` | POST |
| **Open process/terminal logs** | `/ui/logs` | POST |
| **Navigate to project/session** | `/ui/navigate` | POST |
| **Show notification** | `/ui/notification` | POST |
| Create folder | `/folders` | POST |
| List projects | `/projects` | GET |
| **List background processes** | `/background-processes` | GET |
| **Start background process** | `/background-processes` | POST |
| **Get process output** | `/background-processes/{id}/output` | GET |
| Kill/remove process | `/background-processes/{id}` | DELETE |
| Restart process | `/background-processes/{id}/restart` | POST |

---

## Session Management

### Send Message to Session

Send a message to an existing chat session. The message will be processed by Claude:

```bash
curl -X POST http://localhost:3001/api/sessions/{sessionId}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Your message here"}'
```

Response:
```json
{
  "success": true,
  "message": "Query injected successfully. The message will be processed by Claude.",
  "sessionId": "..."
}
```

### Create New Chat Session

```bash
curl -X POST http://localhost:3001/api/projects/{projectId}/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "New Chat"}'
```

### Fork an Existing Chat

Fork from a specific message (great for exploring alternative approaches):

```bash
curl -X POST http://localhost:3001/api/sessions/{sessionId}/fork \
  -H "Content-Type: application/json" \
  -d '{"fromMessageId": "msg_123", "title": "Forked: Trying different approach"}'
```

### List Recent Sessions

```bash
curl http://localhost:3001/api/sessions/recent?limit=10
```

### Get Session Details

```bash
curl http://localhost:3001/api/sessions/{sessionId}
```

### Update Session Title

```bash
curl -X PATCH http://localhost:3001/api/sessions/{sessionId} \
  -H "Content-Type: application/json" \
  -d '{"title": "New Title"}'
```

### Pin/Unpin Session

```bash
curl -X POST http://localhost:3001/api/sessions/{sessionId}/pin \
  -H "Content-Type: application/json" \
  -d '{"pinned": true}'
```

### Favorite a Session

```bash
curl -X POST http://localhost:3001/api/sessions/{sessionId}/favorite \
  -H "Content-Type: application/json" \
  -d '{"favorite": true}'
```

### Delete Session

```bash
curl -X DELETE http://localhost:3001/api/sessions/{sessionId}
```

### Export Session as Markdown

```bash
curl http://localhost:3001/api/sessions/{sessionId}/export
```

### Inspect Session (Lazy Loading for Chat References)

Inspect a session to get metadata or content on-demand. This is the key endpoint for implementing lazy-loaded chat references - you can reference a chat without loading its full content, then inspect it when needed.

**Get metadata only (default):**
```bash
curl "http://localhost:3001/api/sessions/{sessionId}/inspect"
# or explicitly: ?scope=metadata
```

Response:
```json
{
  "metadata": {
    "id": "session-uuid",
    "title": "Chat about feature X",
    "projectId": "project-uuid",
    "projectName": "my-project",
    "projectPath": "/path/to/project",
    "messageCount": 42,
    "createdAt": 1704067200000,
    "updatedAt": 1704153600000,
    "model": "sonnet",
    "totalCostUsd": 0.0234
  }
}
```

**Get summary (first user message + last assistant message):**
```bash
curl "http://localhost:3001/api/sessions/{sessionId}/inspect?scope=summary"
```

**Get last N messages:**
```bash
curl "http://localhost:3001/api/sessions/{sessionId}/inspect?scope=last&last=5"
```

**Search within the chat:**
```bash
curl "http://localhost:3001/api/sessions/{sessionId}/inspect?scope=search&search=error+handling"
```

**Get full transcript:**
```bash
curl "http://localhost:3001/api/sessions/{sessionId}/inspect?scope=full"
```

This allows Claude to reference chats efficiently:
1. User attaches `@chat:session-id` reference
2. Claude receives only metadata (title, message count)
3. Claude inspects with appropriate scope when it needs context

---

## Project Management

### List All Projects

```bash
curl http://localhost:3001/api/projects
# Include archived:
curl "http://localhost:3001/api/projects?includeArchived=true"
```

### Create New Project

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "path": "/path/to/project", "description": "Optional description"}'
```

### Update Project

```bash
curl -X PUT http://localhost:3001/api/projects/{projectId} \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "path": "/new/path", "context_window": 200000}'
```

### Pin/Unpin Project

```bash
curl -X POST http://localhost:3001/api/projects/{projectId}/pin \
  -H "Content-Type: application/json" \
  -d '{"pinned": true}'
```

### Archive/Unarchive Project

```bash
curl -X POST http://localhost:3001/api/projects/{projectId}/archive \
  -H "Content-Type: application/json" \
  -d '{"archived": true}'
```

### Move Project to Folder

```bash
curl -X POST http://localhost:3001/api/projects/{projectId}/folder \
  -H "Content-Type: application/json" \
  -d '{"folderId": "folder_123"}'
# Remove from folder:
curl -X POST http://localhost:3001/api/projects/{projectId}/folder \
  -H "Content-Type: application/json" \
  -d '{"folderId": null}'
```

### Generate Project Summary

```bash
curl -X POST http://localhost:3001/api/projects/{projectId}/summary
```

### Delete Project

```bash
curl -X DELETE http://localhost:3001/api/projects/{projectId}
```

---

## Folder Management

### List Folders

```bash
curl http://localhost:3001/api/folders
```

### Create Folder

```bash
curl -X POST http://localhost:3001/api/folders \
  -H "Content-Type: application/json" \
  -d '{"name": "Work Projects"}'
```

### Rename Folder

```bash
curl -X PUT http://localhost:3001/api/folders/{folderId} \
  -H "Content-Type: application/json" \
  -d '{"name": "New Folder Name"}'
```

### Collapse/Expand Folder

```bash
curl -X POST http://localhost:3001/api/folders/{folderId}/collapse \
  -H "Content-Type: application/json" \
  -d '{"collapsed": true}'
```

### Delete Folder

```bash
curl -X DELETE http://localhost:3001/api/folders/{folderId}
```

---

## Messages

### List Messages in Session

```bash
curl http://localhost:3001/api/sessions/{sessionId}/messages
```

### Send a Message to Session

Send a message to an existing session and trigger Claude to respond:

```bash
curl -X POST http://localhost:3001/api/sessions/{sessionId}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Your message here"}'
```

This will:
1. Add the message to the session
2. Trigger Claude to process and respond
3. The response will be streamed to any connected UI clients

**Note:** Requires an active Navi UI connection to process the query.

### Rollback to a Message

Revert session to a previous point (deletes messages after the specified one):

```bash
curl -X POST http://localhost:3001/api/sessions/{sessionId}/rollback \
  -H "Content-Type: application/json" \
  -d '{"messageId": "msg_123"}'
```

---

## Search

### Search Sessions and Messages

```bash
curl "http://localhost:3001/api/search?q=search+term"
# Limit to project:
curl "http://localhost:3001/api/search?q=term&projectId=proj_123"
```

### Reindex Search

```bash
curl -X POST http://localhost:3001/api/search/reindex
```

---

## UI Control (Important!)

These endpoints let Claude Code directly control the Navi UI. This is what makes the skill powerful - you can open previews, navigate, and show notifications programmatically.

### Open Preview Panel

Open a URL or file in Navi's preview panel:

```bash
curl -X POST http://localhost:3001/api/ui/preview \
  -H "Content-Type: application/json" \
  -d '{"source": "http://localhost:3000"}'
```

Open a local file:

```bash
curl -X POST http://localhost:3001/api/ui/preview \
  -H "Content-Type: application/json" \
  -d '{"source": "/path/to/file.png"}'
```

### Navigate to Project or Session

Switch the UI to a specific project or session:

```bash
curl -X POST http://localhost:3001/api/ui/navigate \
  -H "Content-Type: application/json" \
  -d '{"projectId": "proj_123"}'
```

Navigate to a specific session:

```bash
curl -X POST http://localhost:3001/api/ui/navigate \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session_456"}'
```

### Show Notification

Display a toast notification in Navi:

```bash
curl -X POST http://localhost:3001/api/ui/notification \
  -H "Content-Type: application/json" \
  --data-raw '{"title":"Build Complete","message":"Your project built successfully","type":"success"}'
```

Notification types: `info`, `success`, `warning`, `error`

**IMPORTANT:** Use `--data-raw` instead of `-d` to avoid JSON parsing issues. Also avoid:
- Emojis in the JSON payload
- Apostrophes or special quotes
- Escape characters like `\'`
- Keep the JSON compact (no spaces after colons/commas works best)

### Open Terminal Panel

Open the terminal panel and optionally create a new terminal tab:

```bash
curl -X POST http://localhost:3001/api/ui/terminal \
  -H "Content-Type: application/json" \
  -d '{"cwd": "/path/to/project"}'
```

With an initial command to run:

```bash
curl -X POST http://localhost:3001/api/ui/terminal \
  -H "Content-Type: application/json" \
  -d '{"cwd": "/path/to/project", "command": "npm run dev"}'
```

Parameters:
- `cwd` - Working directory for the terminal
- `command` - Optional command to run when terminal opens
- `projectId` - Target project (uses current if not specified)
- `terminalId` - Attach to existing terminal by ID

---

## Preview Panel (Alternative Methods)

In addition to the API, you can also use these methods:

### In Your Response

Simply include a URL in your text response and the user can click to preview:

```
You can preview this at http://localhost:3000
```

### Media Display

Use a media code block to show images/audio/video inline:

~~~
```media
src: /path/to/image.png
caption: Screenshot of the result
```
~~~

---

## Permissions & Settings

### Get Permission Settings

```bash
curl http://localhost:3001/api/permissions
```

### Update Permissions

```bash
curl -X POST http://localhost:3001/api/permissions \
  -H "Content-Type: application/json" \
  -d '{
    "autoAcceptAll": false,
    "allowedTools": ["Read", "Glob", "Grep"],
    "requireConfirmation": ["Bash", "Write", "Edit"]
  }'
```

### Set Session Auto-Accept

```bash
curl -X POST http://localhost:3001/api/sessions/{sessionId}/auto-accept \
  -H "Content-Type: application/json" \
  -d '{"autoAcceptAll": true}'
```

### Set Project Auto-Accept

```bash
curl -X POST http://localhost:3001/api/projects/{projectId}/auto-accept \
  -H "Content-Type: application/json" \
  -d '{"autoAcceptAll": true}'
```

---

## CLAUDE.md Management

### Get Default CLAUDE.md

```bash
curl http://localhost:3001/api/claude-md/default
```

### Set Default CLAUDE.md

```bash
curl -X POST http://localhost:3001/api/claude-md/default \
  -H "Content-Type: application/json" \
  -d '{"content": "# Instructions\n\nBe helpful."}'
```

### Get Project CLAUDE.md

```bash
curl "http://localhost:3001/api/claude-md/project?path=/path/to/project"
```

### Set Project CLAUDE.md

```bash
curl -X POST "http://localhost:3001/api/claude-md/project?path=/path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"content": "# Project Instructions\n..."}'
```

### Initialize Project CLAUDE.md

Creates a CLAUDE.md file if it doesn't exist:

```bash
curl -X POST http://localhost:3001/api/claude-md/init \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/project"}'
```

---

## Models

### List Available Models

```bash
curl http://localhost:3001/api/models
```

---

## Cost Tracking

### Get Total Costs

```bash
curl http://localhost:3001/api/costs
```

### Get Cost Analytics

```bash
curl http://localhost:3001/api/costs/analytics
# Filter by projects:
curl "http://localhost:3001/api/costs/analytics?projectIds=proj1,proj2"
```

### Get Session Cost

```bash
curl http://localhost:3001/api/sessions/{sessionId}/cost
```

---

## Skills Management

### List All Skills

```bash
curl http://localhost:3001/api/skills
```

### Enable Skill Globally

```bash
curl -X POST http://localhost:3001/api/skills/{skillId}/enable
```

### Enable Skill for Project

```bash
curl -X POST http://localhost:3001/api/projects/{projectId}/skills/{skillId}/enable
```

### Sync Skills from Filesystem

```bash
curl -X POST http://localhost:3001/api/skills/sync-global
```

---

## Authentication

### Check Auth Status

```bash
curl http://localhost:3001/api/auth/status
```

### Set API Key

```bash
curl -X POST http://localhost:3001/api/auth/api-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sk-ant-..."}'
```

---

## Filesystem Operations

### Create Directory

```bash
curl -X POST http://localhost:3001/api/fs/mkdir \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/new/directory"}'
```

### Reveal in Finder

```bash
curl -X POST http://localhost:3001/api/fs/reveal \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/file"}'
```

---

## Common Workflows

### Start a Fresh Conversation on Same Topic

```bash
# 1. Get current session to find project
curl http://localhost:3001/api/sessions/{currentSessionId}

# 2. Create new session in same project
curl -X POST http://localhost:3001/api/projects/{projectId}/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Fresh start: Same topic"}'
```

### Fork to Try Different Approach

```bash
# Get message ID from session messages
curl http://localhost:3001/api/sessions/{sessionId}/messages

# Fork from that point
curl -X POST http://localhost:3001/api/sessions/{sessionId}/fork \
  -H "Content-Type: application/json" \
  -d '{"fromMessageId": "last_good_msg_id", "title": "Alternative: Trying X approach"}'
```

### Organize Projects into Folders

```bash
# Create folder
FOLDER=$(curl -s -X POST http://localhost:3001/api/folders \
  -H "Content-Type: application/json" \
  -d '{"name": "Client Work"}' | jq -r '.id')

# Move projects to folder
curl -X POST http://localhost:3001/api/projects/{projectId}/folder \
  -H "Content-Type: application/json" \
  -d "{\"folderId\": \"$FOLDER\"}"
```

---

## Terminal Control

Navi has full terminal control capabilities. You can create, manage, and interact with PTY terminals.

### List Active Terminals

```bash
curl http://localhost:3001/api/terminal/pty
# Filter by session:
curl "http://localhost:3001/api/terminal/pty?sessionId=session_123"
```

### Create New Terminal

```bash
curl -X POST http://localhost:3001/api/terminal/pty \
  -H "Content-Type: application/json" \
  -d '{"cwd": "/path/to/project", "sessionId": "session_123"}'
```

Response:
```json
{
  "terminalId": "pty_abc123",
  "pid": 12345
}
```

### Get Terminal Output Buffer

Retrieve recent output from a terminal (up to 500 lines):

```bash
curl http://localhost:3001/api/terminal/pty/{terminalId}/buffer
```

Response:
```json
{
  "buffer": ["$ npm run build", "Building...", "Done!"],
  "lineCount": 3
}
```

### Check Terminal for Errors

Detect common error patterns in terminal output:

```bash
curl http://localhost:3001/api/terminal/pty/{terminalId}/errors
```

Response:
```json
{
  "hasErrors": true,
  "errors": ["command not found: foobar"],
  "patterns": ["command not found"]
}
```

### Resize Terminal

```bash
curl -X POST http://localhost:3001/api/terminal/pty/{terminalId}/resize \
  -H "Content-Type: application/json" \
  -d '{"cols": 120, "rows": 40}'
```

### Kill Terminal

```bash
curl -X DELETE http://localhost:3001/api/terminal/pty/{terminalId}
```

### Run Command (Simple Execution)

For one-off commands without a full PTY:

```bash
# Start command (returns SSE stream)
curl -X POST http://localhost:3001/api/terminal/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "npm run build", "cwd": "/path/to/project"}'

# List active exec processes
curl http://localhost:3001/api/terminal/exec

# Kill exec process
curl -X DELETE http://localhost:3001/api/terminal/exec/{execId}
```

### WebSocket Terminal Control

For real-time terminal interaction, connect via WebSocket and send these messages:

```typescript
// Connect to WebSocket
const ws = new WebSocket("ws://localhost:3001/ws");

// Send input to terminal
ws.send(JSON.stringify({
  type: "terminal_input",
  terminalId: "pty_abc123",
  data: "npm run dev\n"
}));

// Attach to existing terminal
ws.send(JSON.stringify({
  type: "terminal_attach",
  terminalId: "pty_abc123"
}));

// Resize terminal
ws.send(JSON.stringify({
  type: "terminal_resize",
  terminalId: "pty_abc123",
  cols: 120,
  rows: 40
}));
```

### Terminal Control Workflow

Typical workflow for running commands from Claude Code:

```bash
# 1. Create a terminal
TERM_ID=$(curl -s -X POST http://localhost:3001/api/terminal/pty \
  -H "Content-Type: application/json" \
  -d '{"cwd": "/path/to/project"}' | jq -r '.terminalId')

# 2. Send command via WebSocket (or use exec endpoint for simple commands)

# 3. Check output buffer
curl http://localhost:3001/api/terminal/pty/$TERM_ID/buffer

# 4. Check for errors
curl http://localhost:3001/api/terminal/pty/$TERM_ID/errors

# 5. Optionally kill when done
curl -X DELETE http://localhost:3001/api/terminal/pty/$TERM_ID
```

---

---

## Background Process Management

Background processes are long-running commands (dev servers, build watchers, etc.) that run independently of the terminal. They're tracked separately and their output is stored for inspection.

### List Background Processes

```bash
curl http://localhost:3001/api/background-processes
# Filter by session:
curl "http://localhost:3001/api/background-processes?sessionId=session_123"
# Filter by status:
curl "http://localhost:3001/api/background-processes?status=running"
```

Response:
```json
[
  {
    "id": "proc_abc123",
    "type": "bash",
    "command": "npm run dev",
    "cwd": "/path/to/project",
    "pid": 12345,
    "sessionId": "session_123",
    "projectId": "project_456",
    "startedAt": 1704067200000,
    "status": "running",
    "output": ["...", "..."],
    "outputSize": 4567,
    "ports": [3000],
    "label": "Dev Server"
  }
]
```

### Start Background Process

```bash
curl -X POST http://localhost:3001/api/background-processes \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm run dev",
    "cwd": "/path/to/project",
    "sessionId": "session_123",
    "projectId": "project_456",
    "type": "dev_server",
    "label": "Frontend Dev"
  }'
```

### Get Process Details

```bash
curl http://localhost:3001/api/background-processes/{processId}
```

### Get Process Output (Logs)

Retrieve the last N lines of output from a process:

```bash
curl "http://localhost:3001/api/background-processes/{processId}/output?lines=100"
```

Response:
```json
{
  "output": ["line1", "line2", "..."],
  "totalLines": 100
}
```

### Kill a Process

```bash
curl -X DELETE http://localhost:3001/api/background-processes/{processId} \
  -H "Content-Type: application/json" \
  -d '{"signal": "SIGTERM"}'
```

### Remove Process from Tracking

```bash
curl -X DELETE http://localhost:3001/api/background-processes/{processId} \
  -H "Content-Type: application/json" \
  -d '{"remove": true}'
```

### Restart a Process

```bash
curl -X POST http://localhost:3001/api/background-processes/{processId}/restart
```

### Detect Existing Listening Processes

Find processes already listening on ports (useful for detecting orphaned dev servers):

```bash
curl http://localhost:3001/api/background-processes/detect
```

Response:
```json
[
  {"pid": 12345, "port": 3000, "command": "node"},
  {"pid": 12346, "port": 5173, "command": "bun"}
]
```

---

## Viewing Logs in Preview Panel

The logs viewer can display output from both **background processes** and **PTY terminals** in a dedicated preview panel with features like:
- Real-time auto-refresh (2s interval)
- ANSI color code rendering (toggle on/off)
- Line numbers
- Error line highlighting
- Copy/download functionality
- Process/terminal metadata (PID, status, duration, ports)

### Open Process Logs

Open a background process's logs in the preview panel:

```bash
curl -X POST http://localhost:3001/api/ui/logs \
  -H "Content-Type: application/json" \
  -d '{"processId": "proc_abc123"}'
```

### Open Terminal Logs

Open a PTY terminal's output buffer in the preview panel:

```bash
curl -X POST http://localhost:3001/api/ui/logs \
  -H "Content-Type: application/json" \
  -d '{"terminalId": "pty_xyz789"}'
```

This is useful when you want to inspect terminal output without switching to the terminal panel.

### Workflow: Monitor a Dev Server

```bash
# 1. Start a dev server as background process
PROC_ID=$(curl -s -X POST http://localhost:3001/api/background-processes \
  -H "Content-Type: application/json" \
  -d '{"command": "npm run dev", "cwd": "/my/project", "label": "Dev Server"}' | jq -r '.id')

# 2. Open logs in preview panel
curl -X POST http://localhost:3001/api/ui/logs \
  -H "Content-Type: application/json" \
  -d "{\"processId\": \"$PROC_ID\"}"

# 3. Check process status
curl http://localhost:3001/api/background-processes/$PROC_ID

# 4. Get latest output via API
curl "http://localhost:3001/api/background-processes/$PROC_ID/output?lines=50"
```

### Workflow: Debug Terminal Errors

```bash
# 1. List active terminals
curl http://localhost:3001/api/terminal/pty

# 2. Check for errors in a terminal
TERM_ID="your-terminal-id"
curl http://localhost:3001/api/terminal/pty/$TERM_ID/errors

# 3. If errors found, open logs in preview for detailed inspection
curl -X POST http://localhost:3001/api/ui/logs \
  -H "Content-Type: application/json" \
  -d "{\"terminalId\": \"$TERM_ID\"}"
```

---

## Tips

1. **Use jq** for parsing JSON responses: `curl ... | jq '.id'`
2. **Session IDs** are UUIDs like `550e8400-e29b-41d4-a716-446655440000`
3. **Forking** is non-destructive - original session remains unchanged
4. **Auto-accept** settings cascade: Session > Project > Global
5. **Search** is full-text across all sessions and messages
6. **Terminal buffer** stores up to 500 lines of output per terminal
7. **Background processes** store up to 200 lines of output each
8. **Port detection** is automatic - processes listening on ports are detected via output patterns

## Guidelines

1. Always check the response for errors before proceeding
2. Use descriptive titles when creating sessions/folders
3. Prefer forking over rollback when exploring alternatives
4. Clean up test sessions/projects when done experimenting
5. Use the preview panel for visual content rather than terminal output
6. Use terminal buffer to get context from running processes
