/**
 * MCP Server Management Routes
 * Handles listing and toggling MCP server enabled states
 * Syncs with Claude Code's filesystem configs (.mcp.json, ~/.claude.json)
 */

import { json, error } from "../utils/response";
import { mcpSettings, type McpServerInfo } from "../services/mcp-settings";
import {
  MCP_PRESETS,
  getPresetsByCategory,
  getPresetById,
  resolvePresetEnv,
  formatCredential,
  type MCPServerPreset,
} from "../services/mcp-presets";
import { getIntegrationsRegistry } from "../integrations/registry";

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

  function enrichWithPresetAuth(server: McpServerInfo): McpServerInfo {
    const preset = getPresetById(server.name);
    if (!preset) return server;
    return {
      ...server,
      authType: preset.authType,
      authUrl: preset.authUrl,
      authDescription: preset.authDescription,
    };
  }

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
    const externalServers = mcpSettings.getExternalServers(projectPath).map(enrichWithPresetAuth);
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
    const externalServers = mcpSettings.getExternalServers(projectPath).map(enrichWithPresetAuth);
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

  // POST /api/mcp/servers/create - Create a new MCP server
  // Body: { name, type, command?, args?, env?, url?, scope: "project" | "global", projectPath?, credentials? }
  // credentials: { envVarName: value } - stored securely, not in .mcp.json
  if (path === "/api/mcp/servers/create" && method === "POST") {
    try {
      const body = await req.json();
      const { name, type, command, args, env, url, scope, projectPath, credentials } = body as {
        name: string;
        type: "stdio" | "sse" | "streamable-http";
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        scope: "project" | "global";
        projectPath?: string;
        credentials?: Record<string, string>;  // NEW: secure credential storage
      };

      if (!name || !type) {
        return error("Missing required fields: name and type", 400);
      }

      if (type === "stdio" && !command) {
        return error("stdio type requires a command", 400);
      }

      if ((type === "sse" || type === "streamable-http") && !url) {
        return error(`${type} type requires a url`, 400);
      }

      if (scope === "project" && !projectPath) {
        return error("Project scope requires projectPath", 400);
      }

      // Check if name conflicts with built-in servers
      if (BUILTIN_SERVERS[name]) {
        return error(`Cannot use reserved name: ${name}`, 400);
      }

      const config: any = { type };
      if (command) config.command = command;
      if (args && args.length > 0) config.args = args;
      if (url) config.url = url;

      // If credentials provided, store them securely and use credential references
      if (credentials && Object.keys(credentials).length > 0) {
        // Non-credential env vars
        const nonCredEnv = env ? Object.fromEntries(
          Object.entries(env).filter(([k]) => !credentials[k])
        ) : undefined;
        if (nonCredEnv && Object.keys(nonCredEnv).length > 0) {
          config.env = nonCredEnv;
        }

        mcpSettings.addServerWithCredentials(name, config, credentials, scope, projectPath);
      } else {
        // Legacy: store env vars directly in .mcp.json (not recommended)
        if (env && Object.keys(env).length > 0) config.env = env;
        mcpSettings.addServer(name, config, scope, projectPath);
      }

      mcpSettings.reload();

      return json({
        success: true,
        message: `MCP server "${name}" created in ${scope === "project" ? ".mcp.json" : "~/.mcp.json"}`,
        credentialsStored: !!(credentials && Object.keys(credentials).length > 0),
      });
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to create MCP server", 500);
    }
  }

  // DELETE /api/mcp/servers/:name - Delete an MCP server
  // Query params: ?scope=project|global&projectPath=/path/to/project
  if (path.startsWith("/api/mcp/servers/") && method === "DELETE") {
    const name = decodeURIComponent(path.replace("/api/mcp/servers/", ""));

    if (!name || name === "toggle" || name === "reload" || name === "enabled-configs" || name === "create") {
      return error("Invalid server name", 400);
    }

    // Check if name is a built-in server
    if (BUILTIN_SERVERS[name]) {
      return error(`Cannot delete built-in server: ${name}`, 400);
    }

    const scope = url.searchParams.get("scope") as "project" | "global" | null;
    const projectPath = url.searchParams.get("projectPath") || undefined;

    if (!scope) {
      return error("scope query parameter is required (project or global)", 400);
    }

    if (scope === "project" && !projectPath) {
      return error("projectPath is required for project scope", 400);
    }

    try {
      const deleted = mcpSettings.removeServer(name, scope, projectPath);
      if (!deleted) {
        return error(`Server "${name}" not found in ${scope === "project" ? ".mcp.json" : "~/.mcp.json"}`, 404);
      }
      mcpSettings.reload();
      return json({ success: true, message: `MCP server "${name}" deleted from ${scope === "project" ? ".mcp.json" : "~/.mcp.json"}` });
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to delete MCP server", 500);
    }
  }

  // GET /api/mcp/presets - Get available MCP server presets
  if (path === "/api/mcp/presets" && method === "GET") {
    const registry = getIntegrationsRegistry();

    // Augment presets with credential availability info
    const presetsWithStatus = MCP_PRESETS.map(preset => {
      const hasCredentials = preset.credentialTemplate
        ? registry.providers.some(p => p.id === preset.credentialTemplate?.providerId)
        : false;

      return {
        ...preset,
        hasCredentials,
        // Check if credentials are actually stored
        credentialsStored: preset.credentialTemplate
          ? registry.providers.find(p => p.id === preset.credentialTemplate?.providerId)?.available ?? false
          : false,
      };
    });

    return json(presetsWithStatus);
  }

  // POST /api/mcp/presets/:presetId/add - Add a server from a preset
  // Body: { scope: "project" | "global", projectPath?, config?: { args?, env? } }
  if (path.startsWith("/api/mcp/presets/") && path.endsWith("/add") && method === "POST") {
    try {
      const presetId = decodeURIComponent(path.replace("/api/mcp/presets/", "").replace("/add", ""));
      const preset = getPresetById(presetId);

      if (!preset) {
        return error(`Preset not found: ${presetId}`, 404);
      }

      const body = await req.json();
      const { scope, projectPath, config = {} } = body as {
        scope: "project" | "global";
        projectPath?: string;
        config?: {
          args?: string[];
          env?: Record<string, string>;
        };
      };

      if (scope === "project" && !projectPath) {
        return error("projectPath is required for project scope", 400);
      }

      // Build server config from preset
      const serverConfig: any = { type: preset.type };

      if (preset.command) serverConfig.command = preset.command;
      if (preset.url) serverConfig.url = preset.url;

      // Use args from config override or preset defaults
      const args = config.args || preset.args;
      if (args && args.length > 0) serverConfig.args = args;

      // Build environment variables
      const env: Record<string, string> = {};

      // Add preset env templates (resolve credentials if available)
      if (preset.envTemplates) {
        const registry = getIntegrationsRegistry();
        const credentialsMap: Record<string, string> = {};

        if (preset.credentialTemplate) {
          // Get credentials from integration registry
          const provider = registry.providers.find(p => p.id === preset.credentialTemplate.providerId);
          if (provider && provider.available) {
            // Import credentials module to get stored values
            try {
              const { getProjectScopedCredential, getUserLevelCredential } = await import("../integrations/credentials");
              const projectId = scope === "project" ? await getProjectIdFromPath(projectPath) : undefined;

              const credential = projectId
                ? await getProjectScopedCredential(preset.credentialTemplate.providerId, projectId)
                : await getUserLevelCredential(preset.credentialTemplate.providerId);

              if (credential) {
                credentialsMap[preset.credentialTemplate.credentialKey] = credential.data[preset.credentialTemplate.credentialKey];
              }
            } catch (e) {
              console.error(`[MCP Presets] Failed to get credentials:`, e);
            }
          }
        }

        const resolvedEnv = resolvePresetEnv(preset, credentialsMap);
        if (resolvedEnv) {
          Object.assign(env, resolvedEnv);
        }
      }

      // Add any additional env from config
      if (config.env) {
        Object.assign(env, config.env);
      }

      if (Object.keys(env).length > 0) {
        serverConfig.env = env;
      }

      // Add the server
      mcpSettings.addServer(preset.name, serverConfig, scope, projectPath);
      mcpSettings.reload();

      return json({
        success: true,
        message: `MCP server "${preset.name}" added from preset`,
        server: {
          name: preset.name,
          type: preset.type,
          scope,
          hasCredentials: Object.keys(env).length > 0,
        },
      });
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to add preset server", 500);
    }
  }

  return null;
}

// Helper to get project ID from path
async function getProjectIdFromPath(projectPath: string): Promise<string | undefined> {
  try {
    const { projects } = await import("../db");
    const allProjects = projects.listAll();
    return allProjects.find(p => p.path === projectPath)?.id;
  } catch {
    return undefined;
  }
}
