// Kanban types

export type KanbanStatus =
  | "spec"
  | "execute"
  | "review"
  | "done"
  | "archived";

export interface KanbanCard {
  id: string;
  project_id: string;
  session_id: string | null;
  title: string;
  spec: string | null;
  status: KanbanStatus;
  status_message: string | null;
  blocked: boolean; // Card-level blocked state
  sort_order: number;
  created_at: number;
  updated_at: number;
  session_title?: string;
}

export interface KanbanColumn {
  id: KanbanStatus;
  title: string;
  description: string;
}

// Simplified 4-column flow
export const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "spec",
    title: "Spec",
    description: "Define what needs to be done",
  },
  {
    id: "execute",
    title: "Execute",
    description: "Agent is working",
  },
  {
    id: "review",
    title: "Review",
    description: "Verify the work",
  },
  {
    id: "done",
    title: "Done",
    description: "Completed tasks",
  },
];

// Legacy status mapping (for migration)
export function normalizeStatus(status: string): KanbanStatus {
  if (status === "in_progress" || status === "blocked" || status === "waiting_review") {
    // Map old statuses to new ones
    if (status === "in_progress" || status === "blocked") return "execute";
    if (status === "waiting_review") return "review";
  }
  return status as KanbanStatus;
}
