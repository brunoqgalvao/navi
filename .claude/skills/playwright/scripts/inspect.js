#!/usr/bin/env node
/**
 * Playwright Page Inspection Script
 * Analyzes web pages and extracts information.
 *
 * Usage:
 *   node inspect.js <url> [options]
 *
 * Options:
 *   --html             Get full rendered HTML
 *   --element <sel>    Get HTML of specific element
 *   --a11y             Run accessibility checks
 *   --wait <selector>  Wait for element, report if found
 *   --timeout <ms>     Timeout for wait (default: 5000)
 *   --console          Capture console logs
 *   --network          Capture network requests
 */

const { chromium } = require("playwright");

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log(`
Playwright Page Inspection Script

Usage:
  node inspect.js <url> [options]

Arguments:
  url      The URL to inspect (required)

Options:
  --html             Get full rendered HTML
  --element <sel>    Get HTML of specific element
  --a11y             Run accessibility checks
  --wait <selector>  Wait for element, report if found
  --timeout <ms>     Timeout for wait (default: 5000)
  --console          Capture console logs
  --network          Capture network requests
  --json             Output as JSON (for programmatic use)

Examples:
  node inspect.js http://localhost:3000
  node inspect.js http://localhost:3000 --html
  node inspect.js http://localhost:3000 --element ".main-content"
  node inspect.js http://localhost:3000 --a11y
  node inspect.js http://localhost:3000 --console --network
`);
    process.exit(0);
  }

  // Parse arguments
  const url = args[0];
  const options = {
    html: false,
    element: null,
    a11y: false,
    wait: null,
    timeout: 5000,
    console: false,
    network: false,
    json: false,
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--html") {
      options.html = true;
    } else if (arg === "--element" && args[i + 1]) {
      options.element = args[++i];
    } else if (arg === "--a11y") {
      options.a11y = true;
    } else if (arg === "--wait" && args[i + 1]) {
      options.wait = args[++i];
    } else if (arg === "--timeout" && args[i + 1]) {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === "--console") {
      options.console = true;
    } else if (arg === "--network") {
      options.network = true;
    } else if (arg === "--json") {
      options.json = true;
    }

    i++;
  }

  // Validate URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.error("Error: URL must start with http:// or https://");
    process.exit(1);
  }

  let browser;
  const consoleLogs = [];
  const networkRequests = [];

  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture console logs if requested
    if (options.console) {
      page.on("console", (msg) => {
        consoleLogs.push({
          type: msg.type(),
          text: msg.text(),
        });
      });

      page.on("pageerror", (error) => {
        consoleLogs.push({
          type: "error",
          text: error.message,
        });
      });
    }

    // Capture network requests if requested
    if (options.network) {
      page.on("request", (request) => {
        networkRequests.push({
          method: request.method(),
          url: request.url(),
          type: request.resourceType(),
        });
      });
    }

    // Navigate
    console.error(`Inspecting: ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for specific element if requested
    if (options.wait) {
      try {
        await page.waitForSelector(options.wait, { timeout: options.timeout });
        console.log(`Element found: ${options.wait}`);
      } catch {
        console.log(`Element NOT found within ${options.timeout}ms: ${options.wait}`);
      }
    }

    // Get HTML if requested
    if (options.html) {
      const html = await page.content();
      console.log(html);
      await browser.close();
      return;
    }

    // Get specific element HTML if requested
    if (options.element) {
      const element = await page.$(options.element);
      if (element) {
        const html = await element.evaluate((el) => el.outerHTML);
        console.log(html);
      } else {
        console.error(`Element not found: ${options.element}`);
      }
      await browser.close();
      return;
    }

    // Run accessibility checks if requested
    if (options.a11y) {
      const a11yResults = await page.evaluate(() => {
        const issues = [];

        // Check images without alt
        const imagesNoAlt = document.querySelectorAll('img:not([alt])');
        if (imagesNoAlt.length > 0) {
          issues.push({
            type: "error",
            message: `${imagesNoAlt.length} image(s) missing alt attribute`,
            elements: Array.from(imagesNoAlt).map((img) => img.src.substring(0, 100)),
          });
        }

        // Check images with empty alt (might be decorative, just warn)
        const imagesEmptyAlt = document.querySelectorAll('img[alt=""]');
        if (imagesEmptyAlt.length > 0) {
          issues.push({
            type: "warning",
            message: `${imagesEmptyAlt.length} image(s) with empty alt (OK if decorative)`,
          });
        }

        // Check form inputs without labels
        const inputs = document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button])");
        const inputsWithoutLabels = Array.from(inputs).filter((input) => {
          const id = input.id;
          if (!id) return !input.getAttribute("aria-label") && !input.getAttribute("aria-labelledby");
          const label = document.querySelector(`label[for="${id}"]`);
          return !label && !input.getAttribute("aria-label") && !input.getAttribute("aria-labelledby");
        });
        if (inputsWithoutLabels.length > 0) {
          issues.push({
            type: "error",
            message: `${inputsWithoutLabels.length} input(s) without associated labels`,
            elements: inputsWithoutLabels.map((i) => i.outerHTML.substring(0, 100)),
          });
        }

        // Check buttons without accessible names
        const buttons = document.querySelectorAll("button");
        const buttonsNoName = Array.from(buttons).filter((btn) => {
          const text = btn.textContent?.trim();
          const ariaLabel = btn.getAttribute("aria-label");
          return !text && !ariaLabel;
        });
        if (buttonsNoName.length > 0) {
          issues.push({
            type: "error",
            message: `${buttonsNoName.length} button(s) without accessible name`,
          });
        }

        // Check heading hierarchy
        const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
        const levels = Array.from(headings).map((h) => parseInt(h.tagName[1], 10));
        let skippedLevels = [];
        for (let i = 1; i < levels.length; i++) {
          if (levels[i] > levels[i - 1] + 1) {
            skippedLevels.push(`h${levels[i - 1]} -> h${levels[i]}`);
          }
        }
        if (skippedLevels.length > 0) {
          issues.push({
            type: "warning",
            message: `Heading hierarchy skips levels: ${skippedLevels.join(", ")}`,
          });
        }

        // Check for missing h1
        const h1s = document.querySelectorAll("h1");
        if (h1s.length === 0) {
          issues.push({
            type: "warning",
            message: "Page has no h1 heading",
          });
        } else if (h1s.length > 1) {
          issues.push({
            type: "warning",
            message: `Page has ${h1s.length} h1 headings (usually should have 1)`,
          });
        }

        // Check links without text
        const links = document.querySelectorAll("a");
        const linksNoText = Array.from(links).filter((a) => {
          const text = a.textContent?.trim();
          const ariaLabel = a.getAttribute("aria-label");
          const hasImg = a.querySelector("img[alt]");
          return !text && !ariaLabel && !hasImg;
        });
        if (linksNoText.length > 0) {
          issues.push({
            type: "error",
            message: `${linksNoText.length} link(s) without accessible text`,
          });
        }

        return issues;
      });

      console.log("\n=== Accessibility Report ===\n");
      if (a11yResults.length === 0) {
        console.log("No accessibility issues detected!");
      } else {
        const errors = a11yResults.filter((r) => r.type === "error");
        const warnings = a11yResults.filter((r) => r.type === "warning");

        if (errors.length > 0) {
          console.log(`ERRORS (${errors.length}):`);
          errors.forEach((e) => {
            console.log(`  - ${e.message}`);
            if (e.elements) {
              e.elements.forEach((el) => console.log(`      ${el}`));
            }
          });
        }

        if (warnings.length > 0) {
          console.log(`\nWARNINGS (${warnings.length}):`);
          warnings.forEach((w) => {
            console.log(`  - ${w.message}`);
          });
        }
      }

      await browser.close();
      return;
    }

    // Default: analyze page structure
    const analysis = await page.evaluate(() => {
      const result = {
        title: document.title,
        meta: {},
        headings: [],
        links: [],
        forms: [],
        images: { total: 0, withAlt: 0, withoutAlt: 0 },
        buttons: [],
      };

      // Meta description
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) result.meta.description = metaDesc.getAttribute("content");

      // Headings
      const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      result.headings = Array.from(headings).map((h) => ({
        level: h.tagName,
        text: h.textContent?.trim().substring(0, 100),
      }));

      // Links (first 20)
      const links = document.querySelectorAll("a[href]");
      result.links = Array.from(links)
        .slice(0, 20)
        .map((a) => ({
          text: a.textContent?.trim().substring(0, 50) || "[no text]",
          href: a.getAttribute("href")?.substring(0, 100),
        }));
      if (links.length > 20) {
        result.links.push({ text: `... and ${links.length - 20} more links`, href: "" });
      }

      // Forms
      const forms = document.querySelectorAll("form");
      result.forms = Array.from(forms).map((form) => {
        const inputs = form.querySelectorAll("input, select, textarea");
        return {
          action: form.action,
          method: form.method || "GET",
          inputs: Array.from(inputs).map((i) => ({
            type: i.type || i.tagName.toLowerCase(),
            name: i.name,
            id: i.id,
          })),
        };
      });

      // Images
      const images = document.querySelectorAll("img");
      result.images.total = images.length;
      result.images.withAlt = Array.from(images).filter((img) => img.getAttribute("alt")).length;
      result.images.withoutAlt = result.images.total - result.images.withAlt;

      // Buttons
      const buttons = document.querySelectorAll("button, input[type=button], input[type=submit]");
      result.buttons = Array.from(buttons)
        .slice(0, 10)
        .map((btn) => ({
          text: btn.textContent?.trim() || btn.value || "[no text]",
          type: btn.type,
        }));

      return result;
    });

    // Output results
    if (options.json) {
      const output = {
        url,
        analysis,
        consoleLogs: options.console ? consoleLogs : undefined,
        networkRequests: options.network ? networkRequests : undefined,
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log("\n=== Page Analysis ===\n");
      console.log(`Title: ${analysis.title || "(none)"}`);
      if (analysis.meta.description) {
        console.log(`Description: ${analysis.meta.description}`);
      }

      console.log(`\n--- Headings (${analysis.headings.length}) ---`);
      analysis.headings.forEach((h) => {
        const indent = "  ".repeat(parseInt(h.level[1], 10) - 1);
        console.log(`${indent}${h.level}: ${h.text}`);
      });

      console.log(`\n--- Links (${analysis.links.length}) ---`);
      analysis.links.forEach((l) => {
        console.log(`  ${l.text} -> ${l.href}`);
      });

      console.log(`\n--- Forms (${analysis.forms.length}) ---`);
      analysis.forms.forEach((f, i) => {
        console.log(`  Form ${i + 1}: ${f.method} ${f.action}`);
        f.inputs.forEach((input) => {
          console.log(`    - ${input.type}: ${input.name || input.id || "(unnamed)"}`);
        });
      });

      console.log(`\n--- Images ---`);
      console.log(`  Total: ${analysis.images.total}`);
      console.log(`  With alt: ${analysis.images.withAlt}`);
      console.log(`  Without alt: ${analysis.images.withoutAlt}`);

      console.log(`\n--- Buttons (${analysis.buttons.length}) ---`);
      analysis.buttons.forEach((b) => {
        console.log(`  [${b.type}] ${b.text}`);
      });

      // Console logs if captured
      if (options.console && consoleLogs.length > 0) {
        console.log(`\n--- Console Logs (${consoleLogs.length}) ---`);
        consoleLogs.forEach((log) => {
          console.log(`  [${log.type}] ${log.text}`);
        });
      }

      // Network requests if captured
      if (options.network && networkRequests.length > 0) {
        console.log(`\n--- Network Requests (${networkRequests.length}) ---`);
        networkRequests.slice(0, 20).forEach((req) => {
          console.log(`  ${req.method} ${req.type} ${req.url.substring(0, 80)}`);
        });
        if (networkRequests.length > 20) {
          console.log(`  ... and ${networkRequests.length - 20} more requests`);
        }
      }
    }

    await browser.close();
  } catch (error) {
    console.error("Error:", error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
