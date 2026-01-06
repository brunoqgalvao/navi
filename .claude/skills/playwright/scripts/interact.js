#!/usr/bin/env node
/**
 * Playwright Interaction Script
 * Performs interactions on web pages (click, fill, hover, etc.)
 *
 * Usage:
 *   node interact.js <url> [actions...] [options]
 *
 * Actions:
 *   --click <selector>        Click an element
 *   --fill <selector> <text>  Fill an input field
 *   --hover <selector>        Hover over an element
 *   --scroll-to <selector>    Scroll element into view
 *   --type <selector> <text>  Type text (key by key)
 *   --press <key>             Press a key (Enter, Tab, etc.)
 *   --select <selector> <val> Select dropdown option
 *
 * Options:
 *   --screenshot <path>       Take screenshot after actions
 *   --wait <ms>              Wait between actions (default: 500)
 *   --timeout <ms>           Action timeout (default: 5000)
 */

const { chromium } = require("playwright");

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log(`
Playwright Interaction Script

Usage:
  node interact.js <url> [actions...] [options]

Arguments:
  url      The URL to interact with (required)

Actions (can be chained):
  --click <selector>         Click an element
  --dblclick <selector>      Double-click an element
  --fill <selector> <text>   Fill an input field (clears first)
  --type <selector> <text>   Type text character by character
  --hover <selector>         Hover over an element
  --scroll-to <selector>     Scroll element into view
  --press <key>              Press a key (Enter, Tab, Escape, etc.)
  --select <selector> <val>  Select dropdown option by value
  --check <selector>         Check a checkbox
  --uncheck <selector>       Uncheck a checkbox
  --focus <selector>         Focus an element

Options:
  --screenshot <path>        Take screenshot after all actions
  --wait <ms>               Wait between actions (default: 500)
  --timeout <ms>            Action timeout (default: 5000)
  --width <n>               Viewport width (default: 1280)
  --height <n>              Viewport height (default: 720)

Examples:
  # Click a button and screenshot
  node interact.js http://localhost:3000 --click "button.submit" --screenshot /tmp/clicked.png

  # Fill and submit a form
  node interact.js http://localhost:3000 \\
    --fill "#email" "test@example.com" \\
    --fill "#password" "secret" \\
    --click "button[type=submit]" \\
    --screenshot /tmp/submitted.png

  # Hover to open dropdown
  node interact.js http://localhost:3000 \\
    --hover ".dropdown-trigger" \\
    --wait 1000 \\
    --screenshot /tmp/dropdown.png
`);
    process.exit(0);
  }

  // Parse arguments
  const url = args[0];
  const actions = [];
  let screenshot = null;
  let waitBetween = 500;
  let timeout = 5000;
  let width = 1280;
  let height = 720;

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--click" && args[i + 1]) {
      actions.push({ type: "click", selector: args[++i] });
    } else if (arg === "--dblclick" && args[i + 1]) {
      actions.push({ type: "dblclick", selector: args[++i] });
    } else if (arg === "--fill" && args[i + 1] && args[i + 2]) {
      actions.push({ type: "fill", selector: args[++i], value: args[++i] });
    } else if (arg === "--type" && args[i + 1] && args[i + 2]) {
      actions.push({ type: "type", selector: args[++i], value: args[++i] });
    } else if (arg === "--hover" && args[i + 1]) {
      actions.push({ type: "hover", selector: args[++i] });
    } else if (arg === "--scroll-to" && args[i + 1]) {
      actions.push({ type: "scroll", selector: args[++i] });
    } else if (arg === "--press" && args[i + 1]) {
      actions.push({ type: "press", key: args[++i] });
    } else if (arg === "--select" && args[i + 1] && args[i + 2]) {
      actions.push({ type: "select", selector: args[++i], value: args[++i] });
    } else if (arg === "--check" && args[i + 1]) {
      actions.push({ type: "check", selector: args[++i] });
    } else if (arg === "--uncheck" && args[i + 1]) {
      actions.push({ type: "uncheck", selector: args[++i] });
    } else if (arg === "--focus" && args[i + 1]) {
      actions.push({ type: "focus", selector: args[++i] });
    } else if (arg === "--screenshot" && args[i + 1]) {
      screenshot = args[++i];
    } else if (arg === "--wait" && args[i + 1]) {
      waitBetween = parseInt(args[++i], 10);
    } else if (arg === "--timeout" && args[i + 1]) {
      timeout = parseInt(args[++i], 10);
    } else if (arg === "--width" && args[i + 1]) {
      width = parseInt(args[++i], 10);
    } else if (arg === "--height" && args[i + 1]) {
      height = parseInt(args[++i], 10);
    }

    i++;
  }

  // Validate URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.error("Error: URL must start with http:// or https://");
    process.exit(1);
  }

  if (actions.length === 0) {
    console.error("Error: No actions specified. Use --help for usage.");
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width, height },
    });
    const page = await context.newPage();

    // Navigate
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Execute actions
    for (const action of actions) {
      console.log(`Executing: ${action.type} ${action.selector || action.key || ""} ${action.value || ""}`);

      try {
        switch (action.type) {
          case "click":
            await page.click(action.selector, { timeout });
            break;

          case "dblclick":
            await page.dblclick(action.selector, { timeout });
            break;

          case "fill":
            await page.fill(action.selector, action.value, { timeout });
            break;

          case "type":
            await page.type(action.selector, action.value, { timeout });
            break;

          case "hover":
            await page.hover(action.selector, { timeout });
            break;

          case "scroll":
            const element = await page.$(action.selector);
            if (element) {
              await element.scrollIntoViewIfNeeded();
            } else {
              console.warn(`Warning: Element not found: ${action.selector}`);
            }
            break;

          case "press":
            await page.keyboard.press(action.key);
            break;

          case "select":
            await page.selectOption(action.selector, action.value, { timeout });
            break;

          case "check":
            await page.check(action.selector, { timeout });
            break;

          case "uncheck":
            await page.uncheck(action.selector, { timeout });
            break;

          case "focus":
            await page.focus(action.selector, { timeout });
            break;
        }

        console.log(`  Done.`);
      } catch (error) {
        console.error(`  Error: ${error.message}`);
      }

      // Wait between actions
      if (waitBetween > 0) {
        await page.waitForTimeout(waitBetween);
      }
    }

    // Take screenshot if requested
    if (screenshot) {
      // Wait a bit for any animations
      await page.waitForTimeout(500);
      await page.screenshot({ path: screenshot });
      console.log(`\nScreenshot saved: ${screenshot}`);
    }

    await browser.close();
    console.log("\nAll actions completed.");
  } catch (error) {
    console.error("Error:", error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
