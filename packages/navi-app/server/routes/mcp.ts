/**
 * MCP Server Management Routes
 * Handles listing and toggling MCP server enabled states
 * Syncs with Claude Code's filesystem configs (.mcp.json, ~/.claude.json)
 */

import { json, error } from "../utils/response";
import { mcpSettings, type McpServerInfo } from "../services/mcp-settings";

// Built-in MCP servers with their tool counts
const BUILTIN_SERVERS: Record<string, { toolCount: number; description: string }> = {
  "user-interaction": {
    toolCount: 1,
    description: "Ask user questions with UI prompts",
  },
  "navi-context": {
    toolCount: 3,
    description: "View processes, terminal, and wait",
  },
  "multi-session": {
    toolCount: 5,
    description: "Multi-agent coordination tools",
  },
};

export async function handleMcpRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const path = url.pathname;

  // GET /api/mcp/servers - List all MCP servers (built-in + external)
  // Query params: ?projectPath=/path/to/project (required for external servers)
  if (path === "/api/mcp/servers" && method === "GET") {
    const projectPath = url.searchParams.get("projectPath") || undefined;

    // Built-in servers - always enabled by default
    // (built-in servers are controlled separately from external servers)
    const servers: McpServerInfo[] = Object.entries(BUILTIN_SERVERS).map(
      ([name, info]) => ({
        name,
        enabled: !mcpSettings.isDisabledBuiltin(name, projectPath),
        toolCount: info.toolCount,
        isBuiltIn: true,
        source: "builtin" as const,
      })
    );

    // External servers from filesystem (.mcp.json, ~/.claude.json)
    const externalServers = mcpSettings.getExternalServers(projectPath);
    servers.push(...externalServers);

    return json(servers);
  }

  // POST /api/mcp/servers/toggle - Toggle a server's enabled state
  // Body: { name, enabled, projectPath, isBuiltIn }
  if (path === "/api/mcp/servers/toggle" && method === "POST") {
    try {
      const body = await req.json();
      const { name, enabled, projectPath, isBuiltIn } = body as {
        name: string;
        enabled: boolean;
        projectPath?: string;
        isBuiltIn?: boolean;
      };

      if (!name || typeof enabled !== "boolean") {
        return error("Missing name or enabled field", 400);
      }

      if (!projectPath) {
        return error("projectPath is required to toggle MCP servers (writes to ~/.claude.json)", 400);
      }

      // Built-in servers use a separate storage key
      if (isBuiltIn || BUILTIN_SERVERS[name]) {
        mcpSettings.setBuiltin(name, enabled, projectPath);
      } else {
        mcpSettings.set(name, enabled, projectPath);
      }

      return json({ success: true });
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to toggle MCP server", 500);
    }
  }

  // GET /api/mcp/servers/:name - Get a specific server's status
  if (path.startsWith("/api/mcp/servers/") && method === "GET") {
    const name = decodeURIComponent(path.replace("/api/mcp/servers/", ""));

    if (name === "toggle" || name === "reload" || name === "enabled-configs") return null;

    const projectPath = url.searchParams.get("projectPath") || undefined;
    const builtIn = BUILTIN_SERVERS[name];

    if (builtIn) {
      return json({
        name,
        enabled: !mcpSettings.isDisabledBuiltin(name, projectPath),
        toolCount: builtIn.toolCount,
        isBuiltIn: true,
        source: "builtin",
      });
    }

    // Check external servers
    const externalServers = mcpSettings.getExternalServers(projectPath);
    const external = externalServers.find(s => s.name === name);
    if (external) {
      return json(external);
    }

    return error(`MCP server not found: ${name}`, 404);
  }

  // POST /api/mcp/servers/reload - Force reload from filesystem
  if (path === "/api/mcp/servers/reload" && method === "POST") {
    mcpSettings.reload();
    return json({ success: true, message: "MCP settings reloaded from disk" });
  }

  // GET /api/mcp/servers/enabled-configs - Get configs for enabled external servers
  // Used by query-worker to pass external MCP servers to Claude Agent SDK
  if (path === "/api/mcp/servers/enabled-configs" && method === "GET") {
    const projectPath = url.searchParams.get("projectPath") || undefined;
    const configs = mcpSettings.getEnabledExternalServerConfigs(projectPath);
    return json(configs);
  }

  return null;
}
