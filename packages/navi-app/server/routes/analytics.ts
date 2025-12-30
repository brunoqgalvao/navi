import { json } from "../utils/response";
import { projects } from "../db";
import { analyzeProjectTranscripts } from "../utils/transcript-parser";

export async function handleAnalyticsRoutes(
  url: URL,
  method: string
): Promise<Response | null> {
  // GET /api/projects/:id/analytics
  const projectAnalyticsMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/analytics$/
  );
  if (projectAnalyticsMatch && method === "GET") {
    const projectId = decodeURIComponent(projectAnalyticsMatch[1]);
    const project = projects.get(projectId);

    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const days = parseInt(url.searchParams.get("days") || "30", 10);
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    try {
      const analytics = await analyzeProjectTranscripts(project.path, {
        days,
        limit,
      });
      return json(analytics);
    } catch (e) {
      console.error("Failed to analyze project transcripts:", e);
      return json({ error: "Failed to analyze transcripts" }, 500);
    }
  }

  return null;
}
