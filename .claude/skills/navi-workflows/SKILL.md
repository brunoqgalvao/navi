---
name: navi-workflows
description: Create, edit, run, pause, resume, and inspect Navi workflows and their run history. Use when the user asks about scheduled workflows, recurring agents, workflow runs, workflow debugging, or workflow automation inside Navi.
allowed-tools: Bash, Read
default-enabled: true
---

# Navi Workflows

Use this skill for Navi workflow CRUD, manual runs, schedule changes, and run-history inspection.

## Mental Model

- A **workflow** belongs to a project and stores a reusable prompt, schedule, optional gate, and notes.
- Each workflow has a **root session**. That root session holds the workflow summary.
- Every execution creates a **child run session** under that root session.
- **Run history** is available as child run sessions in the session tree and via `GET /api/workflows/{workflowId}/runs`.
- **There is no workflows GUI** (removed 2026-08): no sidebar section, editor, or monitor view. This skill and the REST API are the only way to manage workflows — that's why this skill matters.

## API Base

Discover the right Navi base URL before using curl:

```bash
NAVI_BASE=$(curl -s http://localhost:3001/api/navi-url 2>/dev/null | jq -r '.apiUrl' || echo "http://localhost:3011")
```

Examples below use `$NAVI_BASE`.

## Quick Reference

| Action | Endpoint | Method |
|---|---|---|
| List workflows for a project | `/api/projects/{projectId}/workflows` | `GET` |
| Create workflow | `/api/projects/{projectId}/workflows` | `POST` |
| Get workflow | `/api/workflows/{workflowId}` | `GET` |
| Update workflow | `/api/workflows/{workflowId}` | `PATCH` |
| Delete workflow | `/api/workflows/{workflowId}` | `DELETE` |
| Run workflow now | `/api/workflows/{workflowId}/run` | `POST` |
| Get run history | `/api/workflows/{workflowId}/runs?limit=25` | `GET` |
| Open workflow/root run session in UI | `/api/ui/navigate` | `POST` |

## Workflow Object

Create and update payloads support:

```json
{
  "name": "Daily triage",
  "prompt": "Review overnight errors and summarize the highest priority issues.",
  "schedule": { "kind": "cron", "expression": "0 9 * * 1-5", "timezone": "America/New_York" },
  "gate": { "kind": "none" },
  "enabled": true,
  "collapsed": true,
  "learningNotes": "Prefer backend incidents first.",
  "feedbackNotes": "Keep summaries under 10 bullets.",
  "model": "claude-sonnet-4-5",
  "backend": "claude"
}
```

Important fields:

- `schedule.kind`: `"at"`, `"every"`, or `"cron"`
- `gate.kind`: `"none"` or `"command"`
- `enabled`: pause/resume switch
- `rootSessionId`: returned on reads; use it to inspect the workflow's root session in Navi

## Schedule Shapes

One-shot:

```json
{ "kind": "at", "time": "2026-03-08T14:00:00Z" }
```

Interval:

```json
{ "kind": "every", "interval": 3600000 }
```

Cron:

```json
{ "kind": "cron", "expression": "0 9 * * 1-5", "timezone": "America/New_York" }
```

Guidance:

- Prefer explicit `timezone` on cron schedules.
- `every.interval` is milliseconds and must be at least `1000`.
- The workflow API validates cron expressions as standard 5-field cron.

## Gates

No gate:

```json
{ "kind": "none" }
```

Command gate:

```json
{ "kind": "command", "command": "test -f .env", "cwd": "/path/to/project" }
```

Behavior:

- If the gate command exits `0`, the run proceeds.
- Non-zero exit skips the run and records `lastSkipReason`.

## Common Tasks

### 1. List Existing Workflows

Always check for an existing workflow before creating a duplicate.

```bash
curl "$NAVI_BASE/api/projects/$PROJECT_ID/workflows"
```

### 2. Create a Workflow

```bash
curl -X POST "$NAVI_BASE/api/projects/$PROJECT_ID/workflows" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Inbox sweep",
    "prompt": "Review recent messages, reply where needed, and leave a concise transcript.",
    "schedule": { "kind": "every", "interval": 14400000 },
    "gate": { "kind": "none" },
    "enabled": true,
    "collapsed": true
  }'
```

### 3. Update a Workflow

Patch only the fields you want to change:

```bash
curl -X PATCH "$NAVI_BASE/api/workflows/$WORKFLOW_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "feedbackNotes": "Do not message users after 6 PM local time."
  }'
```

Useful updates:

- Pause: `{ "enabled": false }`
- Resume: `{ "enabled": true }`
- Rename: `{ "name": "New name" }`
- Change schedule: `{ "schedule": { ... } }`

### 4. Run a Workflow Immediately

```bash
curl -X POST "$NAVI_BASE/api/workflows/$WORKFLOW_ID/run"
```

### 5. Inspect Run History

```bash
curl "$NAVI_BASE/api/workflows/$WORKFLOW_ID/runs?limit=10"
```

Each run includes:

- `status`: `running`, `success`, `failed`, or `skipped`
- `trigger_source`: `manual` or `scheduled`
- `session_id`: child session for that run
- `session`: session metadata when available

If you need the actual transcript for a run, inspect the run session via the regular session APIs after getting `session_id`.

### 6. Open the Workflow in the Navi UI

Navigate to the workflow root session:

```bash
curl -X POST "$NAVI_BASE/api/ui/navigate" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"sessionId\":\"$ROOT_SESSION_ID\"}"
```

Navigate to a specific run session:

```bash
curl -X POST "$NAVI_BASE/api/ui/navigate" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"sessionId\":\"$RUN_SESSION_ID\"}"
```

## Debugging Workflow Problems

When a workflow is not behaving correctly:

1. Read the workflow DTO with `GET /api/workflows/{workflowId}`.
2. Check `lastError`, `lastSkipReason`, `enabled`, and `nextRunAt`.
3. Inspect recent runs with `GET /api/workflows/{workflowId}/runs`.
4. If a run has `session_id`, inspect that session to see the transcript and outputs.
5. If needed, patch the workflow rather than creating a duplicate replacement.

## Deletion

Deleting a workflow also deletes:

- the workflow root session
- all child run sessions
- all stored run history

Use delete only when the user clearly wants the workflow removed:

```bash
curl -X DELETE "$NAVI_BASE/api/workflows/$WORKFLOW_ID"
```

## Agent Behavior

- Read existing workflows first unless the user explicitly says to create a new one.
- Prefer updating an existing workflow over creating near-duplicates.
- When reporting status, include `workflowId`, `rootSessionId`, and the next run time if available.
- When the user asks about "workflow history", check both the `/runs` endpoint and the child run sessions in the sidebar.
