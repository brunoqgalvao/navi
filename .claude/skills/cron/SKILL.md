---
name: cron
description: Schedule recurring or one-shot tasks for Navi. Use when the user wants to set up reminders, scheduled queries, periodic checks, or automated workflows that run at specific times.
tools: Read, Write, Bash
default-enabled: true
---

# Cron Skill - Scheduled Tasks for Navi

Schedule tasks that run at specific times or intervals. Jobs persist across restarts and can trigger Claude queries, run commands, or send notifications.

## Quick Start

### One-Shot Reminder (in 20 minutes)

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Check build status",
    "schedule": {"kind": "at", "time": "'$(date -v+20M -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "payload": {"kind": "query", "message": "Check if the build completed successfully"},
    "deleteAfterRun": true
  }'
```

### Recurring Job (every day at 9 AM)

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning standup prep",
    "schedule": {"kind": "cron", "expression": "0 9 * * *", "timezone": "America/New_York"},
    "payload": {"kind": "query", "message": "Summarize my git activity from yesterday and list any open PRs"}
  }'
```

### Interval Job (every 30 minutes)

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Health check",
    "schedule": {"kind": "every", "interval": 1800000},
    "payload": {"kind": "command", "command": "curl -s http://localhost:3000/health"}
  }'
```

---

## API Reference

### List Jobs

```bash
curl http://localhost:3001/api/cron/jobs
```

Response:
```json
[
  {
    "id": "job_abc123",
    "name": "Morning standup prep",
    "schedule": {"kind": "cron", "expression": "0 9 * * *"},
    "payload": {"kind": "query", "message": "..."},
    "enabled": true,
    "lastRun": 1704067200000,
    "nextRun": 1704153600000,
    "runCount": 5
  }
]
```

### Create Job

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Job name",
    "schedule": {...},
    "payload": {...}
  }'
```

### Get Job Details

```bash
curl http://localhost:3001/api/cron/jobs/{jobId}
```

### Update Job

```bash
curl -X PATCH http://localhost:3001/api/cron/jobs/{jobId} \
  -H "Content-Type: application/json" \
  -d '{"name": "New name", "enabled": false}'
```

### Delete Job

```bash
curl -X DELETE http://localhost:3001/api/cron/jobs/{jobId}
```

### Run Job Now (Manual Trigger)

```bash
curl -X POST http://localhost:3001/api/cron/jobs/{jobId}/run
```

### Get Job Run History

```bash
curl "http://localhost:3001/api/cron/jobs/{jobId}/runs?limit=20"
```

---

## Schedule Types

### One-Shot (`at`)

Run once at a specific time:

```json
{
  "kind": "at",
  "time": "2024-01-15T09:00:00Z"
}
```

- ISO 8601 format
- If no timezone specified, treated as UTC
- Supports relative times via helper: `$(date -v+1H -u +%Y-%m-%dT%H:%M:%SZ)`

### Interval (`every`)

Run repeatedly at fixed intervals:

```json
{
  "kind": "every",
  "interval": 3600000
}
```

- Interval in milliseconds
- Common values:
  - 5 minutes: `300000`
  - 30 minutes: `1800000`
  - 1 hour: `3600000`
  - 1 day: `86400000`

### Cron Expression (`cron`)

Standard 5-field cron:

```json
{
  "kind": "cron",
  "expression": "0 9 * * 1-5",
  "timezone": "America/New_York"
}
```

Format: `minute hour day-of-month month day-of-week`

Common patterns:
| Expression | Description |
|------------|-------------|
| `0 9 * * *` | Every day at 9 AM |
| `0 9 * * 1-5` | Weekdays at 9 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 */2 * * *` | Every 2 hours |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 18 * * 5` | Every Friday at 6 PM |

---

## Payload Types

### Query (`query`)

Send a message to Claude in a specific session:

```json
{
  "kind": "query",
  "message": "Check the deployment status",
  "sessionId": "session_abc123",
  "projectId": "project_xyz"
}
```

- If `sessionId` omitted, creates a new session
- If `projectId` omitted, uses first project or creates "Scheduled Tasks" project

### Command (`command`)

Run a shell command:

```json
{
  "kind": "command",
  "command": "npm run build",
  "cwd": "/path/to/project",
  "captureOutput": true
}
```

- Output is logged to job run history
- Failed commands mark the run as failed

### Notification (`notification`)

Show a toast notification:

```json
{
  "kind": "notification",
  "title": "Reminder",
  "message": "Time to take a break!",
  "type": "info"
}
```

Types: `info`, `success`, `warning`, `error`

### Webhook (`webhook`)

POST to an external URL:

```json
{
  "kind": "webhook",
  "url": "https://example.com/webhook",
  "method": "POST",
  "headers": {"Authorization": "Bearer xxx"},
  "body": {"event": "scheduled_check"}
}
```

---

## Job Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Human-readable job name |
| `schedule` | object | required | When to run |
| `payload` | object | required | What to do |
| `enabled` | boolean | `true` | Whether job is active |
| `deleteAfterRun` | boolean | `false` | Delete after successful one-shot |
| `retryOnFailure` | boolean | `false` | Retry failed runs |
| `maxRetries` | number | `3` | Max retry attempts |
| `timeout` | number | `60000` | Timeout in ms |

---

## Common Workflows

### Morning Briefing

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning briefing",
    "schedule": {"kind": "cron", "expression": "0 8 * * 1-5", "timezone": "America/Los_Angeles"},
    "payload": {
      "kind": "query",
      "message": "Good morning! Please:\n1. Check my calendar for today\n2. Summarize unread emails\n3. List any failing CI builds\n4. Show my open PRs"
    }
  }'
```

### Periodic Code Review Reminder

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PR review reminder",
    "schedule": {"kind": "cron", "expression": "0 14 * * *"},
    "payload": {
      "kind": "query",
      "message": "Check GitHub for any PRs assigned to me that need review"
    }
  }'
```

### Build Watcher

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Watch production build",
    "schedule": {"kind": "every", "interval": 300000},
    "payload": {
      "kind": "command",
      "command": "curl -sf https://myapp.com/health || echo FAILED",
      "captureOutput": true
    }
  }'
```

### One-Time Deployment Reminder

```bash
# Reminder in 2 hours
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Deploy reminder",
    "schedule": {"kind": "at", "time": "'$(date -v+2H -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "payload": {"kind": "notification", "title": "Deploy Time", "message": "Ready to deploy v2.0?", "type": "info"},
    "deleteAfterRun": true
  }'
```

### Weekly Metrics Report

```bash
curl -X POST http://localhost:3001/api/cron/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly metrics",
    "schedule": {"kind": "cron", "expression": "0 10 * * 1", "timezone": "UTC"},
    "payload": {
      "kind": "query",
      "message": "Generate a weekly metrics report: commits, PRs merged, issues closed, and cost analysis from Navi"
    }
  }'
```

---

## CLI Helper Script

For convenience, you can use this helper script:

```bash
# Save as ~/.local/bin/navi-cron (make executable)

#!/bin/bash
NAVI_API="${NAVI_API:-http://localhost:3001}"

case "$1" in
  list)
    curl -s "$NAVI_API/api/cron/jobs" | jq
    ;;
  add)
    shift
    curl -s -X POST "$NAVI_API/api/cron/jobs" \
      -H "Content-Type: application/json" \
      -d "$1" | jq
    ;;
  delete)
    curl -s -X DELETE "$NAVI_API/api/cron/jobs/$2" | jq
    ;;
  run)
    curl -s -X POST "$NAVI_API/api/cron/jobs/$2/run" | jq
    ;;
  enable)
    curl -s -X PATCH "$NAVI_API/api/cron/jobs/$2" \
      -H "Content-Type: application/json" \
      -d '{"enabled": true}' | jq
    ;;
  disable)
    curl -s -X PATCH "$NAVI_API/api/cron/jobs/$2" \
      -H "Content-Type: application/json" \
      -d '{"enabled": false}' | jq
    ;;
  *)
    echo "Usage: navi-cron {list|add|delete|run|enable|disable} [args]"
    ;;
esac
```

---

## Storage

Jobs are persisted at: `~/.claude-code-ui/cron/jobs.json`
Run history at: `~/.claude-code-ui/cron/runs/`

---

## Tips

1. **Use timezones** - Always specify timezone for cron expressions to avoid surprises
2. **Test first** - Use the manual run endpoint to test before relying on schedule
3. **Check runs** - Review run history to debug failed jobs
4. **One-shot cleanup** - Use `deleteAfterRun` for reminders to avoid clutter
5. **Batch morning tasks** - Combine multiple checks into one morning briefing job
6. **Use intervals for monitoring** - Cron expressions have 1-minute minimum granularity; use `every` for faster polling

---

## Comparison: When to Use What

| Need | Use |
|------|-----|
| Run once at specific time | `schedule.kind: "at"` |
| Run every N minutes/hours | `schedule.kind: "every"` |
| Run at specific times (daily/weekly) | `schedule.kind: "cron"` |
| Have Claude analyze something | `payload.kind: "query"` |
| Run a shell command | `payload.kind: "command"` |
| Just show a notification | `payload.kind: "notification"` |
| Trigger external service | `payload.kind: "webhook"` |
