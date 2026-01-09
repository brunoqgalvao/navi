/**
 * Commands API - Fetch custom slash commands from the server
 * Supports global and workspace-specific command settings
 */

import { getApiBase } from "../../config";
import type {
  CommandScope,
  CommandSettings,
  ResolvedCommand,
  CommandListResponse,
  CommandReorderDTO,
} from "./types";

export interface CustomCommand {
  name: string;
  description: string;
  argsHint?: string;
  source: "global" | "project";
  path: string;
}

export interface CustomCommandWithContent extends CustomCommand {
  content: string;
  setting?: CommandSettings | null;
}

const API_BASE = () => getApiBase();

/**
 * Fetch all custom commands for a project (basic list without settings)
 */
export async function fetchCommands(projectPath?: string): Promise<CustomCommand[]> {
  const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
  const res = await fetch(`${API_BASE()}/commands${params}`);
  if (!res.ok) {
    console.error("Failed to fetch commands:", await res.text());
    return [];
  }
  return res.json();
}

/**
 * Fetch all commands with their settings resolved
 */
export async function fetchCommandsWithSettings(
  projectPath?: string,
  projectId?: string
): Promise<CommandListResponse> {
  const params = new URLSearchParams({ includeSettings: "true" });
  if (projectPath) params.set("projectPath", projectPath);
  if (projectId) params.set("projectId", projectId);

  const res = await fetch(`${API_BASE()}/commands?${params}`);
  if (!res.ok) {
    console.error("Failed to fetch commands with settings:", await res.text());
    return { commands: [], globalCount: 0, workspaceCount: 0 };
  }
  return res.json();
}

/**
 * Fetch a specific command with its content
 */
export async function fetchCommandContent(
  name: string,
  projectPath?: string,
  projectId?: string
): Promise<CustomCommandWithContent | null> {
  const params = new URLSearchParams();
  if (projectPath) params.set("projectPath", projectPath);
  if (projectId) params.set("projectId", projectId);
  const queryString = params.toString() ? `?${params}` : "";

  const res = await fetch(`${API_BASE()}/commands/${encodeURIComponent(name)}${queryString}`);
  if (!res.ok) {
    console.error("Failed to fetch command:", await res.text());
    return null;
  }
  return res.json();
}

/**
 * Fetch global command settings
 */
export async function fetchGlobalCommandSettings(): Promise<CommandSettings[]> {
  const res = await fetch(`${API_BASE()}/commands/settings/global`);
  if (!res.ok) {
    console.error("Failed to fetch global command settings:", await res.text());
    return [];
  }
  return res.json();
}

/**
 * Fetch workspace-specific command settings
 */
export async function fetchWorkspaceCommandSettings(projectId: string): Promise<CommandSettings[]> {
  const res = await fetch(`${API_BASE()}/commands/settings/workspace/${encodeURIComponent(projectId)}`);
  if (!res.ok) {
    console.error("Failed to fetch workspace command settings:", await res.text());
    return [];
  }
  return res.json();
}

/**
 * Update command settings (enable/disable, reorder, config)
 */
export async function updateCommandSettings(
  commandName: string,
  scope: CommandScope,
  projectId?: string | null,
  updates?: {
    enabled?: boolean;
    sortOrder?: number;
    config?: Record<string, unknown>;
  }
): Promise<CommandSettings | null> {
  const res = await fetch(`${API_BASE()}/commands/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commandName,
      scope,
      projectId,
      ...updates,
    }),
  });

  if (!res.ok) {
    console.error("Failed to update command settings:", await res.text());
    return null;
  }
  return res.json();
}

/**
 * Toggle command enabled status
 */
export async function toggleCommand(
  commandName: string,
  scope: CommandScope,
  enabled: boolean,
  projectId?: string | null
): Promise<boolean> {
  const res = await fetch(`${API_BASE()}/commands/settings/toggle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commandName,
      scope,
      projectId,
      enabled,
    }),
  });

  if (!res.ok) {
    console.error("Failed to toggle command:", await res.text());
    return false;
  }
  return true;
}

/**
 * Reorder commands
 */
export async function reorderCommands(
  scope: CommandScope,
  orders: CommandReorderDTO[],
  projectId?: string | null
): Promise<boolean> {
  const res = await fetch(`${API_BASE()}/commands/settings/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope,
      projectId,
      orders,
    }),
  });

  if (!res.ok) {
    console.error("Failed to reorder commands:", await res.text());
    return false;
  }
  return true;
}

/**
 * Delete a command setting (resets to default)
 */
export async function deleteCommandSetting(
  commandName: string,
  scope: CommandScope,
  projectId?: string | null
): Promise<boolean> {
  const res = await fetch(`${API_BASE()}/commands/settings`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commandName,
      scope,
      projectId,
    }),
  });

  if (!res.ok) {
    console.error("Failed to delete command setting:", await res.text());
    return false;
  }
  return true;
}

// Export the commands API as an object for consistency with other features
export const commandsApi = {
  fetchCommands,
  fetchCommandsWithSettings,
  fetchCommandContent,
  fetchGlobalCommandSettings,
  fetchWorkspaceCommandSettings,
  updateCommandSettings,
  toggleCommand,
  reorderCommands,
  deleteCommandSetting,
};
