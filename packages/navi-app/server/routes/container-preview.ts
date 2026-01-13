/**
 * Container Preview Routes
 *
 * HTTP endpoints for the containerized preview system.
 * Replaces native process-based previews with Docker containers via Colima.
 */
import { json, error } from "../utils/response";
import { sessions, projects, saveDb } from "../db";
import {
  previewService,
  getInstallInstructions,
  type PreviewContainer,
} from "../services/preview";
import { getDb } from "../db";

export async function handleContainerPreviewRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/projects/:projectId/preview/branch/:branch - Get preview by branch
  const branchStatusMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/preview\/branch\/(.+)$/
  );
  if (branchStatusMatch && method === "GET") {
    const projectId = branchStatusMatch[1];
    const branch = decodeURIComponent(branchStatusMatch[2]);

    const preview = previewService.getPreviewByBranch(projectId, branch);
    if (!preview) {
      return json({ running: false, exists: false });
    }

    previewService.markAccessed(preview.id);

    return json({
      exists: true,
      running: preview.status === "running" || preview.status === "starting",
      status: preview.status,
      url: preview.url,
      slug: preview.slug,
      branch: preview.branch,
      framework: preview.framework?.name,
      startedAt: preview.startedAt,
      error: preview.error,
    });
  }

  // DELETE /api/projects/:projectId/preview/branch/:branch - Stop preview by branch
  if (branchStatusMatch && method === "DELETE") {
    const projectId = branchStatusMatch[1];
    const branch = decodeURIComponent(branchStatusMatch[2]);

    await previewService.stopPreviewByBranch(projectId, branch);
    return json({ success: true });
  }

  // GET /api/preview/status - Get preview system status
  if (url.pathname === "/api/preview/status" && method === "GET") {
    const state = previewService.getState();
    return json({
      initialized: state.initialized,
      runtime: state.runtime,
      proxyRunning: state.proxyRunning,
      containerCount: state.containerCount,
      proxyPort: state.config.proxyPort,
      maxContainers: state.config.maxContainers,
    });
  }

  // POST /api/preview/initialize - Initialize preview system
  if (url.pathname === "/api/preview/initialize" && method === "POST") {
    try {
      const runtime = await previewService.initialize();
      return json({
        success: true,
        runtime: runtime.runtime,
        version: runtime.version,
        running: runtime.running,
      });
    } catch (e: any) {
      return json(
        {
          success: false,
          error: e.message,
          instructions: getInstallInstructions(),
        },
        500
      );
    }
  }

  // GET /api/preview/list - List all active previews
  if (url.pathname === "/api/preview/list" && method === "GET") {
    const previews = previewService.listPreviews();
    return json(previews);
  }

  // POST /api/sessions/:id/preview/container - Start containerized preview
  const startMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/container$/
  );
  if (startMatch && method === "POST") {
    const sessionId = startMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return error("Session not found", 404);
    }

    // Get the project
    const project = session.project_id ? projects.get(session.project_id) : null;
    if (!project) {
      return error("Project not found for session", 404);
    }

    // Determine the path to use (worktree or project root)
    const previewPath = session.worktree_path || project.path;
    const branch = session.worktree_branch || "main";

    if (!previewPath) {
      return error("No path available for preview", 400);
    }

    // Get cached preview config from database
    const cachedConfig = getProjectPreviewConfig(project.id);

    try {
      const { preview, detectedConfig } = await previewService.startPreview(
        sessionId,
        project.id,
        previewPath,
        branch,
        cachedConfig
      );

      // If new config was detected, cache it for future use
      if (detectedConfig && !cachedConfig) {
        saveProjectPreviewConfig(project.id, detectedConfig);
      }

      return json({
        success: true,
        preview: {
          id: preview.id,
          url: preview.url,
          slug: preview.slug,
          status: preview.status,
          branch: preview.branch,
          framework: preview.framework?.name,
        },
      });
    } catch (e: any) {
      console.error("[ContainerPreview] Start failed:", e);
      return json(
        {
          success: false,
          error: e.message,
          instructions:
            e.message.includes("No container runtime")
              ? getInstallInstructions()
              : undefined,
        },
        500
      );
    }
  }

  // DELETE /api/sessions/:id/preview/container - Stop containerized preview
  const stopMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/container$/
  );
  if (stopMatch && method === "DELETE") {
    const sessionId = stopMatch[1];

    await previewService.stopPreviewBySession(sessionId);
    return json({ success: true });
  }

  // GET /api/sessions/:id/preview/container - Get preview status for session
  const statusMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/container$/
  );
  if (statusMatch && method === "GET") {
    const sessionId = statusMatch[1];

    const preview = previewService.getPreviewBySession(sessionId);
    if (!preview) {
      return json({ running: false });
    }

    // Mark as accessed to reset idle timer
    previewService.markAccessed(preview.id);

    return json({
      running: preview.status === "running" || preview.status === "starting",
      status: preview.status,
      url: preview.url,
      slug: preview.slug,
      branch: preview.branch,
      framework: preview.framework?.name,
      startedAt: preview.startedAt,
      error: preview.error,
    });
  }

  // GET /api/sessions/:id/preview/container/logs - Get preview logs
  const logsMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/container\/logs$/
  );
  if (logsMatch && method === "GET") {
    const sessionId = logsMatch[1];

    const preview = previewService.getPreviewBySession(sessionId);
    if (!preview) {
      return json({ logs: [] });
    }

    const tail = parseInt(url.searchParams.get("tail") || "100");
    const logs = await previewService.getLogs(preview.id, tail);

    return json({ logs });
  }

  // POST /api/sessions/:id/preview/container/pause - Pause preview
  const pauseMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/container\/pause$/
  );
  if (pauseMatch && method === "POST") {
    const sessionId = pauseMatch[1];

    const preview = previewService.getPreviewBySession(sessionId);
    if (!preview) {
      return error("No preview found for session", 404);
    }

    await previewService.pausePreview(preview.id);
    return json({ success: true });
  }

  // POST /api/sessions/:id/preview/container/unpause - Unpause preview
  const unpauseMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/preview\/container\/unpause$/
  );
  if (unpauseMatch && method === "POST") {
    const sessionId = unpauseMatch[1];

    const preview = previewService.getPreviewBySession(sessionId);
    if (!preview) {
      return error("No preview found for session", 404);
    }

    await previewService.unpausePreview(preview.id);
    return json({ success: true });
  }

  // GET /api/preview/branch-indicator.js - Serve the branch indicator injection script
  if (url.pathname === "/api/preview/branch-indicator.js" && method === "GET") {
    const fs = await import("fs");
    const path = await import("path");
    const scriptPath = path.join(
      __dirname,
      "../services/preview/inject-indicator.js"
    );

    if (fs.existsSync(scriptPath)) {
      const script = fs.readFileSync(scriptPath, "utf-8");
      return new Response(script, {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return error("Branch indicator script not found", 404);
  }

  // DELETE /api/projects/:projectId/preview/config - Reset cached preview config
  const resetConfigMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/preview\/config$/
  );
  if (resetConfigMatch && method === "DELETE") {
    const projectId = resetConfigMatch[1];

    // Clear the cached preview config
    clearProjectPreviewConfig(projectId);

    return json({ success: true, message: "Preview config cache cleared. Next preview will re-detect." });
  }

  // GET /api/preview/branch-info/:port - Get branch info for a specific port
  if (url.pathname.match(/^\/api\/preview\/branch-info\/(\d+)$/) && method === "GET") {
    const portMatch = url.pathname.match(/^\/api\/preview\/branch-info\/(\d+)$/);
    const port = portMatch![1];

    // Find preview by port
    const previews = previewService.listPreviews();
    const preview = previews.find(p => p.url?.includes(`:${port}`));

    if (preview) {
      const project = preview.projectId ? projects.get(preview.projectId) : null;
      return json({
        branch: preview.branch,
        projectName: project?.name || "Unknown Project",
        framework: preview.framework?.name || "Unknown",
        status: preview.status,
      });
    }

    return json({ branch: "unknown", projectName: "Unknown", framework: "Unknown", status: "unknown" });
  }

  return null;
}

/**
 * Cleanup preview when a session is deleted
 */
export async function cleanupContainerPreview(sessionId: string): Promise<void> {
  await previewService.stopPreviewBySession(sessionId);
}

/**
 * Get cached preview config for a project from the database
 */
function getProjectPreviewConfig(projectId: string): string | null {
  const db = getDb();
  const result = db.exec(
    `SELECT preview_config FROM projects WHERE id = ?`,
    [projectId]
  );
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0] as string | null;
  }
  return null;
}

/**
 * Save detected preview config to the database
 */
function saveProjectPreviewConfig(projectId: string, config: string): void {
  const db = getDb();
  db.run(
    `UPDATE projects SET preview_config = ? WHERE id = ?`,
    [config, projectId]
  );
  saveDb();
}

/**
 * Clear cached preview config for a project (forces re-detection)
 */
function clearProjectPreviewConfig(projectId: string): void {
  const db = getDb();
  db.run(
    `UPDATE projects SET preview_config = NULL WHERE id = ?`,
    [projectId]
  );
  saveDb();
}
