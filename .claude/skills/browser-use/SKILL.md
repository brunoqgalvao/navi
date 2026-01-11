---
name: browser-use
description: AI-powered browser automation using browser-use library. Use when you need to browse the web, fill forms, scrape data, sign up for services, or perform any web automation task that requires visual understanding of web pages.
tools: Bash
model: sonnet
---

# Browser-Use Skill

AI-powered browser automation that lets Navi control a web browser to perform tasks like:
- Signing up for services
- Filling out forms
- Scraping web data
- Taking screenshots
- Navigating complex web flows
- Interacting with authenticated sessions

## How It Works

Browser-use uses AI (Claude) to understand web pages visually and interact with them intelligently. It's not just clicking elements by selector - it understands the page like a human would.

## Quick Usage

### Run a task in the browser:

```bash
cd ~/.claude/skills/browser-use && uv run python browse.py "Go to github.com and find the trending repositories"
```

### With specific URL:

```bash
cd ~/.claude/skills/browser-use && uv run python browse.py "Find the pricing information" --url "https://example.com"
```

### Headless mode (no visible browser):

```bash
cd ~/.claude/skills/browser-use && uv run python browse.py "Download the PDF" --headless
```

### Save screenshot:

```bash
cd ~/.claude/skills/browser-use && uv run python browse.py "Go to the homepage" --screenshot /tmp/screenshot.png
```

### Extract data as JSON:

```bash
cd ~/.claude/skills/browser-use && uv run python browse.py "Find all product prices on this page" --url "https://store.example.com" --output json
```

## CLI Options

```
browse.py <task> [options]

Arguments:
  task              What you want the browser to do (natural language)

Options:
  --url URL         Start at this URL (default: about:blank)
  --headless        Run without visible browser window
  --screenshot PATH Save final screenshot to this path
  --output FORMAT   Output format: text (default), json, markdown
  --timeout SECS    Maximum time for task (default: 300)
  --model MODEL     Claude model to use (default: claude-sonnet-4-0)
  --debug           Enable debug output
```

## Examples

### Sign up for a service:

```bash
uv run python browse.py "Sign up for a free account using email navi@example.com and password SecurePass123" --url "https://service.com/signup"
```

### Scrape data:

```bash
uv run python browse.py "Extract all job listings including title, company, and salary" --url "https://jobs.example.com" --output json
```

### Fill a form:

```bash
uv run python browse.py "Fill out the contact form with name 'Navi AI', email 'navi@example.com', message 'Hello from Navi!'" --url "https://example.com/contact"
```

### Research a topic:

```bash
uv run python browse.py "Find the current price of Bitcoin and the 24h change percentage"
```

### Download something:

```bash
uv run python browse.py "Download the latest release ZIP file" --url "https://github.com/user/repo/releases"
```

## Environment Variables

The skill uses your Anthropic API key:

```bash
# Already set in your environment or keymanager
ANTHROPIC_API_KEY=sk-ant-...
```

## Integration with Navi Email

Combine with the navi-email skill for autonomous account creation:

```bash
# 1. Create email inbox for this service
node ~/.claude/skills/navi-email/scripts/email.js create-inbox navi-github

# 2. Sign up using browser-use
uv run python browse.py "Sign up for GitHub using email navi-github@yourdomain.com" --url "https://github.com/signup"

# 3. Wait for verification email
node ~/.claude/skills/navi-email/scripts/email.js wait --inbox navi-github@yourdomain.com --from github.com --timeout 120

# 4. Get verification link
LINK=$(node ~/.claude/skills/navi-email/scripts/email.js extract-link <email-id>)

# 5. Click verification link
uv run python browse.py "Complete the verification" --url "$LINK"
```

## Troubleshooting

### "Playwright not installed"
```bash
cd ~/.claude/skills/browser-use && uv run playwright install chromium
```

### "API key not found"
Make sure ANTHROPIC_API_KEY is set in your environment or available via keymanager.

### Browser closes too fast
Add `--timeout 600` for longer tasks.

### Can't see what's happening
Remove `--headless` to watch the browser work.

## Advanced: Custom Python Integration

```python
from browser_use import Agent
from langchain_anthropic import ChatAnthropic
import asyncio

async def main():
    llm = ChatAnthropic(model="claude-sonnet-4-0")
    agent = Agent(
        task="Your task here",
        llm=llm,
    )
    result = await agent.run()
    print(result)

asyncio.run(main())
```

## Limitations

- Some sites have anti-bot detection that may block automated access
- CAPTCHAs may require manual intervention
- Very complex multi-step flows may need to be broken into smaller tasks
- File downloads go to the system's default download location
