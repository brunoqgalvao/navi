# Trust Layer Architecture

> The foundation that makes delegation possible.

## Core Principle

Users won't delegate to agents if they fear the consequences. The Trust Layer removes that fear.

```
Trust = Reversibility × Visibility × Scope Control
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      TRUST LAYER                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Branch    │  │   Action    │  │    Scope            │   │
│  │   Manager   │  │   Timeline  │  │    Enforcer         │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                │                     │              │
│         ▼                ▼                     ▼              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   State Snapshots                        │ │
│  │         (Git commits + DB snapshots + Audit log)         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Component 1: Branch Manager

Every agent action happens in a branch. Never on main.

### Behavior

```
User: @coder add OAuth login

System:
1. Create branch: agent/coder/oauth-login-{timestamp}
2. Agent works in that branch
3. When done, present diff
4. User merges OR discards

No merge = no changes. Zero risk.
```

### Branch Naming Convention

```
agent/{agent-name}/{task-slug}-{timestamp}
agent/coder/oauth-login-1704067200
agent/ops/deploy-staging-1704067500
```

### API

```typescript
interface BranchManager {
  // Create isolated branch for agent work
  createAgentBranch(agentName: string, taskDescription: string): Promise<string>;

  // List all agent branches
  listAgentBranches(projectPath: string): Promise<AgentBranch[]>;

  // Merge agent work into main
  mergeAgentBranch(branchName: string): Promise<MergeResult>;

  // Discard agent work entirely
  discardAgentBranch(branchName: string): Promise<void>;

  // Get diff between branch and main
  getBranchDiff(branchName: string): Promise<Diff>;
}

interface AgentBranch {
  name: string;
  agentName: string;
  taskDescription: string;
  createdAt: Date;
  status: 'active' | 'merged' | 'discarded';
  filesChanged: number;
}
```

### UI

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Branches                                    [+ New]  │
├─────────────────────────────────────────────────────────────┤
│  🔀 agent/coder/oauth-login                                 │
│     3 files changed · 2 hours ago                           │
│     [View Diff] [Merge ✓] [Discard ✗]                       │
├─────────────────────────────────────────────────────────────┤
│  🔀 agent/ops/staging-config                                │
│     1 file changed · 5 hours ago                            │
│     [View Diff] [Merge ✓] [Discard ✗]                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Component 2: Action Timeline

Every agent action is logged. Every action can be inspected. Many can be undone.

### Action Types

```typescript
type ActionType =
  | 'file_create'
  | 'file_modify'
  | 'file_delete'
  | 'command_execute'
  | 'api_call'
  | 'deploy'
  | 'message_send'
  | 'branch_create'
  | 'branch_merge';

interface AgentAction {
  id: string;
  agentName: string;
  type: ActionType;
  description: string;
  timestamp: Date;

  // Reversibility
  reversible: boolean;
  reverseAction?: () => Promise<void>;

  // Context
  branch?: string;
  files?: string[];
  command?: string;

  // State
  status: 'pending' | 'executed' | 'undone' | 'failed';

  // Approval (for high-risk actions)
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;
}
```

### Reversibility Matrix

| Action | Reversible | How |
|--------|-----------|-----|
| File create | ✅ | Delete file |
| File modify | ✅ | Git checkout previous |
| File delete | ✅ | Git checkout previous |
| Branch create | ✅ | Delete branch |
| Branch merge | ⚠️ | Revert commit |
| Command (read) | ✅ | No-op (no side effects) |
| Command (write) | ⚠️ | Depends on command |
| API call (GET) | ✅ | No-op |
| API call (POST) | ⚠️ | Compensating action if available |
| Deploy | ⚠️ | Rollback to previous |
| Email/message | ❌ | Can't unsend |

### API

```typescript
interface ActionTimeline {
  // Log an action
  logAction(action: AgentAction): Promise<void>;

  // Get actions for a project/agent/branch
  getActions(filters: ActionFilters): Promise<AgentAction[]>;

  // Undo a specific action
  undoAction(actionId: string): Promise<UndoResult>;

  // Undo all actions from an agent in a session
  undoAgentSession(agentName: string, sessionId: string): Promise<UndoResult[]>;

  // Request approval for pending action
  requestApproval(actionId: string): Promise<void>;

  // Approve/reject pending action
  resolveApproval(actionId: string, approved: boolean): Promise<void>;
}
```

### UI

```
┌─────────────────────────────────────────────────────────────┐
│  Action Timeline                      [Filter ▼] [Undo All] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TODAY                                                      │
│  ├─ 14:32  @coder  Created auth.ts            [Undo ↩️]     │
│  ├─ 14:33  @coder  Modified package.json      [Undo ↩️]     │
│  ├─ 14:35  @coder  Ran: npm install           [View 👁️]     │
│  └─ 14:40  @ops    Deployed to staging        [Rollback ↩️] │
│                                                             │
│  PENDING APPROVAL                                           │
│  └─ ⚠️  @coder  Wants to modify prod.db      [Approve/Deny] │
│                                                             │
│  YESTERDAY                                                  │
│  └─ 09:15  @coder  Merged oauth-login         [Revert ↩️]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component 3: Scope Enforcer

Limits what agents can access. Blast radius control.

### Scope Definition

```typescript
interface AgentScope {
  agentName: string;

  // File system access
  paths: {
    read: string[];    // Glob patterns
    write: string[];   // Glob patterns
    forbidden: string[]; // Always blocked
  };

  // Command execution
  commands: {
    allowed: string[];  // Whitelist or '*'
    forbidden: string[]; // Blacklist
    requireApproval: string[]; // Ask before running
  };

  // External access
  network: {
    allowed: string[];  // Domains/IPs
    forbidden: string[];
  };

  // Other agents
  canDelegate: string[]; // Agent names this agent can call
}
```

### Default Scopes

```typescript
const CODER_SCOPE: AgentScope = {
  agentName: '@coder',
  paths: {
    read: ['**/*'],
    write: ['src/**', 'tests/**', 'package.json'],
    forbidden: ['.env*', '**/secrets/**', '**/*.pem']
  },
  commands: {
    allowed: ['npm *', 'node *', 'git *', 'bun *'],
    forbidden: ['rm -rf /', 'sudo *'],
    requireApproval: ['npm publish', 'git push']
  },
  network: {
    allowed: ['npmjs.com', 'github.com'],
    forbidden: []
  },
  canDelegate: ['@reviewer', '@researcher']
};

const OPS_SCOPE: AgentScope = {
  agentName: '@ops',
  paths: {
    read: ['**/*'],
    write: ['infra/**', 'deploy/**', 'docker-compose.yml'],
    forbidden: ['.env.production']
  },
  commands: {
    allowed: ['docker *', 'kubectl *', 'gcloud *'],
    forbidden: [],
    requireApproval: ['*deploy*', '*production*']
  },
  network: {
    allowed: ['*'],
    forbidden: []
  },
  canDelegate: ['@coder']
};
```

### Enforcement

```typescript
interface ScopeEnforcer {
  // Check before action
  canPerform(agentName: string, action: ProposedAction): ScopeCheck;

  // Wrap agent to enforce scope
  wrapAgent(agent: Agent, scope: AgentScope): ScopedAgent;

  // Update scope
  updateScope(agentName: string, scope: Partial<AgentScope>): void;
}

interface ScopeCheck {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
}
```

### UI

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Scopes                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  @coder                                          [Edit ✏️]  │
│  ├─ Files: src/**, tests/**                                │
│  ├─ Forbidden: .env*, secrets/                             │
│  ├─ Commands: npm, node, git, bun                          │
│  └─ Approval needed: npm publish, git push                 │
│                                                             │
│  @ops                                            [Edit ✏️]  │
│  ├─ Files: infra/**, deploy/**                             │
│  ├─ Commands: docker, kubectl, gcloud                      │
│  └─ Approval needed: *deploy*, *production*                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component 4: State Snapshots

Capture full state before risky operations. Enable complete rollback.

### Snapshot Triggers

- Before agent starts a task
- Before any "requiresApproval" action
- Before merge
- On-demand by user

### What's Captured

```typescript
interface StateSnapshot {
  id: string;
  createdAt: Date;
  trigger: 'agent_start' | 'before_action' | 'before_merge' | 'manual';

  // Git state
  git: {
    branch: string;
    commit: string;
    uncommittedChanges: string[];
  };

  // Optional: DB state (for projects with local DB)
  database?: {
    tables: string[];
    backupPath: string;
  };

  // Context state
  context: {
    agentMemories: Record<string, any>;
    projectContext: any;
  };

  // Metadata
  agentName?: string;
  taskDescription?: string;
}
```

### API

```typescript
interface SnapshotManager {
  // Create snapshot
  createSnapshot(trigger: SnapshotTrigger): Promise<StateSnapshot>;

  // List snapshots
  listSnapshots(projectPath: string): Promise<StateSnapshot[]>;

  // Restore to snapshot
  restoreSnapshot(snapshotId: string): Promise<RestoreResult>;

  // Compare current state to snapshot
  diffFromSnapshot(snapshotId: string): Promise<StateDiff>;
}
```

---

## Integration: How It All Works Together

### Flow: Agent Task Execution

```
1. User: "@coder add OAuth login"

2. Branch Manager:
   - Creates branch: agent/coder/oauth-login-xxx
   - Switches agent context to branch

3. Snapshot Manager:
   - Creates snapshot before agent starts

4. Scope Enforcer:
   - Loads @coder's scope
   - Wraps agent to enforce limits

5. Agent works (in branch):
   - Each action checked against scope
   - Each action logged to timeline
   - Forbidden actions blocked
   - Approval-required actions queued

6. Agent completes:
   - Summary of changes
   - Diff view available
   - User chooses: [Merge] [Discard] [Edit more]

7. If merged:
   - Merge recorded in timeline
   - Snapshot available for future rollback

8. If discarded:
   - Branch deleted
   - Like it never happened
```

### Flow: Undo Request

```
1. User clicks [Undo] on action

2. Timeline checks:
   - Is action reversible?
   - What's the reverse action?

3. If reversible:
   - Execute reverse action
   - Log the undo in timeline
   - Update UI

4. If not reversible:
   - Show options:
     - "Rollback to snapshot before this?"
     - "This action cannot be undone"
```

---

## Database Schema

```sql
-- Agent branches
CREATE TABLE agent_branches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  task_description TEXT,
  status TEXT DEFAULT 'active', -- active, merged, discarded
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Action timeline
CREATE TABLE agent_actions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT,
  details JSON,
  reversible BOOLEAN DEFAULT TRUE,
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by TEXT,
  approved_at DATETIME,
  status TEXT DEFAULT 'executed', -- pending, executed, undone, failed
  branch_id TEXT REFERENCES agent_branches(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- State snapshots
CREATE TABLE state_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  git_branch TEXT,
  git_commit TEXT,
  context_data JSON,
  agent_name TEXT,
  task_description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent scopes
CREATE TABLE agent_scopes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  scope_config JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, agent_name)
);
```

---

## Implementation Priority

### Phase 1: Branch-Based Safety
- [x] Git integration exists
- [ ] Auto-create branch per agent task
- [ ] Branch list UI in sidebar
- [ ] Merge/discard buttons
- [ ] Diff view before merge

### Phase 2: Action Timeline
- [ ] Action logging infrastructure
- [ ] Timeline UI component
- [ ] Basic undo for file operations
- [ ] Approval queue for risky actions

### Phase 3: Scope Enforcement
- [ ] Scope definition schema
- [ ] Enforcement middleware
- [ ] Scope editor UI
- [ ] Default scope templates

### Phase 4: Snapshots
- [ ] Git state capture
- [ ] Snapshot list UI
- [ ] Restore functionality
- [ ] Snapshot comparison view

---

*This is the foundation. Everything else builds on being able to trust agents.*
