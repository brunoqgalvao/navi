---
name: git-status-reminder
description: Reminds about uncommitted changes after tool use (prompt injection)
event: PostToolUse
matcher: "Edit|Write"
type: prompt
timeout: 5000
enabled: false
---

Remember: You made changes to files. Consider committing when the task is complete.
