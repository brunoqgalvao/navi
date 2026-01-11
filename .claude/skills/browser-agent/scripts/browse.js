#!/usr/bin/env node
/**
 * Browser Agent - Control user's Chrome browser
 *
 * Usage:
 *   node browse.js <url>                          Navigate to URL
 *   node browse.js --click "selector"             Click element
 *   node browse.js --fill "selector" "value"      Fill input
 *   node browse.js --focus "selector"             Focus element (triggers autofill)
 *   node browse.js --wait-for-user "message"      Pause for user action
 *   node browse.js --wait-for "selector"          Wait for element
 *   node browse.js --screenshot /path/to/file     Take screenshot
 *   node browse.js --info                         Get page info
 */

const { chromium } = require("playwright");
const readline = require("readline");

const CDP_URL = "http://localhost:9222";

// Parse command line arguments
function parseArgs(args) {
  const result = {
    url: null,
    actions: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--click" && args[i + 1]) {
      result.actions.push({ type: "click", selector: args[++i] });
    } else if (arg === "--dblclick" && args[i + 1]) {
      result.actions.push({ type: "dblclick", selector: args[++i] });
    } else if (arg === "--fill" && args[i + 1] && args[i + 2]) {
      result.actions.push({ type: "fill", selector: args[++i], value: args[++i] });
    } else if (arg === "--type" && args[i + 1] && args[i + 2]) {
      result.actions.push({ type: "type", selector: args[++i], value: args[++i] });
    } else if (arg === "--focus" && args[i + 1]) {
      result.actions.push({ type: "focus", selector: args[++i] });
    } else if (arg === "--hover" && args[i + 1]) {
      result.actions.push({ type: "hover", selector: args[++i] });
    } else if (arg === "--press" && args[i + 1]) {
      result.actions.push({ type: "press", key: args[++i] });
    } else if (arg === "--scroll-to" && args[i + 1]) {
      result.actions.push({ type: "scroll", selector: args[++i] });
    } else if (arg === "--wait-for" && args[i + 1]) {
      const target = args[++i];
      if (target.startsWith("url=")) {
        result.actions.push({ type: "wait-url", pattern: target.slice(4) });
      } else if (target.startsWith("selector=")) {
        result.actions.push({ type: "wait-selector", selector: target.slice(9) });
      } else {
        result.actions.push({ type: "wait-selector", selector: target });
      }
    } else if (arg === "--wait-for-user" && args[i + 1]) {
      result.actions.push({ type: "wait-user", message: args[++i] });
    } else if (arg === "--wait" && args[i + 1]) {
      result.actions.push({ type: "wait-time", ms: parseInt(args[++i], 10) });
    } else if (arg === "--screenshot" && args[i + 1]) {
      result.actions.push({ type: "screenshot", path: args[++i] });
    } else if (arg === "--info") {
      result.actions.push({ type: "info" });
    } else if (arg === "--trigger-autofill") {
      result.actions.push({ type: "trigger-autofill" });
    } else if (arg === "--help") {
      result.actions.push({ type: "help" });
    } else if (!arg.startsWith("--")) {
      // Assume it's a URL if it looks like one
      if (arg.startsWith("http://") || arg.startsWith("https://")) {
        result.url = arg;
      } else if (arg.includes(".") && !arg.includes(" ")) {
        // Probably a URL without protocol
        result.url = "https://" + arg;
      }
    }

    i++;
  }

  return result;
}

// Wait for user input
function waitForUser(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("");
    console.log("=".repeat(50));
    console.log("USER ACTION REQUIRED:");
    console.log(`  ${message}`);
    console.log("=".repeat(50));
    console.log("");

    rl.question("Press ENTER when ready to continue... ", () => {
      rl.close();
      resolve();
    });
  });
}

// Get page info
async function getPageInfo(page) {
  const info = await page.evaluate(() => {
    const result = {
      url: window.location.href,
      title: document.title,
      forms: [],
      buttons: [],
      links: [],
      inputs: [],
    };

    // Forms
    document.querySelectorAll("form").forEach((form, i) => {
      result.forms.push({
        index: i,
        action: form.action,
        method: form.method,
        id: form.id || null,
      });
    });

    // Inputs
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      result.inputs.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        autocomplete: el.autocomplete || null,
      });
    });

    // Buttons
    document.querySelectorAll("button, input[type=submit], input[type=button], [role=button]").forEach((el) => {
      result.buttons.push({
        text: el.textContent?.trim().substring(0, 50) || el.value || "[no text]",
        type: el.type || null,
        id: el.id || null,
      });
    });

    // Links (first 20)
    const links = document.querySelectorAll("a[href]");
    Array.from(links)
      .slice(0, 20)
      .forEach((a) => {
        result.links.push({
          text: a.textContent?.trim().substring(0, 50) || "[no text]",
          href: a.href,
        });
      });

    if (links.length > 20) {
      result.links.push({ text: `... and ${links.length - 20} more`, href: "" });
    }

    return result;
  });

  return info;
}

// Print help
function printHelp() {
  console.log(`
Browser Agent - Control your Chrome browser

IMPORTANT: Chrome must be running with remote debugging:
  bash ~/.claude/skills/browser-agent/scripts/launch-chrome.sh

Usage:
  node browse.js <url>                          Navigate to URL
  node browse.js [actions...]                   Perform actions on current page

Navigation:
  <url>                                         Navigate to URL (http:// or https://)

Actions:
  --click <selector>                            Click an element
  --dblclick <selector>                         Double-click an element
  --fill <selector> <value>                     Clear and fill an input
  --type <selector> <value>                     Type into an element (key by key)
  --focus <selector>                            Focus an element (triggers autofill UI)
  --hover <selector>                            Hover over an element
  --press <key>                                 Press a key (Enter, Tab, Escape, etc.)
  --scroll-to <selector>                        Scroll element into view
  --trigger-autofill                            Trigger autofill on focused element

Waiting:
  --wait-for <selector>                         Wait for element to appear
  --wait-for selector=<sel>                     Wait for element (explicit)
  --wait-for url=<pattern>                      Wait for URL to contain pattern
  --wait-for-user <message>                     Pause and wait for user action
  --wait <ms>                                   Wait fixed time in milliseconds

Output:
  --screenshot <path>                           Take screenshot
  --info                                        Print page info (URL, forms, buttons, etc.)

Selectors:
  CSS selectors work:           button, #id, .class, [attr=value]
  Text selectors:               text=Sign in, text="Click here"
  XPath:                        xpath=//button[@type="submit"]

Examples:
  # Navigate and screenshot
  node browse.js https://github.com --screenshot /tmp/github.png

  # Fill a login form (let Chrome autofill password)
  node browse.js --fill "#email" "user@example.com" --focus "#password"

  # Click through OAuth
  node browse.js --click "text=Sign in with Google" --wait-for-user "Approve 2FA"

  # Chain multiple actions
  node browse.js https://example.com/signup \\
    --fill "#name" "John Doe" \\
    --fill "#email" "john@example.com" \\
    --click "button[type=submit]" \\
    --wait-for ".success-message" \\
    --screenshot /tmp/signed-up.png
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    printHelp();
    process.exit(0);
  }

  const parsed = parseArgs(args);

  if (parsed.actions.some((a) => a.type === "help")) {
    printHelp();
    process.exit(0);
  }

  // Connect to Chrome
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (error) {
    console.error("ERROR: Cannot connect to Chrome");
    console.error("");
    console.error("Make sure Chrome is running with remote debugging:");
    console.error("  bash ~/.claude/skills/browser-agent/scripts/launch-chrome.sh");
    process.exit(1);
  }

  try {
    // Get the default context and page
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      console.error("ERROR: No browser contexts found");
      process.exit(1);
    }

    const context = contexts[0];
    let page = context.pages()[0];

    // If no page, create one
    if (!page) {
      page = await context.newPage();
    }

    // Navigate if URL provided
    if (parsed.url) {
      console.log(`Navigating to: ${parsed.url}`);
      await page.goto(parsed.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      console.log(`  Page loaded: ${await page.title()}`);
    }

    // Execute actions
    for (const action of parsed.actions) {
      console.log(`Executing: ${action.type} ${action.selector || action.path || action.message || action.key || ""}`);

      try {
        switch (action.type) {
          case "click":
            await page.click(action.selector, { timeout: 10000 });
            console.log("  Clicked.");
            break;

          case "dblclick":
            await page.dblclick(action.selector, { timeout: 10000 });
            console.log("  Double-clicked.");
            break;

          case "fill":
            await page.fill(action.selector, action.value, { timeout: 10000 });
            console.log(`  Filled with: ${action.value}`);
            break;

          case "type":
            await page.type(action.selector, action.value, { timeout: 10000 });
            console.log(`  Typed: ${action.value}`);
            break;

          case "focus":
            await page.focus(action.selector, { timeout: 10000 });
            console.log("  Focused. (Check for autofill dropdown)");
            break;

          case "hover":
            await page.hover(action.selector, { timeout: 10000 });
            console.log("  Hovering.");
            break;

          case "press":
            await page.keyboard.press(action.key);
            console.log(`  Pressed: ${action.key}`);
            break;

          case "scroll":
            const element = await page.$(action.selector);
            if (element) {
              await element.scrollIntoViewIfNeeded();
              console.log("  Scrolled into view.");
            } else {
              console.log("  WARNING: Element not found.");
            }
            break;

          case "wait-selector":
            await page.waitForSelector(action.selector, { timeout: 30000 });
            console.log("  Element appeared.");
            break;

          case "wait-url":
            await page.waitForURL(`**/*${action.pattern}*`, { timeout: 30000 });
            console.log(`  URL now contains: ${action.pattern}`);
            break;

          case "wait-user":
            await waitForUser(action.message);
            console.log("  User confirmed, continuing...");
            break;

          case "wait-time":
            await page.waitForTimeout(action.ms);
            console.log(`  Waited ${action.ms}ms.`);
            break;

          case "trigger-autofill":
            // Press down arrow to trigger autofill dropdown
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(500);
            console.log("  Triggered autofill. (Look for dropdown)");
            break;

          case "screenshot":
            await page.screenshot({ path: action.path });
            console.log(`  Screenshot saved: ${action.path}`);
            break;

          case "info":
            const info = await getPageInfo(page);
            console.log("");
            console.log("=== Page Info ===");
            console.log(`URL: ${info.url}`);
            console.log(`Title: ${info.title}`);
            console.log("");

            if (info.forms.length > 0) {
              console.log(`Forms (${info.forms.length}):`);
              info.forms.forEach((f) => {
                console.log(`  [${f.index}] ${f.method} ${f.action} ${f.id ? `#${f.id}` : ""}`);
              });
              console.log("");
            }

            if (info.inputs.length > 0) {
              console.log(`Inputs (${info.inputs.length}):`);
              info.inputs.forEach((inp) => {
                const id = inp.id ? `#${inp.id}` : "";
                const name = inp.name ? `[name=${inp.name}]` : "";
                const ac = inp.autocomplete ? `(autocomplete=${inp.autocomplete})` : "";
                console.log(`  ${inp.tag}[type=${inp.type}] ${id} ${name} ${ac}`);
              });
              console.log("");
            }

            if (info.buttons.length > 0) {
              console.log(`Buttons (${info.buttons.length}):`);
              info.buttons.forEach((b) => {
                console.log(`  "${b.text}" ${b.id ? `#${b.id}` : ""}`);
              });
              console.log("");
            }

            if (info.links.length > 0) {
              console.log(`Links (${info.links.length}):`);
              info.links.forEach((l) => {
                console.log(`  "${l.text}" -> ${l.href}`);
              });
            }
            break;
        }

        // Small delay between actions
        await page.waitForTimeout(300);
      } catch (error) {
        console.error(`  ERROR: ${error.message}`);
      }
    }

    console.log("");
    console.log("Done. (Browser stays open)");

    // Disconnect without closing
    browser.close();
  } catch (error) {
    console.error("ERROR:", error.message);
    if (browser) browser.close();
    process.exit(1);
  }
}

main();
