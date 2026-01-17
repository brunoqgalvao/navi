/**
 * Session Hierarchy API - Frontend client
 *
 * API for multi-session agent hierarchy (fractal agents)
 */

import { getApiBase } from "../../config";
import type {
  HierarchySession,
  SessionTreeNode,
  SessionImmediateContext,
  ContextResult,
  SpawnConfig,
  EscalationResponse,
  SessionDecision,
  SessionArtifact,
  AgentStatus,
  EscalationType,
} from "./types";

const getSessionApiBase = () => `${getApiBase()}/sessions`;

// ============================================================================
// Session Tree Operations
// ============================================================================

/**
 * Get full session tree from a root session
 */
export async function getSessionTree(
  rootSessionId: string
): Promise<SessionTreeNode | null> {
  const res = await fetch(`${getSessionApiBase()}/${rootSessionId}/tree`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Get direct children of a session
 */
export async function getChildren(
  sessionId: string
): Promise<HierarchySession[]> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/children`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Get sibling sessions
 */
export async function getSiblings(
  sessionId: string
): Promise<HierarchySession[]> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/siblings`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Get ancestor chain (parent, grandparent, etc.)
 */
export async function getAncestors(
  sessionId: string
): Promise<HierarchySession[]> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/ancestors`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * Spawn a child session
 */
export async function spawnChild(
  parentSessionId: string,
  config: SpawnConfig
): Promise<HierarchySession> {
  const res = await fetch(`${getSessionApiBase()}/${parentSessionId}/spawn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Update session status
 */
export async function updateStatus(
  sessionId: string,
  status: AgentStatus
): Promise<HierarchySession> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Escalate to parent
 */
export async function escalate(
  sessionId: string,
  escalation: {
    type: EscalationType;
    summary: string;
    context: string;
    options?: string[];
  }
): Promise<{ success: boolean }> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(escalation),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Resolve an escalation (respond to a blocked session)
 */
export async function resolveEscalation(
  sessionId: string,
  response: EscalationResponse
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${getSessionApiBase()}/${sessionId}/resolve-escalation`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Deliver results (mark session complete)
 */
export async function deliver(
  sessionId: string,
  deliverable: {
    type: "code" | "research" | "decision" | "artifact" | "error";
    summary: string;
    content: string;
    artifacts?: Array<{ path: string; description?: string }>;
  }
): Promise<{ success: boolean }> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/deliver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deliverable),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Archive a session
 */
export async function archiveSession(
  sessionId: string,
  archiveDescendants: boolean = true
): Promise<{ success: boolean }> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archiveDescendants }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================================
// Active Sessions & Status
// ============================================================================

/**
 * Get all active sessions in a tree
 */
export async function getActiveSessions(
  rootSessionId: string
): Promise<HierarchySession[]> {
  const res = await fetch(`${getSessionApiBase()}/${rootSessionId}/active`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Get all blocked sessions that need attention
 */
export async function getBlockedSessions(
  rootSessionId: string
): Promise<HierarchySession[]> {
  const res = await fetch(`${getSessionApiBase()}/${rootSessionId}/blocked`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Check if a session can spawn more children
 */
export async function canSpawn(
  sessionId: string
): Promise<{ can: boolean; reason?: string }> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/can-spawn`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Cancel all child sessions (subagents) under this session.
 * Does NOT cancel the parent session itself.
 */
export async function cancelChildren(
  sessionId: string
): Promise<{ success: boolean; message: string; cancelled: string[] }> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/cancel-children`, {
    method: "POST",
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================================
// Context System
// ============================================================================

/**
 * Get immediate context for a session
 */
export async function getImmediateContext(
  sessionId: string
): Promise<SessionImmediateContext | null> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/context`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Query context from parent/siblings/decisions/artifacts
 */
export async function queryContext(
  sessionId: string,
  query: {
    source: "parent" | "sibling" | "decisions" | "artifacts";
    query: string;
    siblingRole?: string;
  }
): Promise<ContextResult> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/query-context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================================
// Decisions
// ============================================================================

/**
 * Get all decisions in a session tree
 */
export async function getDecisions(
  rootSessionId: string,
  category?: string
): Promise<SessionDecision[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(
    `${getSessionApiBase()}/${rootSessionId}/decisions${params}`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Log a decision
 */
export async function logDecision(
  sessionId: string,
  decision: {
    decision: string;
    category?: string;
    rationale?: string;
  }
): Promise<SessionDecision> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decision),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================================
// Artifacts
// ============================================================================

/**
 * Get all artifacts in a session tree
 */
export async function getArtifacts(
  rootSessionId: string,
  type?: string
): Promise<SessionArtifact[]> {
  const params = type ? `?type=${encodeURIComponent(type)}` : "";
  const res = await fetch(
    `${getSessionApiBase()}/${rootSessionId}/artifacts${params}`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Log an artifact
 */
export async function logArtifact(
  sessionId: string,
  artifact: {
    path: string;
    content?: string;
    description?: string;
    artifactType?: string;
  }
): Promise<SessionArtifact> {
  const res = await fetch(`${getSessionApiBase()}/${sessionId}/artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(artifact),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================================
// Export as single API object
// ============================================================================

export const sessionHierarchyApi = {
  // Tree operations
  getSessionTree,
  getChildren,
  getSiblings,
  getAncestors,

  // Lifecycle
  spawnChild,
  updateStatus,
  escalate,
  resolveEscalation,
  deliver,
  archiveSession,

  // Status
  getActiveSessions,
  getBlockedSessions,
  canSpawn,
  cancelChildren,

  // Context
  getImmediateContext,
  queryContext,

  // Decisions
  getDecisions,
  logDecision,

  // Artifacts
  getArtifacts,
  logArtifact,
};
