---
name: browser-agent
description: Control the user's own Chrome browser via CDP (Chrome DevTools Protocol). Use when the user wants you to browse the web, fill forms, sign up for services, or perform actions in their authenticated browser session. This connects to THEIR Chrome with THEIR saved passwords/cards - you never see credentials.
---

# Browser Agent Skill

Control the user's Chrome browser directly. This connects to their running Chrome instance via CDP, meaning:

- **Their saved passwords** autofill automatically
- **Their saved credit cards** autofill automatically
- **Their existing sessions** (Google, GitHub, etc.) are already logged in
- **You never see credentials** - Chrome handles autofill, you just click buttons

## Prerequisites

The user must launch Chrome with remote debugging enabled:

```bash
# Launch Chrome with debugging (run this first)
bash ~/.claude/skills/browser-agent/scripts/launch-chrome.sh
```

Or manually:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
```

## Quick Reference

| Action | Command |
|--------|---------|
| Check connection | `node ~/.claude/skills/browser-agent/scripts/connect.js` |
| Browse to URL | `node ~/.claude/skills/browser-agent/scripts/browse.js <url>` |
| Click element | `node ~/.claude/skills/browser-agent/scripts/browse.js --click "selector"` |
| Fill field | `node ~/.claude/skills/browser-agent/scripts/browse.js --fill "selector" "value"` |
| Screenshot | `node ~/.claude/skills/browser-agent/scripts/browse.js --screenshot /tmp/shot.png` |
| Wait for user | `node ~/.claude/skills/browser-agent/scripts/browse.js --wait-for-user "Approve 2FA"` |
| Get page info | `node ~/.claude/skills/browser-agent/scripts/browse.js --info` |

---

## Core Concept: You Drive, Chrome Autofills

```
┌─────────────────────────────────────────┐
│  User's Chrome (port 9222)              │
│  ├── Saved passwords (autofill)         │
│  ├── Saved credit cards (autofill)      │
│  ├── Logged-in sessions                 │
│  └── 2FA prompts (user approves)        │
└──────────────────┬──────────────────────┘
                   │ CDP Connection
                   ▼
┌─────────────────────────────────────────┐
│  Browser Agent Scripts                  │
│  ├── Navigate to URLs                   │
│  ├── Click buttons/links                │
│  ├── Trigger autofill (you don't see)   │
│  ├── Wait for user actions (2FA)        │
│  └── Screenshot results                 │
└─────────────────────────────────────────┘
```

---

## Setup

### 1. Launch Chrome with Debugging

```bash
bash ~/.claude/skills/browser-agent/scripts/launch-chrome.sh
```

This launches Chrome with:
- Your existing profile (all your saved data)
- Remote debugging on port 9222
- Ready for Playwright to connect

### 2. Verify Connection

```bash
node ~/.claude/skills/browser-agent/scripts/connect.js
```

Should output: `Connected to Chrome! Found X tabs.`

---

## Usage

### Navigate to a URL

```bash
node ~/.claude/skills/browser-agent/scripts/browse.js https://github.com/signup
```

### Click an Element

```bash
# Click by text
node ~/.claude/skills/browser-agent/scripts/browse.js --click "text=Sign up"

# Click by selector
node ~/.claude/skills/browser-agent/scripts/browse.js --click "button[type=submit]"
```

### Fill a Form Field

```bash
# Fill input by selector
node ~/.claude/skills/browser-agent/scripts/browse.js --fill "#email" "user@example.com"

# Note: For password fields, use --trigger-autofill to let Chrome fill saved passwords
node ~/.claude/skills/browser-agent/scripts/browse.js --focus "#password" --trigger-autofill
```

### Trigger Password/Card Autofill

Instead of typing credentials, focus the field and let Chrome autofill:

```bash
# Focus password field - Chrome will offer to autofill
node ~/.claude/skills/browser-agent/scripts/browse.js --focus "input[type=password]"

# For credit cards, focus the card number field
node ~/.claude/skills/browser-agent/scripts/browse.js --focus "input[autocomplete=cc-number]"
```

### Wait for User Action

When 2FA or manual approval is needed:

```bash
# Pause and wait for user to complete action
node ~/.claude/skills/browser-agent/scripts/browse.js --wait-for-user "Please approve the 2FA prompt on your phone"

# Wait for specific element to appear (e.g., after login completes)
node ~/.claude/skills/browser-agent/scripts/browse.js --wait-for "selector=.dashboard"
```

### Take Screenshot

```bash
node ~/.claude/skills/browser-agent/scripts/browse.js --screenshot /tmp/current-page.png
```

### Get Page Info

```bash
node ~/.claude/skills/browser-agent/scripts/browse.js --info
```

Returns: URL, title, forms on page, clickable elements.

---

## Common Workflows

### Sign Up for a Service (with Google)

```bash
# 1. Navigate to signup
node browse.js https://example.com/signup

# 2. Click "Sign in with Google"
node browse.js --click "text=Sign in with Google"

# 3. Google OAuth opens - user is likely already logged in
#    If 2FA needed, wait for user
node browse.js --wait-for-user "Approve Google sign-in if prompted"

# 4. Wait for redirect back to the app
node browse.js --wait-for "url=example.com/dashboard"

# 5. Screenshot success
node browse.js --screenshot /tmp/signed-up.png
```

### Add Payment Method

```bash
# 1. Navigate to billing
node browse.js https://example.com/billing

# 2. Click add payment
node browse.js --click "text=Add payment method"

# 3. Focus card field to trigger Chrome's card autofill
node browse.js --focus "input[autocomplete=cc-number]"

# 4. Wait for user to select their saved card from Chrome's dropdown
node browse.js --wait-for-user "Select your saved card from Chrome's autofill dropdown"

# 5. Submit
node browse.js --click "button[type=submit]"
```

### Fill a Multi-Step Form

```bash
# Step 1: Personal info
node browse.js https://example.com/onboarding
node browse.js --fill "#name" "Bruno Galvao"
node browse.js --fill "#email" "bruno@example.com"
node browse.js --click "text=Next"

# Step 2: Maybe needs user input
node browse.js --wait-for-user "Please select your preferences"

# Step 3: Continue
node browse.js --click "text=Complete"
node browse.js --screenshot /tmp/done.png
```

---

## Chaining Actions

You can chain multiple actions in one command:

```bash
node browse.js https://example.com/login \
  --fill "#email" "user@example.com" \
  --focus "#password" \
  --wait-for-user "Let Chrome autofill your password, then press Enter" \
  --screenshot /tmp/logged-in.png
```

---

## Safety Features

1. **No credential capture** - Passwords flow through Chrome, not scripts
2. **User approval points** - `--wait-for-user` pauses for sensitive actions
3. **Visible browser** - You can see exactly what's happening
4. **Your browser, your session** - Nothing runs in a sandboxed/headless context

---

## Troubleshooting

### "Cannot connect to Chrome"

Make sure Chrome is running with remote debugging:
```bash
bash ~/.claude/skills/browser-agent/scripts/launch-chrome.sh
```

### "Port 9222 already in use"

Another Chrome debug instance may be running:
```bash
lsof -i :9222
# Kill if needed, then relaunch
```

### Autofill not triggering

- Make sure the field has proper `autocomplete` attribute
- Click/focus the field first, then wait for Chrome's dropdown
- Some sites block autofill - may need manual entry

---

## Tips

1. **Always screenshot after actions** to verify state
2. **Use `--wait-for-user`** liberally for any sensitive step
3. **Check `--info`** to understand page structure before acting
4. **Chain actions** for multi-step flows
5. **Let Chrome autofill** - don't try to type passwords/cards

## Guidelines

1. Always verify Chrome is connected before starting a flow
2. Use `--wait-for-user` for any 2FA, CAPTCHA, or sensitive confirmation
3. Screenshot at key points to verify progress
4. If something fails, get `--info` to understand page state
5. Don't rush - add small delays between actions if needed
