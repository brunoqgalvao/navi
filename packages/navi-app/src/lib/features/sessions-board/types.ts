/**
 * Sessions Board Types
 *
 * State machine columns:
 * - Working: Currently executing (running)
 * - Needs Approval: Waiting on tool permission
 * - Needs Review: Completed, marked for review
 * - Idle: Inactive/done
 */

export type BoardColumnType = "working" | "needs_approval" | "needs_review" | "idle";

export interface BoardColumn {
  type: BoardColumnType;
  label: string;
  description: string;
  color: string; // Tailwind color class
}

export const BOARD_COLUMNS: BoardColumn[] = [
  {
    type: "working",
    label: "Working",
    description: "Currently executing",
    color: "text-green-500",
  },
  {
    type: "needs_approval",
    label: "Needs Approval",
    description: "Waiting on tool permission",
    color: "text-yellow-500",
  },
  {
    type: "needs_review",
    label: "Needs Review",
    description: "Completed, needs review",
    color: "text-blue-500",
  },
  {
    type: "idle",
    label: "Idle",
    description: "Inactive or done",
    color: "text-gray-500",
  },
];

export interface BoardSession {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  branch?: string;
  messageCount: number;
  lastActivity: number; // timestamp
  model?: string;
  costUsd: number;
  columnType: BoardColumnType;
  // Extra metadata for display
  worktreeBranch?: string;
  isUntilDoneMode?: boolean;
  untilDoneIteration?: number;
  agentStatus?: string;
}

export interface BoardGroup {
  projectId: string;
  projectName: string;
  projectPath: string;
  sessionCount: number;
  columns: {
    working: BoardSession[];
    needs_approval: BoardSession[];
    needs_review: BoardSession[];
    idle: BoardSession[];
  };
}

export interface BoardData {
  groups: BoardGroup[];
  totals: {
    working: number;
    needs_approval: number;
    needs_review: number;
    idle: number;
  };
}
