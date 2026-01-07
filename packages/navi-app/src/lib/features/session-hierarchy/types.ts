/**
 * Session Hierarchy Types
 *
 * Types for multi-session agent architecture (fractal agents)
 */

// Agent status for multi-session hierarchy
export type AgentStatus =
  | "working"
  | "waiting"
  | "blocked"
  | "delivered"
  | "failed"
  | "archived";

// Escalation types
export type EscalationType =
  | "question"
  | "decision_needed"
  | "blocker"
  | "permission";

export interface Escalation {
  type: EscalationType;
  summary: string;
  context: string;
  options?: string[];
  created_at: number;
}

export interface Deliverable {
  type: "code" | "research" | "decision" | "artifact" | "error";
  summary: string;
  content: any;
  artifacts?: SessionArtifact[];
}

export interface SessionArtifact {
  id: string;
  session_id: string;
  root_session_id: string;
  path: string;
  content: string | null;
  description: string | null;
  artifact_type: string | null;
  created_at: number;
}

export interface SessionDecision {
  id: string;
  root_session_id: string;
  session_id: string;
  category: string | null;
  decision: string;
  rationale: string | null;
  created_at: number;
}

// Extended session with hierarchy fields
export interface HierarchySession {
  id: string;
  project_id: string;
  title: string;
  claude_session_id: string | null;
  model: string | null;
  total_cost_usd: number;
  total_turns: number;
  input_tokens: number;
  output_tokens: number;
  // Hierarchy fields
  parent_session_id: string | null;
  root_session_id: string | null;
  depth: number;
  role: string | null;
  task: string | null;
  agent_status: AgentStatus;
  deliverable: string | null; // JSON string
  escalation: string | null; // JSON string
  delivered_at: number | null;
  archived_at: number | null;
  // Timestamps
  created_at: number;
  updated_at: number;
}

// Tree node with children
export interface SessionTreeNode extends HierarchySession {
  children: SessionTreeNode[];
}

// Immediate context for a session
export interface SessionImmediateContext {
  task: string;
  role: string;
  parentSummary: string | null;
  siblingRoles: string[];
  decisions: string[];
}

// Context query result
export interface ContextResult {
  source: string;
  content: string;
  metadata?: Record<string, any>;
}

// Spawn configuration
export interface SpawnConfig {
  title: string;
  role: string;
  task: string;
  model?: string;
  context?: string;
}

// Escalation response
export interface EscalationResponse {
  action: "answer" | "decide" | "unblock" | "abort" | "escalate_further";
  content: string;
}

// WebSocket events
export interface SessionSpawnedEvent {
  type: "session:spawned";
  session: HierarchySession;
  parentId: string;
}

export interface SessionStatusChangedEvent {
  type: "session:status_changed";
  sessionId: string;
  status: AgentStatus;
  previousStatus: AgentStatus;
}

export interface SessionEscalatedEvent {
  type: "session:escalated";
  sessionId: string;
  escalation: Escalation;
}

export interface SessionEscalationResolvedEvent {
  type: "session:escalation_resolved";
  sessionId: string;
  response: EscalationResponse;
}

export interface SessionDeliveredEvent {
  type: "session:delivered";
  sessionId: string;
  deliverable: Deliverable;
}

export interface SessionArchivedEvent {
  type: "session:archived";
  sessionId: string;
}

export interface SessionDecisionLoggedEvent {
  type: "session:decision_logged";
  decision: SessionDecision;
}

export interface SessionArtifactCreatedEvent {
  type: "session:artifact_created";
  artifact: SessionArtifact;
}

export type SessionHierarchyEvent =
  | SessionSpawnedEvent
  | SessionStatusChangedEvent
  | SessionEscalatedEvent
  | SessionEscalationResolvedEvent
  | SessionDeliveredEvent
  | SessionArchivedEvent
  | SessionDecisionLoggedEvent
  | SessionArtifactCreatedEvent;

// Parse helpers
export function parseDeliverable(json: string | null): Deliverable | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function parseEscalation(json: string | null): Escalation | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Status helpers
export function isActiveStatus(status: AgentStatus): boolean {
  return ["working", "waiting", "blocked"].includes(status);
}

export function isCompletedStatus(status: AgentStatus): boolean {
  return ["delivered", "failed", "archived"].includes(status);
}

export function getStatusIcon(status: AgentStatus): string {
  switch (status) {
    case "working":
      return "●"; // green dot
    case "waiting":
      return "○"; // hollow dot
    case "blocked":
      return "⚠"; // warning
    case "delivered":
      return "✓"; // checkmark
    case "failed":
      return "✗"; // x
    case "archived":
      return "📦"; // archive
    default:
      return "?";
  }
}

export function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case "working":
      return "text-green-500";
    case "waiting":
      return "text-yellow-500";
    case "blocked":
      return "text-orange-500";
    case "delivered":
      return "text-blue-500";
    case "failed":
      return "text-red-500";
    case "archived":
      return "text-gray-400";
    default:
      return "text-gray-500";
  }
}
