/**
 * SessionManager - Manages multiple Agent SDK sessions for fractal agent architecture
 *
 * This service handles:
 * - Spawning and managing multiple concurrent Agent SDK sessions
 * - Inter-session communication via message bus
 * - Progressive disclosure context retrieval
 * - Escalation routing
 * - Deliverable collection
 */

import {
  sessions,
  sessionHierarchy,
  sessionDecisions,
  sessionArtifacts,
  type Session,
  type SessionTreeNode,
  type AgentStatus,
  type Escalation,
  type Deliverable,
  type SessionDecision,
  type SessionArtifact,
  MAX_SESSION_DEPTH,
  MAX_CONCURRENT_SESSIONS,
} from "../db";

// Types for runtime session state
export interface RuntimeSession {
  id: string;
  dbSession: Session;
  // The actual Agent SDK session will be managed elsewhere (websocket handler)
  // This tracks the runtime state
  claudeSessionId: string | null;
  isActive: boolean;
}

export interface SpawnConfig {
  title: string;
  role: string;
  task: string;
  model?: string;
  context?: string; // Additional context to pass to the child
  agentType?: string; // 'browser' | 'coding' | 'runner' | etc. for native UI
}

export interface ContextQuery {
  source: "parent" | "sibling" | "decisions" | "artifacts";
  query: string;
  siblingRole?: string;
}

export interface ContextResult {
  source: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface EscalationResponse {
  action: "answer" | "decide" | "unblock" | "abort" | "escalate_further";
  content: string;
}

// Event types for session updates
export type SessionEvent =
  | { type: "spawned"; session: Session; parentId: string }
  | { type: "status_changed"; sessionId: string; status: AgentStatus; previousStatus: AgentStatus }
  | { type: "escalated"; sessionId: string; escalation: Escalation }
  | { type: "escalation_resolved"; sessionId: string; response: EscalationResponse }
  | { type: "delivered"; sessionId: string; deliverable: Deliverable }
  | { type: "archived"; sessionId: string }
  | { type: "decision_logged"; decision: SessionDecision }
  | { type: "artifact_created"; artifact: SessionArtifact };

type SessionEventHandler = (event: SessionEvent) => void | Promise<void>;

class SessionManager {
  private eventHandlers: Set<SessionEventHandler> = new Set();
  private runtimeSessions: Map<string, RuntimeSession> = new Map();

  // ============================================================================
  // Event System
  // ============================================================================

  subscribe(handler: SessionEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: SessionEvent) {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Session event handler error:", error);
      }
    }
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  /**
   * Spawn a child session from a parent
   */
  spawn(parentSessionId: string, config: SpawnConfig): Session | null {
    const parent = sessions.get(parentSessionId);
    if (!parent) {
      console.error(`Cannot spawn: parent session ${parentSessionId} not found`);
      return null;
    }

    // Validate depth
    if (parent.depth >= MAX_SESSION_DEPTH - 1) {
      console.error(`Cannot spawn: max depth (${MAX_SESSION_DEPTH}) reached`);
      return null;
    }

    // Validate concurrent sessions
    const rootId = parent.root_session_id || parent.id;
    const activeCount = sessionHierarchy.countActiveSessions(rootId);
    if (activeCount >= MAX_CONCURRENT_SESSIONS) {
      console.error(`Cannot spawn: max concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached`);
      return null;
    }

    const childId = crypto.randomUUID();
    const child = sessionHierarchy.spawnChild(parentSessionId, {
      id: childId,
      title: config.title,
      role: config.role,
      task: config.task,
      model: config.model,
      agentType: config.agentType,  // Pass agent type for native UI
    });

    if (child) {
      // Track in runtime
      this.runtimeSessions.set(child.id, {
        id: child.id,
        dbSession: child,
        claudeSessionId: null,
        isActive: true,
      });

      this.emit({
        type: "spawned",
        session: child,
        parentId: parentSessionId,
      });
    }

    return child;
  }

  /**
   * Update session status
   */
  updateStatus(sessionId: string, status: AgentStatus) {
    const session = sessions.get(sessionId);
    if (!session) return;

    const previousStatus = session.agent_status;
    sessionHierarchy.updateAgentStatus(sessionId, status);

    this.emit({
      type: "status_changed",
      sessionId,
      status,
      previousStatus,
    });

    // Update runtime tracking
    const runtime = this.runtimeSessions.get(sessionId);
    if (runtime) {
      runtime.isActive = ["working", "waiting", "blocked"].includes(status);
    }
  }

  /**
   * Escalate to parent (or ultimately human)
   */
  escalate(sessionId: string, escalation: Omit<Escalation, "created_at">): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;

    const fullEscalation: Escalation = {
      ...escalation,
      created_at: Date.now(),
    };

    sessionHierarchy.setEscalation(sessionId, fullEscalation);

    this.emit({
      type: "escalated",
      sessionId,
      escalation: fullEscalation,
    });

    return true;
  }

  /**
   * Resolve an escalation
   */
  resolveEscalation(sessionId: string, response: EscalationResponse) {
    sessionHierarchy.clearEscalation(sessionId);

    this.emit({
      type: "escalation_resolved",
      sessionId,
      response,
    });
  }

  /**
   * Deliver results and mark session complete
   */
  deliver(sessionId: string, deliverable: Deliverable) {
    sessionHierarchy.setDeliverable(sessionId, deliverable);

    this.emit({
      type: "delivered",
      sessionId,
      deliverable,
    });

    // Auto-archive after delivery (as per design)
    // Small delay to allow UI to show delivered state
    setTimeout(() => {
      this.archive(sessionId);
    }, 5000);
  }

  /**
   * Archive a session
   */
  archive(sessionId: string, archiveDescendants: boolean = true) {
    sessionHierarchy.archiveSession(sessionId, archiveDescendants);

    this.emit({
      type: "archived",
      sessionId,
    });

    // Clean up runtime
    this.runtimeSessions.delete(sessionId);
    if (archiveDescendants) {
      const descendants = sessionHierarchy.getDescendants(sessionId);
      for (const desc of descendants) {
        this.runtimeSessions.delete(desc.id);
      }
    }
  }

  // ============================================================================
  // Context System (Progressive Disclosure)
  // ============================================================================

  /**
   * Get context based on query - returns only relevant excerpts
   */
  async getContext(sessionId: string, query: ContextQuery): Promise<ContextResult | null> {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const rootId = session.root_session_id || session.id;

    switch (query.source) {
      case "parent":
        return this.getParentContext(sessionId, query.query);

      case "sibling":
        return this.getSiblingContext(sessionId, query.query, query.siblingRole);

      case "decisions":
        return this.getDecisionsContext(rootId, query.query);

      case "artifacts":
        return this.getArtifactsContext(rootId, query.query);

      default:
        return null;
    }
  }

  private getParentContext(sessionId: string, query: string): ContextResult | null {
    const session = sessions.get(sessionId);
    if (!session?.parent_session_id) return null;

    const parent = sessions.get(session.parent_session_id);
    if (!parent) return null;

    // Return structured parent context
    const content = `
Parent Session: ${parent.title}
Role: ${parent.role || "orchestrator"}
Task: ${parent.task || parent.title}
Status: ${parent.agent_status}
Depth: ${parent.depth}

Query: "${query}"
Note: For detailed conversation history, use the get_context tool with more specific queries.
    `.trim();

    return {
      source: "parent",
      content,
      metadata: {
        parentId: parent.id,
        parentRole: parent.role,
        parentTask: parent.task,
      },
    };
  }

  private getSiblingContext(
    sessionId: string,
    query: string,
    siblingRole?: string
  ): ContextResult | null {
    const siblings = sessionHierarchy.getSiblings(sessionId);

    if (siblingRole) {
      const sibling = siblings.find((s) => s.role === siblingRole);
      if (!sibling) {
        return {
          source: "sibling",
          content: `No sibling found with role: ${siblingRole}. Available siblings: ${siblings.map((s) => s.role).join(", ")}`,
        };
      }

      return {
        source: "sibling",
        content: `
Sibling: ${sibling.title}
Role: ${sibling.role}
Task: ${sibling.task}
Status: ${sibling.agent_status}
${sibling.deliverable ? `\nDeliverable: ${JSON.parse(sibling.deliverable).summary}` : ""}
        `.trim(),
        metadata: {
          siblingId: sibling.id,
          siblingRole: sibling.role,
          siblingStatus: sibling.agent_status,
        },
      };
    }

    // Return overview of all siblings
    const siblingsSummary = siblings
      .map(
        (s) =>
          `- ${s.role || "unnamed"}: ${s.task || s.title} (${s.agent_status})`
      )
      .join("\n");

    return {
      source: "sibling",
      content: `
Active Siblings:
${siblingsSummary || "No siblings"}

Query: "${query}"
To get details from a specific sibling, specify their role.
      `.trim(),
    };
  }

  private getDecisionsContext(rootId: string, query: string): ContextResult | null {
    const decisions = sessionDecisions.listByRoot(rootId);

    if (decisions.length === 0) {
      return {
        source: "decisions",
        content: "No decisions logged yet for this session tree.",
      };
    }

    // Filter decisions by query (simple keyword match for now)
    const queryLower = query.toLowerCase();
    const relevant = decisions.filter(
      (d) =>
        d.decision.toLowerCase().includes(queryLower) ||
        d.category?.toLowerCase().includes(queryLower) ||
        d.rationale?.toLowerCase().includes(queryLower)
    );

    const toShow = relevant.length > 0 ? relevant : decisions.slice(0, 10);
    const decisionsList = toShow
      .map(
        (d) =>
          `[${d.category || "general"}] ${d.decision}${d.rationale ? ` (${d.rationale})` : ""}`
      )
      .join("\n");

    return {
      source: "decisions",
      content: `
Project Decisions${relevant.length > 0 ? ` (matching "${query}")` : ""}:
${decisionsList}
      `.trim(),
      metadata: {
        totalDecisions: decisions.length,
        shownDecisions: toShow.length,
      },
    };
  }

  private getArtifactsContext(rootId: string, query: string): ContextResult | null {
    const artifacts = sessionArtifacts.listByRoot(rootId);

    if (artifacts.length === 0) {
      return {
        source: "artifacts",
        content: "No artifacts created yet for this session tree.",
      };
    }

    // Filter artifacts by query
    const queryLower = query.toLowerCase();
    const relevant = artifacts.filter(
      (a) =>
        a.path.toLowerCase().includes(queryLower) ||
        a.description?.toLowerCase().includes(queryLower) ||
        a.artifact_type?.toLowerCase().includes(queryLower)
    );

    const toShow = relevant.length > 0 ? relevant : artifacts.slice(0, 10);
    const artifactsList = toShow
      .map((a) => `- ${a.path} (${a.artifact_type || "file"}): ${a.description || "no description"}`)
      .join("\n");

    return {
      source: "artifacts",
      content: `
Project Artifacts${relevant.length > 0 ? ` (matching "${query}")` : ""}:
${artifactsList}

To read an artifact's content, use the Read tool with the file path.
      `.trim(),
      metadata: {
        totalArtifacts: artifacts.length,
        shownArtifacts: toShow.length,
      },
    };
  }

  // ============================================================================
  // Decision & Artifact Logging
  // ============================================================================

  /**
   * Log a decision
   */
  logDecision(
    sessionId: string,
    decision: string,
    category?: string,
    rationale?: string
  ): SessionDecision | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const rootId = session.root_session_id || session.id;
    const newDecision: SessionDecision = {
      id: crypto.randomUUID(),
      root_session_id: rootId,
      session_id: sessionId,
      category: category || null,
      decision,
      rationale: rationale || null,
      created_at: Date.now(),
    };

    sessionDecisions.create(newDecision);

    this.emit({
      type: "decision_logged",
      decision: newDecision,
    });

    return newDecision;
  }

  /**
   * Log an artifact
   */
  logArtifact(
    sessionId: string,
    path: string,
    content?: string,
    description?: string,
    artifactType?: string
  ): SessionArtifact | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const rootId = session.root_session_id || session.id;
    const newArtifact: SessionArtifact = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      root_session_id: rootId,
      path,
      content: content || null,
      description: description || null,
      artifact_type: artifactType || null,
      created_at: Date.now(),
    };

    sessionArtifacts.create(newArtifact);

    this.emit({
      type: "artifact_created",
      artifact: newArtifact,
    });

    return newArtifact;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get session tree
   */
  getTree(rootSessionId: string): SessionTreeNode | null {
    return sessionHierarchy.getTree(rootSessionId);
  }

  /**
   * Get all active sessions in a tree
   */
  getActiveSessions(rootSessionId: string): Session[] {
    return sessionHierarchy.getActiveSessions(rootSessionId);
  }

  /**
   * Get all blocked sessions that need attention
   */
  getBlockedSessions(rootSessionId: string): Session[] {
    return sessionHierarchy.getBlockedSessions(rootSessionId);
  }

  /**
   * Check if a session can spawn more children
   */
  canSpawn(sessionId: string): { can: boolean; reason?: string } {
    const session = sessions.get(sessionId);
    if (!session) {
      return { can: false, reason: "Session not found" };
    }

    if (session.depth >= MAX_SESSION_DEPTH - 1) {
      return { can: false, reason: `Max depth (${MAX_SESSION_DEPTH}) reached` };
    }

    const rootId = session.root_session_id || session.id;
    const activeCount = sessionHierarchy.countActiveSessions(rootId);
    if (activeCount >= MAX_CONCURRENT_SESSIONS) {
      return { can: false, reason: `Max concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached` };
    }

    return { can: true };
  }

  /**
   * Get immediate context for a session (always provided, no query needed)
   */
  getImmediateContext(sessionId: string): {
    task: string;
    role: string;
    parentSummary: string | null;
    siblingRoles: string[];
    decisions: string[];
  } | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const rootId = session.root_session_id || session.id;

    // Get parent summary
    let parentSummary: string | null = null;
    if (session.parent_session_id) {
      const parent = sessions.get(session.parent_session_id);
      if (parent) {
        parentSummary = `${parent.role || "orchestrator"}: ${parent.task || parent.title}`;
      }
    }

    // Get sibling roles
    const siblings = sessionHierarchy.getSiblings(sessionId);
    const siblingRoles = siblings.map((s) => s.role || "unnamed");

    // Get recent decisions (last 5)
    const allDecisions = sessionDecisions.listByRoot(rootId);
    const recentDecisions = allDecisions.slice(0, 5).map((d) => d.decision);

    return {
      task: session.task || session.title,
      role: session.role || "agent",
      parentSummary,
      siblingRoles,
      decisions: recentDecisions,
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up runtime state for a deleted session.
   * Called when a session is permanently deleted.
   */
  cleanup(sessionId: string) {
    this.runtimeSessions.delete(sessionId);
    console.log(`[SessionManager] Cleaned up runtime state for session ${sessionId}`);
  }

  /**
   * Get memory stats for debugging
   */
  getMemoryStats() {
    return {
      runtimeSessions: this.runtimeSessions.size,
      eventHandlers: this.eventHandlers.size,
    };
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
