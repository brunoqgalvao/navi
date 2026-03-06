import { api, type WorkspaceFolder, type Project } from "../api";

export interface FolderActionCallbacks {
  setWorkspaceFolders: (folders: WorkspaceFolder[]) => void;
  getWorkspaceFolders: () => WorkspaceFolder[];
  setSidebarProjects: (projects: Project[]) => void;
  getSidebarProjects: () => Project[];
}

let callbacks: FolderActionCallbacks | null = null;

function sortFoldersForDisplay(folders: WorkspaceFolder[]): WorkspaceFolder[] {
  return [...folders].sort((a, b) => {
    if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return (a.created_at || 0) - (b.created_at || 0);
  });
}

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

export async function createFolder(name: string, parentId: string | null = null): Promise<WorkspaceFolder> {
  const folder = await api.folders.create(name, parentId);
  const folders = callbacks?.getWorkspaceFolders() || [];
  callbacks?.setWorkspaceFolders(sortFoldersForDisplay([...folders, folder]));
  return folder;
}

export function updateFolder(id: string, name: string): void {
  const folders = callbacks?.getWorkspaceFolders() || [];
  const previousFolders = folders;
  callbacks?.setWorkspaceFolders(folders.map(f => f.id === id ? { ...f, name } : f));
  api.folders.update(id, name).catch(() => {
    callbacks?.setWorkspaceFolders(previousFolders);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = callbacks?.getWorkspaceFolders() || [];
  const deletedFolder = folders.find((folder) => folder.id === id);
  const parentId = deletedFolder?.parent_id ?? null;
  await api.folders.delete(id);
  callbacks?.setWorkspaceFolders(
    sortFoldersForDisplay(
      folders
        .filter((folder) => folder.id !== id)
        .map((folder) => (folder.parent_id === id ? { ...folder, parent_id: parentId } : folder))
    )
  );
  // Bubble projects up to the deleted folder's parent, matching server behavior.
  const projects = callbacks?.getSidebarProjects() || [];
  callbacks?.setSidebarProjects(projects.map((project) => (project.folder_id === id ? { ...project, folder_id: parentId } : project)));
}

export function toggleFolderCollapse(id: string, collapsed: boolean): void {
  const folders = callbacks?.getWorkspaceFolders() || [];
  const previousFolders = folders;
  callbacks?.setWorkspaceFolders(folders.map(f => f.id === id ? { ...f, collapsed: collapsed ? 1 : 0 } : f));
  api.folders.toggleCollapse(id, collapsed).catch(() => {
    callbacks?.setWorkspaceFolders(previousFolders);
  });
}

export function setProjectFolder(projectId: string, folderId: string | null): void {
  const projects = callbacks?.getSidebarProjects() || [];
  const previousProjects = projects;
  callbacks?.setSidebarProjects(projects.map(p => p.id === projectId ? { ...p, folder_id: folderId } : p));
  api.projects.setFolder(projectId, folderId).catch(() => {
    callbacks?.setSidebarProjects(previousProjects);
  });
}

export function reorderFolders(order: string[]): void {
  const orderMap = new Map(order.map((id, idx) => [id, idx]));
  const folders = callbacks?.getWorkspaceFolders() || [];
  const previousFolders = folders;
  callbacks?.setWorkspaceFolders(
    sortFoldersForDisplay(
      folders.map((folder) =>
        orderMap.has(folder.id)
          ? { ...folder, sort_order: orderMap.get(folder.id) ?? folder.sort_order }
          : folder
      )
    )
  );
  api.folders.reorder(order).catch(() => {
    callbacks?.setWorkspaceFolders(previousFolders);
  });
}

export function moveFolder(id: string, parentId: string | null): void {
  const folders = callbacks?.getWorkspaceFolders() || [];
  const previousFolders = folders;
  const siblingSortOrders = folders
    .filter((folder) => folder.id !== id && (folder.parent_id || null) === parentId)
    .map((folder) => folder.sort_order || 0);
  const nextSortOrder = siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) + 1 : 0;

  callbacks?.setWorkspaceFolders(
    sortFoldersForDisplay(
      folders.map((folder) =>
        folder.id === id
          ? { ...folder, parent_id: parentId, sort_order: nextSortOrder }
          : folder
      )
    )
  );

  api.folders.move(id, parentId).catch(() => {
    callbacks?.setWorkspaceFolders(previousFolders);
  });
}

export function toggleFolderPin(folder: WorkspaceFolder): void {
  const newPinned = !folder.pinned;
  const folders = callbacks?.getWorkspaceFolders() || [];
  const previousFolders = folders;
  callbacks?.setWorkspaceFolders(sortFoldersForDisplay(
    folders.map(f => f.id === folder.id ? { ...f, pinned: newPinned ? 1 : 0 } : f)
  ));
  api.folders.togglePin(folder.id, newPinned).catch(() => {
    callbacks?.setWorkspaceFolders(previousFolders);
  });
}
