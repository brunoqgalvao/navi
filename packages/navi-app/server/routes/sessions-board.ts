/**
 * @experimental This feature is experimental and may change or be removed.
 *
 * Sessions Board Routes
 *
 * Returns sessions grouped by state for the board view:
 * - Working: Currently executing (running)
 * - Needs Approval: Waiting on tool permission
 * - Needs Review: Completed, marked for review
 * - Idle: Inactive/done
 */

import { json } from "../utils/response";
import { projects, sessions, type Session } from "../db";

type BoardColumnType = "working" | "needs_approval" | "needs_review" | "idle";

interface BoardSession {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  branch?: string;
  messageCount: number;
  lastActivity: number;
  model?: string;
  costUsd: number;
  columnType: BoardColumnType;
  worktreeBranch?: string;
  isUntilDoneMode?: boolean;
  untilDoneIteration?: number;
  agentStatus?: string;
}

interface BoardGroup {
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

interface BoardData {
  groups: BoardGroup[];
  totals: {
    working: number;
    needs_approval: number;
    needs_review: number;
    idle: number;
  };
}

/**
 * Determine which column a session belongs in based on its state
 */
function getColumnType(
  session: Session,
  activeSessionIds: Set<string>,
  permissionSessionIds: Set<string>
): BoardColumnType {
  // Check if actively running
  if (activeSessionIds.has(session.id)) {
    // Check if waiting for permission
    if (permissionSessionIds.has(session.id)) {
      return "needs_approval";
    }
    return "working";
  }

  // Check if marked for review
  if (session.marked_for_review) {
    return "needs_review";
  }

  // Everything else is idle
  return "idle";
}

/**
 * Transform a database session into a board session
 */
function toBoardSession(
  session: Session,
  project: { name: string; path: string },
  columnType: BoardColumnType
): BoardSession {
  return {
    id: session.id,
    title: session.title,
    projectId: session.project_id,
    projectName: project.name,
    projectPath: project.path,
    messageCount: session.total_turns || 0,
    lastActivity: session.updated_at,
    model: session.model || undefined,
    costUsd: session.total_cost_usd || 0,
    columnType,
    worktreeBranch: session.worktree_branch || undefined,
    isUntilDoneMode: session.until_done_mode === 1,
    untilDoneIteration: session.until_done_iteration || undefined,
    agentStatus: session.agent_status || undefined,
  };
}

export async function handleSessionsBoardRoutes(
  url: URL,
  method: string,
  _req: Request,
  activeProcesses: Map<string, unknown>,
  pendingPermissions: Map<string, { sessionId: string; payload: unknown }>
): Promise<Response | null> {
  // GET /api/sessions-board - Get all sessions grouped by state
  if (url.pathname === "/api/sessions-board" && method === "GET") {
    const projectIdFilter = url.searchParams.get("projectId");

    // Build sets of active and permission-waiting sessions
    const activeSessionIds = new Set(activeProcesses.keys());
    const permissionSessionIds = new Set(
      Array.from(pendingPermissions.values()).map((p) => p.sessionId)
    );

    // Get all projects (or just one if filtered)
    const allProjects = projectIdFilter
      ? [projects.get(projectIdFilter)].filter(Boolean)
      : projects.list();

    const groups: BoardGroup[] = [];
    const totals = {
      working: 0,
      needs_approval: 0,
      needs_review: 0,
      idle: 0,
    };

    for (const project of allProjects) {
      if (!project) continue;

      // Get non-archived sessions for this project
      const projectSessions = sessions.listByProject(project.id, false);

      const columns: BoardGroup["columns"] = {
        working: [],
        needs_approval: [],
        needs_review: [],
        idle: [],
      };

      for (const session of projectSessions) {
        const columnType = getColumnType(session, activeSessionIds, permissionSessionIds);
        const boardSession = toBoardSession(
          session,
          { name: project.name, path: project.path },
          columnType
        );
        columns[columnType].push(boardSession);
        totals[columnType]++;
      }

      // Sort each column by last activity (most recent first)
      for (const col of Object.values(columns)) {
        col.sort((a, b) => b.lastActivity - a.lastActivity);
      }

      // Only include projects that have at least one session
      const sessionCount = projectSessions.length;
      if (sessionCount > 0) {
        groups.push({
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path,
          sessionCount,
          columns,
        });
      }
    }

    // Sort groups by most recent activity across all their sessions
    groups.sort((a, b) => {
      const aLatest = Math.max(
        ...Object.values(a.columns)
          .flat()
          .map((s) => s.lastActivity),
        0
      );
      const bLatest = Math.max(
        ...Object.values(b.columns)
          .flat()
          .map((s) => s.lastActivity),
        0
      );
      return bLatest - aLatest;
    });

    const data: BoardData = { groups, totals };
    return json(data);
  }

  return null;
}
