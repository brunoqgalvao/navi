/**
 * Worktree Preview Server Management
 *
 * ⚠️ EXPERIMENTAL FEATURE - Added 2026-01-08
 *
 * To revert this feature:
 * 1. Delete this file (server/routes/worktree-preview.ts)
 * 2. Remove import and route handler from server/index.ts (search "worktree-preview")
 * 3. Remove cleanupWorktreePreview import/call from server/routes/worktrees.ts
 * 4. Remove preview API methods from src/lib/api.ts (startPreview, stopPreview, getPreviewStatus, listPreviews)
 * 5. Revert WorktreeHeader.svelte changes (remove preview button and related state/functions)
 *
 * Allows spawning dev servers in git worktrees to preview branches
 * without affecting the main development environment.
 *
 * KNOWN LIMITATIONS:
 * - Only works with simple npm/bun/yarn/pnpm projects with standard "dev" scripts
 * - Monorepos may not work (worktree might be in wrong directory)
 * - Dependencies might not be installed in worktree
 * - Environment variables from main repo won't be available
 * - Hardcoded ports in apps won't respect PORT env var
 */
import { json } from "../utils/response";
import { sessions, projects } from "../db";
import {
  startBackgroundProcess,
  killBackgroundProcess,
  listBackgroundProcesses,
  getBackgroundProcess,
  type BackgroundProcess,
} from "./background-processes";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Track worktree preview servers: sessionId -> processId
const worktreePreviewServers = new Map<string, string>();

// Base port for worktree previews (will scan up from here)
const WORKTREE_PREVIEW_BASE_PORT = 1450;
const WORKTREE_BACKEND_BASE_PORT = 3050;

/**
 * Detect package manager and dev command from a worktree
 */
function detectDevCommand(worktreePath: string): { command: string; label: string } | null {
  const packageJsonPath = join(worktreePath, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const scripts = packageJson.scripts || {};

    // Determine package manager
    let pm = "npm";
    if (existsSync(join(worktreePath, "bun.lockb"))) {
      pm = "bun";
    } else if (existsSync(join(worktreePath, "yarn.lock"))) {
      pm = "yarn";
    } else if (existsSync(join(worktreePath, "pnpm-lock.yaml"))) {
      pm = "pnpm";
    }

    // Find the best dev command
    const devCommands = ["dev", "dev:all", "start", "serve"];
    for (const cmd of devCommands) {
      if (scripts[cmd]) {
        return {
          command: `${pm} run ${cmd}`,
          label: `Preview: ${cmd}`,
        };
      }
    }

    // Fallback: just run dev
    if (scripts.dev) {
      return { command: `${pm} run dev`, label: "Preview: dev" };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find next available port starting from base
 */
function findAvailablePort(basePort: number): number {
  const runningProcesses = listBackgroundProcesses({ status: "running" });
  const usedPorts = new Set<number>();

  for (const proc of runningProcesses) {
    for (const port of proc.ports) {
      usedPorts.add(port);
    }
  }

  // Also check our tracked preview servers
  for (let offset = 0; offset < 50; offset++) {
    const port = basePort + offset;
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  return basePort + 50; // Fallback
}

/**
 * Get environment variables for worktree dev server
 */
function getPreviewEnv(frontendPort: number, backendPort: number): Record<string, string> {
  return {
    ...process.env,
    PORT: String(frontendPort),
    VITE_PORT: String(frontendPort),
    DEV_SERVER_PORT: String(backendPort),
    // Disable HMR websocket to avoid conflicts
    VITE_HMR_PORT: String(frontendPort + 100),
    // Flag to identify this as a preview instance
    NAVI_PREVIEW_MODE: "true",
  };
}

export async function handleWorktreePreviewRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // POST /api/sessions/:id/worktree/preview - Start preview server
  const startMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/preview$/
  );
  if (startMatch && method === "POST") {
    const sessionId = startMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path || !existsSync(session.worktree_path)) {
      return json({ error: "Session does not have a valid worktree" }, 400);
    }

    // Check if preview already running
    const existingProcessId = worktreePreviewServers.get(sessionId);
    if (existingProcessId) {
      const existingProcess = getBackgroundProcess(existingProcessId);
      if (existingProcess && existingProcess.status === "running") {
        return json({
          success: true,
          alreadyRunning: true,
          processId: existingProcessId,
          ports: existingProcess.ports,
        });
      }
      // Clean up stale reference
      worktreePreviewServers.delete(sessionId);
    }

    // Detect how to run dev server
    const devInfo = detectDevCommand(session.worktree_path);
    if (!devInfo) {
      return json({
        error: "Could not detect dev command. No package.json with dev script found."
      }, 400);
    }

    // Find available ports
    const frontendPort = findAvailablePort(WORKTREE_PREVIEW_BASE_PORT);
    const backendPort = findAvailablePort(WORKTREE_BACKEND_BASE_PORT);

    // Build the command with port overrides
    const body = await req.json().catch(() => ({}));
    const customCommand = body.command;

    // Construct command that sets port via env vars
    // Most frameworks respect PORT or have their own flags
    let command: string;
    if (customCommand) {
      command = customCommand;
    } else {
      // Add port flags based on detected command
      const baseCmd = devInfo.command;
      if (baseCmd.includes("vite") || baseCmd.includes("dev")) {
        // Vite-based projects
        command = `PORT=${frontendPort} ${baseCmd} -- --port ${frontendPort}`;
      } else {
        command = `PORT=${frontendPort} ${baseCmd}`;
      }
    }

    console.log(`[WorktreePreview] Starting preview for session ${sessionId}`);
    console.log(`[WorktreePreview] Path: ${session.worktree_path}`);
    console.log(`[WorktreePreview] Command: ${command}`);
    console.log(`[WorktreePreview] Frontend port: ${frontendPort}, Backend port: ${backendPort}`);

    const proc = startBackgroundProcess({
      command,
      cwd: session.worktree_path,
      sessionId,
      projectId: session.project_id,
      type: "dev_server",
      label: `Preview: ${session.worktree_branch || "worktree"}`,
    });

    worktreePreviewServers.set(sessionId, proc.id);

    return json({
      success: true,
      processId: proc.id,
      pid: proc.pid,
      frontendPort,
      backendPort,
      command,
      worktreePath: session.worktree_path,
      branch: session.worktree_branch,
    });
  }

  // DELETE /api/sessions/:id/worktree/preview - Stop preview server
  const stopMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/preview$/
  );
  if (stopMatch && method === "DELETE") {
    const sessionId = stopMatch[1];

    const processId = worktreePreviewServers.get(sessionId);
    if (!processId) {
      return json({ error: "No preview server running for this session" }, 404);
    }

    const killed = killBackgroundProcess(processId);
    worktreePreviewServers.delete(sessionId);

    return json({ success: true, killed });
  }

  // GET /api/sessions/:id/worktree/preview - Get preview server status
  const statusMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/preview$/
  );
  if (statusMatch && method === "GET") {
    const sessionId = statusMatch[1];

    const processId = worktreePreviewServers.get(sessionId);
    if (!processId) {
      return json({ running: false });
    }

    const proc = getBackgroundProcess(processId);
    if (!proc || proc.status !== "running") {
      worktreePreviewServers.delete(sessionId);
      return json({ running: false });
    }

    return json({
      running: true,
      processId,
      pid: proc.pid,
      ports: proc.ports,
      status: proc.status,
      startedAt: proc.startedAt,
      output: proc.output.slice(-20), // Last 20 lines
    });
  }

  // GET /api/worktree-previews - List all running preview servers
  if (url.pathname === "/api/worktree-previews" && method === "GET") {
    const previews: Array<{
      sessionId: string;
      processId: string;
      status: string;
      ports: number[];
      branch?: string;
    }> = [];

    for (const [sessionId, processId] of worktreePreviewServers) {
      const proc = getBackgroundProcess(processId);
      if (proc) {
        const session = sessions.get(sessionId);
        previews.push({
          sessionId,
          processId,
          status: proc.status,
          ports: proc.ports,
          branch: session?.worktree_branch || undefined,
        });
      }
    }

    return json(previews);
  }

  return null;
}

/**
 * Clean up preview server when a session/worktree is deleted
 */
export function cleanupWorktreePreview(sessionId: string): void {
  const processId = worktreePreviewServers.get(sessionId);
  if (processId) {
    killBackgroundProcess(processId);
    worktreePreviewServers.delete(sessionId);
  }
}
