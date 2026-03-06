import { json } from "../utils/response";
import { workspaceFolders } from "../db";

function ensureValidParent(folderId: string, parentId: string | null): string | null {
  if (parentId === null) return null;
  if (parentId === folderId) {
    return "A folder cannot be nested inside itself";
  }

  const folders = workspaceFolders.list();
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  if (!folderMap.has(parentId)) {
    return "Parent folder not found";
  }

  let currentId: string | null = parentId;
  while (currentId) {
    if (currentId === folderId) {
      return "A folder cannot be moved into one of its descendants";
    }
    currentId = folderMap.get(currentId)?.parent_id ?? null;
  }

  return null;
}

export async function handleFolderRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/folders") {
    if (method === "GET") {
      return json(workspaceFolders.list());
    }
    if (method === "POST") {
      const body = await req.json();
      const parentId = body.parentId ?? null;
      const parentError = ensureValidParent("__new__", parentId);
      if (parentError) {
        return json({ error: parentError }, 400);
      }
      const id = crypto.randomUUID();
      const siblingFolders = workspaceFolders.listByParent(parentId);
      const maxOrder = siblingFolders.length > 0 ? Math.max(...siblingFolders.map((folder) => folder.sort_order)) + 1 : 0;
      workspaceFolders.create(id, body.name, maxOrder, parentId);
      return json(workspaceFolders.get(id), 201);
    }
  }

  const folderMatch = url.pathname.match(/^\/api\/folders\/([^/]+)$/);
  if (folderMatch) {
    const id = folderMatch[1];
    if (method === "GET") {
      const folder = workspaceFolders.get(id);
      return folder ? json(folder) : json({ error: "Not found" }, 404);
    }
    if (method === "PUT") {
      const body = await req.json();
      workspaceFolders.update(id, { name: body.name });
      return json(workspaceFolders.get(id));
    }
    if (method === "DELETE") {
      workspaceFolders.delete(id);
      return json({ success: true });
    }
  }

  const folderCollapseMatch = url.pathname.match(/^\/api\/folders\/([^/]+)\/collapse$/);
  if (folderCollapseMatch && method === "POST") {
    const id = folderCollapseMatch[1];
    const body = await req.json();
    workspaceFolders.toggleCollapsed(id, body.collapsed);
    return json(workspaceFolders.get(id));
  }

  const folderPinMatch = url.pathname.match(/^\/api\/folders\/([^/]+)\/pin$/);
  if (folderPinMatch && method === "POST") {
    const id = folderPinMatch[1];
    const body = await req.json();
    workspaceFolders.togglePin(id, body.pinned);
    return json(workspaceFolders.get(id));
  }

  const folderMoveMatch = url.pathname.match(/^\/api\/folders\/([^/]+)\/move$/);
  if (folderMoveMatch && method === "POST") {
    const id = folderMoveMatch[1];
    const folder = workspaceFolders.get(id);
    if (!folder) {
      return json({ error: "Not found" }, 404);
    }

    const body = await req.json();
    const parentId = body.parentId ?? null;
    const parentError = ensureValidParent(id, parentId);
    if (parentError) {
      return json({ error: parentError }, 400);
    }

    const siblingFolders = workspaceFolders
      .listByParent(parentId)
      .filter((candidate) => candidate.id !== id);
    const nextSortOrder =
      siblingFolders.length > 0
        ? Math.max(...siblingFolders.map((candidate) => candidate.sort_order)) + 1
        : 0;

    workspaceFolders.move(id, parentId, nextSortOrder);
    return json(workspaceFolders.get(id));
  }

  const foldersReorderMatch = url.pathname === "/api/folders/reorder";
  if (foldersReorderMatch && method === "POST") {
    const body = await req.json();
    for (let i = 0; i < body.order.length; i++) {
      workspaceFolders.updateOrder(body.order[i], i);
    }
    return json({ success: true });
  }

  return null;
}
