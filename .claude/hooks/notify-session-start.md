---
name: notify-session-start
description: Logs session start to console (example hook)
event: SessionStart
type: command
timeout: 5000
enabled: false
---

echo "[Hook] Session started at $(date)"
