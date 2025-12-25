# Kanban Project Type - Experimental Feature

## Overview

A special project type that presents tasks as a kanban board instead of a chat list. Tasks flow through columns and are executed by Claude sessions.

## Data Model

### New Table: `kanban_tasks`

```sql
CREATE TABLE kanban_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',  -- backlog | in_progress | review | done
  session_id TEXT,                          -- links to session when executing
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
```

### Project Extension

Add column to `projects` table:
```sql
ALTER TABLE projects ADD COLUMN project_type TEXT DEFAULT 'standard';
-- Values: 'standard' | 'kanban'
```

## File Structure

Keep isolated from main codebase:

```
src/lib/kanban/
  KanbanBoard.svelte        # Main board with 4 columns
  KanbanColumn.svelte       # Single column (droppable)
  KanbanCard.svelte         # Task card (draggable)
  KanbanTaskModal.svelte    # Create/edit task modal
  kanban-store.ts           # Svelte store for kanban state
  kanban-api.ts             # API client for kanban endpoints

server/
  kanban.ts                 # Route handlers for kanban API
```

## API Endpoints

```
GET    /api/projects/:id/kanban/tasks     # List tasks for project
POST   /api/projects/:id/kanban/tasks     # Create task
PATCH  /api/kanban/tasks/:id              # Update task (title, description, status)
DELETE /api/kanban/tasks/:id              # Delete task
POST   /api/kanban/tasks/:id/execute      # Start execution (creates session)
POST   /api/kanban/tasks/:id/approve      # Move from review to done
POST   /api/kanban/tasks/:id/followup     # Send followup, back to in_progress
POST   /api/projects/:id/kanban/reorder   # Reorder tasks within/across columns
```

## Columns

| Column | Status | Description |
|--------|--------|-------------|
| Backlog | `backlog` | New tasks waiting to be executed |
| In Progress | `in_progress` | Currently being executed by Claude |
| Review | `review` | Claude finished, awaiting user review |
| Done | `done` | Approved and completed |

## User Flow

### 1. Create Kanban Project
- In "New Project" modal, add project type toggle/selector
- When type is `kanban`, project opens KanbanBoard instead of session list

### 2. Add Task
- Click "+ Add Task" in Backlog column
- Enter title and optional description
- Task appears in Backlog

### 3. Execute Task
- Click "Execute" button on card in Backlog
- System creates a new session with task description as initial prompt
- Card moves to In Progress
- Card shows live status (spinner, current todo if available)

### 4. Automatic Review
- When Claude session completes (no more streaming, no pending permissions)
- Card automatically moves to Review column
- User can see the session output

### 5. Review Actions
- **Approve**: Card moves to Done
- **Request Changes**: Opens input for followup message, sends to session, card goes back to In Progress

### 6. View Session
- Click on card to view full session conversation
- Opens in a slide-over or modal (not full navigation)

## Integration Points

### App.svelte
```svelte
{#if currentProject?.project_type === 'kanban'}
  <KanbanBoard projectId={currentProject.id} />
{:else}
  <!-- existing chat view -->
{/if}
```

### Sidebar
- Show different icon for kanban projects (grid icon vs folder)
- Clicking kanban project doesn't show session list, just selects project

### Session Status
- Reuse existing `sessionStatus` store to track running/permission states
- When session tied to kanban task changes status, update card accordingly

## UI Design

```
┌─────────────────────────────────────────────────────────────────┐
│  Project: My Kanban  ⚙️                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐│
│  │  BACKLOG    │ │ IN PROGRESS │ │   REVIEW    │ │    DONE    ││
│  │             │ │             │ │             │ │            ││
│  │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌────────┐ ││
│  │ │ Task 1  │ │ │ │ Task 2  │ │ │ │ Task 3  │ │ │ │ Task 4 │ ││
│  │ │         │ │ │ │ ◐ Run...│ │ │ │ ✓ Aprv  │ │ │ │   ✓    │ ││
│  │ │ [Exec]  │ │ │ └─────────┘ │ │ │ ✎ Edit  │ │ │ └────────┘ ││
│  │ └─────────┘ │ │             │ │ └─────────┘ │ │            ││
│  │             │ │             │ │             │ │            ││
│  │ [+ Add]     │ │             │ │             │ │            ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Data Layer
- [ ] Add `project_type` column to projects table
- [ ] Create `kanban_tasks` table
- [ ] Create `server/kanban.ts` with CRUD routes
- [ ] Create `kanban-api.ts` client

### Phase 2: Basic UI
- [ ] Create `KanbanBoard.svelte` with static columns
- [ ] Create `KanbanColumn.svelte`
- [ ] Create `KanbanCard.svelte`
- [ ] Create `KanbanTaskModal.svelte`
- [ ] Add project type selector to new project modal
- [ ] Conditionally render KanbanBoard in App.svelte

### Phase 3: Drag & Drop
- [ ] Implement drag/drop between columns
- [ ] Implement reordering within columns
- [ ] Persist order changes

### Phase 4: Execution Flow
- [ ] Implement "Execute" → creates session
- [ ] Link session to task
- [ ] Show live status on card
- [ ] Auto-move to Review when complete

### Phase 5: Review Flow
- [ ] Implement "Approve" action
- [ ] Implement "Request Changes" with followup input
- [ ] Session slide-over view

## Open Questions

1. Should Done tasks be archived after some time?
2. Allow manual drag to any column, or enforce workflow?
3. Show cost per task (sum of session cost)?
4. Multiple execution attempts per task?
