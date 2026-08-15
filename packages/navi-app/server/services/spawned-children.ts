/**
 * Recovering a parent's view of its spawned agents.
 *
 * A query worker is a process per turn, so the maps tracking spawned children
 * start empty every turn. Without this, `check_spawned_agents` answered "you
 * haven't spawned any child agents in this session" while children were still
 * running, and any deliverable that landed after the parent's turn ended was
 * never seen by the model — the human saw it in the UI, the orchestrator did
 * not. The hierarchy already lives in the database, so read it back.
 */

export interface SpawnedChildInfo {
  role: string;
  task: string;
  spawnedAt: number;
  status?: string;
}

export interface PendingDeliverable {
  childSessionId: string;
  childRole: string;
  deliverable: {
    type: string;
    summary: string;
    content: string;
    artifacts?: Array<{ path: string; description?: string }>;
  };
  receivedAt: number;
}

export function describeChildStatus(status?: string): string {
  switch (status) {
    case "delivered":
      return "✅ Completed";
    case "blocked":
      return "⛔ Blocked — it escalated and is waiting on an answer";
    case "waiting":
      return "⏸️ Waiting on its own children";
    case "archived":
      return "📦 Archived without delivering";
    default:
      return "🔄 Working...";
  }
}

/**
 * Fills `children` and `deliverables` from the session hierarchy, leaving any
 * entry the current turn already knows about untouched.
 */
export async function seedSpawnedChildrenFromDb(
  parentSessionId: string | undefined,
  children: Map<string, SpawnedChildInfo>,
  deliverables: PendingDeliverable[]
): Promise<void> {
  if (!parentSessionId) return;

  let rows: Array<Record<string, any>>;
  try {
    const { sessionHierarchy } = await import("../db");
    rows = sessionHierarchy.getChildren(parentSessionId) as Array<Record<string, any>>;
  } catch (e) {
    console.error("[SpawnedChildren] Could not read the session hierarchy:", e);
    return;
  }

  for (const child of rows) {
    if (!children.has(child.id)) {
      children.set(child.id, {
        role: child.role || "agent",
        task: child.task || child.title || "",
        spawnedAt: child.created_at || 0,
        status: child.agent_status || undefined,
      });
    }

    if (!child.deliverable) continue;
    if (deliverables.some((d) => d.childSessionId === child.id)) continue;

    try {
      deliverables.push({
        childSessionId: child.id,
        childRole: child.role || "agent",
        deliverable: JSON.parse(child.deliverable),
        receivedAt: child.updated_at || 0,
      });
    } catch (e) {
      console.error(`[SpawnedChildren] Child ${child.id} has an unparseable deliverable:`, e);
    }
  }

  if (rows.length > 0) {
    console.error(`[SpawnedChildren] Restored ${rows.length} child(ren) for ${parentSessionId}`);
  }
}
