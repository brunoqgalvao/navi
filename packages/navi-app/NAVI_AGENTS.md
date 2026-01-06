# Navi Agents Spec

## Vision

Agents are **shareable, composable automation units** - like n8n workflows but with LLM intelligence baked in. They transform Claude from a chat assistant into a platform for building and sharing AI-powered automations.

An agent is a self-contained unit that:
- Has a clear purpose (what it does)
- Has typed inputs/outputs (contract)
- Uses skills, tools, and scripts to accomplish its goal
- Can be triggered manually, on schedule, or via webhooks
- Can be shared, forked, and published to a marketplace

## Real-World Examples

### 1. Blog Automation Agent (from [@davila7](https://github.com/davila7))

Automated technical blog generation for [aitmpl.com/blog](https://aitmpl.com/blog).

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Claude Skill│───▶│ Nano Banana │───▶│GitHub Action│───▶│Vercel Deploy│
│ (research + │    │ (generate   │    │ (schedule   │    │ (publish)   │
│  write blog)│    │  cover img) │    │  daily)     │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Input**: `{ component_name: string }`
**Output**: `{ blog_post: FileRef, cover_image: FileRef, deployed_url: string }`
**Trigger**: Daily cron OR PR merged webhook

**Key insight**: The skill searches for the component, reviews Anthropic docs, and generates a structured blog with Mermaid diagrams, installation instructions, and validated examples. No fancy design - tech blogs are direct.

**Future enhancements**:
- Pre-deploy review step (currently reviews in production)
- Telegram notification with preview + approval
- Discord notification for community
- Auto-trigger on PR merge for new components

Source: [claude-code-templates](https://github.com/davila7/claude-code-templates)

---

### 2. PR Review Agent

Automated code review on every pull request.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│GitHub Webhook│───▶│ Claude Agent│───▶│ PR Comment │
│ (PR opened) │    │ (review +   │    │ (feedback) │
│             │    │  suggestions)│    │            │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Input**: `{ repo: string, pr_number: number, focus_areas?: string[] }`
**Output**: `{ review: string, issues: Issue[], suggestions: Suggestion[] }`
**Trigger**: GitHub `pull_request.opened` event

---

### 3. Documentation Generator Agent

Auto-generate docs when code changes.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Git Diff    │───▶│ Claude Agent│───▶│ MDX Files  │───▶│ Docusaurus │
│ (changed    │    │ (analyze +  │    │ (generated │    │ (deploy)   │
│  files)     │    │  document)  │    │  docs)     │    │            │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Input**: `{ changed_files: string[], repo_context: string }`
**Output**: `{ docs: FileRef[], changelog_entry: string }`
**Trigger**: Push to main branch

---

### 4. Issue Triage Agent

Automatically label, prioritize, and assign issues.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│GitHub Webhook│───▶│ Claude Agent│───▶│ Issue Update│
│(issue opened)│    │ (classify + │    │ (labels +   │
│             │    │  prioritize) │    │  assignee)  │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Input**: `{ issue_title: string, issue_body: string, repo: string }`
**Output**: `{ labels: string[], priority: string, assignee?: string, response?: string }`
**Trigger**: GitHub `issues.opened` event

---

### 5. Release Notes Agent

Generate changelog and release notes from commits.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Git Log     │───▶│ Claude Agent│───▶│ CHANGELOG   │───▶│ GitHub     │
│ (commits    │    │ (categorize │    │ (formatted  │    │ Release    │
│  since tag) │    │  + summarize)│   │  markdown)  │    │ (publish)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Input**: `{ from_tag: string, to_ref: string }`
**Output**: `{ changelog: FileRef, release_notes: string, breaking_changes: string[] }`
**Trigger**: Manual OR new tag pushed

---

### 6. Competitor Monitor Agent

Track competitor changes and summarize updates.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Cron Daily  │───▶│ Web Scrape  │───▶│ Claude Agent│───▶│ Slack/Email│
│ (schedule)  │    │ (competitor │    │ (analyze +  │    │ (report)   │
│             │    │  sites)     │    │  summarize) │    │            │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Input**: `{ competitor_urls: string[], focus_areas: string[] }`
**Output**: `{ report: FileRef, key_changes: Change[], alerts: Alert[] }`
**Trigger**: Daily cron

---

### 7. Telegram Bot Agent

Interactive agent via Telegram commands.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Telegram    │───▶│ Claude Agent│───▶│ Telegram   │
│ /command    │    │ (process +  │    │ Response   │
│             │    │  execute)   │    │            │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Input**: `{ command: string, args: string[], user_id: string }`
**Output**: `{ response: string, attachments?: FileRef[] }`
**Trigger**: Telegram webhook

Commands:
- `/deploy <project>` - Deploy to production
- `/status` - Check system health
- `/generate <prompt>` - Generate content
- `/approve <pr>` - Approve and merge PR

---

## aitmpl.com Template Format

The [claude-code-templates](https://github.com/davila7/claude-code-templates) project by @davila7 provides 600+ agent templates. This is the format we want to build and deploy:

### Simple Agent (Single File)

```markdown
---
name: frontend-developer
description: Frontend development specialist for React applications and responsive design. Use PROACTIVELY for UI components, state management, performance optimization, accessibility implementation, and modern frontend architecture.
tools: Read, Write, Edit, Bash
model: sonnet
---

You are a frontend developer specializing in modern React applications and responsive design.

## Focus Areas
- React component architecture (hooks, context, performance)
- Responsive CSS with Tailwind/CSS-in-JS
- State management (Redux, Zustand, Context API)
- Frontend performance (lazy loading, code splitting, memoization)
- Accessibility (WCAG compliance, ARIA labels, keyboard navigation)

## Approach
1. Component-first thinking - reusable, composable UI pieces
2. Mobile-first responsive design
3. Performance budgets - aim for sub-3s load times
4. Semantic HTML and proper ARIA attributes
5. Type safety with TypeScript when applicable

## Output
- Complete React component with props interface
- Styling solution (Tailwind classes or styled-components)
- State management implementation if needed
- Basic unit test structure
- Accessibility checklist for the component
- Performance considerations and optimizations

Focus on working code over explanations. Include usage examples in comments.
```

**Key elements:**
- **Frontmatter**: name, description, tools, model
- **Prompt body**: Focus areas, approach, expected output
- **Single file**: Simple agents are just one `.md` file

### Agent Categories (from aitmpl.com)

```
agents/
├── ai-specialists/
├── api-graphql/
├── blockchain-web3/
├── business-marketing/
├── data-ai/
├── database/
├── development-team/
│   ├── backend-architect.md
│   ├── frontend-developer.md
│   ├── fullstack-developer.md
│   ├── ios-developer.md
│   └── ui-ux-designer.md
├── devops-infrastructure/
├── documentation/
├── game-development/
└── ... (600+ total)
```

### Installation via CLI

```bash
# Install single agent
npx claude-code-templates@latest --agent development-team/frontend-developer

# Install full stack
npx claude-code-templates@latest \
  --agent development-team/frontend-developer \
  --agent development-team/backend-architect \
  --command testing/generate-tests \
  --mcp development/github-integration
```

### Run in Cloud Sandbox

```bash
npx claude-code-templates@latest --sandbox cloudflare \
  --agent development-team/frontend-developer \
  --prompt "Create a contact form with validation"
```

---

## Navi Agent Builder UI

The Agent Builder makes it easy to create, edit, and deploy agents like the above.

### What the UI Does

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NAVI AGENT BUILDER                                                         │
├─────────┬───────────────────────────────────────────────────────┬───────────┤
│ FILES   │  EDITOR                                               │  TEST     │
│         │                                                       │           │
│ agent.md│  ---                                                  │  Input:   │
│ ←active │  name: frontend-developer                             │  {}       │
│         │  description: Frontend development specialist...      │           │
│ schema  │  tools: Read, Write, Edit, Bash                       │  [▶ Run]  │
│ (opt)   │  model: sonnet                                        │           │
│         │  ---                                                  │  Output:  │
│ skills/ │                                                       │  (none)   │
│  +new   │  You are a frontend developer specializing in...      │           │
│         │                                                       │           │
│ scripts/│  ## Focus Areas                                       │           │
│  +new   │  - React component architecture...                    │           │
│         │                                                       │           │
├─────────┴───────────────────────────────────────────────────────┴───────────┤
│  Tools: [✓] Read [✓] Write [✓] Edit [✓] Bash [ ] WebFetch [ ] WebSearch     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Model: ○ Haiku  ● Sonnet  ○ Opus          [Save] [Test] [Publish to Cloud] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow

1. **Create**: Click "New Agent" → Enter name/description → Opens editor
2. **Edit**: Write prompt in markdown, select tools, choose model
3. **Test**: Enter sample input → Run locally → See output
4. **Publish**: Deploy to Navi Cloud → Get shareable URL/install command

### Compatibility

Navi agents are compatible with:
- **aitmpl.com**: Publish to the template marketplace
- **Claude Code CLI**: Install via `npx claude-code-templates`
- **Claude Code SDK**: Use in custom applications
- **GitHub**: Version control, fork, contribute

---

## File Structure

### Simple Agent (Single File)
```
~/.navi/agents/
└── frontend-developer.md     # Just the agent file
```

### Complex Agent (Folder)
```
~/.navi/agents/
└── blog-automation/
    ├── agent.md              # Main prompt + frontmatter config
    ├── schema.ts             # TypeScript input/output types (optional)
    ├── skills/
    │   ├── research.md       # Local skills
    │   └── write-blog.md
    ├── scripts/
    │   ├── generate-cover.ts # Helper scripts
    │   └── deploy.sh
    ├── triggers/
    │   └── daily.yaml        # Cron/webhook config
    └── README.md             # Auto-generated docs
```

---

## agent.md Format

```markdown
---
name: Blog Automation
description: Generates and publishes blog posts for AI Template components
version: 1.0.0
author: davila7
license: MIT

# Model settings
model: sonnet
max_tokens: 8000

# Tools this agent can use
tools:
  - Read
  - Write
  - Bash
  - WebFetch
  - WebSearch

# Skills this agent uses
skills:
  - ./skills/research.md
  - ./skills/write-blog.md
  - library:nano-banana        # From global skill library

# Scripts available to the agent
scripts:
  - ./scripts/generate-cover.ts
  - ./scripts/deploy.sh

# Triggers (how this agent can be invoked)
triggers:
  - type: manual               # Run from UI
  - type: cron                 # Scheduled
    schedule: "0 9 * * *"      # Daily at 9am
  - type: webhook              # HTTP endpoint
    path: /agents/blog-automation/run
  - type: github               # GitHub events
    events: [pull_request.merged]
    repo: davila7/claude-code-templates

# Environment variables required
env:
  - NANO_BANANA_API_KEY
  - VERCEL_TOKEN
  - GITHUB_TOKEN

# Dependencies (other agents this one can call)
dependencies:
  - library:image-generator
  - library:git-commit
---

# Blog Automation Agent

You are a technical blog writer for AI Template (aitmpl.com). Your job is to create high-quality blog posts about React/Vue/Svelte components.

## Process

1. **Research**: Use the research skill to find documentation about the component
2. **Write**: Use the write-blog skill to create the blog post with:
   - Clear introduction
   - Mermaid diagram showing component architecture
   - Installation instructions
   - Usage examples with code
   - Results/screenshots
3. **Cover Image**: Run generate-cover.ts to create the blog cover
4. **Deploy**: Run deploy.sh to publish to Vercel

## Output Requirements

- Blog post in MDX format
- Cover image (1200x630px)
- All code examples must be tested and working

## Quality Guidelines

- Tech blogs are direct and to the point
- No fluff, no filler content
- Every section must provide value
- Code examples must be copy-pasteable
```

---

## schema.ts Format

```typescript
// Input schema - what the agent receives
export interface Input {
  component_name: string;
  component_url?: string;
  priority?: "low" | "medium" | "high";
}

// Output schema - what the agent produces
export interface Output {
  blog_post: FileRef;
  cover_image: FileRef;
  deployed_url: string;
  metadata: {
    word_count: number;
    read_time_minutes: number;
    sections: string[];
  };
}

// FileRef type for file outputs
export interface FileRef {
  type: "file";
  path: string;
  mimeType?: string;
}
```

---

## Triggers

### Manual
```yaml
type: manual
# No additional config needed
```

### Cron (Scheduled)
```yaml
type: cron
schedule: "0 9 * * *"      # Cron expression
timezone: America/New_York  # Optional, defaults to UTC
```

### Webhook
```yaml
type: webhook
path: /agents/blog-automation/run
method: POST
auth:
  type: bearer              # or "api-key", "none"
  secret_env: WEBHOOK_SECRET
```

### GitHub
```yaml
type: github
events:
  - pull_request.merged
  - push
repo: owner/repo
branch: main                # Optional filter
```

### Telegram (future)
```yaml
type: telegram
commands:
  - /generate_blog
  - /preview
```

---

## Human-in-the-Loop

**Key insight**: The best agents don't replace humans - they do the work and wait for approval. The human provides judgment, the agent provides execution.

### Why Human-in-the-Loop?

1. **Quality control**: AI outputs need review before going to production
2. **Trust building**: Users gain confidence seeing previews before commits
3. **Learning**: Humans can provide feedback to improve future runs
4. **Compliance**: Some actions require human authorization (deploys, payments, etc.)

### Approval Patterns

#### 1. Preview → Approve → Execute

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Agent Runs  │───▶│ Preview     │───▶│ Human       │───▶│ Execute     │
│ (generate   │    │ (show in    │    │ Approves    │    │ (deploy/    │
│  output)    │    │  Telegram)  │    │ (or rejects)│    │  publish)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Configuration:**
```yaml
approval:
  required: true
  channel: telegram           # or "slack", "discord", "email", "ui"
  timeout: 24h                 # Auto-reject after timeout
  reviewers:
    - @brunogalvao
  actions:
    approve: deploy           # What happens on approve
    reject: discard           # What happens on reject
    modify: re-run            # Request changes
```

#### 2. Staged Execution

Execute in stages with checkpoints:

```yaml
stages:
  - name: generate
    auto: true                 # Runs automatically

  - name: review
    approval:
      required: true
      message: "Review generated blog post"

  - name: deploy
    auto: true                 # Runs after approval

  - name: notify
    auto: true
```

#### 3. Confidence Thresholds

Auto-approve high-confidence outputs, require review for uncertain ones:

```yaml
approval:
  auto_approve_threshold: 0.9  # Auto-approve if confidence > 90%
  require_review_threshold: 0.7 # Require review if < 70%
  reject_threshold: 0.5        # Auto-reject if < 50%
```

### Notification Channels

#### Telegram
```yaml
notifications:
  channel: telegram
  bot_token_env: TELEGRAM_BOT_TOKEN
  chat_id_env: TELEGRAM_CHAT_ID

  on_complete:
    message: |
      ✅ Blog generated: {title}

      Preview: {preview_url}

      /approve - Deploy to production
      /reject - Discard
      /modify - Request changes

  on_approve:
    message: "🚀 Deployed: {deployed_url}"

  on_reject:
    message: "❌ Discarded"
```

#### Discord
```yaml
notifications:
  channel: discord
  webhook_url_env: DISCORD_WEBHOOK

  on_complete:
    embed:
      title: "New blog ready for review"
      description: "{summary}"
      fields:
        - name: Preview
          value: "[View]({preview_url})"
      components:
        - type: button
          label: "Approve"
          action: approve
        - type: button
          label: "Reject"
          style: danger
          action: reject
```

#### Slack
```yaml
notifications:
  channel: slack
  webhook_url_env: SLACK_WEBHOOK

  on_complete:
    blocks:
      - type: section
        text: "New blog ready: *{title}*"
      - type: actions
        elements:
          - type: button
            text: "Approve"
            action_id: approve
          - type: button
            text: "Reject"
            action_id: reject
```

#### Email
```yaml
notifications:
  channel: email
  smtp_env: SMTP_CONFIG
  to:
    - team@company.com

  on_complete:
    subject: "Review required: {title}"
    body: |
      A new blog post has been generated.

      Preview: {preview_url}

      Click to approve: {approve_url}
      Click to reject: {reject_url}
```

### Interactive Modifications

Allow humans to request changes via chat:

```
┌─────────────────────────────────────────────────────────────────┐
│ Telegram Chat                                                   │
├─────────────────────────────────────────────────────────────────┤
│ 🤖 Blog generated: "React Query Best Practices"                 │
│                                                                 │
│ Preview: https://preview.aitmpl.com/blog/react-query            │
│                                                                 │
│ /approve - Deploy                                               │
│ /reject - Discard                                               │
│ /modify <instructions> - Request changes                        │
├─────────────────────────────────────────────────────────────────┤
│ 👤 /modify Add a section about error handling                   │
├─────────────────────────────────────────────────────────────────┤
│ 🤖 Updated! Added "Error Handling" section.                     │
│                                                                 │
│ New preview: https://preview.aitmpl.com/blog/react-query?v=2    │
│                                                                 │
│ /approve - Deploy                                               │
│ /reject - Discard                                               │
│ /modify <instructions> - Request more changes                   │
├─────────────────────────────────────────────────────────────────┤
│ 👤 /approve                                                     │
├─────────────────────────────────────────────────────────────────┤
│ 🤖 🚀 Deployed to https://aitmpl.com/blog/react-query           │
└─────────────────────────────────────────────────────────────────┘
```

### Audit Trail

Every agent run records:

```typescript
interface AgentRun {
  id: string;
  agent_id: string;
  started_at: Date;
  completed_at?: Date;

  input: Record<string, unknown>;
  output?: Record<string, unknown>;

  status: "running" | "pending_approval" | "approved" | "rejected" | "completed" | "failed";

  approval?: {
    required: boolean;
    requested_at?: Date;
    responded_at?: Date;
    reviewer?: string;
    decision?: "approved" | "rejected" | "modified";
    comments?: string;
  };

  stages: {
    name: string;
    status: "pending" | "running" | "completed" | "skipped";
    started_at?: Date;
    completed_at?: Date;
  }[];

  logs: LogEntry[];
  cost_usd: number;
}
```

### Real Example: @davila7's Blog Workflow

Current (v1):
```
Agent runs → Deploys to production → Reviews in prod → Hotfix if needed
```

With Human-in-the-Loop (v2):
```
Agent runs → Preview URL generated → Telegram notification →
Human reviews → /approve or /modify → Deploy or Re-run
```

Benefits:
- No more "hotfixes in production"
- Review on mobile via Telegram
- Request changes without opening laptop
- Clear audit trail of what was approved and by whom

---

## Runtime Execution

When an agent runs:

1. **Validate Input**: Check input against schema.ts
2. **Set Up Environment**: Load env vars, create temp output directory
3. **Execute Prompt**: Run agent.md with Claude
4. **Collect Output**: Gather files from output directory
5. **Validate Output**: Check output against schema.ts
6. **Trigger Post-Actions**: Notifications, webhooks, etc.

### Execution Context

The agent runs with:
- Access to specified tools only
- Skills loaded into context
- Scripts available via Bash
- Temp directory for file outputs (`$AGENT_OUTPUT_DIR`)
- Environment variables from config

---

## Agent Marketplace

Agents can be:

1. **Local**: `~/.navi/agents/` - private, editable
2. **Project**: `.navi/agents/` - shared with project collaborators
3. **Published**: `navi.dev/agents/blog-automation` - public, versioned

### Marketplace Page (Reference: aitmpl.com)

Each published agent gets a page like [aitmpl.com/component/agent/frontend-developer](https://aitmpl.com/component/agent/frontend-developer):

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 Frontend Developer                    ⭐ 12.1k  [View on GitHub] │
│ [AGENT] [category-tags]                            [Add to Stack] │
├─────────────────────────────────────────────────────────────────┤
│ Overview                                                         │
│ {description from frontmatter}                                   │
├─────────────────────────────────────────────────────────────────┤
│ 📋 Metadata                                                      │
│ VERSION | AUTHOR | LICENSE | REPOSITORY                         │
│ KEYWORDS: [tags]                                                │
├─────────────────────────────────────────────────────────────────┤
│ Installation                                                     │
│                                                                 │
│ 📦 Basic Installation (local)                                   │
│    navi agent install @author/agent-name                        │
│                                                                 │
│ 🌐 Global Agent (Claude Code SDK)                               │
│    npx navi-agents@latest --create-agent @author/agent-name     │
│                                                                 │
│    After installation, use from anywhere:                       │
│    agent-name "your prompt here"                                │
│                                                                 │
│    ✓ Works in scripts, CI/CD, npm tasks                        │
│    ✓ Auto-detects project context                              │
│    ✓ Powered by Claude Code SDK                                │
│                                                                 │
│ ☁️ Run in Cloud Sandbox (Isolated Execution)                    │
│    [E2B] [Cloudflare Workers] [Docker]                         │
├─────────────────────────────────────────────────────────────────┤
│ Component Code                                      [Copy Code] │
│ {full agent.md content with syntax highlighting}                │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Schema (frontmatter)

```yaml
---
name: frontend-developer
description: Frontend development specialist for React applications...
version: 1.0.0
author: Claude Code Templates Team
license: MIT
repository: https://github.com/davila7/claude-code-templates

# Categorization
category: development-team
keywords:
  - frontend
  - react
  - typescript
  - ui
  - responsive
  - accessibility

# Runtime config
tools:
  - Read
  - Write
  - Edit
  - Bash
model: sonnet

# Stats (auto-populated)
downloads: 12100
stars: 342
---
```

### Publishing

```bash
navi agent publish frontend-developer
```

Creates:
- Versioned release (semver)
- README from agent.md
- Input/output documentation from schema.ts
- Usage examples
- Marketplace listing

### Installing

**CLI:**
```bash
# Install to local agents
navi agent install @davila7/frontend-developer

# Install globally (available everywhere)
navi agent install -g @davila7/frontend-developer

# Use directly without installing
npx navi-agents@latest --run @davila7/frontend-developer "build a todo app"
```

**UI:**
1. Browse marketplace → Search/filter
2. Click "Add to Stack" or "Install"
3. Configure required env vars
4. Run from sidebar or triggers

### One-Click Deploy (Navi Cloud)

For agents with triggers, deploy to Navi Cloud:

```bash
navi agent deploy frontend-developer
```

This:
1. Uploads agent to Navi Cloud
2. Sets up webhook endpoints
3. Configures cron schedules
4. Provisions secrets/env vars
5. Returns live URL: `https://agents.navi.dev/@you/frontend-developer`

---

## Agent Composition

Agents can call other agents:

```markdown
---
dependencies:
  - library:image-generator
  - library:git-commit
---

# My Agent

When you need to generate an image, use the image-generator agent:
\`\`\`
await runAgent("image-generator", { prompt: "..." })
\`\`\`

When done, commit changes using git-commit agent:
\`\`\`
await runAgent("git-commit", { message: "..." })
\`\`\`
```

---

## UI Components

### Agent Builder
- File navigator (left) - filesystem view of agent
- Editor area (center) - contextual editors for each file type
- Test harness (right) - input JSON, run, see output

### Agent Library
- Grid of agents (local + installed)
- Search/filter
- Create new / Import from URL

### Agent Marketplace (future)
- Browse public agents
- Categories, tags, popularity
- One-click install
- Fork to customize

---

## Roadmap

### Phase 1: Foundation (current)
- [x] Agent file structure
- [x] Agent builder UI
- [x] Local agent creation/editing
- [ ] Manual trigger execution
- [ ] Test harness with real execution

### Phase 2: Triggers
- [ ] Cron scheduling
- [ ] Webhook endpoints
- [ ] GitHub integration

### Phase 3: Sharing
- [ ] Agent export/import
- [ ] Git-based publishing
- [ ] Navi Cloud hosting

### Phase 4: Marketplace
- [ ] Public agent registry
- [ ] Versioning
- [ ] Usage analytics
- [ ] Ratings/reviews

### Phase 5: Advanced
- [ ] Agent composition (agents calling agents)
- [ ] Streaming execution logs
- [ ] Approval workflows
- [ ] Telegram/Discord notifications
- [ ] Cost tracking per agent

---

## Design Principles

1. **File-first**: Everything is files, git-friendly, portable
2. **Composable**: Small skills combine into powerful agents
3. **Typed**: Input/output contracts enable reliable automation
4. **Shareable**: Easy to export, import, publish
5. **Observable**: Clear logs, test harness, execution history
6. **Secure**: Scoped permissions, env var management, audit trail
