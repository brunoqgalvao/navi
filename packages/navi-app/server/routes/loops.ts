/**
 * Infinite Loop Mode API Routes
 *
 * POST /api/loops/start     - Start infinite loop with DoD
 * POST /api/loops/:id/stop  - Stop a running loop
 * POST /api/loops/:id/pause - Pause a running loop
 * POST /api/loops/:id/resume - Resume a paused loop
 * GET  /api/loops/:id       - Get loop status
 * GET  /api/loops/:id/status.md - Get STATUS.md content
 * GET  /api/loops           - List all loops
 * DELETE /api/loops/:id     - Delete a loop
 */

import { json, error } from "../utils/response";
import {
  createLoop,
  getLoop,
  listLoops,
  stopLoop,
  pauseLoop,
  resumeLoop,
  generateStatusMd,
  isLoopComplete,
  shouldStopLoop,
  type LoopState,
} from "../services/loop-manager";
import { enableInfiniteLoop, disableUntilDone } from "../websocket/handler";
import { projects } from "../db";

export async function handleLoopRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // POST /api/loops/start - Start a new infinite loop
  if (pathname === "/api/loops/start" && method === "POST") {
    try {
      const body = await req.json();
      const {
        sessionId,
        projectId,
        prompt,
        definitionOfDone,
        model,
        maxIterations,
        maxCost,
        contextResetThreshold,
        verifierModel,
      } = body;

      if (!sessionId || !projectId || !prompt) {
        return error("sessionId, projectId, and prompt are required", 400);
      }

      if (!definitionOfDone || !Array.isArray(definitionOfDone) || definitionOfDone.length === 0) {
        return error("definitionOfDone must be a non-empty array of strings", 400);
      }

      // Get project's context window
      const project = projects.get(projectId);
      const contextWindow = project?.context_window || 200000;

      // Start the infinite loop
      const loop = enableInfiniteLoop(sessionId, prompt, projectId, {
        model,
        maxIterations: maxIterations ?? 100,
        maxCost: maxCost ?? 50,
        definitionOfDone,
        contextResetThreshold: contextResetThreshold ?? 0.7,
        verifierModel: verifierModel ?? "haiku",
        contextWindow,
      });

      return json({
        success: true,
        loopId: loop.loopId,
        message: "Infinite loop started",
        loop: sanitizeLoopState(loop),
      });
    } catch (e) {
      console.error("[Loops] Error starting loop:", e);
      return error(e instanceof Error ? e.message : "Failed to start loop", 500);
    }
  }

  // GET /api/loops - List all loops
  if (pathname === "/api/loops" && method === "GET") {
    const status = url.searchParams.get("status"); // running, completed, failed, stopped, paused
    const projectId = url.searchParams.get("projectId");

    let loops = listLoops();

    if (status) {
      loops = loops.filter(l => l.status === status);
    }
    if (projectId) {
      loops = loops.filter(l => l.projectId === projectId);
    }

    return json({
      loops: loops.map(sanitizeLoopState),
      total: loops.length,
    });
  }

  // Routes with loop ID
  const loopIdMatch = pathname.match(/^\/api\/loops\/([^/]+)$/);
  const loopStatusMdMatch = pathname.match(/^\/api\/loops\/([^/]+)\/status\.md$/);
  const loopActionMatch = pathname.match(/^\/api\/loops\/([^/]+)\/(stop|pause|resume)$/);

  // GET /api/loops/:id/status.md - Get STATUS.md content
  if (loopStatusMdMatch && method === "GET") {
    const loopId = loopStatusMdMatch[1];
    const loop = getLoop(loopId);

    if (!loop) {
      return error("Loop not found", 404);
    }

    const statusMd = generateStatusMd(loop);
    return new Response(statusMd, {
      headers: { "Content-Type": "text/markdown" },
    });
  }

  // POST /api/loops/:id/stop|pause|resume
  if (loopActionMatch && method === "POST") {
    const loopId = loopActionMatch[1];
    const action = loopActionMatch[2];
    const loop = getLoop(loopId);

    if (!loop) {
      return error("Loop not found", 404);
    }

    switch (action) {
      case "stop":
        stopLoop(loopId);
        disableUntilDone(loop.sessionId);
        return json({ success: true, message: "Loop stopped", loopId });

      case "pause":
        if (loop.status !== "running") {
          return error("Can only pause running loops", 400);
        }
        pauseLoop(loopId);
        return json({ success: true, message: "Loop paused", loopId });

      case "resume":
        if (loop.status !== "paused") {
          return error("Can only resume paused loops", 400);
        }
        resumeLoop(loopId);
        return json({ success: true, message: "Loop resumed", loopId });
    }
  }

  // GET /api/loops/:id - Get loop status
  if (loopIdMatch && method === "GET") {
    const loopId = loopIdMatch[1];
    const loop = getLoop(loopId);

    if (!loop) {
      return error("Loop not found", 404);
    }

    const stopCheck = shouldStopLoop(loopId);

    return json({
      loop: sanitizeLoopState(loop),
      isComplete: isLoopComplete(loopId),
      shouldStop: stopCheck.stop,
      stopReason: stopCheck.reason,
      statusMd: generateStatusMd(loop),
    });
  }

  // DELETE /api/loops/:id - Delete a loop
  if (loopIdMatch && method === "DELETE") {
    const loopId = loopIdMatch[1];
    const loop = getLoop(loopId);

    if (!loop) {
      return error("Loop not found", 404);
    }

    // Stop if running
    if (loop.status === "running" || loop.status === "paused") {
      stopLoop(loopId);
      disableUntilDone(loop.sessionId);
    }

    return json({ success: true, message: "Loop deleted", loopId });
  }

  return null; // Not handled
}

/**
 * Sanitize loop state for API response (remove internal details)
 */
function sanitizeLoopState(loop: LoopState) {
  return {
    loopId: loop.loopId,
    sessionId: loop.sessionId,
    projectId: loop.projectId,
    status: loop.status,
    statusReason: loop.statusReason,
    iteration: loop.iteration,
    contextResets: loop.contextResets,
    totalCost: loop.totalCost,
    totalTokens: loop.totalTokens,
    startedAt: loop.startedAt,
    maxIterations: loop.maxIterations,
    maxCost: loop.maxCost,
    contextResetThreshold: loop.contextResetThreshold,
    verifierModel: loop.verifierModel,
    definitionOfDone: loop.definitionOfDone.map(d => ({
      id: d.id,
      description: d.description,
      verified: d.verified,
      verifiedAt: d.verifiedAt,
      verifiedBy: d.verifiedBy,
    })),
    iterations: loop.iterations.map(i => ({
      iteration: i.iteration,
      startedAt: i.startedAt,
      endedAt: i.endedAt,
      tokensUsed: i.tokensUsed,
      costUsd: i.costUsd,
      outcome: i.outcome,
      contextResetAfter: i.contextResetAfter,
    })),
    lastContext: loop.lastContext,
  };
}
