/**
 * Native Preview Routes
 *
 * HTTP endpoints for the native (non-Docker) preview system.
 * Includes compliance checking and session management.
 */

import { json, error } from "../utils/response";
import { sessions, projects } from "../db";
import { nativePreviewService } from "../services/native-preview";

export async function handleNativePreviewRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/sessions/:id/preview/native/compliance - Check if preview is possible
  const complianceMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/native\/compliance$/
  );
  if (complianceMatch && method === "GET") {
    const sessionId = complianceMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return error("Session not found", 404);
    }

    const project = session.project_id ? projects.get(session.project_id) : null;
    if (!project) {
      return error("Project not found for session", 404);
    }

    const previewPath = session.worktree_path || project.path;
    if (!previewPath) {
      return json({
        canPreview: false,
        reason: "No path available for preview",
      });
    }

    try {
      const compliance = await nativePreviewService.checkCompliance(previewPath);
      return json(compliance);
    } catch (e: any) {
      return json({
        canPreview: false,
        reason: e.message,
      });
    }
  }

  // POST /api/sessions/:id/preview/native - Start native preview
  const startMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/native$/
  );
  if (startMatch && method === "POST") {
    const sessionId = startMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return error("Session not found", 404);
    }

    const project = session.project_id ? projects.get(session.project_id) : null;
    if (!project) {
      return error("Project not found for session", 404);
    }

    // Determine base path (worktree or project root)
    const basePath = session.worktree_path || project.path;
    const branch = session.worktree_branch || "main";

    if (!basePath) {
      return error("No path available for preview", 400);
    }

    // Check compliance first to get the resolved path (handles subfolders)
    const compliance = await nativePreviewService.checkCompliance(basePath);
    if (!compliance.canPreview) {
      return json({
        success: false,
        error: compliance.reason || "Preview not available",
        suggestions: compliance.suggestions,
      }, 400);
    }

    // Use resolved path if package.json was in a subfolder
    const previewPath = compliance.resolvedPath || basePath;

    try {
      const result = await nativePreviewService.start(
        sessionId,
        project.id,
        previewPath,
        branch
      );

      // Handle the different result types
      if (result.success) {
        return json({
          success: true,
          port: result.port,
          url: result.url,
          framework: result.framework,
          resolvedPath: compliance.resolvedPath,
        });
      } else if ("conflict" in result) {
        // Port conflict requiring user decision
        return json({
          success: false,
          conflict: result.conflict,
        });
      } else {
        // Error
        return json({
          success: false,
          error: result.error,
        }, 400);
      }
    } catch (e: any) {
      console.error("[NativePreview] Start failed:", e);
      return json(
        {
          success: false,
          error: e.message,
        },
        500
      );
    }
  }

  // POST /api/sessions/:id/preview/native/resolve-conflict - Resolve a port conflict
  const resolveConflictMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/native\/resolve-conflict$/
  );
  if (resolveConflictMatch && method === "POST") {
    const sessionId = resolveConflictMatch[1];

    let body: { action?: string } = {};
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON body", 400);
    }

    const action = body.action;
    if (action !== "use_alternative" && action !== "kill_and_use_original") {
      return error("Invalid action. Must be 'use_alternative' or 'kill_and_use_original'", 400);
    }

    try {
      const result = await nativePreviewService.resolveConflict(sessionId, action);

      if (result.success) {
        return json({
          success: true,
          port: result.port,
          url: result.url,
          framework: result.framework,
        });
      } else if ("conflict" in result) {
        // Another conflict (shouldn't happen but handle gracefully)
        return json({
          success: false,
          conflict: result.conflict,
        });
      } else {
        return json({
          success: false,
          error: result.error,
        }, 400);
      }
    } catch (e: any) {
      console.error("[NativePreview] Resolve conflict failed:", e);
      return json({
        success: false,
        error: e.message,
      }, 500);
    }
  }

  // DELETE /api/sessions/:id/preview/native - Stop native preview for this session's project
  const stopMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/native$/
  );
  if (stopMatch && method === "DELETE") {
    const sessionId = stopMatch[1];
    // Only stop the preview for THIS session, not all previews!
    await nativePreviewService.stopForSession(sessionId);
    return json({ success: true });
  }

  // GET /api/sessions/:id/preview/native - Get native preview status
  const statusMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/native$/
  );
  if (statusMatch && method === "GET") {
    const sessionId = statusMatch[1];

    // Only return preview status for THIS session - no cross-session fallback
    // This prevents preview leaking between different Navi windows/workspaces
    const status = nativePreviewService.getBySession(sessionId);

    return json(status);
  }

  // GET /api/sessions/:id/preview/native/logs - Get native preview logs for this session
  const logsMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/native\/logs$/
  );
  if (logsMatch && method === "GET") {
    const sessionId = logsMatch[1];
    const tail = parseInt(url.searchParams.get("tail") || "50");
    // Get logs for THIS session's preview, not global logs
    const logs = nativePreviewService.getLogsBySession(sessionId, tail);
    return json({ logs });
  }

  // GET /api/preview/native/status - Get global native preview status
  if (url.pathname === "/api/preview/native/status" && method === "GET") {
    const status = nativePreviewService.getStatus();
    return json(status);
  }

  return null;
}

/**
 * Cleanup preview when a session is deleted
 * Only stops the preview for THIS session's project, not all previews
 */
export async function cleanupNativePreview(sessionId: string): Promise<void> {
  const status = nativePreviewService.getBySession(sessionId);
  if (status.running) {
    // Only stop THIS session's preview, not all previews!
    await nativePreviewService.stopForSession(sessionId);
  }
}
