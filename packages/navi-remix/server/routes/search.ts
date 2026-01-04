import { json } from "../utils/response";
import { searchIndex } from "../db";

export async function handleSearchRoutes(url: URL, method: string): Promise<Response | null> {
  if (url.pathname === "/api/search") {
    if (method === "GET") {
      const q = url.searchParams.get("q") || "";
      const projectId = url.searchParams.get("projectId") || undefined;
      const sessionId = url.searchParams.get("sessionId") || undefined;
      const limit = parseInt(url.searchParams.get("limit") || "50");

      if (!q.trim()) {
        return json([]);
      }

      const results = searchIndex.search(q, { projectId, sessionId, limit });
      return json(results);
    }
  }

  if (url.pathname === "/api/search/reindex" && method === "POST") {
    try {
      searchIndex.reindexAll();
      const stats = searchIndex.getStats();
      return json({ success: true, stats });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Reindex failed" }, 500);
    }
  }

  if (url.pathname === "/api/search/stats" && method === "GET") {
    return json(searchIndex.getStats());
  }

  if (url.pathname === "/api/search/debug" && method === "GET") {
    const entityType = url.searchParams.get("type") || undefined;
    return json({
      stats: searchIndex.getStats(),
      items: searchIndex.debugList(entityType),
    });
  }

  return null;
}
