#!/usr/bin/env node
/**
 * Playwright Screenshot Script
 * Takes screenshots of web pages with various options.
 *
 * Usage:
 *   node screenshot.js <url> [output] [options]
 *
 * Options:
 *   --full-page          Capture full scrollable page
 *   --width <n>          Viewport width (default: 1280)
 *   --height <n>         Viewport height (default: 720)
 *   --element <selector> Screenshot only this element
 *   --device <name>      Emulate device (e.g., "iPhone 14")
 *   --wait-network       Wait for network to be idle
 *   --wait-for <sel>     Wait for element to appear
 *   --delay <ms>         Wait fixed time before screenshot
 *   --color-scheme <s>   Force light/dark mode
 *   --quality <n>        JPEG quality (0-100)
 */

const { chromium, devices } = require("playwright");

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log(`
Playwright Screenshot Script

Usage:
  node screenshot.js <url> [output] [options]

Arguments:
  url      The URL to screenshot (required)
  output   Output file path (default: /tmp/screenshot-{timestamp}.png)

Options:
  --full-page          Capture full scrollable page
  --width <n>          Viewport width (default: 1280)
  --height <n>         Viewport height (default: 720)
  --element <selector> Screenshot only this element
  --device <name>      Emulate device (e.g., "iPhone 14", "iPad Pro 11")
  --wait-network       Wait for network to be idle
  --wait-for <sel>     Wait for element to appear
  --delay <ms>         Wait fixed time before screenshot
  --color-scheme <s>   Force light or dark mode
  --quality <n>        JPEG quality 0-100 (only for .jpg files)

Examples:
  node screenshot.js http://localhost:3000
  node screenshot.js http://localhost:3000 /tmp/home.png --full-page
  node screenshot.js http://localhost:3000 /tmp/mobile.png --device "iPhone 14"
  node screenshot.js http://localhost:3000 /tmp/dark.png --color-scheme dark
`);
    process.exit(0);
  }

  // Parse arguments
  const url = args[0];
  let output = `/tmp/screenshot-${Date.now()}.png`;
  const options = {
    fullPage: false,
    width: 1280,
    height: 720,
    element: null,
    device: null,
    waitNetwork: false,
    waitFor: null,
    delay: 0,
    colorScheme: null,
    quality: undefined,
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--full-page") {
      options.fullPage = true;
    } else if (arg === "--width" && args[i + 1]) {
      options.width = parseInt(args[++i], 10);
    } else if (arg === "--height" && args[i + 1]) {
      options.height = parseInt(args[++i], 10);
    } else if (arg === "--element" && args[i + 1]) {
      options.element = args[++i];
    } else if (arg === "--device" && args[i + 1]) {
      options.device = args[++i];
    } else if (arg === "--wait-network") {
      options.waitNetwork = true;
    } else if (arg === "--wait-for" && args[i + 1]) {
      options.waitFor = args[++i];
    } else if (arg === "--delay" && args[i + 1]) {
      options.delay = parseInt(args[++i], 10);
    } else if (arg === "--color-scheme" && args[i + 1]) {
      options.colorScheme = args[++i];
    } else if (arg === "--quality" && args[i + 1]) {
      options.quality = parseInt(args[++i], 10);
    } else if (!arg.startsWith("--")) {
      output = arg;
    }

    i++;
  }

  // Validate URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.error("Error: URL must start with http:// or https://");
    process.exit(1);
  }

  let browser;
  try {
    // Launch browser
    browser = await chromium.launch();

    // Configure context options
    const contextOptions = {};

    if (options.device && devices[options.device]) {
      Object.assign(contextOptions, devices[options.device]);
    } else if (options.device) {
      console.warn(`Warning: Device "${options.device}" not found. Using default viewport.`);
      console.log("Available devices include: iPhone 14, iPhone 14 Pro, iPad Pro 11, Pixel 7, etc.");
    }

    if (!options.device) {
      contextOptions.viewport = {
        width: options.width,
        height: options.height,
      };
    }

    if (options.colorScheme) {
      contextOptions.colorScheme = options.colorScheme;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Navigate to URL
    console.log(`Navigating to: ${url}`);
    const waitUntil = options.waitNetwork ? "networkidle" : "domcontentloaded";
    await page.goto(url, { waitUntil, timeout: 30000 });

    // Wait for specific element if requested
    if (options.waitFor) {
      console.log(`Waiting for element: ${options.waitFor}`);
      await page.waitForSelector(options.waitFor, { timeout: 10000 });
    }

    // Additional delay if requested
    if (options.delay > 0) {
      console.log(`Waiting ${options.delay}ms...`);
      await page.waitForTimeout(options.delay);
    }

    // Take screenshot
    const screenshotOptions = {
      path: output,
      fullPage: options.fullPage,
    };

    if (options.quality !== undefined && output.endsWith(".jpg")) {
      screenshotOptions.quality = options.quality;
    }

    if (options.element) {
      console.log(`Taking element screenshot: ${options.element}`);
      const element = await page.$(options.element);
      if (!element) {
        console.error(`Error: Element "${options.element}" not found`);
        process.exit(1);
      }
      await element.screenshot(screenshotOptions);
    } else {
      console.log(`Taking ${options.fullPage ? "full page" : "viewport"} screenshot...`);
      await page.screenshot(screenshotOptions);
    }

    console.log(`Screenshot saved: ${output}`);

    await browser.close();
  } catch (error) {
    console.error("Error:", error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
