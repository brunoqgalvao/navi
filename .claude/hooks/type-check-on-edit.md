---
name: type-check-on-edit
description: Runs TypeScript type check after file edits in packages/navi-app
event: PostToolUse
matcher: "Edit|Write"
type: command
timeout: 60000
enabled: false
---

# Only run if file is in packages/navi-app and is .ts/.tsx/.svelte
if [[ "$FILE" == *packages/navi-app* ]] && [[ "$FILE" =~ \.(ts|tsx|svelte)$ ]]; then
  cd packages/navi-app && bun run check 2>&1 | head -20
fi
