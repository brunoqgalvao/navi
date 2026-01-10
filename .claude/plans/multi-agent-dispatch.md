# Multi-Agent Dispatch System - Implementation Plan

> Dispatch multiple Claude agents to work on tasks in parallel, coordinating through a parent orchestrator.

## Overview

Enable users to spawn multiple Claude agents that work concurrently on different aspects of a task. A parent session orchestrates, dispatches subtasks, and collects results.

---

## Mental Model

```
User Request: "Build a full-stack todo app"
         │
         ▼
   ┌─────────────────┐
   │  Parent Agent   │  ← Orchestrator, plans & coordinates
   │  (Opus/Sonnet)  │
   └────────┬────────┘
            │
   ┌────────┼────────┬────────────┐
   ▼        ▼        ▼            ▼
┌──────┐ ┌──────┐ ┌──────┐   ┌──────┐
│Agent │ │Agent │ │Agent │   │Agent │
│ API  │ │ UI   │ │ DB   │   │Tests │
└──────┘ └──────┘ └──────┘   └──────┘
   │        │        │            │
   └────────┴────────┴────────────┘
                  │
                  ▼
         Merged Result to User
```

---

## Core Concepts

### 1. Agent Session
An independent Claude execution context with:
- Own conversation history
- Own tool permissions
- Own working context
- Can spawn child agents (up to depth 3)

### 2. Agent Roles
Pre-defined specializations:
- **Backend Developer** - API, database, server logic
- **Frontend Developer** - UI, components, styling
- **Test Engineer** - Unit tests, integration tests
- **DevOps** - Deployment, CI/CD, infrastructure
- **Researcher** - Code exploration, documentation
- **Reviewer** - Code review, suggestions

### 3. Communication
- **Downward**: Parent sends task + context to child
- **Upward**: Child delivers result/error to parent
- **Lateral**: Children can query sibling status (read-only)
- **Escalation**: Child can escalate blockers to parent

### 4. Shared State
- **Decisions Log**: Architectural choices visible to all
- **Artifacts**: Files created, tracked across agents
- **Project Context**: Shared understanding of codebase

---

## Architecture

### New Files

```
packages/navi-app/
├── src/lib/features/agents/
│   ├── index.ts                    # Public exports
│   ├── types.ts                    # Agent, Task, Result types
│   ├── api.ts                      # Backend API client
│   ├── stores.ts                   # Agent state management
│   └── components/
│       ├── AgentPanel.svelte       # Shows active agents
│       ├── AgentCard.svelte        # Individual agent status
│       ├── AgentTree.svelte        # Hierarchical view
│       ├── AgentOutput.svelte      # Agent's work output
│       └── SpawnAgentModal.svelte  # Manual agent creation
│
├── server/
│   ├── routes/agents.ts            # Agent API routes
│   └── services/
│       └── agent-orchestrator.ts   # Agent lifecycle management
```

### Database Schema

```sql
-- Agent sessions (extends existing sessions)
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  parent_agent_id TEXT REFERENCES agent_sessions(id),
  role TEXT NOT NULL,                    -- 'backend', 'frontend', etc.
  status TEXT DEFAULT 'pending',         -- pending, running, completed, failed, blocked
  task TEXT NOT NULL,                    -- What this agent should do
  context TEXT,                          -- Additional context from parent
  result TEXT,                           -- Deliverable when done
  result_type TEXT,                      -- 'code', 'research', 'decision', 'error'
  depth INTEGER DEFAULT 0,               -- Nesting level (max 3)
  created_at TEXT,
  completed_at TEXT
);

-- Shared decisions across agents
CREATE TABLE agent_decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  agent_id TEXT REFERENCES agent_sessions(id),
  category TEXT,                         -- 'architecture', 'api', 'styling', etc.
  decision TEXT NOT NULL,
  rationale TEXT,
  created_at TEXT
);

-- Artifacts created by agents
CREATE TABLE agent_artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  agent_id TEXT REFERENCES agent_sessions(id),
  path TEXT NOT NULL,
  description TEXT,
  created_at TEXT
);

-- Escalations from child to parent
CREATE TABLE agent_escalations (
  id TEXT PRIMARY KEY,
  from_agent_id TEXT REFERENCES agent_sessions(id),
  to_agent_id TEXT REFERENCES agent_sessions(id),
  type TEXT NOT NULL,                    -- 'question', 'blocker', 'decision_needed'
  summary TEXT NOT NULL,
  context TEXT,
  response TEXT,
  status TEXT DEFAULT 'pending',         -- pending, resolved
  created_at TEXT,
  resolved_at TEXT
);
```

### Types

```typescript
interface AgentSession {
  id: string;
  sessionId: string;
  parentAgentId: string | null;
  role: AgentRole;
  status: AgentStatus;
  task: string;
  context?: string;
  result?: string;
  resultType?: 'code' | 'research' | 'decision' | 'error';
  depth: number;
  createdAt: string;
  completedAt?: string;
  children?: AgentSession[];
}

type AgentRole =
  | 'backend'
  | 'frontend'
  | 'test'
  | 'devops'
  | 'researcher'
  | 'reviewer'
  | 'custom';

type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked';

interface AgentDecision {
  id: string;
  agentId: string;
  category: string;
  decision: string;
  rationale?: string;
  createdAt: string;
}

interface AgentEscalation {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: 'question' | 'blocker' | 'decision_needed' | 'permission';
  summary: string;
  context?: string;
  response?: string;
  status: 'pending' | 'resolved';
}
```

### API Routes

```
# Agent Management
POST   /api/sessions/:id/agents          # Spawn new agent
GET    /api/sessions/:id/agents          # List all agents in session
GET    /api/sessions/:id/agents/tree     # Get agent hierarchy
GET    /api/agents/:id                   # Get agent details
DELETE /api/agents/:id                   # Cancel agent

# Agent Communication
POST   /api/agents/:id/deliver           # Child delivers result to parent
POST   /api/agents/:id/escalate          # Child escalates to parent
POST   /api/agents/:id/respond           # Parent responds to escalation
GET    /api/agents/:id/context/:source   # Get context (parent/sibling/decisions)

# Shared State
GET    /api/sessions/:id/decisions       # Get all decisions
POST   /api/sessions/:id/decisions       # Log new decision
GET    /api/sessions/:id/artifacts       # Get all artifacts
POST   /api/sessions/:id/artifacts       # Register artifact
```

---

## Implementation Steps

### Phase 1: Database & Types
1. [ ] Add agent-related tables to database schema
2. [ ] Create TypeScript types in `features/agents/types.ts`
3. [ ] Add database helper functions for agent CRUD

### Phase 2: Backend Infrastructure
4. [ ] Create `agent-orchestrator.ts` service
5. [ ] Implement agent spawning (creates new Claude session)
6. [ ] Implement agent lifecycle management (status transitions)
7. [ ] Create `/api/sessions/:id/agents` routes

### Phase 3: Agent Communication
8. [ ] Implement `deliver` endpoint (child → parent)
9. [ ] Implement `escalate` endpoint (child → parent)
10. [ ] Implement `get_context` endpoint (read parent/sibling/decisions)
11. [ ] Implement decisions & artifacts logging

### Phase 4: Frontend - Agent Panel
12. [ ] Create `AgentPanel.svelte` component
13. [ ] Create `AgentCard.svelte` for individual agent status
14. [ ] Create `AgentTree.svelte` for hierarchical view
15. [ ] Add agent panel to session view (collapsible sidebar)

### Phase 5: Integration with Claude
16. [ ] Add MCP tools for agent operations (spawn, deliver, escalate, etc.)
17. [ ] Create system prompt additions for agent-aware behavior
18. [ ] Test parent-child communication flow
19. [ ] Test multi-agent parallel execution

### Phase 6: UI Enhancements
20. [ ] Real-time status updates via WebSocket
21. [ ] Agent output streaming
22. [ ] Manual agent spawning UI
23. [ ] Escalation resolution UI

### Phase 7: Polish
24. [ ] Depth limiting (max 3 levels)
25. [ ] Timeout handling for stuck agents
26. [ ] Cleanup of completed agent sessions
27. [ ] Documentation and examples

---

## MCP Tools for Agents

These tools are exposed to Claude when running as an agent:

### `spawn_agent`
```typescript
{
  title: string;        // Short description
  role: AgentRole;      // Specialization
  task: string;         // What to do
  context?: string;     // Additional context
  model?: 'opus' | 'sonnet' | 'haiku';
}
```

### `deliver`
```typescript
{
  type: 'code' | 'research' | 'decision' | 'artifact' | 'error';
  summary: string;      // Brief summary
  content: string;      // Full deliverable
  artifacts?: Array<{ path: string; description?: string }>;
}
```

### `escalate`
```typescript
{
  type: 'question' | 'decision_needed' | 'blocker' | 'permission';
  summary: string;
  context: string;
  options?: string[];   // For decision_needed
}
```

### `get_context`
```typescript
{
  source: 'parent' | 'sibling' | 'decisions' | 'artifacts';
  query: string;        // What to look for
  sibling_role?: string; // For sibling queries
}
```

### `log_decision`
```typescript
{
  decision: string;
  category?: string;
  rationale?: string;
}
```

---

## Agent Lifecycle

```
                    spawn_agent
                         │
                         ▼
                    ┌─────────┐
                    │ PENDING │
                    └────┬────┘
                         │ start execution
                         ▼
                    ┌─────────┐
              ┌─────│ RUNNING │─────┐
              │     └────┬────┘     │
              │          │          │
         escalate    complete    error/timeout
              │          │          │
              ▼          ▼          ▼
         ┌─────────┐ ┌─────────┐ ┌────────┐
         │ BLOCKED │ │COMPLETED│ │ FAILED │
         └────┬────┘ └─────────┘ └────────┘
              │
         resolved
              │
              ▼
         ┌─────────┐
         │ RUNNING │ (resume)
         └─────────┘
```

---

## Example Flow

**User**: "Build a REST API for a todo app with tests"

**Parent Agent**:
1. Analyzes task, breaks into subtasks
2. Spawns Backend Agent: "Create Express API with CRUD for todos"
3. Spawns Test Agent: "Write integration tests for todo API"
4. Monitors progress, receives deliverables
5. Merges results, presents to user

**Backend Agent**:
1. Receives task + project context
2. Creates `src/api/todos.ts`
3. Logs decision: "Using Express with TypeScript"
4. Delivers: code artifact + summary

**Test Agent**:
1. Queries sibling (Backend) for API contract
2. Waits for Backend to log decisions
3. Creates `tests/todos.test.ts`
4. Delivers: test artifact + summary

---

## Security Considerations

- **Depth limit**: Max 3 levels to prevent infinite spawning
- **Resource limits**: Max concurrent agents per session
- **Timeout**: Agents killed after configurable timeout
- **Permissions**: Children inherit parent's tool permissions
- **File access**: Agents can only access project directory

---

## Future Enhancements

- **Agent templates**: Pre-configured agent teams for common tasks
- **Persistent agents**: Long-running agents that watch for changes
- **Agent memory**: Agents remember past interactions
- **Cross-session agents**: Agents that work across projects
- **Human-in-the-loop**: Escalations that ping the user
- **Agent marketplace**: Share agent configurations
- **Replay**: Re-run agent orchestration with different parameters
