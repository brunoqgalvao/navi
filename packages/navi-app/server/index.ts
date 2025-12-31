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

// Services
import { handleEphemeralChat } from "./services/ephemeral-chat";

// WebSocket
import {
  createWebSocketHandlers,
  broadcastToClients,
  getPendingPermissions,
  getSessionApprovedAll,
  getActiveProcesses,
} from "./websocket/handler";
import { findAvailablePort } from "./utils/port";

// Initialize database
await initDb();

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

    // Ports discovery endpoint
    if (url.pathname === "/ports") {
      return json({ server: PORT, pty: PORT + 1 });
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

    // Ephemeral chat
    if (url.pathname === "/api/ephemeral" && method === "POST") {
      return handleEphemeralChat(req);
    }

    // 404 fallback
    return json({ error: "Not found" }, 404);
  },

  websocket: createWebSocketHandlers(),
});

console.log(`Claude Code UI Server running on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
