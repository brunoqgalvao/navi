# Navi Vision: The Agent Workspace

> **Where humans and AI work together.**

## The Core Thesis

The future of AI isn't better chatbots. It's **delegation**.

Today: You prompt → AI responds → You review everything → Repeat.

Tomorrow: You delegate → Agents work → You approve results → Move on.

The bottleneck isn't AI capability. It's **trust**. Users won't delegate if they can't undo.

---

## The Vision

Navi becomes the workspace where:

1. **Humans and agents are peers** - same conversation, same context
2. **Delegation is natural** - `@agent do this` like Slack
3. **Trust is built-in** - every action reversible, every change in a branch
4. **Context flows** - agents share understanding, not just files

---

## The Three Layers

```
┌─────────────────────────────────────────────────────────┐
│                    CONVERSATION LAYER                    │
│     Natural language interface for humans + agents       │
│         @mentions, threads, real-time presence           │
├─────────────────────────────────────────────────────────┤
│                      AGENT LAYER                         │
│       Named agents with identity, scope, memory          │
│    @coder  @ops  @researcher  @reviewer  @custom...     │
├─────────────────────────────────────────────────────────┤
│                     CONTEXT LAYER                        │
│        Shared understanding across all participants      │
│     Agents publish, query, subscribe to context          │
├─────────────────────────────────────────────────────────┤
│                      TRUST LAYER                         │
│     Branching, snapshots, undo, audit, permissions       │
│         "Credit card safety" for AI actions              │
└─────────────────────────────────────────────────────────┘
```

---

## The Trust Model

### The Credit Card Analogy

| Payment Type | Risk | Trust |
|-------------|------|-------|
| Cash | Gone forever | Low - count carefully |
| Debit | Disputable | Medium |
| Credit Card | Not your money, easy reversal | High - spend freely |

**Agents need "credit card mode"** - users delegate freely because undo is trivial.

### Trust Primitives

| Primitive | What It Enables |
|-----------|-----------------|
| **Branching** | Agent works in isolation, merge when happy |
| **Snapshots** | Point-in-time state before agent acts |
| **Undo/Rollback** | One-click "nevermind" on any action |
| **Dry Run** | "Show me what you'd do" before doing |
| **Audit Log** | Full history of who did what |
| **Blast Radius** | Scope limits on what agent CAN touch |

### The Trust UI

```
┌─────────────────────────────────────────────────────┐
│  Agent Activity                        [Undo All ▼] │
├─────────────────────────────────────────────────────┤
│  ↩️  @coder modified auth.ts              [Undo]    │
│  ↩️  @coder modified auth.test.ts         [Undo]    │
│  ↩️  @ops deployed to staging             [Rollback]│
│  📧  @cx emailed users                    [View]    │
│  ⚠️  @coder wants to modify prod DB      [Review]  │
└─────────────────────────────────────────────────────┘
```

---

## Agent Model

### Agent Identity

Each agent has:
- **Name** - `@coder`, `@ops`, `@researcher`
- **Avatar** - visual identity
- **Scope** - what files/systems it can access
- **Skills** - packaged capabilities
- **Memory** - persistent context about its domain
- **Status** - idle, working, waiting for approval

### Agent Communication

```
You: @coder add OAuth login, @maria review when ready

@coder: Done. Added OAuth with Google/GitHub.
        Branch: agent/oauth-login
        @maria ready for review.

@maria: @coder why localStorage for tokens? XSS risk.

@coder: Good catch. Refactoring to httpOnly cookies.
        @ops heads up - CORS config needs update.

@ops: Noted. Prepping config, ping when refactor done.
```

Humans and agents in the same thread. Context flows naturally.

### Agent Delegation

Agents can delegate to other agents:

```
You: @lead ship the new onboarding flow

@lead: Breaking this down:
       → @coder: Implement OnboardingWizard
       → @writer: Draft onboarding copy
       → @ops: Prepare feature flag

       I'll coordinate. ETA ~2 hours.
       [Watch progress] [Pause]
```

---

## Context Sharing

Not a graph you stare at. A **living shared memory**.

```
┌─────────────────────────────────────────────────┐
│               CONTEXT POOL                       │
├─────────────────────────────────────────────────┤
│ Project: navi-app                               │
│ ├── Architecture decisions (from @coder)        │
│ ├── Deployment config (from @ops)               │
│ ├── User feedback themes (from @cx)             │
│ └── Current sprint goals (from you)             │
│                                                 │
│ Agents can:                                     │
│ • PUBLISH: "Deployed v2.3 to prod"             │
│ • QUERY: "What's the DB schema?"               │
│ • SUBSCRIBE: "Tell me when tests fail"         │
└─────────────────────────────────────────────────┘
```

Agents don't just share files. They share **understanding**.

---

## The Transition Path

Build incrementally. Each phase is useful on its own.

### Phase 1: Agents as Personas (Now → Soon)
- Add `@agent` syntax to chat input
- `@claude` = current behavior (default)
- First specialized agent: `@git` (wraps existing git feature)
- Agent branches for all work

**Value:** Clearer mental model, scoped expectations.

### Phase 2: Agents with Memory (Soon → Next)
- Persistent agent memory per project
- Agents can see what other agents did
- Context sharing primitives
- Trust UI (action timeline, undo buttons)

**Value:** Agents that learn, easier review.

### Phase 3: Background Agents (Next)
- Task queue for agent work
- Notifications when done/stuck
- Approval gates for risky actions
- Agent-to-agent delegation

**Value:** True delegation. "Do this, tell me when done."

### Phase 4: Human Collaboration (Later)
- Multi-user projects
- Real-time presence
- Shared agents
- Team permissions

**Value:** Humans + agents as true team.

---

## What Makes This Different

| Others | Navi |
|--------|------|
| One model, one chat | Named agents, clear roles |
| Session-based | Persistent memory |
| You drive everything | Agents delegate to agents |
| Cloud-only | Local-first, cloud-optional |
| Closed ecosystem | Open skills/integrations |
| Watch it work | Delegate and check in |
| No undo | Everything reversible |

---

## The Tagline

> **Navi: Delegate with confidence.**
>
> Agents work in branches. Every action logged.
> One-click undo on anything. Review when you want, not because you're scared.

---

## Priority Order

1. **Trust Layer** - Multiplier on everything. Users won't delegate without it.
2. **Context/Integrations** - Expands what agents can do.
3. **Human Collaboration** - Amplifies value once 1 & 2 work.

---

## Open Questions

1. **Agent scoping** - Explicit paths? Implicit trust levels?
2. **Context sharing** - Opt-in per share? Auto-share within project?
3. **Execution** - Local-first with cloud optional? Cloud-native?
4. **First agents** - Beyond `@coder`: `@git`? `@researcher`? `@reviewer`?
5. **Failure handling** - Agent stuck → escalate to you? To another agent?
6. **Skill packaging** - How do power users share agents/skills with normies?

---

## Success Metrics (Future)

- Time from task → delegation (seconds, not minutes of prompting)
- % of agent actions that DON'T need manual review
- Undo usage (indicates trust calibration)
- Agent-to-agent delegations (indicates working autonomy)
- Human collaboration sessions (indicates team adoption)

---

*Last updated: December 2024*
*Status: Vision document - not yet implemented*
