/**
 * Types for command management system
 * Commands can be global (available everywhere) or workspace-specific
 */

/** Scope of a command - global or workspace-specific */
export type CommandScope = "global" | "workspace";

/** Base command information from file system */
export interface CustomCommand {
  name: string;
  description: string;
  argsHint?: string;
  source: "global" | "project";
  path: string;
}

/** Command with its content */
export interface CustomCommandWithContent extends CustomCommand {
  content: string;
}

/** Database-stored command settings */
export interface CommandSettings {
  id: string;
  command_name: string;
  scope: CommandScope;
  project_id: string | null;  // null for global scope
  enabled: number;  // SQLite boolean (0 or 1)
  sort_order: number;
  config: string | null;  // JSON string for custom config
  created_at: number;
  updated_at: number;
}

/** Resolved command with settings applied */
export interface ResolvedCommand extends CustomCommand {
  enabled: boolean;
  sortOrder: number;
  scope: CommandScope;
  config?: Record<string, unknown>;
}

/** DTO for creating/updating command settings */
export interface CommandSettingsDTO {
  commandName: string;
  scope: CommandScope;
  projectId?: string;
  enabled?: boolean;
  sortOrder?: number;
  config?: Record<string, unknown>;
}

/** DTO for reordering commands */
export interface CommandReorderDTO {
  commandName: string;
  sortOrder: number;
}

/** API response for command list */
export interface CommandListResponse {
  commands: ResolvedCommand[];
  globalCount: number;
  workspaceCount: number;
}

/** API response for command content */
export interface CommandContentResponse {
  command: CustomCommandWithContent;
  settings: CommandSettings | null;
}

/** Event for when commands are modified */
export interface CommandChangeEvent {
  type: "created" | "updated" | "deleted" | "reordered";
  commandName: string;
  scope: CommandScope;
  projectId?: string;
}
