/**
 * Experimental Features API Routes
 *
 * Endpoints for experimental AI-powered features:
 * - Ensemble Consensus
 * - Self-Healing Builds
 * - Experimental Agents (Red Team, Browser, Goal, Healer)
 */

import { json, error } from "../utils/response";
import { selfHealingService, type HealingWebSocketEvent } from "../services/self-healing-builds";
import {
  getAvailableAgentTypes,
  getAgentConfig,
  spawnRedTeam,
  spawnBrowserAgent,
  spawnGoalAgent,
  spawnHealerAgent,
  spawnConsensusAgent,
  type ExperimentalAgentType,
} from "../services/experimental-agents";
import { projects, sessions } from "../db";

// Will be set by initExperimentalWebSocket
let broadcastFn: ((payload: unknown) => void) | null = null;

/**
 * Initialize WebSocket broadcasting for experimental features
 * Call this from main server after WebSocket is set up
 */
export function initExperimentalWebSocket(broadcast: (payload: unknown) => void) {
  broadcastFn = broadcast;

  // Wire up self-healing events to WebSocket
  selfHealingService.on("session:started", ({ projectId, session }) => {
    broadcast({
      type: "healing:session_started",
      projectId,
      data: {
        status: session.status,
        errorCount: session.errors.length,
      },
    } as HealingWebSocketEvent);
  });

  selfHealingService.on("session:stopped", ({ projectId }) => {
    broadcast({
      type: "healing:session_stopped",
      projectId,
    } as HealingWebSocketEvent);
  });

  selfHealingService.on("check:complete", ({ projectId, errors }) => {
    broadcast({
      type: "healing:check_complete",
      projectId,
      data: {
        errorCount: errors.length,
        errors: errors.slice(0, 10),
      },
    } as HealingWebSocketEvent);
  });

  selfHealingService.on("healing:started", ({ projectId, error: healingError }) => {
    broadcast({
      type: "healing:started",
      projectId,
      data: { error: healingError },
    } as HealingWebSocketEvent);
  });

  selfHealingService.on("healing:complete", ({ projectId, attemptId, success, error: healError }) => {
    broadcast({
      type: "healing:complete",
      projectId,
      data: { attemptId, success, error: healError },
    } as HealingWebSocketEvent);
  });

  console.log("[Experimental] WebSocket events initialized");
}

/**
 * Handle experimental feature routes
 */
export async function handleExperimentalRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // ==========================================================================
  // EXPERIMENTAL AGENTS
  // ==========================================================================

  // GET /api/experimental/agents - List available experimental agent types
  if (pathname === "/api/experimental/agents" && method === "GET") {
    const agents = getAvailableAgentTypes();
    return json({ agents });
  }

  // GET /api/experimental/agents/:type - Get specific agent config
  const agentConfigMatch = pathname.match(/^\/api\/experimental\/agents\/([^/]+)$/);
  if (agentConfigMatch && method === "GET") {
    const agentType = agentConfigMatch[1] as ExperimentalAgentType;
    const config = getAgentConfig(agentType);

    if (!config) {
      return error(`Unknown agent type: ${agentType}`, 404);
    }

    return json({ config });
  }

  // POST /api/experimental/agents/spawn - Spawn an experimental agent
  if (pathname === "/api/experimental/agents/spawn" && method === "POST") {
    try {
      const body = await req.json();
      const { sessionId, agentType, task, context } = body;

      if (!sessionId || !agentType || !task) {
        return error("sessionId, agentType, and task are required", 400);
      }

      // Validate session exists
      const session = sessions.get(sessionId);
      if (!session) {
        return error("Session not found", 404);
      }

      let result;
      switch (agentType) {
        case "red-team":
          result = spawnRedTeam(sessionId, task, context?.filePaths);
          break;
        case "browser-agent":
          result = spawnBrowserAgent(sessionId, context?.url || "http://localhost:3000", task);
          break;
        case "goal-agent":
          result = spawnGoalAgent(sessionId, task, context?.verificationCriteria || "Verify the goal is achieved");
          break;
        case "healer-agent":
          result = spawnHealerAgent(sessionId, context?.errorContext || task, context?.projectPath || session.project_id);
          break;
        case "consensus-agent":
          result = spawnConsensusAgent(sessionId, task, context?.mode || "default");
          break;
        default:
          return error(`Unknown agent type: ${agentType}`, 400);
      }

      if (!result) {
        return error("Failed to spawn agent", 500);
      }

      return json({
        success: true,
        childSessionId: result.id,
        agentType,
        message: `Spawned ${agentType} agent`,
      });
    } catch (err: any) {
      console.error("[Experimental] Failed to spawn agent:", err);
      return error(err.message || "Failed to spawn agent", 500);
    }
  }

  // ==========================================================================
  // SELF-HEALING BUILDS
  // ==========================================================================

  // GET /api/experimental/healing/sessions - List all healing sessions
  if (pathname === "/api/experimental/healing/sessions" && method === "GET") {
    const sessions = selfHealingService.getAllSessions().map((s) => ({
      projectId: s.projectId,
      projectPath: s.projectPath,
      sessionId: s.sessionId,
      status: s.status,
      errorCount: s.errors.length,
      attemptCount: s.attempts.length,
      startedAt: s.startedAt,
      lastErrorAt: s.lastErrorAt,
      lastHealAt: s.lastHealAt,
    }));

    return json({ sessions });
  }

  // GET /api/experimental/healing/:projectId - Get healing session details
  const healingDetailsMatch = pathname.match(/^\/api\/experimental\/healing\/([^/]+)$/);
  if (healingDetailsMatch && method === "GET") {
    const projectId = healingDetailsMatch[1];
    const session = selfHealingService.getSession(projectId);

    if (!session) {
      return json({ running: false });
    }

    return json({
      running: true,
      projectId: session.projectId,
      projectPath: session.projectPath,
      sessionId: session.sessionId,
      status: session.status,
      errors: session.errors,
      attempts: session.attempts.slice(-20), // Last 20 attempts
      startedAt: session.startedAt,
      lastErrorAt: session.lastErrorAt,
      lastHealAt: session.lastHealAt,
    });
  }

  // POST /api/experimental/healing/start - Start self-healing for a project
  if (pathname === "/api/experimental/healing/start" && method === "POST") {
    try {
      const body = await req.json();
      const { projectId, sessionId, config } = body;

      if (!projectId) {
        return error("projectId is required", 400);
      }

      // Get project path
      const project = projects.get(projectId);
      if (!project) {
        return error("Project not found", 404);
      }

      const session = await selfHealingService.startWatching(
        projectId,
        project.path,
        sessionId,
        config
      );

      return json({
        success: true,
        message: "Self-healing started",
        status: session.status,
        errorCount: session.errors.length,
      });
    } catch (err: any) {
      console.error("[Experimental] Failed to start healing:", err);
      return error(err.message || "Failed to start healing", 500);
    }
  }

  // POST /api/experimental/healing/stop - Stop self-healing for a project
  if (pathname === "/api/experimental/healing/stop" && method === "POST") {
    try {
      const body = await req.json();
      const { projectId } = body;

      if (!projectId) {
        return error("projectId is required", 400);
      }

      await selfHealingService.stopWatching(projectId);

      return json({
        success: true,
        message: "Self-healing stopped",
      });
    } catch (err: any) {
      console.error("[Experimental] Failed to stop healing:", err);
      return error(err.message || "Failed to stop healing", 500);
    }
  }

  // POST /api/experimental/healing/check - Trigger a manual check
  if (pathname === "/api/experimental/healing/check" && method === "POST") {
    try {
      const body = await req.json();
      const { projectId } = body;

      if (!projectId) {
        return error("projectId is required", 400);
      }

      const errors = await selfHealingService.runCheck(projectId);

      return json({
        success: true,
        errorCount: errors.length,
        errors: errors.slice(0, 10), // First 10 errors
      });
    } catch (err: any) {
      console.error("[Experimental] Failed to run check:", err);
      return error(err.message || "Failed to run check", 500);
    }
  }

  // POST /api/experimental/healing/pause - Pause healing
  if (pathname === "/api/experimental/healing/pause" && method === "POST") {
    try {
      const body = await req.json();
      const { projectId } = body;

      if (!projectId) {
        return error("projectId is required", 400);
      }

      selfHealingService.pauseHealing(projectId);

      return json({
        success: true,
        message: "Self-healing paused",
      });
    } catch (err: any) {
      return error(err.message || "Failed to pause healing", 500);
    }
  }

  // POST /api/experimental/healing/resume - Resume healing
  if (pathname === "/api/experimental/healing/resume" && method === "POST") {
    try {
      const body = await req.json();
      const { projectId } = body;

      if (!projectId) {
        return error("projectId is required", 400);
      }

      selfHealingService.resumeHealing(projectId);

      return json({
        success: true,
        message: "Self-healing resumed",
      });
    } catch (err: any) {
      return error(err.message || "Failed to resume healing", 500);
    }
  }

  // ==========================================================================
  // ENSEMBLE CONSENSUS (via skill - these are convenience endpoints)
  // ==========================================================================

  // POST /api/experimental/consensus - Run ensemble consensus
  if (pathname === "/api/experimental/consensus" && method === "POST") {
    try {
      const body = await req.json();
      const { prompt, mode, models, context } = body;

      if (!prompt) {
        return error("prompt is required", 400);
      }

      // Build the command
      const skillPath = "~/.claude/skills/ensemble-consensus/index.ts";
      let cmd = `bun ${skillPath}`;

      if (mode) {
        cmd += ` --${mode}`;
      }

      if (models && Array.isArray(models)) {
        cmd += ` --models "${models.join(",")}"`;
      }

      cmd += ` --json`;
      cmd += ` "${prompt.replace(/"/g, '\\"')}"`;

      // Execute
      const { execSync } = await import("child_process");
      const result = execSync(cmd, {
        encoding: "utf-8",
        timeout: 120000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024,
      });

      // Parse result
      const parsed = JSON.parse(result);

      return json({
        success: true,
        ...parsed,
      });
    } catch (err: any) {
      console.error("[Experimental] Consensus failed:", err);

      // Try to extract error message
      let message = err.message || "Consensus failed";
      if (err.stderr) {
        message = err.stderr.toString().slice(0, 500);
      }

      return error(message, 500);
    }
  }

  // Not handled by this router
  return null;
}
