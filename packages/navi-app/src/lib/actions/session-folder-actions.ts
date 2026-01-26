import { api, type SessionFolder, type Session } from "../api";

export interface SessionFolderActionCallbacks {
  setSessionFolders: (folders: SessionFolder[]) => void;
  getSessionFolders: () => SessionFolder[];
  setSidebarSessions: (sessions: Session[]) => void;
  getSidebarSessions: () => Session[];
}

let callbacks: SessionFolderActionCallbacks | null = null;

export function initSessionFolderActions(cb: SessionFolderActionCallbacks) {
  callbacks = cb;
}

export async function loadSessionFolders(projectId: string): Promise<SessionFolder[]> {
  console.log("[SessionFolders] loadSessionFolders called, projectId:", projectId, "callbacks:", !!callbacks);
  try {
    const folders = await api.sessionFolders.list(projectId);
    console.log("[SessionFolders] Loaded folders:", folders.length);
    if (callbacks) {
      callbacks.setSessionFolders(folders);
      console.log("[SessionFolders] Callbacks invoked");
    } else {
      console.error("[SessionFolders] No callbacks registered!");
    }
    return folders;
  } catch (e) {
    console.error("[SessionFolders] Failed to load:", e);
    return [];
  }
}

export async function createSessionFolder(projectId: string, name: string): Promise<SessionFolder> {
  const folder = await api.sessionFolders.create(projectId, name);
  const folders = callbacks?.getSessionFolders() || [];
  callbacks?.setSessionFolders([...folders, folder]);
  return folder;
}

export function updateSessionFolder(id: string, name: string): void {
  const folders = callbacks?.getSessionFolders() || [];
  const previousFolders = folders;
  callbacks?.setSessionFolders(folders.map(f => f.id === id ? { ...f, name } : f));
  api.sessionFolders.update(id, name).catch(() => {
    callbacks?.setSessionFolders(previousFolders);
  });
}

export async function deleteSessionFolder(id: string): Promise<void> {
  await api.sessionFolders.delete(id);
  const folders = callbacks?.getSessionFolders() || [];
  callbacks?.setSessionFolders(folders.filter(f => f.id !== id));
  // Clear folder_id from sessions that were in this folder
  const sessions = callbacks?.getSidebarSessions() || [];
  callbacks?.setSidebarSessions(sessions.map(s => s.folder_id === id ? { ...s, folder_id: null } : s));
}

export function toggleSessionFolderCollapse(id: string, collapsed: boolean): void {
  const folders = callbacks?.getSessionFolders() || [];
  const previousFolders = folders;
  callbacks?.setSessionFolders(folders.map(f => f.id === id ? { ...f, collapsed: collapsed ? 1 : 0 } : f));
  api.sessionFolders.toggleCollapse(id, collapsed).catch(() => {
    callbacks?.setSessionFolders(previousFolders);
  });
}

export function setSessionFolder(sessionId: string, folderId: string | null): void {
  const sessions = callbacks?.getSidebarSessions() || [];
  const previousSessions = sessions;
  callbacks?.setSidebarSessions(sessions.map(s => s.id === sessionId ? { ...s, folder_id: folderId } : s));
  api.sessions.setFolder(sessionId, folderId).catch(() => {
    callbacks?.setSidebarSessions(previousSessions);
  });
}

export function reorderSessionFolders(projectId: string, order: string[]): void {
  const orderMap = new Map(order.map((id, idx) => [id, idx]));
  const folders = callbacks?.getSessionFolders() || [];
  const previousFolders = folders;
  callbacks?.setSessionFolders([...folders].sort((a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0)));
  api.sessionFolders.reorder(projectId, order).catch(() => {
    callbacks?.setSessionFolders(previousFolders);
  });
}

export function toggleSessionFolderPin(folder: SessionFolder): void {
  const newPinned = !folder.pinned;
  const folders = callbacks?.getSessionFolders() || [];
  const previousFolders = folders;
  callbacks?.setSessionFolders(
    folders.map(f => f.id === folder.id ? { ...f, pinned: newPinned ? 1 : 0 } : f)
      .sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        return (a.sort_order || 0) - (b.sort_order || 0);
      })
  );
  api.sessionFolders.togglePin(folder.id, newPinned).catch(() => {
    callbacks?.setSessionFolders(previousFolders);
  });
}
