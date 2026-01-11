#!/usr/bin/env node
/**
 * Test connection to user's Chrome via CDP
 * Verifies that Chrome is running with remote debugging enabled
 */

const { chromium } = require("playwright");

const CDP_URL = "http://localhost:9222";

async function main() {
  console.log(`Attempting to connect to Chrome at ${CDP_URL}...`);
  console.log("");

  try {
    // First, check if anything is listening on the port
    const response = await fetch(`${CDP_URL}/json/version`).catch(() => null);

    if (!response) {
      console.error("ERROR: Cannot reach Chrome on port 9222");
      console.error("");
      console.error("Make sure Chrome is running with remote debugging:");
      console.error("  bash ~/.claude/skills/browser-agent/scripts/launch-chrome.sh");
      process.exit(1);
    }

    const versionInfo = await response.json();
    console.log("Chrome is running!");
    console.log(`  Browser: ${versionInfo.Browser}`);
    console.log(`  Protocol: ${versionInfo["Protocol-Version"]}`);
    console.log("");

    // Connect via Playwright
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();

    console.log(`Connected via Playwright!`);
    console.log(`  Contexts: ${contexts.length}`);

    // List open tabs
    let totalPages = 0;
    for (const context of contexts) {
      const pages = context.pages();
      totalPages += pages.length;
    }

    console.log(`  Open tabs: ${totalPages}`);
    console.log("");

    // List the tabs
    if (totalPages > 0) {
      console.log("Open tabs:");
      for (const context of contexts) {
        for (const page of context.pages()) {
          const title = await page.title().catch(() => "(untitled)");
          const url = page.url();
          console.log(`  - ${title}`);
          console.log(`    ${url}`);
        }
      }
    }

    console.log("");
    console.log("Connection successful! Browser Agent is ready to use.");

    // Don't close - we're just testing connection
    await browser.close();
  } catch (error) {
    console.error("ERROR:", error.message);
    console.error("");
    console.error("Make sure Chrome is running with remote debugging:");
    console.error("  bash ~/.claude/skills/browser-agent/scripts/launch-chrome.sh");
    process.exit(1);
  }
}

main();
