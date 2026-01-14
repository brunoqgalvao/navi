/**
 * Plugin Types
 *
 * Type definitions for Claude Code plugin integration
 */

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Components
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginCommand {
  name: string;
  fullName: string; // plugin:command format
  description?: string;
  filePath: string;
}

export interface PluginAgent {
  name: string;
  description?: string;
  filePath: string;
}

export interface PluginSkill {
  name: string;
  description?: string;
  filePath: string;
}

export interface PluginHook {
  type: string;
  command: string;
  timeout?: number;
}

export interface PluginHookEntry {
  matcher?: string;
  hooks: PluginHook[];
}

export interface PluginHookConfig {
  description?: string;
  hooks: Record<string, PluginHookEntry[]>;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component Counts
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginComponentCounts {
  commands: number;
  agents: number;
  skills: number;
  hooks: number;
  mcpServers: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  scope: "user" | "project";
  installPath: string;
  enabledInProject?: boolean;
  enabledInUser?: boolean;

  // Component counts for badges
  componentCounts: PluginComponentCounts;

  // Full component details
  commands: PluginCommand[];
  agents: PluginAgent[];
  skills: PluginSkill[];
  hooks: string[]; // Hook event names
  hooksDetail: PluginHookConfig | null;
  mcpServers: string[]; // Server names
  mcpServersDetail: Record<string, McpServerConfig>;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallPluginRequest {
  url: string;
  scope?: "user" | "project";
  projectPath?: string;
}

export interface InstallPluginResponse {
  success: boolean;
  plugin?: {
    id: string;
    name: string;
    version: string;
    componentCounts: PluginComponentCounts;
  };
  error?: string;
}

export interface TogglePluginRequest {
  pluginId: string;
  enabled: boolean;
  scope: "user" | "project";
  cwd: string;
}

export interface GetCommandContentRequest {
  commandName: string;
  args?: string;
}

export interface GetCommandContentResponse {
  content: string;
}
