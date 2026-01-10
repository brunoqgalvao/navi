import { initDb, globalSettings, searchIndex, sessions } from "./db";
import { json, corsHeaders } from "./utils/response";

// Route handlers
import { handleGitRoutes } from "./routes/git";
import { handleFilesystemRoutes } from "./routes/filesystem";
import { handleFolderRoutes } from "./routes/folders";
import { handleSearchRoutes } from "./routes/search";
import { handleUiControlRoutes } from "./routes/ui-control";
import { handleAudioRoutes } from "./routes/audio";
import { handleCostRoutes } from "./routes/costs";
import { handleAuthRoutes } from "./routes/auth";
import { handleConfigRoutes } from "./routes/config";
import { handleProjectRoutes } from "./routes/projects";
import { handleSessionRoutes } from "./routes/sessions";
import { handleMessageRoutes } from "./routes/messages";
import { handleSkillRoutes } from "./routes/skills";
import { handleAgentRoutes } from "./routes/agents";
import { handleAgentBuilderRoutes } from "./routes/agent-builder";
import { handleTerminalRoutes, installPtyErrorHandler } from "./routes/terminal";
import { handleProxyRoutes } from "./routes/proxy";
import { handleProcessRoutes } from "./routes/processes";
import { handleAnalyticsRoutes } from "./routes/analytics";
import { handleDeployRoutes } from "./routes/deploy";
import { handleBackgroundProcessRoutes, addProcessEventListener, type ProcessEvent } from "./routes/background-processes";
import { handleExtensionRoutes } from "./routes/extensions";
import { handleKanbanRoutes } from "./routes/kanban";
import { handleWorktreeRoutes } from "./routes/worktrees";
// ⚠️ EXPERIMENTAL: Worktree preview - remove this import to revert (see worktree-preview.ts for full revert steps)
import { handleWorktreePreviewRoutes } from "./routes/worktree-preview";
// Container-based preview system (Colima/Docker)
import { handleContainerPreviewRoutes } from "./routes/container-preview";
// Native preview system (lightweight, no Docker)
import { handleNativePreviewRoutes } from "./routes/native-preview";
// Preview proxy with branch indicator injection
import { handlePreviewProxyRoutes } from "./routes/preview-proxy";
// Port Manager preview system (LLM-powered port orchestration)
import { handlePortManagerPreviewRoutes } from "./routes/port-manager-preview";
// LLM-powered port conflict resolver
import { handlePortFixerRoutes } from "./routes/port-fixer";
import { handleBranchNameRoutes } from "./routes/branch-name";
import { handleSessionHierarchyRoutes } from "./routes/session-hierarchy";
import { handleCommandsRoutes } from "./routes/commands";
import { handleSessionsBoardRoutes } from "./routes/sessions-board";
// Dashboard feature (isolated - remove import to disable)
import { handleDashboardRoutes } from "./routes/dashboard";
// OAuth Integrations (Google, GitHub, etc.)
import { handleIntegrationsRoutes } from "./routes/integrations";
// Experimental Features (Ensemble Consensus, Self-Healing, Experimental Agents)
import { handleExperimentalRoutes, initExperimentalWebSocket } from "./routes/experimental";
// Project Memory (for proactive hooks)
import { handleMemoryRoutes } from "./routes/memory";
// Proactive Hooks (cheap Haiku analysis)
import { handleProactiveHooksRoutes } from "./routes/proactive-hooks";
// Cloud Execution (E2B sandboxes)
import { handleCloudExecutionRoutes } from "./routes/cloud-execution";

// Services
import { handleEphemeralChat } from "./services/ephemeral-chat";

// WebSocket
import {
  createWebSocketHandlers,
  broadcastToClients,
  getPendingPermissions,
  getSessionApprovedAll,
  getActiveProcesses,
  getMemoryStats,
} from "./websocket/handler";
import { findAvailablePort } from "./utils/port";

// Initialize database
await initDb();

// Initialize integrations table (must be after initDb)
import { initIntegrationsTable } from "./integrations/db";
initIntegrationsTable();

// Install global error handler for PTY crashes
installPtyErrorHandler();

// Migrate env keys to database
async function migrateEnvKeys() {
  const { homedir } = await import("os");
  const { join } = await import("path");
  const fs = await import("fs/promises");

  const envPath = join(homedir(), ".claude-code-ui", ".env");
  try {
    const content = await fs.readFile(envPath, "utf-8");

    const anthropicMatch = content.match(/ANTHROPIC_API_KEY=(.+)/);
    if (anthropicMatch && !globalSettings.get("anthropicApiKey")) {
      const key = anthropicMatch[1].trim();
      if (key.startsWith("sk-ant-")) {
        globalSettings.set("anthropicApiKey", key);
        globalSettings.set("preferredAuth", "api_key");
        console.log("Migrated ANTHROPIC_API_KEY from .env to database");
      }
    }
  } catch {}
}

await migrateEnvKeys();

// Build search index if empty
const stats = searchIndex.getStats();
if (stats.total === 0) {
  console.log("Building search index...");
  searchIndex.reindexAll();
  console.log("Search index built:", searchIndex.getStats());
}

const PREFERRED_PORT = parseInt(process.argv[2] || Bun.env.PORT || "3001", 10);
const PORT = await findAvailablePort(PREFERRED_PORT);

if (PORT !== PREFERRED_PORT) {
  console.log(`Port ${PREFERRED_PORT} in use, using ${PORT} instead`);
}

// Spawn PTY server when running in Tauri (bundled) mode
// The PTY server runs separately because node-pty has issues with Bun's file descriptor handling
let ptyServerProcess: ReturnType<typeof import("child_process").spawn> | null = null;

async function spawnPtyServer() {
  const { spawn } = await import("child_process");
  const { join, dirname } = await import("path");
  const { existsSync } = await import("fs");

  // Calculate PTY port (main server port + 1)
  const ptyPort = PORT + 1;

  // Find the PTY server script
  let ptyServerPath: string | null = null;

  // In Tauri bundled mode, look in resources directory
  if (process.env.TAURI_RESOURCE_DIR) {
    const resourcePath = join(process.env.TAURI_RESOURCE_DIR, "resources", "pty-server.cjs");
    if (existsSync(resourcePath)) {
      ptyServerPath = resourcePath;
    }
  }

  // Also check relative to the server directory (for development with Tauri)
  if (!ptyServerPath) {
    const serverDir = dirname(import.meta.url.replace("file://", ""));
    const devPath = join(serverDir, "pty-server.cjs");
    if (existsSync(devPath)) {
      ptyServerPath = devPath;
    }
  }

  if (!ptyServerPath) {
    console.warn("[Server] PTY server script not found, terminal functionality may be limited");
    return;
  }

  console.log(`[Server] Spawning PTY server on port ${ptyPort}...`);

  // Find node executable - check multiple locations
  let nodePath = "node";
  const nodeLocations = [
    process.env.NAVI_NODE_PATH,
    "/usr/local/bin/node",          // Homebrew Intel
    "/opt/homebrew/bin/node",       // Homebrew ARM (Apple Silicon)
    "/usr/bin/node",                // System node
    `${process.env.HOME}/.nvm/current/bin/node`, // nvm
  ].filter(Boolean) as string[];

  for (const loc of nodeLocations) {
    if (existsSync(loc)) {
      nodePath = loc;
      console.log(`[Server] Found Node.js at: ${nodePath}`);
      break;
    }
  }

  console.log(`[Server] Using PTY server: ${ptyServerPath}`);
  ptyServerProcess = spawn(nodePath, [ptyServerPath], {
    env: {
      ...process.env,
      PTY_PORT: String(ptyPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  ptyServerProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[PTY] ${data.toString().trim()}`);
  });

  ptyServerProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[PTY] ${data.toString().trim()}`);
  });

  ptyServerProcess.on("error", (err) => {
    console.error("[Server] Failed to spawn PTY server:", err.message);
  });

  ptyServerProcess.on("exit", (code, signal) => {
    console.log(`[Server] PTY server exited with code ${code}, signal ${signal}`);
    ptyServerProcess = null;
  });
}

// Spawn PTY server if we're in Tauri mode (TAURI_RESOURCE_DIR is set)
// This handles the bundled app case where PTY server isn't started separately
console.log(`[Server] TAURI_RESOURCE_DIR=${process.env.TAURI_RESOURCE_DIR || "not set"}`);
if (process.env.TAURI_RESOURCE_DIR) {
  console.log("[Server] Running in Tauri mode, spawning PTY server...");
  await spawnPtyServer();
} else {
  console.log("[Server] Not in Tauri mode, skipping PTY server spawn");
}

// Get shared state for routes that need it
const pendingPermissions = getPendingPermissions();
const sessionApprovedAll = getSessionApprovedAll();
const activeProcesses = getActiveProcesses();

const server = Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Health check
    if (url.pathname === "/health") {
      return json({ status: "ok", port: PORT });
    }

    // Internet connectivity check - tests if we can reach external APIs
    if (url.pathname === "/api/health/internet") {
      try {
        // Try to reach Anthropic's API (lightweight check)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const res = await fetch("https://api.anthropic.com/v1/models", {
          method: "HEAD",
          signal: controller.signal,
        }).catch(() => null);

        clearTimeout(timeout);

        // Any response (even 401) means we have internet
        const online = res !== null;
        return json({ online, checkedAt: Date.now() });
      } catch {
        return json({ online: false, checkedAt: Date.now() });
      }
    }

    // Ports discovery endpoint
    if (url.pathname === "/ports") {
      return json({ server: PORT, pty: PORT + 1 });
    }

    // Memory stats endpoint for debugging
    if (url.pathname === "/api/debug/memory") {
      const memoryUsage = process.memoryUsage();
      // Dynamically import services to get their stats
      const { sessionManager } = await import("./services/session-manager");
      const { nativePreviewService } = await import("./services/native-preview");
      return json({
        serverMaps: getMemoryStats(),
        sessionManager: sessionManager.getMemoryStats(),
        nativePreview: {
          activePreviews: nativePreviewService.getStatus() ? 1 : 0,
        },
        process: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
          external: Math.round(memoryUsage.external / 1024 / 1024) + "MB",
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + "MB",
        },
        timestamp: Date.now(),
      });
    }

    // Try each route handler in order
    let response: Response | null = null;

    // Sessions active endpoint (needs activeProcesses) - check early
    if (url.pathname === "/api/sessions/active" && method === "GET") {
      const permissionSessions = new Set(
        Array.from(pendingPermissions.values()).map((pending) => pending.sessionId)
      );
      const active = Array.from(activeProcesses.keys()).map((sessionId) => {
        const session = sessions.get(sessionId);
        if (!session) return null;
        return {
          sessionId,
          projectId: session.project_id,
          status: permissionSessions.has(sessionId) ? "permission" : "running",
        };
      }).filter(Boolean);
      return json(active);
    }

    // Search routes
    response = await handleSearchRoutes(url, method);
    if (response) return response;

    // Git routes
    response = await handleGitRoutes(url, method, req);
    if (response) return response;

    // Dashboard routes (isolated feature)
    response = await handleDashboardRoutes(url, method, req);
    if (response) return response;

    // Experimental features routes (Ensemble Consensus, Self-Healing, Agents)
    response = await handleExperimentalRoutes(url, method, req);
    if (response) return response;

    // Filesystem routes
    response = await handleFilesystemRoutes(url, method, req);
    if (response) return response;

    // Folder routes
    response = await handleFolderRoutes(url, method, req);
    if (response) return response;

    // UI control routes
    response = await handleUiControlRoutes(url, method, req, broadcastToClients);
    if (response) return response;

    // Audio routes
    response = await handleAudioRoutes(url, method, req);
    if (response) return response;

    // Cost routes
    response = await handleCostRoutes(url, method);
    if (response) return response;

    // Auth routes
    response = await handleAuthRoutes(url, method, req);
    if (response) return response;

    // Integrations routes (OAuth)
    response = await handleIntegrationsRoutes(url, method, req);
    if (response) return response;

    // Config routes
    response = await handleConfigRoutes(url, method, req);
    if (response) return response;

    // Project routes
    response = await handleProjectRoutes(url, method, req);
    if (response) return response;

    // Session routes (needs shared state)
    response = await handleSessionRoutes(url, method, req, sessionApprovedAll, pendingPermissions);
    if (response) return response;

    // Message routes
    response = await handleMessageRoutes(url, method, req);
    if (response) return response;

    // Skill routes
    response = await handleSkillRoutes(url, method, req);
    if (response) return response;

    // Memory routes (project memory for proactive hooks)
    response = await handleMemoryRoutes(url, method, req);
    if (response) return response;

    // Proactive hooks routes (cheap Haiku analysis)
    response = await handleProactiveHooksRoutes(url, method, req);
    if (response) return response;

    // Agent routes
    response = await handleAgentRoutes(url, method, req);
    if (response) return response;

    // Agent builder routes
    response = await handleAgentBuilderRoutes(url, method, req);
    if (response) return response;

    // Terminal routes
    response = await handleTerminalRoutes(url, method, req);
    if (response) return response;

    // Proxy routes (for external URL preview)
    response = await handleProxyRoutes(url, method, req);
    if (response) return response;

    // Process management routes
    response = await handleProcessRoutes(url, method, req);
    if (response) return response;

    // Analytics routes
    response = await handleAnalyticsRoutes(url, method);
    if (response) return response;

    // Deploy routes (Navi Cloud)
    response = await handleDeployRoutes(url, method, req);
    if (response) return response;

    // Cloud Execution routes (E2B)
    response = await handleCloudExecutionRoutes(url, method, req);
    if (response) return response;

    // Background process routes
    response = await handleBackgroundProcessRoutes(url, method, req);
    if (response) return response;

    // Extension routes
    response = await handleExtensionRoutes(url, method, req);
    if (response) return response;

    // Kanban routes
    response = await handleKanbanRoutes(url, method, req);
    if (response) return response;

    // Worktree routes
    response = await handleWorktreeRoutes(url, method, req);
    if (response) return response;

    // ⚠️ EXPERIMENTAL: Worktree preview routes (dev server in branch) - remove to revert
    response = await handleWorktreePreviewRoutes(url, method, req);
    if (response) return response;

    // Native preview routes (lightweight, no Docker)
    response = await handleNativePreviewRoutes(url, method, req);
    if (response) return response;

    // Container-based preview routes (Colima/Docker)
    response = await handleContainerPreviewRoutes(url, method, req);
    if (response) return response;

    // Preview proxy routes (injects branch indicator)
    response = await handlePreviewProxyRoutes(url, method, req);
    if (response) return response;

    // Port Manager preview routes (LLM-powered port orchestration)
    response = await handlePortManagerPreviewRoutes(url, method, req);
    if (response) return response;

    // Port fixer routes (LLM-powered conflict resolution)
    response = await handlePortFixerRoutes(url, method, req);
    if (response) return response;

    // Branch name generation (LLM-powered)
    response = await handleBranchNameRoutes(url, method, req);
    if (response) return response;

    // Session hierarchy routes (multi-agent)
    response = await handleSessionHierarchyRoutes(url, method, req);
    if (response) return response;

    // Commands routes (custom slash commands)
    response = await handleCommandsRoutes(url, method, req);
    if (response) return response;

    // Sessions board routes (dashboard view)
    response = await handleSessionsBoardRoutes(url, method, req, activeProcesses, pendingPermissions);
    if (response) return response;

    // Ephemeral chat
    if (url.pathname === "/api/ephemeral" && method === "POST") {
      return handleEphemeralChat(req);
    }

    // 404 fallback
    return json({ error: "Not found" }, 404);
  },

  websocket: createWebSocketHandlers(),
});

// Set up background process event broadcasting
addProcessEventListener((event: ProcessEvent) => {
  broadcastToClients({
    type: "background_process_event",
    ...event,
  });
});

// Initialize experimental features WebSocket broadcasting
initExperimentalWebSocket(broadcastToClients);

console.log(`Claude Code UI Server running on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);

// Cleanup PTY server on exit
function cleanupPtyServer() {
  if (ptyServerProcess) {
    console.log("[Server] Killing PTY server process...");
    ptyServerProcess.kill("SIGTERM");
    ptyServerProcess = null;
  }
}

process.on("SIGINT", () => {
  console.log("[Server] Received SIGINT, shutting down...");
  cleanupPtyServer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Server] Received SIGTERM, shutting down...");
  cleanupPtyServer();
  process.exit(0);
});

process.on("exit", () => {
  cleanupPtyServer();
});
