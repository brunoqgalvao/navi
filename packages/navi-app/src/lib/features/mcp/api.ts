/**
 * MCP Settings API
 * Client for managing MCP server enabled/disabled states
 * Syncs with Claude Code's filesystem configs (.mcp.json, ~/.claude.json)
 */

import { getApiBase } from "$lib/config";

export interface McpAuthStatus {
  hasTokens: boolean;
  hasClientInfo: boolean;
  isAuthenticated: boolean;
  needsAuth: boolean;
  tokensExpired: boolean;
  hasRefreshToken: boolean;
}

export interface McpServer {
  name: string;
  enabled: boolean;
  toolCount?: number;
  isBuiltIn: boolean;
  type?: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  source?: "builtin" | "project-mcp" | "global-mcp" | "claude-json";
  authType?: "oauth" | "mcp_oauth" | "api_key" | "none";
  authUrl?: string;
  authDescription?: string;
  // OAuth status for SSE/HTTP servers
  authStatus?: McpAuthStatus;
}

export interface CreateMcpServerRequest {
  name: string;
  type: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  scope: "project" | "global";
  projectPath?: string;
  // Credentials to store securely (encrypted in DB, not in .mcp.json)
  credentials?: Record<string, string>;
}

export interface MCPSetupStep {
  id: string;
  type: "input" | "secret" | "directory" | "select" | "confirm" | "info";
  label: string;
  description?: string;
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
  required?: boolean;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  storeAs: {
    env?: string;
    arg?: boolean;
    argReplace?: string;
  };
  validation?: {
    pattern?: string;
    minLength?: number;
    message?: string;
  };
}

export interface MCPServerPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  type: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  envTemplates?: Record<string, string>;
  credentialTemplate?: {
    credentialKey: string;
    providerId: string;
    format?: string;
  };
  helpUrl?: string;
  requiresConfig: boolean;
  authType?: "oauth" | "mcp_oauth" | "api_key" | "none";
  authUrl?: string;
  authDescription?: string;
  hasCredentials?: boolean;
  credentialsStored?: boolean;
  setupSteps?: MCPSetupStep[];
}

export interface AddPresetRequest {
  scope: "project" | "global";
  projectPath?: string;
  config?: {
    args?: string[];
    env?: Record<string, string>;
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const mcpApi = {
  /**
   * List all MCP servers with their enabled states
   * @param projectPath Optional project path for project-specific external servers
   */
  list: (projectPath?: string): Promise<McpServer[]> => {
    const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
    return request(`/mcp/servers${params}`);
  },

  /**
   * Toggle an MCP server's enabled state
   * @param name Server name
   * @param enabled New enabled state
   * @param projectPath Required - project path for writing to ~/.claude.json
   * @param isBuiltIn Whether this is a built-in Navi server
   */
  toggle: (name: string, enabled: boolean, projectPath: string, isBuiltIn?: boolean): Promise<{ success: boolean }> =>
    request("/mcp/servers/toggle", {
      method: "POST",
      body: JSON.stringify({ name, enabled, projectPath, isBuiltIn }),
    }),

  /**
   * Get the enabled state for a specific MCP server
   */
  get: (name: string, projectPath?: string): Promise<McpServer> => {
    const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
    return request(`/mcp/servers/${encodeURIComponent(name)}${params}`);
  },

  /**
   * Force reload MCP settings from filesystem
   */
  reload: (): Promise<{ success: boolean; message: string }> =>
    request("/mcp/servers/reload", { method: "POST" }),

  /**
   * Get enabled external server configs (for passing to Claude Agent SDK)
   */
  getEnabledConfigs: (projectPath?: string): Promise<Record<string, any>> => {
    const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
    return request(`/mcp/servers/enabled-configs${params}`);
  },

  /**
   * Create a new MCP server
   * @param data Server configuration
   */
  create: (data: CreateMcpServerRequest): Promise<{ success: boolean; message: string }> =>
    request("/mcp/servers/create", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /**
   * Delete an MCP server
   * @param name Server name
   * @param scope Where to delete from (project or global)
   * @param projectPath Required for project scope
   */
  delete: (name: string, scope: "project" | "global", projectPath?: string): Promise<{ success: boolean; message: string }> => {
    const params = new URLSearchParams({ scope });
    if (projectPath) params.set("projectPath", projectPath);
    return request(`/mcp/servers/${encodeURIComponent(name)}?${params}`, {
      method: "DELETE",
    });
  },

  /**
   * Get available MCP server presets
   */
  getPresets: (): Promise<MCPServerPreset[]> =>
    request("/mcp/presets"),

  /**
   * Add an MCP server from a preset
   * @param presetId The preset ID
   * @param data Configuration for the preset
   */
  addFromPreset: (presetId: string, data: AddPresetRequest): Promise<{ success: boolean; message: string; server?: any }> =>
    request(`/mcp/presets/${encodeURIComponent(presetId)}/add`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ─────────────────────────────────────────────────────────────────────────────
  // OAuth APIs for MCP servers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get OAuth status for an MCP server
   * @param serverUrl The MCP server URL
   */
  getOAuthStatus: (serverUrl: string): Promise<McpAuthStatus> =>
    request(`/mcp/oauth/status?url=${encodeURIComponent(serverUrl)}`),

  /**
   * Start OAuth connection flow for an MCP server
   * @param serverUrl The MCP server URL
   * @param serverName Optional display name
   */
  connectOAuth: (serverUrl: string, serverName?: string): Promise<{
    success: boolean;
    message: string;
    instructions?: string[];
    callbackPort?: number;
    serverUrl?: string;
  }> =>
    request("/mcp/oauth/connect", {
      method: "POST",
      body: JSON.stringify({ url: serverUrl, serverName }),
    }),

  /**
   * Disconnect OAuth (clear tokens) for an MCP server
   * @param serverUrl The MCP server URL
   */
  disconnectOAuth: (serverUrl: string): Promise<{ success: boolean; message: string }> =>
    request("/mcp/oauth/disconnect", {
      method: "POST",
      body: JSON.stringify({ url: serverUrl }),
    }),
};
