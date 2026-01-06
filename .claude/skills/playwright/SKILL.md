---
name: playwright
description: Browser automation and visual inspection using Playwright. Use when Navi needs to take screenshots, inspect web pages, test UI interactions, or visually verify what it's building.
---

# Playwright Skill

Automate browsers and visually inspect web applications. Perfect for seeing what you're building, taking screenshots, testing interactions, and debugging UI issues.

## Setup Verification

**Before any Playwright operation**, run the setup check:

```bash
bash ~/.claude/skills/playwright/scripts/setup-check.sh
```

### If Setup Fails

Guide the user through these steps:

1. **Install Playwright** (if not installed):
   ```bash
   npm install -g playwright
   # Or install locally in a project
   npm install playwright
   ```

2. **Install browsers**:
   ```bash
   npx playwright install
   # Or install specific browsers
   npx playwright install chromium
   npx playwright install firefox
   npx playwright install webkit
   ```

3. **Verify**:
   ```bash
   npx playwright --version
   ```

## Quick Reference

| Action | Script/Command |
|--------|----------------|
| Take screenshot | `node ~/.claude/skills/playwright/scripts/screenshot.js <url> [output]` |
| Full page screenshot | `node ~/.claude/skills/playwright/scripts/screenshot.js <url> --full-page` |
| Inspect page | `node ~/.claude/skills/playwright/scripts/inspect.js <url>` |
| Get page HTML | `node ~/.claude/skills/playwright/scripts/inspect.js <url> --html` |
| Check accessibility | `node ~/.claude/skills/playwright/scripts/inspect.js <url> --a11y` |
| Wait for element | `node ~/.claude/skills/playwright/scripts/inspect.js <url> --wait "selector"` |

---

## Taking Screenshots

### Basic Screenshot

Take a screenshot of any URL (local dev server or remote):

```bash
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/screenshot.png
```

### Full Page Screenshot

Capture the entire scrollable page:

```bash
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/full.png --full-page
```

### Custom Viewport

Specify viewport dimensions:

```bash
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/mobile.png --width 375 --height 812
```

### Wait Before Screenshot

Wait for network idle or specific time:

```bash
# Wait for network to be idle
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/loaded.png --wait-network

# Wait for a specific element
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/ready.png --wait-for ".loaded-indicator"

# Wait fixed time (ms)
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/delayed.png --delay 2000
```

### Element Screenshot

Screenshot a specific element:

```bash
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/element.png --element ".hero-section"
```

### Device Emulation

Emulate specific devices:

```bash
# iPhone 14
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/iphone.png --device "iPhone 14"

# iPad
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/ipad.png --device "iPad Pro 11"

# Pixel 7
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/pixel.png --device "Pixel 7"
```

---

## Page Inspection

### Get Page Structure

Analyze page structure, headings, links, and forms:

```bash
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000
```

Output includes:
- Page title and meta description
- Heading hierarchy (h1-h6)
- All links with text and href
- Form inputs with types and labels
- Interactive elements (buttons, etc.)
- Image count and alt text coverage

### Get Page HTML

Get the full rendered HTML (after JavaScript execution):

```bash
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --html
```

### Get Specific Element

Extract HTML of a specific element:

```bash
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --element ".main-content"
```

### Check Accessibility

Run accessibility checks:

```bash
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --a11y
```

Reports:
- Missing alt text on images
- Form inputs without labels
- Color contrast issues (basic)
- Missing ARIA attributes
- Keyboard navigation issues

### Wait for Element

Check if an element appears:

```bash
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --wait ".data-loaded" --timeout 10000
```

### Console Logs

Capture browser console output:

```bash
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --console
```

### Network Requests

Capture network activity:

```bash
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --network
```

---

## Interactive Testing

### Click and Screenshot

Click an element and capture the result:

```bash
node ~/.claude/skills/playwright/scripts/interact.js http://localhost:3000 \
  --click "button.submit" \
  --screenshot /tmp/after-click.png
```

### Fill Form and Submit

Fill a form and submit:

```bash
node ~/.claude/skills/playwright/scripts/interact.js http://localhost:3000 \
  --fill "#email" "test@example.com" \
  --fill "#password" "secret123" \
  --click "button[type=submit]" \
  --screenshot /tmp/form-submitted.png
```

### Hover State

Capture hover states:

```bash
node ~/.claude/skills/playwright/scripts/interact.js http://localhost:3000 \
  --hover ".dropdown-trigger" \
  --screenshot /tmp/dropdown-open.png
```

### Scroll to Element

Scroll to and screenshot:

```bash
node ~/.claude/skills/playwright/scripts/interact.js http://localhost:3000 \
  --scroll-to ".footer" \
  --screenshot /tmp/footer.png
```

---

## Common Workflows

### Visual Verification After Code Change

After making UI changes, take a screenshot to verify:

```bash
# 1. Take screenshot
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/ui-check.png

# 2. Display in Navi preview (use media block in response)
```

Then show the user using a media block:

```media
src: /tmp/ui-check.png
caption: Current UI state after changes
```

### Debug Why Something Isn't Rendering

```bash
# 1. Check console for errors
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --console

# 2. Check if element exists
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --wait ".my-component" --timeout 5000

# 3. Get the page HTML to see what's actually rendered
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:3000 --element "body" > /tmp/body.html
```

### Test Responsive Design

```bash
# Desktop
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/desktop.png --width 1920 --height 1080

# Tablet
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/tablet.png --width 768 --height 1024

# Mobile
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/mobile.png --width 375 --height 812
```

### Monitor Dev Server During Development

After starting a dev server, periodically check the UI:

```bash
# Take screenshot and check for console errors
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:5173 /tmp/dev-preview.png --wait-network
node ~/.claude/skills/playwright/scripts/inspect.js http://localhost:5173 --console
```

### Test Dark/Light Mode

```bash
# Light mode
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/light.png --color-scheme light

# Dark mode
node ~/.claude/skills/playwright/scripts/screenshot.js http://localhost:3000 /tmp/dark.png --color-scheme dark
```

---

## Direct Playwright Usage

For more complex scenarios, write inline Playwright scripts:

```javascript
// Save as /tmp/test-flow.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:3000');

  // Your custom logic
  await page.click('button.start');
  await page.waitForSelector('.result');

  await page.screenshot({ path: '/tmp/result.png' });

  // Get text content
  const text = await page.textContent('.result');
  console.log('Result:', text);

  await browser.close();
})();
```

Run with:

```bash
node /tmp/test-flow.js
```

---

## Tips

1. **Always check dev server is running** before taking screenshots
2. **Use `--wait-network`** for pages with async data loading
3. **Full page screenshots** can be very tall - use viewport screenshots for chat display
4. **Device emulation** is great for responsive testing
5. **Console capture** helps debug JavaScript errors
6. **Default output** is `/tmp/screenshot-{timestamp}.png` if no output specified

## Guidelines

1. Run setup check before first Playwright operation in a session
2. Take screenshots after significant UI changes to verify visually
3. Use element screenshots for focused UI components
4. Check console for errors when something isn't rendering correctly
5. Use network capture to debug API issues
6. Keep screenshots in `/tmp/` to avoid cluttering project directories
7. Show screenshots to the user using media blocks when relevant
