/**
 * Session Hierarchy Stores
 *
 * Svelte stores for managing multi-session agent state
 */

import { writable, derived, get } from "svelte/store";
import type {
  SessionTreeNode,
  HierarchySession,
  SessionDecision,
  SessionArtifact,
  Escalation,
  Deliverable,
  AgentStatus,
  SessionHierarchyEvent,
} from "./types";
import { parseEscalation, parseDeliverable } from "./types";
import { sessionHierarchyApi } from "./api";

// ============================================================================
// Session Tree Store
// ============================================================================

interface SessionTreeState {
  rootSessionId: string | null;
  tree: SessionTreeNode | null;
  loading: boolean;
  error: string | null;
}

function createSessionTreeStore() {
  const { subscribe, set, update } = writable<SessionTreeState>({
    rootSessionId: null,
    tree: null,
    loading: false,
    error: null,
  });

  return {
    subscribe,

    async loadTree(rootSessionId: string) {
      update((state) => ({ ...state, rootSessionId, loading: true, error: null }));

      try {
        const tree = await sessionHierarchyApi.getSessionTree(rootSessionId);
        update((state) => ({ ...state, tree, loading: false }));
        return tree;
      } catch (e) {
        const error = e instanceof Error ? e.message : "Failed to load tree";
        update((state) => ({ ...state, error, loading: false }));
        return null;
      }
    },

    clear() {
      set({ rootSessionId: null, tree: null, loading: false, error: null });
    },

    // Handle WebSocket events
    handleEvent(event: SessionHierarchyEvent) {
      update((state) => {
        if (!state.tree) return state;

        switch (event.type) {
          case "session:spawned": {
            // Find parent and add child
            const addChild = (node: SessionTreeNode): SessionTreeNode => {
              if (node.id === event.parentId) {
                return {
                  ...node,
                  children: [...(node.children || []), { ...event.session, children: [] }],
                  agent_status: "waiting" as AgentStatus, // Parent is now waiting
                };
              }
              return {
                ...node,
                children: (node.children || []).map(addChild),
              };
            };
            return { ...state, tree: addChild(state.tree) };
          }

          case "session:status_changed": {
            // Update status of specific node
            const updateStatus = (node: SessionTreeNode): SessionTreeNode => {
              if (node.id === event.sessionId) {
                return { ...node, agent_status: event.status };
              }
              return {
                ...node,
                children: (node.children || []).map(updateStatus),
              };
            };
            return { ...state, tree: updateStatus(state.tree) };
          }

          case "session:escalated": {
            // Update escalation of specific node
            const updateEscalation = (node: SessionTreeNode): SessionTreeNode => {
              if (node.id === event.sessionId) {
                return {
                  ...node,
                  agent_status: "blocked",
                  escalation: JSON.stringify(event.escalation),
                };
              }
              return {
                ...node,
                children: (node.children || []).map(updateEscalation),
              };
            };
            return { ...state, tree: updateEscalation(state.tree) };
          }

          case "session:escalation_resolved": {
            // Clear escalation
            const clearEscalation = (node: SessionTreeNode): SessionTreeNode => {
              if (node.id === event.sessionId) {
                return {
                  ...node,
                  agent_status: "working",
                  escalation: null,
                };
              }
              return {
                ...node,
                children: (node.children || []).map(clearEscalation),
              };
            };
            return { ...state, tree: clearEscalation(state.tree) };
          }

          case "session:delivered": {
            // Update deliverable
            const updateDeliverable = (node: SessionTreeNode): SessionTreeNode => {
              if (node.id === event.sessionId) {
                return {
                  ...node,
                  agent_status: "delivered",
                  deliverable: JSON.stringify(event.deliverable),
                };
              }
              return {
                ...node,
                children: (node.children || []).map(updateDeliverable),
              };
            };
            return { ...state, tree: updateDeliverable(state.tree) };
          }

          case "session:archived": {
            // Update to archived
            const updateArchived = (node: SessionTreeNode): SessionTreeNode => {
              if (node.id === event.sessionId) {
                return { ...node, agent_status: "archived" };
              }
              return {
                ...node,
                children: (node.children || []).map(updateArchived),
              };
            };
            return { ...state, tree: updateArchived(state.tree) };
          }

          default:
            return state;
        }
      });
    },
  };
}

export const sessionTreeStore = createSessionTreeStore();

// ============================================================================
// Blocked Sessions Store
// ============================================================================

interface BlockedSessionsState {
  sessions: HierarchySession[];
  loading: boolean;
}

function createBlockedSessionsStore() {
  const { subscribe, set, update } = writable<BlockedSessionsState>({
    sessions: [],
    loading: false,
  });

  return {
    subscribe,

    async load(rootSessionId: string) {
      update((state) => ({ ...state, loading: true }));

      try {
        const sessions = await sessionHierarchyApi.getBlockedSessions(rootSessionId);
        set({ sessions, loading: false });
      } catch (e) {
        console.error("Failed to load blocked sessions:", e);
        set({ sessions: [], loading: false });
      }
    },

    add(session: HierarchySession) {
      update((state) => ({
        ...state,
        sessions: [...state.sessions.filter((s) => s.id !== session.id), session],
      }));
    },

    remove(sessionId: string) {
      update((state) => ({
        ...state,
        sessions: state.sessions.filter((s) => s.id !== sessionId),
      }));
    },

    clear() {
      set({ sessions: [], loading: false });
    },
  };
}

export const blockedSessionsStore = createBlockedSessionsStore();

// ============================================================================
// Decisions Store
// ============================================================================

interface DecisionsState {
  decisions: SessionDecision[];
  loading: boolean;
}

function createDecisionsStore() {
  const { subscribe, set, update } = writable<DecisionsState>({
    decisions: [],
    loading: false,
  });

  return {
    subscribe,

    async load(rootSessionId: string) {
      update((state) => ({ ...state, loading: true }));

      try {
        const decisions = await sessionHierarchyApi.getDecisions(rootSessionId);
        set({ decisions, loading: false });
      } catch (e) {
        console.error("Failed to load decisions:", e);
        set({ decisions: [], loading: false });
      }
    },

    add(decision: SessionDecision) {
      update((state) => ({
        ...state,
        decisions: [decision, ...state.decisions],
      }));
    },

    clear() {
      set({ decisions: [], loading: false });
    },
  };
}

export const decisionsStore = createDecisionsStore();

// ============================================================================
// Derived Stores
// ============================================================================

// Count of blocked sessions
export const blockedCount = derived(
  blockedSessionsStore,
  ($blocked) => $blocked.sessions.length
);

// Whether there are any blocked sessions needing attention
export const hasBlockedSessions = derived(
  blockedSessionsStore,
  ($blocked) => $blocked.sessions.length > 0
);

// Get escalation for a specific session from the tree
export function getSessionEscalation(sessionId: string): Escalation | null {
  const state = get(sessionTreeStore);
  if (!state.tree) return null;

  const findSession = (node: SessionTreeNode): SessionTreeNode | null => {
    if (node.id === sessionId) return node;
    for (const child of node.children || []) {
      const found = findSession(child);
      if (found) return found;
    }
    return null;
  };

  const session = findSession(state.tree);
  return session ? parseEscalation(session.escalation) : null;
}

// ============================================================================
// WebSocket Event Handler
// ============================================================================

export function handleSessionHierarchyWSEvent(event: SessionHierarchyEvent) {
  // Update tree store
  sessionTreeStore.handleEvent(event);

  // Update blocked sessions if relevant
  switch (event.type) {
    case "session:escalated":
      // Fetch the full session and add to blocked
      sessionHierarchyApi.getImmediateContext(event.sessionId).then(() => {
        // Simplified - in real impl would fetch full session
        blockedSessionsStore.add({
          id: event.sessionId,
          agent_status: "blocked",
          escalation: JSON.stringify(event.escalation),
        } as HierarchySession);
      });
      break;

    case "session:escalation_resolved":
    case "session:delivered":
    case "session:archived":
      blockedSessionsStore.remove(event.sessionId);
      break;

    case "session:decision_logged":
      decisionsStore.add(event.decision);
      break;
  }
}
