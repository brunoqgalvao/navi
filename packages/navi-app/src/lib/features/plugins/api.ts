/**
 * Plugin API
 *
 * Frontend API client for Claude Code plugin management
 */

import { getServerUrl } from "$lib/api";
import type {
  Plugin,
  InstallPluginRequest,
  InstallPluginResponse,
  TogglePluginRequest,
  GetCommandContentRequest,
  GetCommandContentResponse,
  PluginHookConfig,
} from "./types";

const API_BASE = () => getServerUrl();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const pluginApi = {
  /**
   * List all installed plugins with full component details
   */
  list: (cwd: string) =>
    request<Plugin[]>(`/api/plugins?cwd=${encodeURIComponent(cwd)}`),

  /**
   * Get a single plugin by ID
   */
  get: (pluginId: string) =>
    request<Plugin>(`/api/plugins/${encodeURIComponent(pluginId)}`),

  /**
   * Toggle plugin enabled/disabled state
   */
  toggle: (pluginId: string, enabled: boolean, scope: "user" | "project", cwd: string) =>
    request<{ success: boolean }>("/api/plugins/toggle", {
      method: "POST",
      body: JSON.stringify({ pluginId, enabled, scope, cwd } satisfies TogglePluginRequest),
    }),

  /**
   * Install a plugin from a git URL
   */
  install: (url: string, scope: "user" | "project" = "user", projectPath?: string) =>
    request<InstallPluginResponse>("/api/plugins/install", {
      method: "POST",
      body: JSON.stringify({ url, scope, projectPath } satisfies InstallPluginRequest),
    }),

  /**
   * Uninstall a plugin
   */
  uninstall: (pluginId: string) =>
    request<{ success: boolean }>(`/api/plugins/${encodeURIComponent(pluginId)}`, {
      method: "DELETE",
    }),

  /**
   * Get plugin hooks configuration
   */
  getHooks: (pluginId: string) =>
    request<PluginHookConfig | null>(
      `/api/plugins/${encodeURIComponent(pluginId)}/hooks`
    ),

  /**
   * Get command content with argument substitution
   */
  getCommandContent: (pluginId: string, commandName: string, args?: string) =>
    request<GetCommandContentResponse>(
      `/api/plugins/${encodeURIComponent(pluginId)}/command`,
      {
        method: "POST",
        body: JSON.stringify({ commandName, args } satisfies GetCommandContentRequest),
      }
    ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Commands
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginCommandEntry {
  name: string;
  fullName: string;
  description?: string;
  pluginId: string;
  pluginName: string;
}

export const pluginCommandsApi = {
  /**
   * Get all commands from enabled plugins
   */
  list: (cwd: string) =>
    request<PluginCommandEntry[]>(`/api/plugins/commands?cwd=${encodeURIComponent(cwd)}`),
};

// Re-export types for convenience
export type {
  Plugin,
  PluginCommand,
  PluginAgent,
  PluginSkill,
  PluginHook,
  PluginHookEntry,
  PluginHookConfig,
  PluginComponentCounts,
  McpServerConfig,
  InstallPluginRequest,
  InstallPluginResponse,
} from "./types";
