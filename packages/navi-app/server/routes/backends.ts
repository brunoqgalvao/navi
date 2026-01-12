/**
 * Backend Routes
 *
 * API endpoints for backend detection, selection, and configuration.
 */

import { json, error } from "../utils/response";
import {
  backendRegistry,
  detectBackends,
  getModels,
  getAllModels,
  type BackendId,
} from "../backends";

export async function handleBackendRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const path = url.pathname;

  // GET /api/backends - List all backends with installation status and models
  if (path === "/api/backends" && method === "GET") {
    try {
      const backends = await detectBackends();
      // Enrich with models and other adapter info
      const enriched = backends.map((b) => {
        const adapter = backendRegistry.get(b.id);
        return {
          ...b,
          models: adapter?.models || [],
          defaultModel: adapter?.defaultModel,
          supportsCallbackPermissions: adapter?.supportsCallbackPermissions,
          supportsResume: adapter?.supportsResume,
        };
      });
      return json(enriched);
    } catch (e: any) {
      return error(e.message, 500);
    }
  }

  // GET /api/backends/installed - List only installed backends
  if (path === "/api/backends/installed" && method === "GET") {
    try {
      const backends = await detectBackends();
      const installed = backends.filter((b) => b.installed);
      // Enrich with models and other adapter info
      const enriched = installed.map((b) => {
        const adapter = backendRegistry.get(b.id);
        return {
          ...b,
          models: adapter?.models || [],
          defaultModel: adapter?.defaultModel,
          supportsCallbackPermissions: adapter?.supportsCallbackPermissions,
          supportsResume: adapter?.supportsResume,
        };
      });
      return json(enriched);
    } catch (e: any) {
      return error(e.message, 500);
    }
  }

  // GET /api/backends/models - Get all models grouped by backend
  // (Must be before :id match to avoid "models" being treated as an ID)
  if (path === "/api/backends/models" && method === "GET") {
    return json(getAllModels());
  }

  // GET /api/backends/:id/models - Get models for a specific backend
  const modelsMatch = path.match(/^\/api\/backends\/([^/]+)\/models$/);
  if (modelsMatch && method === "GET") {
    const backendId = modelsMatch[1] as BackendId;
    const models = getModels(backendId);

    if (!models.length) {
      return error(`Unknown backend: ${backendId}`, 404);
    }

    const adapter = backendRegistry.get(backendId);
    return json({
      models,
      default: adapter?.defaultModel,
    });
  }

  // GET /api/backends/:id - Get specific backend info
  const backendMatch = path.match(/^\/api\/backends\/([^/]+)$/);
  if (backendMatch && method === "GET") {
    const backendId = backendMatch[1] as BackendId;
    const adapter = backendRegistry.get(backendId);

    if (!adapter) {
      return error(`Unknown backend: ${backendId}`, 404);
    }

    try {
      const info = await adapter.detect();
      return json({
        ...info,
        models: adapter.models,
        defaultModel: adapter.defaultModel,
        supportsCallbackPermissions: adapter.supportsCallbackPermissions,
        supportsResume: adapter.supportsResume,
      });
    } catch (e: any) {
      return error(e.message, 500);
    }
  }

  return null;
}
