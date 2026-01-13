# Connect GitHub Skill

Guide users through connecting GitHub to Navi via the GitHub CLI (`gh`). You have full context on `gh` authentication, usage, and capabilities.

> **IMPORTANT**: This is Navi, not Claude Code CLI. Do NOT suggest `claude mcp add` commands.
> GitHub uses the `gh` CLI directly - no credentials stored in Navi.

## Trigger Phrases
- "connect github"
- "setup github"
- "add github integration"
- "github authentication"
- "gh cli setup"

## What GitHub Enables
- Create, update, and close issues
- Manage pull requests (create, review, merge)
- View repositories and code
- Run GitHub Actions workflows
- Manage releases and tags
- Access organization and team info

## Authentication

GitHub integration uses the **GitHub CLI (`gh`)** tool - NOT API keys or OAuth apps. This means:
- No credentials to store in Navi
- Uses your existing `gh auth` session
- Same authentication as your terminal
- Secure, official GitHub tool

### How It Works

Navi executes `gh` commands on your behalf. When you run `gh` commands, they use your authenticated session from the CLI.

## Prerequisites: Install GitHub CLI

**macOS (Homebrew):**
```bash
brew install gh
```

**Windows (Winget):**
```bash
winget install --id GitHub.cli
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install gh
```

**Other methods:** https://github.com/cli/cli#installation

## Setting Up Authentication

Once `gh` is installed, authenticate:

### Step 1: Login
```bash
gh auth login
```

You'll be prompted with:

**1. What account do you want to log into?**
- Select: `GitHub.com` (or `GitHub Enterprise Server` if using)

**2. What is your preferred protocol?**
- Recommended: `HTTPS` (easier, works everywhere)
- Alternative: `SSH` (if you have SSH keys configured)

**3. Authenticate Git with your GitHub credentials?**
- Select: `Yes` (allows git operations to use gh auth)

**4. How would you like to authenticate?**
- **Login with a web browser** (easiest):
  - You'll get a one-time code (e.g., `ABCD-1234`)
  - Press Enter to open browser
  - Paste code and authorize
- **Paste an authentication token**:
  - Requires creating a Personal Access Token manually
  - Not recommended for most users

### Step 2: Verify Authentication
```bash
gh auth status
```

Successful output looks like:
```
github.com
  ✓ Logged in to github.com as USERNAME (/Users/you/.config/gh/hosts.yml)
  ✓ Git operations for github.com configured to use https protocol.
  ✓ Token: *******************
```

## Testing the Connection

After authentication, test with a simple command:

```bash
# List your repositories
gh repo list

# View your issues
gh issue list

# Check current repository status
gh repo view
```

If these work, GitHub is connected!

## No Configuration in Navi

Because `gh` handles authentication, **Navi doesn't need any configuration**. There are no credentials to save in Settings.

When Navi needs GitHub data, it simply runs `gh` commands using your authenticated session.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `gh: command not found` | CLI not installed | Install `gh` (see Prerequisites) |
| `not logged in` | Not authenticated | Run `gh auth login` |
| `authorization failed` | Token expired/revoked | Run `gh auth refresh` or re-login |
| `HTTP 403` | Rate limit or permissions | Check `gh auth status`, may need different scopes |
| `not a git repository` | Command needs repo context | `cd` to a git repository first |
| `repository not found` | Private repo, no access | Verify repo name and permissions |

## Refreshing Authentication

If your token expires or you need to re-authenticate:

```bash
# Refresh existing token
gh auth refresh

# Or completely re-login
gh auth logout
gh auth login
```

## GitHub CLI Quick Reference

The `gh` CLI provides these commands:

### Repositories
- `gh repo list` - List your repositories
- `gh repo view` - View current repository
- `gh repo clone OWNER/REPO` - Clone repository
- `gh repo create` - Create new repository
- `gh repo fork` - Fork repository

### Issues
- `gh issue list` - List issues
- `gh issue create` - Create new issue
- `gh issue view NUMBER` - View issue details
- `gh issue close NUMBER` - Close issue
- `gh issue comment NUMBER` - Add comment

### Pull Requests
- `gh pr list` - List pull requests
- `gh pr create` - Create new PR
- `gh pr view NUMBER` - View PR details
- `gh pr checkout NUMBER` - Checkout PR locally
- `gh pr merge NUMBER` - Merge PR
- `gh pr review NUMBER` - Review PR

### Actions & Workflows
- `gh workflow list` - List workflows
- `gh workflow run NAME` - Trigger workflow
- `gh run list` - List workflow runs
- `gh run view` - View run details

### Releases
- `gh release list` - List releases
- `gh release create TAG` - Create release
- `gh release view TAG` - View release

## Example Prompts After Setup

Once `gh` is authenticated, users can try:
- "Show me my open issues on GitHub"
- "Create a GitHub issue: Bug in login form"
- "List pull requests for this repository"
- "What's the status of PR #42?"
- "Create a pull request from my current branch"
- "Show recent releases for this repo"
- "Trigger the 'deploy' workflow"

## Workflow

1. **Check if `gh` is installed**: Run `gh --version`
2. **If not installed**: Guide to installation (brew, apt, etc.)
3. **Check authentication**: Run `gh auth status`
4. **If not authenticated**: Guide through `gh auth login`
5. **Verify login**: Run `gh auth status` again
6. **Test with simple command**: `gh repo list`
7. **Confirm success**: Show what they can now do

## Multiple Accounts

If you need to switch between GitHub accounts:

```bash
# Login to additional account
gh auth login

# Check which accounts are logged in
gh auth status

# Switch between accounts (set default)
gh auth switch
```

## Using with GitHub Enterprise

For GitHub Enterprise Server:

```bash
gh auth login --hostname github.company.com
```

Then all commands need the hostname:
```bash
gh repo list --hostname github.company.com
```

## Token Scopes

The `gh auth login` flow automatically requests these scopes:
- `repo` - Full repository access
- `read:org` - Read organization data
- `workflow` - Manage GitHub Actions workflows

If you need additional scopes:
```bash
gh auth refresh --scopes read:project,write:packages
```

## Revoking Access

To disconnect GitHub:

```bash
# Logout from gh CLI
gh auth logout

# Or revoke from GitHub web:
# Settings → Applications → GitHub CLI → Revoke
```

## Security Notes

- `gh` tokens are stored in `~/.config/gh/hosts.yml`
- Tokens are encrypted by the operating system
- Never share your `hosts.yml` file
- Tokens have same permissions as your GitHub account
- Use `gh auth refresh` to rotate tokens periodically
- Consider using fine-grained tokens for specific repos only

## Troubleshooting

**"Not logged in to any hosts" after login:**
- Check `~/.config/gh/hosts.yml` exists
- Try `gh auth status --show-token` to see if token is valid
- May need to `gh auth logout && gh auth login` again

**Commands hang or timeout:**
- Check internet connection
- GitHub may be experiencing issues: https://www.githubstatus.com
- Try `gh auth refresh` to get new token

**"Resource not accessible by integration":**
- Token lacks required scope
- Run `gh auth refresh --scopes repo,workflow,read:org`

**SSH vs HTTPS confusion:**
- If you chose SSH but don't have keys: `gh auth setup-git --force`
- Or re-login with HTTPS: `gh auth login` and select HTTPS

## Advanced: Using GitHub API Directly

While Navi uses `gh` commands, you can also access the API directly:

```bash
# Get authenticated user
gh api /user

# List issues for repo
gh api repos/OWNER/REPO/issues

# Create issue
gh api repos/OWNER/REPO/issues -f title="Bug report"
```

This is useful for API calls not covered by `gh` subcommands.
