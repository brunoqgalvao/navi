# PRD: Navi Integrations Framework v2

> A unified, extensible framework for connecting Navi to external services with progressive disclosure, robust error recovery, and seamless agent access.

## Executive Summary

This PRD defines a comprehensive integrations framework that enables:
1. **Users** to easily connect services via guided UI or conversational setup
2. **Navi/Agents** to reliably access these integrations with clear error recovery
3. **Developers** to add new integrations through a standardized pattern
4. **Extensibility** to support various auth types: API keys, OAuth, CLI auth, browser-based scraping

---

## Goals & Non-Goals

### Goals
- Progressive disclosure: simple setup for simple integrations, guided flow for complex ones
- Scopable credentials: user-level (global) and workspace-level
- Clear agent access patterns via skills or MCP (or both)
- Robust error recovery when auth fails mid-task
- Users can see all integrations (available, enabled, connected)
- Easy credential reuse for custom user skills
- Support for API keys, OAuth, CLI-based auth, and browser scraping

### Non-Goals
- Building integrations for every possible service (focus on framework)
- Real-time sync with external services
- Managing external service configurations (e.g., Linear project settings)

---

## Current State Analysis

### What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| **Registry** (`server/integrations/registry.ts`) | Good | Defines providers, credentials, MCP configs |
| **Credentials Storage** (`server/integrations/credentials.ts`) | Good | AES-256 encrypted, project-scoped |
| **OAuth System** (`server/integrations/oauth.ts`) | Partial | Google only, needs client ID setup |
| **Integration MCP Bridge** (`server/services/integration-mcp.ts`) | Good | Converts registry → SDK MCP configs |
| **Settings UI** (`IntegrationSettings.svelte`) | Basic | Works but not delightful |
| **CLI Tool** (`server/integrations/cli.ts`) | Good | For skills to access tokens |
| **Skills** | Fragmented | `integrations`, `linear`, `connect-linear`, etc. |

### Current Gaps

1. **Setup UX**: No guided/conversational setup flow
2. **Enable/Disable**: No way to enable integration globally but disable for specific workspace
3. **Error Recovery**: No retry/refresh flow when auth fails
4. **Skill Fragmentation**: Multiple skills doing similar things
5. **Health Monitoring**: No visibility into integration health
6. **Custom Skills**: No documented way to consume credentials

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Interface                                  │
├──────────────────────────────┬──────────────────────────────────────────────┤
│    Integration Settings UI   │        Conversational Setup (Skills)         │
│    - Browse available        │        - "connect linear"                    │
│    - Configure credentials   │        - Guided step-by-step                 │
│    - Enable/disable per ws   │        - Error recovery prompts              │
└──────────────────────────────┴──────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Integration Registry (v2)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Linear    │  │   Notion    │  │   Google    │  │   Custom    │  ...   │
│  │  (API Key)  │  │  (API Key)  │  │  (OAuth)    │  │ (User-def)  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         ▼                ▼                ▼                ▼                │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                     Credential Storage (encrypted)                │      │
│  │  - User-level (global)                                            │      │
│  │  - Workspace-level (override)                                     │      │
│  │  - Enable/disable state per scope                                 │      │
│  └──────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Agent Access Layer                                 │
├─────────────────────────────┬───────────────────────────────────────────────┤
│         MCP Servers         │              Skills                            │
│  - Auto-loaded when creds   │  - "integrations" (master)                    │
│    are configured           │  - Provider-specific (linear, gmail, etc.)   │
│  - Injected at session start│  - Setup skills (connect-linear, etc.)       │
│  - SSE, npx, or command     │  - Uses CLI tool or direct API               │
└─────────────────────────────┴───────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Error Recovery System                                │
│  - Token refresh (OAuth)                                                     │
│  - Retry with exponential backoff                                            │
│  - User prompt when manual action needed                                     │
│  - Status tracking per integration                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model (Extended)

```sql
-- Extend credentials table with enable/disable
ALTER TABLE credentials ADD COLUMN enabled INTEGER DEFAULT 1;
ALTER TABLE credentials ADD COLUMN last_used_at INTEGER;
ALTER TABLE credentials ADD COLUMN last_error TEXT;
ALTER TABLE credentials ADD COLUMN error_count INTEGER DEFAULT 0;

-- New table: integration_status (tracks health per integration)
CREATE TABLE integration_status (
  id TEXT PRIMARY KEY,               -- provider:scope (e.g., "linear:global" or "linear:project-123")
  provider TEXT NOT NULL,
  project_id TEXT,                   -- NULL = global
  status TEXT NOT NULL DEFAULT 'unknown',  -- unknown, healthy, degraded, failed
  last_check_at INTEGER,
  last_success_at INTEGER,
  error_message TEXT,
  metadata TEXT,                     -- JSON for provider-specific data
  UNIQUE(provider, project_id)
);

-- New table: integration_defaults (what's enabled by default per scope)
CREATE TABLE integration_defaults (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  project_id TEXT,                   -- NULL = global default
  enabled INTEGER DEFAULT 1,
  mcp_enabled INTEGER DEFAULT 1,     -- Whether MCP should auto-load
  skill_enabled INTEGER DEFAULT 1,   -- Whether skill should be available
  UNIQUE(provider, project_id)
);
```

---

## Feature Specifications

### F1: Integration Registry v2

**Goal**: Unified registry that defines everything about an integration.

```typescript
// server/integrations/registry.ts (extended)

interface IntegrationProvider {
  // Identification
  id: string;                        // "linear", "notion", "google"
  name: string;                      // "Linear"
  description: string;               // "Issue tracking and project management"
  icon: string;                      // SVG path or URL
  color: string;                     // Tailwind color class

  // Authentication
  authType: "api_key" | "oauth" | "cli" | "browser" | "none";
  credentials: CredentialField[];

  // OAuth-specific (if authType === "oauth")
  oauth?: {
    authUrl: string;
    tokenUrl: string;
    scopes: Record<string, string>;  // scope -> description
    services: string[];               // "gmail", "sheets", etc.
  };

  // Access methods
  mcp?: MCPConfig;                   // MCP server config
  cli?: CLIConfig;                   // CLI tool config
  api?: APIConfig;                   // Direct REST API config
  skill?: SkillConfig;               // Associated skill(s)

  // Setup
  setupGuide: SetupGuide;            // Instructions for users
  setupSkill?: string;               // Skill ID for conversational setup (e.g., "connect-linear")

  // Health check
  healthCheck?: {
    endpoint?: string;               // API endpoint to ping
    command?: string;                // CLI command to run
    expectedStatus?: number;         // Expected HTTP status
  };

  // Defaults
  defaults: {
    enabledGlobally: boolean;        // Enabled by default when credentials added?
    mcpEnabled: boolean;             // Auto-load MCP?
    skillEnabled: boolean;           // Make skill available?
  };
}

// NOTE: IntegrationCapability removed - YAGNI
// If needed later, capabilities can be derived from MCP tool schemas

interface SkillConfig {
  // The main usage skill (what agents use to interact)
  usage: string;                     // Skill ID (e.g., "linear")
  // The setup skill (guides user through connection)
  setup?: string;                    // Skill ID (e.g., "connect-linear")
}
```

### F2: Integration Skills

**Goal**: Each integration has setup + usage skills. Claude picks directly based on description.

> **Design Decision**: No master routing skill. Claude's skill selection already works via descriptions.
> Adding a routing layer just adds indirection without benefit.

#### Setup Skills (per provider)

Each provider gets a `connect-{provider}` skill:

```markdown
---
name: connect-linear
description: Guide users through connecting Linear to Navi.
tools: Bash
triggers:
  - "connect linear"
  - "setup linear"
  - "add linear integration"
  - "linear api key"
---

# Connect Linear

[Detailed setup instructions...]

## Workflow

1. Check if already connected
2. Explain what Linear enables
3. Guide to API key page
4. Validate format
5. Save credential (ask about scope)
6. Test connection
7. Confirm success & suggest next steps
```

#### Usage Skills (per provider)

Each provider gets a `{provider}` skill:

```markdown
---
name: linear
description: Access Linear for issue management. Use when user asks about Linear issues, projects, or sprints.
tools: []  # Uses MCP tools, not Bash
mcp: linear
---

# Linear Skill

[Usage instructions for Linear...]

## MCP Tools Available
- linear_listIssues
- linear_createIssue
- etc.
```

### F3: Enable/Disable Per Scope

**Goal**: Users can enable integrations globally but disable for specific workspaces.

#### API Endpoints

```typescript
// GET /api/integrations/status
// Returns all integrations with their status per scope
{
  integrations: [
    {
      provider: "linear",
      name: "Linear",
      hasCredentials: true,
      credentialScope: "global",      // Where creds are stored
      status: {
        global: {
          enabled: true,
          mcpEnabled: true,
          skillEnabled: true,
          health: "healthy"
        },
        project: {                    // Current project override
          enabled: false,             // Disabled for this project
          mcpEnabled: false,
          skillEnabled: true,         // But skill still available
          health: "disabled"
        }
      }
    }
  ]
}

// POST /api/integrations/:provider/enable
// Body: { scope: "global" | "project", projectId?: string }

// POST /api/integrations/:provider/disable
// Body: { scope: "global" | "project", projectId?: string }

// POST /api/integrations/:provider/settings
// Body: {
//   scope: "global" | "project",
//   projectId?: string,
//   mcpEnabled?: boolean,
//   skillEnabled?: boolean
// }
```

#### UI Component

```svelte
<!-- IntegrationCard.svelte -->
<div class="integration-card">
  <div class="header">
    <Icon {provider.icon} />
    <span>{provider.name}</span>
    <StatusBadge status={integration.status} />
  </div>

  <div class="controls">
    <!-- Global toggle -->
    <Toggle
      label="Enabled globally"
      checked={integration.globalEnabled}
      onchange={() => toggleGlobal(provider.id)}
    />

    <!-- Project override (if in project context) -->
    {#if currentProject}
      <Toggle
        label="Enabled for this project"
        checked={integration.projectEnabled}
        onchange={() => toggleProject(provider.id)}
        indeterminate={integration.projectEnabled === null}
      />
    {/if}

    <!-- Advanced: MCP/Skill toggles -->
    <details>
      <summary>Advanced</summary>
      <Toggle label="Auto-load MCP" checked={integration.mcpEnabled} />
      <Toggle label="Enable skill" checked={integration.skillEnabled} />
    </details>
  </div>
</div>
```

### F4: Error Recovery System

**Goal**: When auth fails, recover gracefully and guide user to fix.

#### Integration Health Tracker

```typescript
// server/services/integration-health.ts

interface IntegrationHealth {
  provider: string;
  status: "unknown" | "healthy" | "degraded" | "failed" | "disabled";
  lastCheck: number;
  lastSuccess: number;
  errorCount: number;
  lastError?: string;
}

class IntegrationHealthTracker {
  // Record successful operation
  recordSuccess(provider: string, scope?: CredentialScope): void;

  // Record failure
  recordFailure(provider: string, error: Error, scope?: CredentialScope): void;

  // Get health status
  getHealth(provider: string, scope?: CredentialScope): IntegrationHealth;

  // Check if we should retry
  shouldRetry(provider: string): boolean;

  // Attempt recovery (refresh token, etc.)
  async attemptRecovery(provider: string, scope?: CredentialScope): Promise<boolean>;
}
```

#### Recovery Flows

```typescript
// server/services/integration-recovery.ts

async function handleIntegrationError(
  provider: string,
  error: Error,
  scope?: CredentialScope
): Promise<RecoveryAction> {
  const health = tracker.getHealth(provider, scope);

  // OAuth token expired - try refresh
  if (isTokenExpiredError(error) && provider.authType === "oauth") {
    const refreshed = await refreshOAuthToken(provider, scope);
    if (refreshed) {
      return { action: "retry", message: "Token refreshed, retrying..." };
    }
    return {
      action: "reauth",
      message: "Please reconnect your account in Settings > Integrations",
      link: "/settings/integrations"
    };
  }

  // API key invalid
  if (isAuthError(error) && provider.authType === "api_key") {
    return {
      action: "reauth",
      message: `Your ${provider.name} API key appears to be invalid. Please update it in Settings > Integrations.`,
      link: "/settings/integrations"
    };
  }

  // Rate limited
  if (isRateLimitError(error)) {
    return {
      action: "wait",
      waitMs: getRetryAfter(error),
      message: `Rate limited by ${provider.name}. Will retry in ${waitTime}...`
    };
  }

  // Service unavailable
  if (isServiceError(error)) {
    return {
      action: "retry_later",
      message: `${provider.name} is temporarily unavailable. Will retry automatically.`
    };
  }

  // Unknown error - surface to user
  return {
    action: "fail",
    message: `Error accessing ${provider.name}: ${error.message}`
  };
}
```

#### MCP Wrapper with Recovery

```typescript
// server/services/mcp-with-recovery.ts

// Wrap MCP tool calls with error recovery
function wrapMCPToolWithRecovery(
  provider: string,
  toolCall: () => Promise<any>,
  scope?: CredentialScope
): Promise<any> {
  return async (...args) => {
    try {
      const result = await toolCall(...args);
      tracker.recordSuccess(provider, scope);
      return result;
    } catch (error) {
      tracker.recordFailure(provider, error, scope);

      const recovery = await handleIntegrationError(provider, error, scope);

      switch (recovery.action) {
        case "retry":
          return toolCall(...args);  // Retry immediately
        case "wait":
          await sleep(recovery.waitMs);
          return toolCall(...args);
        case "reauth":
        case "fail":
          throw new IntegrationError(provider, recovery.message, recovery.link);
      }
    }
  };
}
```

### F5: Agent Access Patterns

**Goal**: Clear, unambiguous ways for agents to use integrations.

#### Pattern 1: MCP Tools (Preferred)

When MCP is available, agents use MCP tools directly:

```typescript
// Agent sees these tools when Linear is connected:
// - linear_listIssues
// - linear_createIssue
// - etc.

// No skill needed - just call the tool
```

#### Pattern 2: Skill + CLI

When MCP isn't available, use skill + CLI tool:

```typescript
// Agent invokes skill which uses CLI
// Skill: integrations or provider-specific
// CLI: navi-integrations or provider CLI

// Example flow:
// 1. Agent reads skill instructions
// 2. Calls: bun run .../cli.ts gmail list
// 3. CLI fetches token from server
// 4. CLI calls Gmail API
// 5. Returns result to agent
```

#### Pattern 3: Direct API (for custom skills)

Custom skills can access credentials directly:

```typescript
// In a custom skill's bash commands:
TOKEN=$(curl -s http://localhost:3001/api/credentials/linear/token | jq -r '.token')
curl -H "Authorization: Bearer $TOKEN" https://api.linear.app/graphql ...
```

#### Credential Access API (for custom skills)

```typescript
// GET /api/credentials/:provider/token
// Returns a token/API key that can be used directly

// Response for API key providers:
{
  type: "api_key",
  value: "lin_api_...",
  expiresAt: null
}

// Response for OAuth providers:
{
  type: "oauth",
  value: "ya29.xxx...",
  expiresAt: 1705123456000
}
```

### F6: Integration Settings UI v2

**Goal**: Beautiful, functional UI for managing integrations.

#### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Settings > Integrations                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Connected (3)                                    [+ Add]   │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │  ┌─────────────────────────────────────────────────────┐   │    │
│  │  │ [Linear Icon]  Linear              ● Healthy        │   │    │
│  │  │                Connected as bruno@...               │   │    │
│  │  │                                                     │   │    │
│  │  │ [Global: ON] [This Project: ON] [MCP: ON] [Skill:ON]│   │    │
│  │  │                                                     │   │    │
│  │  │ [Test] [Edit] [Disconnect]                         │   │    │
│  │  └─────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─────────────────────────────────────────────────────┐   │    │
│  │  │ [Google Icon]  Google             ● Healthy         │   │    │
│  │  │                bruno@gmail.com                      │   │    │
│  │  │                Gmail, Sheets, Drive                 │   │    │
│  │  │                                                     │   │    │
│  │  │ [Global: ON] [This Project: OFF] [MCP: N/A]        │   │    │
│  │  └─────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Available (5)                                              │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │    │
│  │  │ [Notion]  │ │ [Slack]   │ │ [Jira]    │ │ [Asana]   │   │    │
│  │  │ API Key   │ │ Bot Token │ │ OAuth     │ │ OAuth     │   │    │
│  │  │ [Connect] │ │ [Connect] │ │ [Connect] │ │ [Connect] │   │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  💡 Tip: You can also set up integrations by chatting       │    │
│  │     with Navi. Try: "connect linear" or "setup notion"      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

#### Setup Flow (Click-based)

1. User clicks "Connect" on a provider card
2. **API Key**: Modal with form + setup guide
3. **OAuth**: Opens popup, redirects back
4. **CLI**: Shows terminal command to run
5. After success: Test connection, show capabilities

#### Setup Flow (Conversational)

1. User types "connect linear"
2. Claude picks `connect-linear` skill (based on description match)
3. Skill guides user step-by-step
4. Saves credentials via API
5. Confirms success, suggests what to try

### F7: Future Auth Types (Out of Scope)

> **Note**: Browser-based auth (cookie extraction for scraping) is deferred to a future PRD.
> CLI auth (like `gh auth`) already works - GitHub integration uses `gh` directly.

The current framework supports:
- `api_key` - Manual API key entry
- `oauth` - OAuth 2.0 flow (Google)
- `cli` - External CLI tools (GitHub via `gh`)
- `none` - No auth needed

Browser auth (`browser` type) would require:
- Cookie extraction from user's browser session
- Security considerations for storing session cookies
- Session refresh handling

This is a separate concern and should be its own PRD when needed.

---

## Implementation Plan

### Phase 1: Foundation ✅ DONE

1. **Extend Registry Types** ✅
   - Added `authType`, `description`, `skill`, `defaults` to `IntegrationProvider`
   - Added enable/disable support per scope

2. **Database Schema** ✅
   - Extended `credentials` table with `enabled`, `last_used_at`, `last_error`, `error_count`
   - Created `integration_status` table for health tracking
   - Created `integration_defaults` table for MCP/skill toggles per scope

3. **Status Service** ✅
   - Created `integration-status.ts` with unified status API
   - Added enable/disable, health tracking, token access
   - Wired MCP loading to check enabled state

4. **API Endpoints** ✅
   - `GET /api/integrations/status` - all integrations
   - `GET/POST /api/integrations/:provider/*` - per-provider operations
   - `GET /api/credentials/:provider/token` - credential access for skills

### Phase 2: Setup Skills & UI ✅ DONE

**Goal**: Make adding integrations delightful via chat or UI.

> **Note**: No master routing skill. Claude picks skills directly based on description.
> UI polish is incremental - not a separate phase.

**Priority Providers** (in order):
1. Linear - issue tracking, most requested
2. Notion - docs/wiki
3. Google - OAuth, Gmail/Sheets/Drive
4. GitHub - already works via `gh` CLI
5. Slack - team comms

#### Setup Skills (`connect-{provider}`)

| Provider | Skill | Status | Notes |
|----------|-------|--------|-------|
| Linear | `connect-linear` | ✅ Done | Full workflow, API key validation |
| Notion | `connect-notion` | ✅ Done | Includes "connect pages" critical step |
| Slack | `connect-slack` | ✅ Done | Bot token + scopes guidance |
| Google | `connect-google` | ✅ Done | OAuth flow, client ID setup, Google Cloud Console walkthrough |
| GitHub | `connect-github` | ✅ Done | `gh auth login` flow, no credentials in Navi |

#### Usage Skills (`{provider}`)

| Provider | Skill | Status | Notes |
|----------|-------|--------|-------|
| Linear | `linear` | ✅ Done | MCP tools, error handling, states |
| Google | `integrations` | ✅ Done | Gmail, Sheets, Drive via CLI |
| Notion | `notion` | ✅ Done | MCP tools, page connection reminder |
| Slack | `slack` | ✅ Done | Bot token ops, channel invite reminder |
| GitHub | `github` | ✅ Done | Uses `gh` CLI directly |

#### Settings UI (`IntegrationSettings.svelte`) ✅ DONE

- [x] Status badges (Connected with green dot)
- [x] Scope badges (Global/Project)
- [x] "Test Connection" button (in modal footer)
- [x] "Help me set up" button → dispatches `open-setup-chat` event
- [x] Setup guide with collapsible steps
- [x] Project-scoped credential toggle
- [x] OAuth app configuration modal (for Google)
- [x] Enable/disable toggles per scope (global + project)
- [x] Show `last_error` inline (collapsible details)
- [x] Health indicator dot (green/yellow/red based on error count)

### Phase 3: Error Handling (reactive)

**Goal**: Handle errors as they occur in production.

> **Philosophy**: Don't build error handling systems before you have errors.
> When something fails, fix it specifically. Learn from real failures.

**When to add error handling:**
- First OAuth token expiration → add refresh logic
- First API key rejection → improve error message
- First rate limit hit → add exponential backoff

**What we have now (sufficient to start):**
- `recordProviderError()` tracks failures
- `last_error` shown in UI
- MCP errors surface to agent naturally via SDK

**What to add when needed:**
- OAuth token auto-refresh before expiration
- Retry with backoff for transient failures
- "Reconnect" flow when auth is permanently broken

### Documentation (ongoing)

Not a phase - document as you build.

- Setup guides live in skill files (already there)
- Troubleshooting hints inline in UI
- Developer guide: how to add new integration (registry + skill pattern)

---

## API Reference

### Credentials API (Extended)

```
GET    /api/credentials/providers
       Returns all providers with credential status

GET    /api/credentials/:provider
       Returns credential status for provider

POST   /api/credentials/:provider
       Set credentials { credentials: {...}, scope?: "project" | "user" }

DELETE /api/credentials/:provider
       Delete credentials { scope?: "project" | "user" }

POST   /api/credentials/:provider/test
       Test credentials

GET    /api/credentials/:provider/token
       Get token/API key for use (refreshes if needed)
```

### Integrations API (Extended)

```
GET    /api/integrations/status
       Returns all integrations with full status

GET    /api/integrations/:provider/status
       Returns status for specific provider

POST   /api/integrations/:provider/enable
       Enable integration { scope: "global" | "project" }

POST   /api/integrations/:provider/disable
       Disable integration { scope: "global" | "project" }

POST   /api/integrations/:provider/settings
       Update settings { mcpEnabled?, skillEnabled?, scope }

POST   /api/integrations/:provider/health-check
       Trigger health check

GET    /api/integrations/:provider/health
       Get health status
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Integration setup success rate | > 90% |
| Time to first successful use | < 2 minutes |
| Error recovery success rate | > 80% |
| User satisfaction with setup | > 4/5 |
| Agent integration errors | < 5% of calls |

---

## Open Questions

1. **Should MCP be opt-in or opt-out?**
   - Current: Auto-load when credentials present
   - Consideration: Some users may want skills-only

2. **How to handle workspace vs project scope?**
   - Current: project_id in credentials
   - Consideration: Navi doesn't have "workspaces" yet

3. **Browser auth security concerns?**
   - Storing session cookies is risky
   - May need additional sandboxing

4. **Rate limit handling across agents?**
   - Multiple agents might hit same integration
   - Need request queuing or coordination

---

## Appendix: Provider Examples

### Linear (API Key + MCP)

```typescript
const LINEAR: IntegrationProvider = {
  id: "linear",
  name: "Linear",
  description: "Issue tracking and project management",
  authType: "api_key",
  credentials: [{
    key: "apiKey",
    label: "API Key",
    type: "password",
    placeholder: "lin_api_...",
    helpUrl: "https://linear.app/settings/account/api",
    required: true
  }],
  mcp: {
    sse: "https://mcp.linear.app/sse",
    env: { LINEAR_API_KEY: "{{apiKey}}" }
  },
  skill: {
    usage: "linear",
    setup: "connect-linear"
  },
  healthCheck: {
    endpoint: "https://api.linear.app/graphql",
    // Simple query to check auth
  },
  defaults: {
    enabledGlobally: true,
    mcpEnabled: true,
    skillEnabled: true
  }
};
```

### Google (OAuth)

```typescript
const GOOGLE: IntegrationProvider = {
  id: "google",
  name: "Google",
  authType: "oauth",
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: {
      "gmail.readonly": "Read emails",
      "sheets.readonly": "Read spreadsheets",
      // ...
    },
    services: ["gmail", "sheets", "drive", "calendar"]
  },
  skill: {
    usage: "integrations", // Uses master skill
    setup: "connect-google"
  },
  // No MCP - uses CLI tool
  defaults: {
    enabledGlobally: true,
    mcpEnabled: false,
    skillEnabled: true
  }
};
```

### GitHub (CLI Auth + MCP)

```typescript
const GITHUB: IntegrationProvider = {
  id: "github",
  name: "GitHub",
  authType: "cli",
  cli: {
    command: "gh",
    authCommand: "gh auth login",
    checkCommand: "gh auth status"
  },
  mcp: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {}  // Uses gh CLI auth
  },
  skill: {
    usage: "github",
    setup: null  // No setup needed - uses gh CLI
  },
  defaults: {
    enabledGlobally: true,
    mcpEnabled: true,
    skillEnabled: true
  }
};
```
