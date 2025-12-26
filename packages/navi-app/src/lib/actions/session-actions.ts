import { api, type Session } from "../api";
import {
  currentSession,
  sessionMessages,
  sessionDrafts,
  sessionStatus,
  type ChatMessage,
} from "../stores";
import { get } from "svelte/store";

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

export async function createNewChat(): Promise<string | null> {
  const session = get(currentSession);
  if (!session.projectId) return null;

  try {
    const newSession = await api.sessions.create(session.projectId, { title: "New Chat" });
    const sessions = callbacks?.getSidebarSessions() || [];
    callbacks?.setSidebarSessions([newSession, ...sessions]);
    currentSession.setSession(newSession.id, newSession.claude_session_id);
    sessionMessages.setMessages(newSession.id, []);
    callbacks?.loadRecentChats();
    return newSession.id;
  } catch (e) {
    console.error("Failed to create session:", e);
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

  currentSession.setSession(s.id, s.claude_session_id);
  currentSession.setCost(s.total_cost_usd || 0);
  currentSession.setUsage(s.input_tokens || 0, s.output_tokens || 0);
  sessionStatus.markSeen(s.id);

  // Refresh session data
  try {
    const freshSession = await api.sessions.get(s.id);
    if (freshSession) {
      currentSession.setUsage(freshSession.input_tokens || 0, freshSession.output_tokens || 0);
      currentSession.setCost(freshSession.total_cost_usd || 0);
    }
  } catch {}

  // Load messages if not already loaded
  const messages = get(sessionMessages);
  if (!messages.has(s.id)) {
    try {
      const msgs = await api.messages.list(s.id);
      const loadedMsgs: ChatMessage[] = msgs.map(m => {
        let content = m.content;
        if (typeof content === "string") {
          try { content = JSON.parse(content); } catch {}
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
      sessionMessages.setMessages(s.id, loadedMsgs);
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
  }

  callbacks.scrollToBottom(true);
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await api.sessions.delete(id);
    const sessions = callbacks?.getSidebarSessions() || [];
    callbacks?.setSidebarSessions(sessions.filter(s => s.id !== id));
    callbacks?.loadRecentChats();
    sessionMessages.clearSession(id);
    const session = get(currentSession);
    if (session.sessionId === id) {
      currentSession.setSession(null);
    }
    return true;
  } catch (e) {
    console.error("Failed to delete session:", e);
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
    console.error("Failed to duplicate session:", err);
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
    console.error("Failed to update session:", e);
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
    console.error("Failed to toggle session archive:", err);
    return false;
  }
}

export async function reorderSessions(projectId: string, sessionIds: string[]): Promise<boolean> {
  try {
    await api.sessions.reorder(projectId, sessionIds);
    return true;
  } catch (e) {
    console.error("Failed to reorder sessions:", e);
    return false;
  }
}
