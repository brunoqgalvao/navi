import { api, type WorkspaceFolder, type Project } from "../api";

export interface FolderActionCallbacks {
  setWorkspaceFolders: (folders: WorkspaceFolder[]) => void;
  getWorkspaceFolders: () => WorkspaceFolder[];
  setSidebarProjects: (projects: Project[]) => void;
  getSidebarProjects: () => Project[];
}

let callbacks: FolderActionCallbacks | null = null;

export function initFolderActions(cb: FolderActionCallbacks) {
  callbacks = cb;
}

export async function loadFolders(): Promise<WorkspaceFolder[]> {
  try {
    const folders = await api.folders.list();
    callbacks?.setWorkspaceFolders(folders);
    return folders;
  } catch (e) {
    console.error("Failed to load folders:", e);
    return [];
  }
}

export async function createFolder(name: string): Promise<WorkspaceFolder> {
  const folder = await api.folders.create(name);
  const folders = callbacks?.getWorkspaceFolders() || [];
  callbacks?.setWorkspaceFolders([...folders, folder]);
  return folder;
}

export async function updateFolder(id: string, name: string): Promise<void> {
  await api.folders.update(id, name);
  const folders = callbacks?.getWorkspaceFolders() || [];
  callbacks?.setWorkspaceFolders(folders.map(f => f.id === id ? { ...f, name } : f));
}

export async function deleteFolder(id: string): Promise<void> {
  await api.folders.delete(id);
  const folders = callbacks?.getWorkspaceFolders() || [];
  callbacks?.setWorkspaceFolders(folders.filter(f => f.id !== id));
  // Clear folder_id from projects that were in this folder
  const projects = callbacks?.getSidebarProjects() || [];
  callbacks?.setSidebarProjects(projects.map(p => p.folder_id === id ? { ...p, folder_id: null } : p));
}

export async function toggleFolderCollapse(id: string, collapsed: boolean): Promise<void> {
  await api.folders.toggleCollapse(id, collapsed);
  const folders = callbacks?.getWorkspaceFolders() || [];
  callbacks?.setWorkspaceFolders(folders.map(f => f.id === id ? { ...f, collapsed: collapsed ? 1 : 0 } : f));
}

export async function setProjectFolder(projectId: string, folderId: string | null): Promise<void> {
  await api.projects.setFolder(projectId, folderId);
  const projects = callbacks?.getSidebarProjects() || [];
  callbacks?.setSidebarProjects(projects.map(p => p.id === projectId ? { ...p, folder_id: folderId } : p));
}

export async function reorderFolders(order: string[]): Promise<void> {
  await api.folders.reorder(order);
  const orderMap = new Map(order.map((id, idx) => [id, idx]));
  const folders = callbacks?.getWorkspaceFolders() || [];
  callbacks?.setWorkspaceFolders([...folders].sort((a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0)));
}

export async function toggleFolderPin(folder: WorkspaceFolder): Promise<boolean> {
  const newPinned = !folder.pinned;
  try {
    await api.folders.togglePin(folder.id, newPinned);
    const folders = callbacks?.getWorkspaceFolders() || [];
    callbacks?.setWorkspaceFolders(
      folders.map(f => f.id === folder.id ? { ...f, pinned: newPinned ? 1 : 0 } : f)
        .sort((a, b) => {
          if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
          return (a.sort_order || 0) - (b.sort_order || 0);
        })
    );
    return true;
  } catch (e) {
    console.error("Failed to toggle folder pin:", e);
    return false;
  }
}
