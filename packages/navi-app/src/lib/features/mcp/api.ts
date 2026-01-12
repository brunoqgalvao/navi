/**
 * MCP Settings API
 * Client for managing MCP server enabled/disabled states
 * Syncs with Claude Code's filesystem configs (.mcp.json, ~/.claude.json)
 */

import { getApiBase } from "$lib/config";

export interface McpServer {
  name: string;
  enabled: boolean;
  toolCount?: number;
  isBuiltIn: boolean;
  type?: "stdio" | "sse" | "streamable-http";
  command?: string;
  url?: string;
  source?: "builtin" | "project-mcp" | "global-mcp" | "claude-json";
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
    return request(`/api/mcp/servers${params}`);
  },

  /**
   * Toggle an MCP server's enabled state
   * @param name Server name
   * @param enabled New enabled state
   * @param projectPath Required - project path for writing to ~/.claude.json
   * @param isBuiltIn Whether this is a built-in Navi server
   */
  toggle: (name: string, enabled: boolean, projectPath: string, isBuiltIn?: boolean): Promise<{ success: boolean }> =>
    request("/api/mcp/servers/toggle", {
      method: "POST",
      body: JSON.stringify({ name, enabled, projectPath, isBuiltIn }),
    }),

  /**
   * Get the enabled state for a specific MCP server
   */
  get: (name: string, projectPath?: string): Promise<McpServer> => {
    const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
    return request(`/api/mcp/servers/${encodeURIComponent(name)}${params}`);
  },

  /**
   * Force reload MCP settings from filesystem
   */
  reload: (): Promise<{ success: boolean; message: string }> =>
    request("/api/mcp/servers/reload", { method: "POST" }),

  /**
   * Get enabled external server configs (for passing to Claude Agent SDK)
   */
  getEnabledConfigs: (projectPath?: string): Promise<Record<string, any>> => {
    const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
    return request(`/api/mcp/servers/enabled-configs${params}`);
  },
};
