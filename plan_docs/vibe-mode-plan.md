# Vibe Mode Plan

## Overview

Add a "vibe" project type alongside "standard" projects. Vibe mode is an opinionated, zero-config experience for shipping web apps fast - like Lovable, but local-first.

## Project Types

| Type | Description |
|------|-------------|
| `standard` | Current behavior - flexible, any stack, general purpose |
| `vibe` | Opinionated stack, managed services, purpose-built UI |

Project type is set at project level, not route level. Opening a project loads the appropriate experience.

## Why Local Beats Cloud

- Full filesystem access (not sandboxed)
- Real git integration
- Your own API keys (no middleman billing)
- Privacy (code stays local)
- No cold starts
- Real debugging (attach debuggers, use your tools)
- Unlimited resources

## Opinionated Stack (Vibe Mode)

```
Framework:    Next.js 14 (app router)
Database:     SQLite (local) → Turso (deployed)
Auth:         Better-Auth (runs in app, no external dependency)
Payments:     Stripe
Email:        Resend
Hosting:      Vercel
Styling:      Tailwind + shadcn
Domains:      *.yourapp.dev (wildcard)
```

## What Changes Per Project Type

| Layer | Standard | Vibe |
|-------|----------|------|
| System prompt | General Claude Code | Stack-specific, knows conventions |
| Tools | Default set | `deploy()`, `createTable()`, `addAuth()`, `addPayments()` |
| Skills | User-managed | Pre-loaded patterns for auth, payments, CRUD |
| Setup | Minimal | Guided onboarding for services |
| UI | Chat-focused | Chat + preview pane + terminal |
| State | Basic project info | Tracks services, deployment status, dev server |

## Data Model

```ts
interface Project {
  id: string
  name: string
  path: string
  type: "standard" | "vibe"
  
  // vibe-specific config
  vibeConfig?: {
    stack: "nextjs" // locked for now, extensible later
    services: {
      database?: ServiceConfig
      auth?: AuthConfig
      payments?: ServiceConfig
      email?: ServiceConfig
      hosting?: HostingConfig
    }
    devServer?: {
      port: number
      pid?: number
      autoStart: boolean
    }
  }
}

interface ServiceConfig {
  enabled: boolean
  // credentials stored securely, not exposed to user
}

interface AuthConfig {
  enabled: boolean
  providers: ("google" | "github" | "email")[]
}

interface HostingConfig {
  enabled: boolean
  domain?: string // custom domain
  defaultDomain: string // projectname.yourapp.dev
}
```

## Service Abstraction

**Key principle:** User sees generic services, not providers.

| User Sees | Provider (Hidden) |
|-----------|-------------------|
| Database | Turso |
| Auth | Better-Auth |
| Payments | Stripe |
| Email | Resend |
| Deploy | Vercel |
| Domain | Cloudflare |

User toggles "Database: on" and it works. No connection strings, no provider dashboards.

## Architecture: Services Layer

```ts
// services/database.ts
export interface DatabaseService {
  provision(projectId: string): Promise<void>
  getConnectionString(projectId: string): Promise<string>
  delete(projectId: string): Promise<void>
}

// services/hosting.ts
export interface HostingService {
  deploy(projectId: string): Promise<DeployResult>
  getStatus(projectId: string): Promise<DeployStatus>
  setDomain(projectId: string, domain: string): Promise<void>
}

// etc for auth, payments, email
```

App code only talks to these interfaces. Never directly to Turso/Vercel/etc.

## Migration Path: Non-Managed → Managed

### Phase 1: Non-Managed (Start Here)
- User provides their own API keys (Turso, Vercel, Stripe, Resend)
- You abstract the UI/setup, they own the accounts
- Zero ops burden for you

### Phase 2: Managed (Later)
- You have master accounts
- Provision sub-accounts or multi-tenant resources
- User pays you, you pay providers
- More margin, more stickiness

**Why this works:** The service abstraction layer means swapping implementations is just changing what's behind the interface. UI and app code don't change.

```ts
// Phase 1
async function provision(projectId: string) {
  return turso.create({ token: user.tursoToken, name: projectId })
}

// Phase 2
async function provision(projectId: string) {
  return turso.create({ token: YOUR_MASTER_TOKEN, name: projectId })
}

// Phase 3 (self-hosted)
async function provision(projectId: string) {
  return yourPostgresCluster.createDatabase(projectId)
}
```

## Vibe Mode UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ Header: Project Name | Services Status | Deploy Button │
├──────────────┬──────────────────────┬───────────────────┤
│              │                      │                   │
│   Sidebar    │       Chat           │    Preview        │
│   - Files    │                      │    (iframe)       │
│   - Services │                      │                   │
│   - Settings │                      │                   │
│              │                      │                   │
├──────────────┴──────────────────────┴───────────────────┤
│ Terminal (collapsible)                                  │
└─────────────────────────────────────────────────────────┘
```

## Local Dev Server Management

- Auto-start on project open (if `autoStart: true`)
- Port conflict detection and resolution
- Process supervision (restart on crash)
- Output streaming to terminal pane
- Hot reload integration

## Implementation Phases

### Phase 1: Foundation
- [ ] Add `type` field to project model
- [ ] Create vibe-specific layout/route
- [ ] Implement service abstraction interfaces
- [ ] Add project settings for vibe config

### Phase 2: Local Dev
- [ ] Dev server management (start/stop/restart)
- [ ] Port management
- [ ] Terminal pane with output streaming
- [ ] Preview pane (iframe to localhost)

### Phase 3: Services (Non-Managed)
- [ ] Database setup (Turso) - user provides key
- [ ] Auth setup (Better-Auth) - scaffolding
- [ ] Payments setup (Stripe) - user provides key
- [ ] Email setup (Resend) - user provides key
- [ ] Hosting setup (Vercel) - user provides token

### Phase 4: Deploy
- [ ] One-click deploy to Vercel
- [ ] Environment variable management
- [ ] Domain configuration
- [ ] Deploy status/logs

### Phase 5: Polish
- [ ] Vibe-specific system prompt
- [ ] Pre-built skills for common patterns
- [ ] Contextual suggestions in chat
- [ ] Onboarding flow

### Phase 6: Managed (Future)
- [ ] Master accounts for providers
- [ ] Billing integration
- [ ] Usage tracking
- [ ] Self-hosted options for margin

## Open Questions

1. **Wildcard domain** - Do we want `*.yourapp.dev`? Need to pick/buy a domain.
2. **Billing model** - Free tier limits? Per-project pricing? Usage-based?
3. **Multi-stack** - Start with Next.js only, add SvelteKit/Remix later?
4. **Collaboration** - Single user for now, teams later?
