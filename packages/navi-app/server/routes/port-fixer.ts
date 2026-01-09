/**
 * Port Fixer Routes
 *
 * API endpoints for the LLM-powered port conflict resolver.
 */

import { portFixer } from "../services/port-fixer";
import { json, error } from "../utils/response";

export async function handlePortFixerRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const path = url.pathname;

  // POST /api/port-fixer/analyze - Analyze a port conflict
  if (path === "/api/port-fixer/analyze" && method === "POST") {
    try {
      const body = await req.json();
      const { port, projectPath, useLlm = true } = body;

      if (!port || !projectPath) {
        return error("port and projectPath are required", 400);
      }

      const conflict = await portFixer.analyzeConflict(port, projectPath, useLlm);

      if (!conflict) {
        return json({ conflict: false, port, available: true });
      }

      return json({
        conflict: true,
        ...conflict,
      });
    } catch (e) {
      return error(`Failed to analyze port: ${e}`, 500);
    }
  }

  // POST /api/port-fixer/resolve - Resolve a port conflict
  if (path === "/api/port-fixer/resolve" && method === "POST") {
    try {
      const body = await req.json();
      const { port, projectPath, useLlm = true } = body;

      if (!port || !projectPath) {
        return error("port and projectPath are required", 400);
      }

      const result = await portFixer.autoFix(port, projectPath, useLlm);

      return json(result);
    } catch (e) {
      return error(`Failed to resolve port conflict: ${e}`, 500);
    }
  }

  // POST /api/port-fixer/find-available - Find an available port
  if (path === "/api/port-fixer/find-available" && method === "POST") {
    try {
      const body = await req.json();
      const { startPort = 3000 } = body;

      const port = await portFixer.findAvailablePort(startPort);

      return json({ port });
    } catch (e) {
      return error(`Failed to find available port: ${e}`, 500);
    }
  }

  // GET /api/port-fixer/navi-ports - Get all Navi-owned ports
  if (path === "/api/port-fixer/navi-ports" && method === "GET") {
    try {
      const ports = await portFixer.getNaviPorts();
      return json({ ports });
    } catch (e) {
      return error(`Failed to get Navi ports: ${e}`, 500);
    }
  }

  // POST /api/port-fixer/cleanup - Cleanup all Navi-owned ports
  if (path === "/api/port-fixer/cleanup" && method === "POST") {
    try {
      const cleaned = await portFixer.cleanupNaviPorts();
      return json({ cleaned, message: `Cleaned up ${cleaned} Navi-owned ports` });
    } catch (e) {
      return error(`Failed to cleanup ports: ${e}`, 500);
    }
  }

  // GET /api/port-fixer/check/:port - Quick check if port is available
  if (path.startsWith("/api/port-fixer/check/") && method === "GET") {
    try {
      const port = parseInt(path.split("/").pop() || "", 10);

      if (isNaN(port)) {
        return error("Invalid port number", 400);
      }

      const conflict = await portFixer.analyzeConflict(port, "", false);

      return json({
        port,
        available: !conflict,
        ...(conflict && {
          usedBy: conflict.conflictingProcess.process,
          pid: conflict.conflictingProcess.pid,
          command: conflict.conflictingProcess.command,
        }),
      });
    } catch (e) {
      return error(`Failed to check port: ${e}`, 500);
    }
  }

  return null;
}
