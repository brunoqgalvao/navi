---
name: agent-browser
description: Fast CLI browser automation using Vercel's agent-browser. Use when you need quick browser automation with accessibility tree snapshots, @ref element targeting, semantic locators, multi-session parallel browsing, console/network monitoring, or GIF recording. Full feature parity with Claude Code Chrome extension.
tools: Bash
---

# Agent-Browser Skill

A blazing-fast Rust CLI for browser automation, optimized for AI agents. Features accessibility tree snapshots with `@ref` element references for precise targeting.

**Full feature parity with Claude Code Chrome extension** - console logs, network monitoring, tab management, GIF recording, and more.

## When to Use This vs Other Browser Skills

| Skill | Best For |
|-------|----------|
| **agent-browser** | Fast CLI commands, @ref targeting, parallel sessions, console/network debugging, GIF recording |
| **playwright** | Complex multi-step JS flows, custom test scripts |
| **browser-agent** | User's Chrome with autofill (passwords/cards) - for authenticated sessions |

## Installation

```bash
# Install globally
npm install -g agent-browser

# Install browser (Chromium)
agent-browser install

# For GIF recording, ensure ffmpeg is installed
brew install ffmpeg  # macOS
```

Verify installation:
```bash
agent-browser --version
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| **Navigation** | |
| Open URL | `agent-browser open <url>` |
| Go back/forward | `agent-browser back` / `agent-browser forward` |
| Reload | `agent-browser reload` |
| **Snapshots & Info** | |
| Accessibility snapshot | `agent-browser snapshot` |
| Interactive elements only | `agent-browser snapshot -i` |
| Get page title | `agent-browser get title` |
| Get page URL | `agent-browser get url` |
| **Interaction** | |
| Click by @ref | `agent-browser click @e5` |
| Click by text | `agent-browser click "text=Sign up"` |
| Fill input | `agent-browser fill @e3 "value"` |
| Type text | `agent-browser type "hello"` |
| Press key | `agent-browser press Enter` |
| Hover | `agent-browser hover @e3` |
| **Debugging** | |
| View console logs | `agent-browser console` |
| View errors | `agent-browser errors` |
| Network requests | `agent-browser network requests` |
| Start trace | `agent-browser trace start` |
| Stop trace | `agent-browser trace stop ./trace.zip` |
| **Capture** | |
| Screenshot | `agent-browser screenshot /tmp/shot.png` |
| Full page | `agent-browser screenshot /tmp/full.png --full` |
| PDF | `agent-browser pdf /tmp/page.pdf` |
| Record GIF | `bash ~/.claude/skills/agent-browser/scripts/record-gif.sh <duration> <output>` |
| **Tabs** | |
| List tabs | `agent-browser tab list` |
| New tab | `agent-browser tab new [url]` |
| Switch tab | `agent-browser tab <index>` |
| Close tab | `agent-browser tab close [index]` |
| **Browser** | |
| Close browser | `agent-browser close` |

---

## Core Workflow: Snapshot → Interact

The key feature is the accessibility tree snapshot with `@ref` references:

```bash
# 1. Open a page
agent-browser open https://example.com/login

# 2. Get the accessibility snapshot
agent-browser snapshot
```

Output:
```
@e1 heading "Sign In"
@e2 textbox "Email" [focused]
@e3 textbox "Password"
@e4 button "Sign In"
@e5 link "Forgot password?"
```

```bash
# 3. Interact using @ref
agent-browser fill @e2 "user@example.com"
agent-browser fill @e3 "mypassword"
agent-browser click @e4
```

### Snapshot Options

```bash
# Interactive elements only (buttons, links, inputs)
agent-browser snapshot -i

# Compact (remove empty structural elements)
agent-browser snapshot -c

# Limit depth
agent-browser snapshot -d 3

# Scope to CSS selector
agent-browser snapshot -s ".main-content"

# JSON output for parsing
agent-browser snapshot --json
```

---

## Debugging (Console, Errors, Network)

### Console Logs

View browser console output (log, warn, error, info):

```bash
# View all console logs
agent-browser console

# Clear and view fresh logs
agent-browser console --clear

# JSON output
agent-browser console --json
```

### Page Errors

View JavaScript errors:

```bash
agent-browser errors
agent-browser errors --clear
```

### Network Monitoring

Capture and inspect network requests:

```bash
# View all captured requests
agent-browser network requests

# Filter by URL pattern
agent-browser network requests --filter "api"

# Clear request log
agent-browser network requests --clear

# JSON output
agent-browser network requests --json
```

### Network Interception

Mock or block requests:

```bash
# Block API calls
agent-browser network route "**/api/*" --abort

# Mock response
agent-browser network route "**/data.json" --body '{"mock": true}'

# Remove route
agent-browser network unroute
agent-browser network unroute "**/api/*"
```

### Trace Recording

Record a Playwright trace for detailed debugging:

```bash
# Start recording
agent-browser trace start

# ... do stuff ...

# Stop and save
agent-browser trace stop ./my-trace.zip

# Open with: npx playwright show-trace ./my-trace.zip
```

---

## Tab Management

```bash
# List all tabs
agent-browser tab list

# Open new tab
agent-browser tab new
agent-browser tab new https://google.com

# Switch to tab by index
agent-browser tab 0
agent-browser tab 2

# Close current tab
agent-browser tab close

# Close specific tab
agent-browser tab close 1
```

---

## GIF Recording

Record browser interactions as animated GIFs:

```bash
# Record for 5 seconds
bash ~/.claude/skills/agent-browser/scripts/record-gif.sh 5 /tmp/demo.gif

# Record for 10 seconds at higher quality
bash ~/.claude/skills/agent-browser/scripts/record-gif.sh 10 /tmp/demo.gif 15
```

The script captures screenshots at regular intervals and assembles them into a GIF using ffmpeg.

### Manual GIF Recording

For more control:

```bash
# 1. Start your actions
agent-browser open https://example.com

# 2. Take screenshots during interaction
for i in {1..20}; do
  agent-browser screenshot /tmp/frame-$i.png
  sleep 0.2
done

# 3. Assemble into GIF
ffmpeg -framerate 5 -i /tmp/frame-%d.png -vf "scale=800:-1" /tmp/demo.gif
```

---

## Screenshots & PDF

### Screenshots

```bash
# Viewport screenshot
agent-browser screenshot /tmp/viewport.png

# Full page screenshot
agent-browser screenshot /tmp/full.png --full

# With custom viewport first
agent-browser set viewport 1920 1080
agent-browser screenshot /tmp/desktop.png
```

### PDF

```bash
agent-browser pdf /tmp/page.pdf
```

---

## Element Interaction

### Click

```bash
# By @ref (from snapshot)
agent-browser click @e5

# By text
agent-browser click "text=Submit"

# By role
agent-browser click "role=button[name=Submit]"

# By CSS selector
agent-browser click "css=#submit-btn"

# By placeholder
agent-browser click "placeholder=Search..."

# Double-click
agent-browser dblclick @e3
```

### Fill & Type

```bash
# Fill (clear first, then type)
agent-browser fill @e2 "user@example.com"
agent-browser fill "css=#email" "user@example.com"

# Type (append to existing)
agent-browser type "Additional text"

# Press special keys
agent-browser press Enter
agent-browser press Tab
agent-browser press Control+a
agent-browser press Escape
```

### Other Interactions

```bash
# Hover
agent-browser hover @e3

# Focus
agent-browser focus @e2

# Check/uncheck
agent-browser check @e7
agent-browser uncheck @e7

# Select dropdown
agent-browser select @e6 "option-value"

# Upload files
agent-browser upload @e8 /path/to/file.pdf

# Drag and drop
agent-browser drag @e1 @e5

# Scroll
agent-browser scroll down 500
agent-browser scroll up
agent-browser scrollintoview @e10
```

---

## Get Element Info

```bash
# Get text content
agent-browser get text @e1

# Get HTML
agent-browser get html @e1

# Get input value
agent-browser get value @e2

# Get attribute
agent-browser get attr href @e5

# Get page title
agent-browser get title

# Get current URL
agent-browser get url

# Count elements
agent-browser get count "css=.item"

# Get bounding box
agent-browser get box @e3
```

## Check Element State

```bash
agent-browser is visible @e1
agent-browser is enabled @e2
agent-browser is checked @e3
```

---

## Semantic Locators (find)

Find elements by semantic properties:

```bash
# By role
agent-browser find role button click --name Submit
agent-browser find role link click --name Home

# By text
agent-browser find text "Sign In" click

# By label
agent-browser find label "Email address" fill "user@example.com"

# By placeholder
agent-browser find placeholder "Search..." fill "query"

# By test ID
agent-browser find testid "submit-btn" click

# First/last/nth
agent-browser find first "css=.item" click
agent-browser find last "css=.item" click
agent-browser find nth "css=.item" 3 click
```

---

## Browser Settings

```bash
# Set viewport
agent-browser set viewport 1920 1080
agent-browser set viewport 375 812  # Mobile

# Emulate device
agent-browser set device "iPhone 14"
agent-browser set device "iPad Pro 11"
agent-browser set device "Pixel 7"

# Geolocation
agent-browser set geo 37.7749 -122.4194  # San Francisco

# Offline mode
agent-browser set offline on
agent-browser set offline off

# Custom headers (for API auth)
agent-browser set headers '{"Authorization": "Bearer token123"}'

# HTTP credentials (basic auth)
agent-browser set credentials username password

# Color scheme
agent-browser set media dark
agent-browser set media light
```

---

## Multi-Session (Parallel Browsing)

Run multiple isolated browser sessions:

```bash
# Session 1: Research
agent-browser --session research open https://docs.example.com
agent-browser --session research snapshot

# Session 2: Testing
agent-browser --session testing open http://localhost:3000
agent-browser --session testing screenshot /tmp/test.png

# Session 3: Monitoring
agent-browser --session monitor open https://status.example.com
agent-browser --session monitor console

# List all sessions
agent-browser session list

# Each session is isolated - close individually
agent-browser --session research close
agent-browser --session testing close
agent-browser --session monitor close
```

---

## Waiting

```bash
# Wait for element
agent-browser wait "css=.loaded"
agent-browser wait @e5

# Wait for navigation
agent-browser wait navigation

# Wait for network idle
agent-browser wait networkidle

# Wait with timeout (ms)
agent-browser wait "css=.result" --timeout 10000

# Wait fixed time
agent-browser wait 2000  # 2 seconds
```

---

## JavaScript Evaluation

```bash
# Execute JS and get result
agent-browser eval "document.title"
agent-browser eval "window.innerWidth"

# Scroll to bottom
agent-browser eval "window.scrollTo(0, document.body.scrollHeight)"

# Get localStorage
agent-browser eval "localStorage.getItem('token')"

# Set localStorage
agent-browser eval "localStorage.setItem('debug', 'true')"

# Get computed style
agent-browser eval "getComputedStyle(document.body).backgroundColor"
```

---

## Cookie & Storage Management

```bash
# Get all cookies
agent-browser cookies

# Get cookies as JSON
agent-browser cookies get --json

# Set cookie
agent-browser cookies set "name=value; domain=example.com; path=/"

# Clear cookies
agent-browser cookies clear

# Local storage
agent-browser storage local
agent-browser eval "localStorage.setItem('key', 'value')"
agent-browser eval "localStorage.getItem('key')"

# Session storage
agent-browser storage session
```

---

## Dialog Handling (Alerts/Confirms/Prompts)

For JavaScript dialogs, use the eval workaround:

```bash
# Override alert before triggering action
agent-browser eval "window.alert = () => {}"
agent-browser click @e5  # Button that triggers alert

# Override confirm to always accept
agent-browser eval "window.confirm = () => true"

# Override confirm to always cancel
agent-browser eval "window.confirm = () => false"

# Override prompt with custom value
agent-browser eval "window.prompt = () => 'my input'"
```

---

## Common Workflows

### Debug a Web App

```bash
# 1. Open the app
agent-browser open http://localhost:3000

# 2. Check for console errors
agent-browser console
agent-browser errors

# 3. Monitor network requests
agent-browser network requests

# 4. Take screenshot
agent-browser screenshot /tmp/debug.png
```

### Login Flow

```bash
agent-browser open https://example.com/login
agent-browser snapshot -i
agent-browser fill @e2 "user@example.com"
agent-browser fill @e3 "password123"
agent-browser click @e4
agent-browser wait navigation
agent-browser screenshot /tmp/logged-in.png
```

### Test Form Validation

```bash
agent-browser open https://example.com/signup
agent-browser snapshot -i

# Submit empty form
agent-browser click @e5  # Submit button

# Check for error messages
agent-browser snapshot -i
agent-browser console
agent-browser screenshot /tmp/validation-errors.png
```

### Record a Demo

```bash
# Start recording
agent-browser open https://example.com
bash ~/.claude/skills/agent-browser/scripts/record-gif.sh 10 /tmp/demo.gif &

# Perform actions
agent-browser snapshot -i
agent-browser click @e2
agent-browser fill @e3 "demo input"
agent-browser click @e4

# GIF will be saved when recording completes
```

### Parallel Research

```bash
# Open multiple docs in parallel sessions
agent-browser --session docs1 open https://docs.python.org
agent-browser --session docs2 open https://docs.rust-lang.org
agent-browser --session docs3 open https://docs.deno.com

# Get snapshots from each
agent-browser --session docs1 snapshot > /tmp/python-docs.txt
agent-browser --session docs2 snapshot > /tmp/rust-docs.txt
agent-browser --session docs3 snapshot > /tmp/deno-docs.txt

# Clean up
agent-browser --session docs1 close
agent-browser --session docs2 close
agent-browser --session docs3 close
```

### Visual Regression Testing

```bash
# Before changes
agent-browser open http://localhost:3000
agent-browser screenshot /tmp/before.png

# After changes (rebuild app)
agent-browser reload
agent-browser screenshot /tmp/after.png

# Compare visually
```

---

## Headed Mode (Visible Browser)

By default, agent-browser runs headless. To see the browser:

```bash
agent-browser open https://example.com --headed
```

---

## Using User's Chrome Profile

To use the user's Chrome with saved passwords/sessions:

```bash
# macOS
agent-browser open https://example.com \
  --executable-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Note: For full autofill support with saved passwords/cards, use the `browser-agent` skill instead.

---

## Tips

1. **Always snapshot first** to get @ref values for the current page state
2. **Use `--json`** for machine-parseable output
3. **Use `-i` (interactive)** snapshot for cleaner output
4. **Multi-session** for parallel tasks that don't interfere
5. **Semantic locators** are more stable than CSS selectors
6. **@ref values change** when the page updates - re-snapshot after navigation
7. **Check console/errors** when something isn't working
8. **Use traces** for complex debugging sessions

## Troubleshooting

### "Browser not found"
```bash
agent-browser install
```

### "Element not found"
```bash
# Re-snapshot to get current refs
agent-browser snapshot
```

### "Timeout waiting for element"
```bash
# Increase timeout
agent-browser wait "css=.slow-element" --timeout 30000
```

### "Session not found"
```bash
# Sessions close automatically - reopen if needed
agent-browser --session mysession open https://example.com
```

### Dialog blocks interaction
```bash
# Override dialogs before they appear
agent-browser eval "window.alert = () => {}"
agent-browser eval "window.confirm = () => true"
```
