/**
 * Cloud Execution API Routes
 *
 * Endpoints for managing E2B cloud executions.
 */

import { cloudExecutions, sessions } from "../db";
import { json, error } from "../utils/response";
import { listRunningSandboxes, killSandbox } from "../services/e2b-executor";

export async function handleCloudExecutionRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/cloud/executions/:sessionId - List executions for a session
  const listMatch = url.pathname.match(/^\/api\/cloud\/executions\/([^/]+)$/);
  if (listMatch && method === "GET") {
    const sessionId = listMatch[1];
    const executions = cloudExecutions.list(sessionId);
    return json(executions);
  }

  // GET /api/cloud/execution/:id - Get a specific execution
  const getMatch = url.pathname.match(/^\/api\/cloud\/execution\/([^/]+)$/);
  if (getMatch && method === "GET") {
    const executionId = getMatch[1];
    const execution = cloudExecutions.get(executionId);
    if (!execution) {
      return error("Execution not found", 404);
    }
    return json(execution);
  }

  // GET /api/cloud/session/:sessionId/latest - Get latest execution for session
  const latestMatch = url.pathname.match(/^\/api\/cloud\/session\/([^/]+)\/latest$/);
  if (latestMatch && method === "GET") {
    const sessionId = latestMatch[1];
    const execution = cloudExecutions.getLatest(sessionId);
    return json(execution || null);
  }

  // POST /api/cloud/execution/:id/cancel - Cancel an execution
  const cancelMatch = url.pathname.match(/^\/api\/cloud\/execution\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const executionId = cancelMatch[1];
    const execution = cloudExecutions.get(executionId);
    if (!execution) {
      return error("Execution not found", 404);
    }
    if (execution.status === "completed" || execution.status === "failed" || execution.status === "cancelled") {
      return error("Execution already finished", 400);
    }
    cloudExecutions.cancel(executionId);
    return json({ success: true });
  }

  // GET /api/cloud/sandboxes - List running sandboxes (admin/debug)
  if (url.pathname === "/api/cloud/sandboxes" && method === "GET") {
    try {
      const sandboxes = await listRunningSandboxes();
      return json({ sandboxes });
    } catch (e) {
      return error("Failed to list sandboxes", 500);
    }
  }

  // DELETE /api/cloud/sandbox/:id - Kill a specific sandbox (admin/debug)
  const killMatch = url.pathname.match(/^\/api\/cloud\/sandbox\/([^/]+)$/);
  if (killMatch && method === "DELETE") {
    const sandboxId = killMatch[1];
    try {
      const success = await killSandbox(sandboxId);
      return json({ success });
    } catch (e) {
      return error("Failed to kill sandbox", 500);
    }
  }

  // PATCH /api/sessions/:id/execution-mode - Set session execution mode
  const modeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/execution-mode$/);
  if (modeMatch && method === "PATCH") {
    const sessionId = modeMatch[1];
    const body = await req.json() as {
      mode: "local" | "cloud";
      repoUrl?: string;
      branch?: string;
    };

    const session = sessions.get(sessionId);
    if (!session) {
      return error("Session not found", 404);
    }

    sessions.setExecutionMode(sessionId, body.mode, body.repoUrl, body.branch);
    return json({ success: true });
  }

  // Not handled by this router
  return null;
}
