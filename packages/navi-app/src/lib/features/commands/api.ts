/**
 * Commands API - Fetch custom slash commands from the server
 */

import { getServerUrl } from "$lib/api";

export interface CustomCommand {
  name: string;
  description: string;
  argsHint?: string;
  source: "global" | "project";
  path: string;
}

export interface CustomCommandWithContent extends CustomCommand {
  content: string;
}

const API_BASE = () => getServerUrl();

/**
 * Fetch all custom commands for a project
 */
export async function fetchCommands(projectPath?: string): Promise<CustomCommand[]> {
  const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
  const res = await fetch(`${API_BASE()}/api/commands${params}`);
  if (!res.ok) {
    console.error("Failed to fetch commands:", await res.text());
    return [];
  }
  return res.json();
}

/**
 * Fetch a specific command with its content
 */
export async function fetchCommandContent(name: string, projectPath?: string): Promise<CustomCommandWithContent | null> {
  const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
  const res = await fetch(`${API_BASE()}/api/commands/${encodeURIComponent(name)}${params}`);
  if (!res.ok) {
    console.error("Failed to fetch command:", await res.text());
    return null;
  }
  return res.json();
}
