import { api, worktreeApi, branchNameApi, type Session, type Message } from "../api";
import {
  currentSession,
  sessionMessages,
  sessionDrafts,
  sessionStatus,
  sessionModels,
  cleanupAuxiliaryStores,
  sessionBackendStore,
  defaultBackend,
  type ChatMessage,
  type BackendId,
} from "../stores";
import { streamingStore } from "../handlers";
import { get } from "svelte/store";
import { getDefaultModel } from "./data-loaders";
import { showError, showSuccess } from "../errorHandler";

// Default page size for progressive message loading
const MESSAGE_PAGE_SIZE = 20;

export interface SessionActionCallbacks {
  setSidebarSessions: (sessions: Session[]) => void;
  getSidebarSessions: () => Session[];
  setInputText: (text: string) => void;
  getInputText: () => string;
  loadRecentChats: () => void;
  scrollToBottom: (instant?: boolean) => void;
}

let callbacks: SessionActionCallbacks | null = null;

export function initSessionActions(cb: SessionActionCallbacks) {
  callbacks = cb;
}

/**
 * Start a new chat in "pending" state.
 * No database session is created until the first message is sent.
 * This prevents empty sessions from being created when users click "New Chat" but don't send anything.
 */
export function startNewChat(): void {
  const session = get(currentSession);
  if (!session.projectId) return;

  // Set pending state - no DB session created yet
  currentSession.setPending(true);

  // Set default model for new chat
  const defaultModel = getDefaultModel();
  currentSession.setSelectedModel(defaultModel);

  // Clear any input text
  callbacks?.setInputText("");
}

/**
 * Actually create the database session (called when first message is sent).
 * Returns the new session ID.
 * @param title - Optional title for the session
 * @param backend - Optional backend (claude, codex, gemini). If not provided, uses defaultBackend store value.
 */
export async function createNewChat(title?: string, backend?: BackendId): Promise<string | null> {
  const session = get(currentSession);
  if (!session.projectId) return null;

  // Use provided backend or get from defaultBackend store
  const selectedBackend = backend || get(defaultBackend);

  try {
    const newSession = await api.sessions.create(session.projectId, {
      title: title || "New Chat",
      backend: selectedBackend,
    });
    const sessions = callbacks?.getSidebarSessions() || [];
    callbacks?.setSidebarSessions([newSession, ...sessions]);
    currentSession.setSession(newSession.id, newSession.claude_session_id);
    // Store the backend for this session
    sessionBackendStore.set(newSession.id, selectedBackend);
    // Keep the selected model
    sessionMessages.setMessages(newSession.id, []);
    callbacks?.loadRecentChats();
    return newSession.id;
  } catch (e) {
    showError({ title: "Chat Error", message: "Failed to create new chat", error: e });
    return null;
  }
}

export async function createNewChatWithWorktree(description: string, backend?: BackendId): Promise<string | null> {
  const session = get(currentSession);
  if (!session.projectId) return null;

  // Use provided backend or get from defaultBackend store
  const selectedBackend = backend || get(defaultBackend);

  try {
    // Generate a smart branch name using LLM (fast haiku call)
    let branchName: string | undefined;
    try {
      const branchResult = await branchNameApi.generate(description);
      branchName = branchResult.branchName;
    } catch (branchError) {
      console.warn("[Worktree] Failed to generate smart branch name, using fallback:", branchError);
      // Will fall back to server-side generation from description
    }

    // Create a new session first with backend
    const newSession = await api.sessions.create(session.projectId, {
      title: description || "New Chat",
      backend: selectedBackend,
    });

    // Then create a worktree for it with the smart branch name
    const result = await worktreeApi.create(newSession.id, description, branchName);

    const sessions = callbacks?.getSidebarSessions() || [];
    callbacks?.setSidebarSessions([result.session, ...sessions]);
    currentSession.setSession(result.session.id, result.session.claude_session_id);

    // Store the backend for this session
    sessionBackendStore.set(result.session.id, selectedBackend);

    // Set default model for new chat
    const defaultModel = getDefaultModel();
    currentSession.setSelectedModel(defaultModel);
    sessionMessages.setMessages(result.session.id, []);
    callbacks?.loadRecentChats();

    showSuccess(
      "Parallel Branch Created",
      `Working on branch: ${result.worktree.branch.replace("session/", "")}`
    );

    return result.session.id;
  } catch (e) {
    showError({ title: "Worktree Error", message: "Failed to create parallel branch", error: e });
    return null;
  }
}

export async function selectSession(s: Session) {
  if (!callbacks) return;

  const session = get(currentSession);
  const prevSessionId = session.sessionId;
  const inputText = callbacks.getInputText();

  // Save draft if switching away
  if (prevSessionId && inputText.trim()) {
    sessionDrafts.setDraft(prevSessionId, inputText);
  }

  // Restore draft for new session
  const drafts = get(sessionDrafts);
  callbacks.setInputText(drafts.get(s.id) || "");

  // Clean up auxiliary data from old sessions (LRU eviction)
  cleanupAuxiliaryStores(s.id);

  currentSession.setSession(s.id, s.claude_session_id);
  currentSession.setCost(s.total_cost_usd || 0);
  currentSession.setUsage(s.input_tokens || 0, s.output_tokens || 0);

  // Load model from sessionModels store first, then fall back to session model from DB
  const models = get(sessionModels);
  const cachedModel = models.get(s.id);
  if (cachedModel) {
    currentSession.setSelectedModel(cachedModel);
  } else if (s.model) {
    currentSession.setSelectedModel(s.model);
    sessionModels.setModel(s.id, s.model);
  } else {
    // No model set - use default (Opus)
    const defaultModel = getDefaultModel();
    currentSession.setSelectedModel(defaultModel);
  }
  sessionStatus.markSeen(s.id);

  // Refresh session data
  try {
    const freshSession = await api.sessions.get(s.id);
    if (freshSession) {
      currentSession.setUsage(freshSession.input_tokens || 0, freshSession.output_tokens || 0);
      currentSession.setCost(freshSession.total_cost_usd || 0);
      // Only update model from DB if we don't have a cached value
      if (freshSession.model && !cachedModel) {
        currentSession.setSelectedModel(freshSession.model);
        sessionModels.setModel(s.id, freshSession.model);
      }
    }
  } catch (e) {
    console.warn("[Session] Failed to refresh session data:", e);
  }

  // Load messages if not already loaded (paginated - most recent first)
  const messages = get(sessionMessages);
  if (!messages.has(s.id)) {
    try {
      const result = await api.messages.listPaginated(s.id, MESSAGE_PAGE_SIZE, 0);
      const loadedMsgs = parseMessages(result.messages);
      sessionMessages.setMessagesPaginated(s.id, loadedMsgs, result.total, result.hasMore);
    } catch (e) {
      showError({ title: "Messages Error", message: "Failed to load chat messages", error: e });
    }
  }

  callbacks.scrollToBottom(true);
}

// Helper to parse raw messages into ChatMessage format
function parseMessages(msgs: Message[]): ChatMessage[] {
  return msgs.map(m => {
    let content = m.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); } catch { /* content is already in expected format */ }
    }
    return {
      id: m.id,
      role: m.role as any,
      content: content,
      timestamp: new Date(m.timestamp),
      parentToolUseId: m.parent_tool_use_id ?? undefined,
      isSynthetic: !!m.is_synthetic,
      isFinal: !!m.is_final,
    };
  });
}

// Load more (older) messages for a session
export async function loadMoreMessages(sessionId: string): Promise<boolean> {
  const pagination = sessionMessages.getPagination(sessionId);
  if (!pagination || !pagination.hasMore || pagination.isLoadingMore) {
    return false;
  }

  sessionMessages.setLoadingMore(sessionId, true);

  try {
    const result = await api.messages.listPaginated(sessionId, MESSAGE_PAGE_SIZE, pagination.loadedCount);
    const olderMsgs = parseMessages(result.messages);
    sessionMessages.prependMessages(sessionId, olderMsgs, result.hasMore);
    return true;
  } catch (e) {
    sessionMessages.setLoadingMore(sessionId, false);
    showError({ title: "Messages Error", message: "Failed to load more messages", error: e });
    return false;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await api.sessions.delete(id);
    const sessions = callbacks?.getSidebarSessions() || [];
    callbacks?.setSidebarSessions(sessions.filter(s => s.id !== id));
    callbacks?.loadRecentChats();
    sessionMessages.clearSession(id);
    // Clean up streaming state to prevent memory leaks
    streamingStore.stop(id);
    const session = get(currentSession);
    if (session.sessionId === id) {
      currentSession.setSession(null);
    }
    return true;
  } catch (e) {
    showError({ title: "Delete Failed", message: "Failed to delete chat", error: e });
    return false;
  }
}

export async function duplicateSession(sess: Session): Promise<Session | null> {
  try {
    const forked = await api.sessions.fork(sess.id, { title: `${sess.title} (copy)` });
    const sessions = callbacks?.getSidebarSessions() || [];
    callbacks?.setSidebarSessions([forked, ...sessions]);
    callbacks?.loadRecentChats();
    await selectSession(forked);
    return forked;
  } catch (err) {
    showError({ title: "Duplicate Failed", message: "Failed to duplicate chat", error: err });
    return null;
  }
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<boolean> {
  if (!title.trim()) return false;

  try {
    await api.sessions.update(sessionId, { title: title.trim() });
    const sessions = callbacks?.getSidebarSessions() || [];
    callbacks?.setSidebarSessions(
      sessions.map(s => s.id === sessionId ? { ...s, title: title.trim() } : s)
    );
    return true;
  } catch (e) {
    showError({ title: "Update Failed", message: "Failed to update chat title", error: e });
    return false;
  }
}

export async function toggleSessionPin(sess: Session): Promise<boolean> {
  const newPinned = !sess.pinned;
  try {
    await api.sessions.togglePin(sess.id, newPinned);
    const sessions = callbacks?.getSidebarSessions() || [];
    const updated = sessions
      .map(s => s.id === sess.id ? { ...s, pinned: newPinned ? 1 : 0 } : s)
      .sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        if ((b.favorite || 0) !== (a.favorite || 0)) return (b.favorite || 0) - (a.favorite || 0);
        if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
        return b.updated_at - a.updated_at;
      });
    callbacks?.setSidebarSessions(updated);
    return true;
  } catch (e) {
    // Silent for pin toggle - not critical
    console.error("Failed to toggle session pin:", e);
    return false;
  }
}

export async function toggleSessionFavorite(sess: Session): Promise<boolean> {
  const newFavorite = !sess.favorite;
  try {
    await api.sessions.toggleFavorite(sess.id, newFavorite);
    const sessions = callbacks?.getSidebarSessions() || [];
    const updated = sessions
      .map(s => s.id === sess.id ? { ...s, favorite: newFavorite ? 1 : 0 } : s)
      .sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        if ((b.favorite || 0) !== (a.favorite || 0)) return (b.favorite || 0) - (a.favorite || 0);
        if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
        return b.updated_at - a.updated_at;
      });
    callbacks?.setSidebarSessions(updated);
    return true;
  } catch (e) {
    // Silent for favorite toggle - not critical
    console.error("Failed to toggle session favorite:", e);
    return false;
  }
}

export async function toggleSessionArchive(sess: Session, showArchivedWorkspaces: boolean): Promise<boolean> {
  const newArchived = !sess.archived;
  try {
    await api.sessions.setArchived(sess.id, newArchived);
    const sessions = callbacks?.getSidebarSessions() || [];

    if (newArchived && !showArchivedWorkspaces) {
      // Remove from sidebar if archiving and not showing archived
      callbacks?.setSidebarSessions(sessions.filter(s => s.id !== sess.id));
      const session = get(currentSession);
      if (session.sessionId === sess.id) {
        currentSession.setSession(null);
      }
    } else {
      callbacks?.setSidebarSessions(
        sessions.map(s => s.id === sess.id ? { ...s, archived: newArchived ? 1 : 0 } : s)
      );
    }
    callbacks?.loadRecentChats();
    return true;
  } catch (err) {
    showError({ title: "Archive Failed", message: "Failed to toggle chat archive", error: err });
    return false;
  }
}

export async function reorderSessions(projectId: string, sessionIds: string[]): Promise<boolean> {
  try {
    await api.sessions.reorder(projectId, sessionIds);
    return true;
  } catch (e) {
    // Silent for reorder - not critical
    console.error("Failed to reorder sessions:", e);
    return false;
  }
}

export async function archiveAllNonStarred(projectId: string, showArchivedWorkspaces: boolean): Promise<boolean> {
  try {
    await api.sessions.archiveAllNonStarred(projectId);
    const sessions = callbacks?.getSidebarSessions() || [];

    if (!showArchivedWorkspaces) {
      // Remove non-starred sessions from sidebar if not showing archived
      const starredSessions = sessions.filter(s => s.favorite);
      callbacks?.setSidebarSessions(starredSessions);

      // Clear current session if it was archived
      const session = get(currentSession);
      const wasCurrentArchived = sessions.find(s => s.id === session.sessionId && !s.favorite);
      if (wasCurrentArchived) {
        currentSession.setSession(null);
      }
    } else {
      // Update archived status on all non-starred sessions
      callbacks?.setSidebarSessions(
        sessions.map(s => s.favorite ? s : { ...s, archived: 1 })
      );
    }

    callbacks?.loadRecentChats();
    return true;
  } catch (err) {
    showError({ title: "Archive All Failed", message: "Failed to archive non-starred chats", error: err });
    return false;
  }
}
