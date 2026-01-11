#!/usr/bin/env python3
"""
Browser-Use CLI for Navi

AI-powered browser automation using Claude.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Try to get API key from keymanager if not in environment
def get_anthropic_api_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]

    # Try keymanager
    try:
        import subprocess
        result = subprocess.run(
            ["bun", "run", os.path.expanduser("~/Documents/dev-bruno/api-key-manager/index.ts"), "get", "anthropic", "--show-key"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            for line in result.stdout.split("\n"):
                if line.startswith("Key:"):
                    key = line.split(":", 1)[1].strip()
                    if key and not key.startswith("***"):
                        return key
    except Exception:
        pass

    return None


async def run_browser_task(
    task: str,
    url: str | None = None,
    headless: bool = False,
    screenshot_path: str | None = None,
    output_format: str = "text",
    timeout: int = 300,
    model: str = "claude-sonnet-4-0",
    debug: bool = False,
):
    """Run a browser automation task using browser-use."""

    # Import here to avoid slow startup for --help
    from browser_use import Agent, Browser, ChatAnthropic

    # Set up API key
    api_key = get_anthropic_api_key()
    if not api_key:
        print("Error: ANTHROPIC_API_KEY not found.", file=sys.stderr)
        print("Set it via environment variable or add to keymanager.", file=sys.stderr)
        sys.exit(1)

    os.environ["ANTHROPIC_API_KEY"] = api_key

    # Configure browser
    browser = Browser(
        headless=headless,
    )

    # Configure LLM - use browser-use's ChatAnthropic
    llm = ChatAnthropic(
        model=model,
    )

    # Build task with URL if provided
    full_task = task
    if url:
        full_task = f"First navigate to {url}, then: {task}"

    if debug:
        print(f"Task: {full_task}", file=sys.stderr)
        print(f"Model: {model}", file=sys.stderr)
        print(f"Headless: {headless}", file=sys.stderr)

    # Create agent
    agent = Agent(
        task=full_task,
        llm=llm,
        browser=browser,
    )

    try:
        # Run the task
        history = await asyncio.wait_for(
            agent.run(),
            timeout=timeout
        )

        # Get the result
        result = history.final_result() if hasattr(history, 'final_result') else str(history)

        # Take screenshot if requested
        if screenshot_path:
            try:
                # Get the browser context and take screenshot
                if hasattr(browser, 'context') and browser.context:
                    pages = browser.context.pages
                    if pages:
                        await pages[0].screenshot(path=screenshot_path)
                        if debug:
                            print(f"Screenshot saved to: {screenshot_path}", file=sys.stderr)
            except Exception as e:
                print(f"Warning: Failed to save screenshot: {e}", file=sys.stderr)

        # Format output
        if output_format == "json":
            output = {
                "success": True,
                "task": task,
                "url": url,
                "result": result,
            }
            print(json.dumps(output, indent=2))
        elif output_format == "markdown":
            print(f"## Browser Task Result\n")
            print(f"**Task:** {task}\n")
            if url:
                print(f"**URL:** {url}\n")
            print(f"**Result:**\n\n{result}")
        else:
            print(result)

        return True

    except asyncio.TimeoutError:
        error_msg = f"Task timed out after {timeout} seconds"
        if output_format == "json":
            print(json.dumps({"success": False, "error": error_msg}))
        else:
            print(f"Error: {error_msg}", file=sys.stderr)
        return False

    except Exception as e:
        error_msg = str(e)
        if output_format == "json":
            print(json.dumps({"success": False, "error": error_msg}))
        else:
            print(f"Error: {error_msg}", file=sys.stderr)
        if debug:
            import traceback
            traceback.print_exc()
        return False

    finally:
        # Clean up
        try:
            await browser.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(
        description="AI-powered browser automation using browser-use",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s "Find the trending repositories on GitHub"
  %(prog)s "Get the current Bitcoin price" --output json
  %(prog)s "Fill out the contact form" --url "https://example.com/contact"
  %(prog)s "Sign up for an account" --url "https://service.com" --screenshot /tmp/result.png
        """
    )

    parser.add_argument(
        "task",
        help="The task to perform (natural language description)"
    )

    parser.add_argument(
        "--url",
        help="Starting URL (default: browser will search/navigate as needed)"
    )

    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run browser in headless mode (no visible window)"
    )

    parser.add_argument(
        "--screenshot",
        metavar="PATH",
        help="Save a screenshot of the final page to this path"
    )

    parser.add_argument(
        "--output",
        choices=["text", "json", "markdown"],
        default="text",
        help="Output format (default: text)"
    )

    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Maximum time in seconds for the task (default: 300)"
    )

    parser.add_argument(
        "--model",
        default="claude-sonnet-4-0",
        help="Claude model to use (default: claude-sonnet-4-0)"
    )

    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug output"
    )

    args = parser.parse_args()

    # Run the async task
    success = asyncio.run(run_browser_task(
        task=args.task,
        url=args.url,
        headless=args.headless,
        screenshot_path=args.screenshot,
        output_format=args.output,
        timeout=args.timeout,
        model=args.model,
        debug=args.debug,
    ))

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
