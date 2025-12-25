import { json } from "../utils/response";
import { workspaceFolders } from "../db";

export async function handleFolderRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/folders") {
    if (method === "GET") {
      return json(workspaceFolders.list());
    }
    if (method === "POST") {
      const body = await req.json();
      const id = crypto.randomUUID();
      const folders = workspaceFolders.list();
      const maxOrder = folders.length > 0 ? Math.max(...folders.map(f => f.sort_order)) + 1 : 0;
      workspaceFolders.create(id, body.name, maxOrder);
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
      workspaceFolders.update(id, body.name);
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
