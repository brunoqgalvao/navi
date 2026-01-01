# Navi Roadmap

> From chat tool to agent workspace.

## What We Have (Current Navi)

| Feature | Status | Reusable For Vision |
|---------|--------|---------------------|
| Chat with Claude | ✅ Done | → Conversation layer |
| Git integration (stage, commit, diff) | ✅ Done | → Trust layer (branching) |
| Diff viewer | ✅ Done | → Review UI |
| Session/project management | ✅ Done | → Agent context |
| Terminal integration | ✅ Done | → Agent execution |
| File browser + preview | ✅ Done | → Agent workspace |
| Cost tracking | ✅ Done | → Agent analytics |
| Tool result rendering | ✅ Done | → Action timeline |
| SQLite persistence | ✅ Done | → Agent memory |
| WebSocket streaming | ✅ Done | → Real-time updates |
| Tauri desktop app | ✅ Done | → Native experience |
| Navi Control Skill | ✅ Done | → Agent orchestration |

**Good news:** Most foundation is there. We're adding layers, not rebuilding.

---

## Phase 1: Agent Identity (January 2025)

### Goal
Make agents feel like teammates, not just "Claude."

### Features

#### 1.1 @mention Syntax
```
You: @coder add OAuth login
You: @researcher find best practices for rate limiting
You: @git commit with message "feat: add OAuth"
```

- Parse @mentions in chat input
- Route to appropriate agent/behavior
- `@claude` = current default behavior

#### 1.2 Agent Registry
```typescript
interface Agent {
  name: string;        // @coder
  displayName: string; // "Coder"
  avatar: string;      // emoji or image
  description: string;
  systemPrompt: string;
  scope: AgentScope;   // from Trust Layer
  status: 'idle' | 'working' | 'waiting';
}
```

Default agents:
- `@claude` - General assistant (current behavior)
- `@coder` - Code-focused, uses tools aggressively
- `@git` - Wraps git feature, specialized for version control

#### 1.3 Agent Presence in Chat
```
┌─────────────────────────────────────────────────────────────┐
│ Chat                                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ You: @coder add a dark mode toggle                          │
│                                                             │
│ @coder 🤖                                                   │
│ Working on it... [src/components/DarkModeToggle.tsx]        │
│ ████████░░░░░░░░                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

1. **Chat input parser** - detect @mentions, extract agent name
2. **Agent store** - Svelte store for agent registry
3. **Agent selector UI** - show available agents
4. **Message attribution** - show which agent responded
5. **Agent avatars** - visual identity in chat

### Files to Modify
- `src/lib/components/ChatInput.svelte` - @mention detection
- `src/lib/stores/agents.ts` - new store
- `src/lib/components/Message.svelte` - agent attribution
- `server/routes/chat.ts` - agent routing

---

## Phase 2: Branch-Based Safety (February 2025)

### Goal
Every agent task happens in a branch. Merge or discard.

### Features

#### 2.1 Auto-Branch Creation
When agent starts a task:
```
@coder: Creating branch `agent/coder/dark-mode-toggle`
        I'll work here, you can merge when happy.
```

#### 2.2 Branch Sidebar
```
┌─────────────────────┐
│ Agent Branches      │
├─────────────────────┤
│ 🔀 agent/coder/...  │
│    3 files · 2h ago │
│    [Diff] [✓] [✗]   │
├─────────────────────┤
│ 🔀 agent/git/...    │
│    1 file · 5h ago  │
│    [Diff] [✓] [✗]   │
└─────────────────────┘
```

#### 2.3 Merge/Discard Flow
```
@coder: Done! Branch `agent/coder/dark-mode` ready.

        Files changed: 4
        +142 / -23 lines

        [View Diff] [Merge to main ✓] [Discard ✗]
```

### Implementation

1. **Branch manager service** - create/list/merge/discard
2. **Branch UI component** - sidebar panel
3. **Diff integration** - reuse existing diff viewer
4. **Agent task wrapper** - auto-create branch on task start

### Files to Create/Modify
- `server/services/branchManager.ts` - new service
- `src/lib/features/trust/BranchPanel.svelte` - new component
- `src/lib/features/trust/` - new feature folder
- Modify agent execution to wrap in branch

---

## Phase 3: Action Timeline (March 2025)

### Goal
See everything agents did. Undo what you don't like.

### Features

#### 3.1 Action Logging
Every agent action recorded:
- File creates/modifies/deletes
- Commands executed
- API calls made

#### 3.2 Timeline UI
```
┌─────────────────────────────────────────────────────────────┐
│ Activity                                    [Undo All ▼]    │
├─────────────────────────────────────────────────────────────┤
│ 14:32  @coder  Created DarkModeToggle.tsx      [Undo ↩️]    │
│ 14:33  @coder  Modified App.tsx                [Undo ↩️]    │
│ 14:35  @coder  Ran: npm install tailwind       [View 👁️]    │
│ 14:38  @git    Committed "feat: dark mode"     [Revert ↩️]  │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 Undo Actions
One-click undo for reversible actions.

### Implementation

1. **Action logger** - intercept/log all tool calls
2. **Timeline store** - Svelte store for actions
3. **Timeline UI** - collapsible panel
4. **Undo service** - reverse actions where possible
5. **DB schema** - `agent_actions` table

---

## Phase 4: Agent Memory (April 2025)

### Goal
Agents remember context across sessions.

### Features

#### 4.1 Persistent Memory
```typescript
interface AgentMemory {
  agentName: string;
  projectId: string;
  memories: {
    key: string;
    value: any;
    createdAt: Date;
    source: 'agent' | 'user' | 'system';
  }[];
}
```

#### 4.2 Memory Access
Agents can:
- Store: "Remember that we use Tailwind for styling"
- Recall: "What styling system does this project use?"
- Share: Other agents can query shared memories

#### 4.3 Memory UI
```
┌─────────────────────────────────────────────────────────────┐
│ @coder's Memory for navi-app                                │
├─────────────────────────────────────────────────────────────┤
│ • Uses Tailwind CSS for styling                             │
│ • Prefers functional components                             │
│ • Test files go in __tests__ folders                        │
│ • [Edit] [Clear]                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Background Agents (May 2025)

### Goal
Delegate and move on. Agents work while you do other things.

### Features

#### 5.1 Task Queue
```
You: @coder refactor the auth module
     [Run in background ◻️]
```

#### 5.2 Notifications
```
🔔 @coder finished "refactor auth module"
   4 files changed · [Review] [Merge] [Dismiss]
```

#### 5.3 Agent Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│ Running Agents                                              │
├─────────────────────────────────────────────────────────────┤
│ @coder     Refactoring auth...      ████████░░  [Pause]     │
│ @researcher Investigating rate...   ██████████  [Done]      │
│ @ops       Waiting for approval     ⏸️ Blocked  [Review]    │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 6: Context Sharing (June 2025)

### Goal
Agents share understanding, not just files.

### Features

#### 6.1 Context Pool
Shared knowledge base for project:
- Architecture decisions
- Coding conventions
- Recent changes
- External integrations

#### 6.2 Agent Communication
```
@coder: Done with OAuth. @ops, CORS config needs updating
        for cookie domain.

@ops: Got it. I see you used httpOnly cookies.
      Updating staging config now.
```

---

## Phase 7: Human Collaboration (Q3 2025)

### Goal
Teammates join the workspace. Humans + agents as peers.

### Features

- Multi-user projects
- Real-time presence
- Shared agents
- Team permissions
- Notifications

---

## Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| 1 | Agent mentions used | 80% of tasks |
| 2 | Branch merge rate | 90%+ |
| 3 | Undo usage | < 10% (trust calibration) |
| 4 | Memory recalls | 5+ per session |
| 5 | Background tasks | 30%+ of tasks |
| 6 | Agent-to-agent messages | 20%+ of total |
| 7 | Multi-user sessions | TBD |

---

## Technical Debt to Address

Before scaling:
- [ ] Type safety across codebase
- [ ] Error handling standardization
- [ ] Test coverage > 60%
- [ ] Performance profiling
- [ ] Memory leak audit

---

## Open Questions

1. **Agent model** - Same Claude instance with different prompts? Or separate instances?
2. **Memory storage** - SQLite sufficient? Need vector DB for semantic search?
3. **Background execution** - Local only? Cloud workers option?
4. **Collaboration** - WebRTC for real-time? Or server-mediated?
5. **Pricing** - Per-seat? Per-agent-usage? Free forever?

---

*This roadmap is directional. Timelines will shift based on learnings.*
