import { json } from "../utils/response";
import { costEntries, projects } from "../db";

export async function handleCostRoutes(url: URL, method: string): Promise<Response | null> {
  if (url.pathname === "/api/costs") {
    if (method === "GET") {
      return json({
        totalEver: costEntries.getTotalEver(),
        totalToday: costEntries.getTotalToday(),
      });
    }
  }

  if (url.pathname === "/api/costs/analytics" && method === "GET") {
    const projectIdsParam = url.searchParams.get("projectIds");
    const projectIds = projectIdsParam ? projectIdsParam.split(",").filter(Boolean) : undefined;
    return json(costEntries.getAnalytics(projectIds));
  }

  const projectCostMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/cost$/);
  if (projectCostMatch && method === "GET") {
    const projectId = projectCostMatch[1];
    return json({
      totalEver: costEntries.getProjectTotalEver(projectId),
      totalToday: costEntries.getProjectTotalToday(projectId),
    });
  }

  const sessionCostMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/cost$/);
  if (sessionCostMatch && method === "GET") {
    const sessionId = sessionCostMatch[1];
    return json({
      total: costEntries.getSessionTotal(sessionId),
    });
  }

  return null;
}
