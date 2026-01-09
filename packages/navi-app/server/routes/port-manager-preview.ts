/**
 * Port Manager Preview Routes
 *
 * API endpoints for the LLM-powered port management preview system.
 * Enables running multiple dev server instances without port conflicts.
 */

import { portManagerPreviewService } from "../services/port-manager-preview";
import { sessions, projects } from "../db";
import { json, error } from "../utils/response";

export async function handlePortManagerPreviewRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // GET /api/port-manager-preview/list - List all running previews
  if (pathname === "/api/port-manager-preview/list" && method === "GET") {
    const previews = portManagerPreviewService.listAll();
    return json(previews);
  }

  // GET /api/port-manager-preview/ports - Get allocated ports map
  if (pathname === "/api/port-manager-preview/ports" && method === "GET") {
    const ports = portManagerPreviewService.getAllocatedPorts();
    return json({ ports });
  }

  // POST /api/sessions/:sessionId/preview/port-manager - Start preview
  const startMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/preview\/port-manager$/);
  if (startMatch && method === "POST") {
    const sessionId = startMatch[1];

    try {
      // Get session details
      const session = sessions.get(sessionId);
      if (!session) {
        return error("Session not found", 404);
      }

      // Get project details
      const project = projects.get(session.project_id);
      if (!project) {
        return error("Project not found", 404);
      }

      // Determine project path (worktree or main)
      const projectPath = session.worktree_path || project.path;
      const branch = session.worktree_branch || "main";

      // Parse request body for options
      const body = await req.json().catch(() => ({})) as { useLlm?: boolean };
      const useLlm = body.useLlm !== false; // Default to true

      // Start preview
      const result = await portManagerPreviewService.start(
        sessionId,
        project.id,
        projectPath,
        branch,
        useLlm
      );

      return json({
        success: true,
        id: result.id,
        ports: result.ports,
        url: result.url,
      });
    } catch (e: any) {
      console.error("[PortManagerPreview] Start error:", e);
      return error(e.message, 500);
    }
  }

  // DELETE /api/sessions/:sessionId/preview/port-manager - Stop preview
  const stopMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/preview\/port-manager$/);
  if (stopMatch && method === "DELETE") {
    const sessionId = stopMatch[1];

    try {
      const success = await portManagerPreviewService.stopBySession(sessionId);
      return json({ success });
    } catch (e: any) {
      console.error("[PortManagerPreview] Stop error:", e);
      return error(e.message, 500);
    }
  }

  // GET /api/sessions/:sessionId/preview/port-manager - Get preview status
  const statusMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/preview\/port-manager$/);
  if (statusMatch && method === "GET") {
    const sessionId = statusMatch[1];
    const status = portManagerPreviewService.getStatusBySession(sessionId);
    return json(status);
  }

  // GET /api/sessions/:sessionId/preview/port-manager/logs - Get preview logs
  const logsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/preview\/port-manager\/logs$/);
  if (logsMatch && method === "GET") {
    const sessionId = logsMatch[1];
    const tail = parseInt(url.searchParams.get("tail") || "50", 10);

    // Get logs directly by session - works even in error state
    const logs = portManagerPreviewService.getLogsBySession(sessionId, tail);
    return json({ logs });
  }

  // DELETE /api/port-manager-preview/:previewId - Stop specific preview by ID
  const stopByIdMatch = pathname.match(/^\/api\/port-manager-preview\/([^/]+)$/);
  if (stopByIdMatch && method === "DELETE") {
    const previewId = decodeURIComponent(stopByIdMatch[1]);

    try {
      const success = await portManagerPreviewService.stop(previewId);
      return json({ success });
    } catch (e: any) {
      console.error("[PortManagerPreview] Stop by ID error:", e);
      return error(e.message, 500);
    }
  }

  // GET /api/port-manager-preview/:previewId - Get specific preview status
  const getByIdMatch = pathname.match(/^\/api\/port-manager-preview\/([^/]+)$/);
  if (getByIdMatch && method === "GET") {
    const previewId = decodeURIComponent(getByIdMatch[1]);
    const status = portManagerPreviewService.getStatus(previewId);
    return json(status);
  }

  // GET /api/port-manager-preview/:previewId/logs - Get specific preview logs
  const logsByIdMatch = pathname.match(/^\/api\/port-manager-preview\/([^/]+)\/logs$/);
  if (logsByIdMatch && method === "GET") {
    const previewId = decodeURIComponent(logsByIdMatch[1]);
    const tail = parseInt(url.searchParams.get("tail") || "50", 10);
    const logs = portManagerPreviewService.getLogs(previewId, tail);
    return json({ logs });
  }

  return null;
}
