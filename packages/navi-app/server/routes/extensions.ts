// Extensions API routes

import { json, error } from "../utils/response";
import { extensionSettings } from "../db";

export async function handleExtensionRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // GET /api/extensions/project/:projectId - List extension settings for a project
  const projectListMatch = pathname.match(/^\/api\/extensions\/project\/([^/]+)$/);
  if (projectListMatch && method === "GET") {
    const projectId = projectListMatch[1];
    const extensions = extensionSettings.listByProject(projectId);
    return json({ extensions });
  }

  // PUT /api/extensions/project/:projectId/reorder - Update extension order
  // NOTE: This must come BEFORE the generic /:extensionId route to avoid "reorder" being treated as an extension ID
  const reorderMatch = pathname.match(/^\/api\/extensions\/project\/([^/]+)\/reorder$/);
  if (reorderMatch && method === "PUT") {
    const projectId = reorderMatch[1];
    try {
      const body = await req.json();
      const orders = body.orders as { extensionId: string; sortOrder: number }[];

      if (!orders || !Array.isArray(orders)) {
        return error("Orders array is required", 400);
      }

      extensionSettings.updateOrders(projectId, orders);
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to update extension order", 500);
    }
  }

  // PUT /api/extensions/project/:projectId/:extensionId/config - Update extension config
  // NOTE: This must come BEFORE the generic /:extensionId route
  const configUpdateMatch = pathname.match(/^\/api\/extensions\/project\/([^/]+)\/([^/]+)\/config$/);
  if (configUpdateMatch && method === "PUT") {
    const [, projectId, extensionId] = configUpdateMatch;
    try {
      const body = await req.json();
      if (!body.config) {
        return error("Config is required", 400);
      }
      extensionSettings.updateConfig(projectId, extensionId, JSON.stringify(body.config));
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to update extension config", 500);
    }
  }

  // PUT /api/extensions/project/:projectId/:extensionId - Set extension enabled state
  const extensionUpdateMatch = pathname.match(/^\/api\/extensions\/project\/([^/]+)\/([^/]+)$/);
  if (extensionUpdateMatch && method === "PUT") {
    const [, projectId, extensionId] = extensionUpdateMatch;
    try {
      const body = await req.json();
      const enabled = body.enabled ?? true;
      const sortOrder = body.sortOrder;
      console.log("[Extensions] Upserting:", { projectId, extensionId, enabled, sortOrder });
      extensionSettings.upsert(
        projectId,
        extensionId,
        enabled,
        body.config ? JSON.stringify(body.config) : null,
        sortOrder
      );
      console.log("[Extensions] Upsert complete");
      return json({ success: true });
    } catch (e: any) {
      console.error("[Extensions] Error:", e);
      return error(e.message || "Failed to update extension settings", 500);
    }
  }

  // DELETE /api/extensions/project/:projectId - Reset all extension settings for a project
  if (projectListMatch && method === "DELETE") {
    const projectId = projectListMatch[1];
    try {
      extensionSettings.deleteByProject(projectId);
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to reset extension settings", 500);
    }
  }

  // DELETE /api/extensions/project/:projectId/:extensionId - Delete specific extension setting
  if (extensionUpdateMatch && method === "DELETE") {
    const [, projectId, extensionId] = extensionUpdateMatch;
    try {
      extensionSettings.delete(projectId, extensionId);
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to delete extension setting", 500);
    }
  }

  // POST /api/extensions/project/:projectId/apply-template - Apply template extension config
  const applyTemplateMatch = pathname.match(/^\/api\/extensions\/project\/([^/]+)\/apply-template$/);
  if (applyTemplateMatch && method === "POST") {
    const projectId = applyTemplateMatch[1];
    try {
      const body = await req.json();
      const extensions = body.extensions as Record<string, { enabled: boolean; config?: Record<string, unknown>; sortOrder?: number }>;

      if (!extensions || typeof extensions !== "object") {
        return error("Extensions config is required", 400);
      }

      for (const [extensionId, config] of Object.entries(extensions)) {
        extensionSettings.upsert(
          projectId,
          extensionId,
          config.enabled,
          config.config ? JSON.stringify(config.config) : null,
          config.sortOrder
        );
      }

      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to apply template extensions", 500);
    }
  }

  return null;
}
