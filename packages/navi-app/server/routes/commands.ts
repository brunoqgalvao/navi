/**
 * Commands API - Loads custom slash commands from .claude/commands directories
 *
 * Commands are markdown files (.md) in:
 * - ~/.claude/commands/ (global commands)
 * - <project>/.claude/commands/ (project-specific commands)
 *
 * File naming convention: my-command.md -> /my-command
 *
 * Frontmatter can include:
 * - description: Brief description of the command
 * - args: Argument hint (e.g., "<file>")
 *
 * Command settings are stored in the database and allow:
 * - Enabling/disabling commands per workspace or globally
 * - Reordering commands
 * - Custom configuration per command
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { json, error } from "../utils/response";
import { commandSettings, type CommandScope, type CommandSetting } from "../db";

export interface CustomCommand {
  name: string;
  description: string;
  argsHint?: string;
  source: "global" | "project";
  path: string;
}

export interface ResolvedCommand extends CustomCommand {
  enabled: boolean;
  sortOrder: number;
  scope: "global" | "workspace" | null;
  config?: Record<string, unknown>;
}

/**
 * Parse frontmatter from a markdown command file
 */
function parseCommandFrontmatter(content: string): { description?: string; args?: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  const frontmatter = frontmatterMatch[1];
  const result: { description?: string; args?: string } = {};

  // Parse description
  const descMatch = frontmatter.match(/description:\s*["']?(.+?)["']?\s*$/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  // Parse args hint
  const argsMatch = frontmatter.match(/args:\s*["']?(.+?)["']?\s*$/m);
  if (argsMatch) {
    result.args = argsMatch[1].trim();
  }

  return result;
}

/**
 * Extract first non-empty line after frontmatter as fallback description
 */
function getFirstContentLine(content: string): string | undefined {
  // Remove frontmatter
  let text = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  // Get first non-empty line
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      return trimmed.slice(0, 100); // Limit length
    }
  }
  return undefined;
}

/**
 * Load commands from a directory
 */
function loadCommandsFromDir(commandsDir: string, source: "global" | "project"): CustomCommand[] {
  const commands: CustomCommand[] = [];

  if (!fs.existsSync(commandsDir)) return commands;

  try {
    const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const filePath = path.join(commandsDir, entry.name);
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = parseCommandFrontmatter(content);

        // Command name is filename without .md extension
        const name = entry.name.replace(/\.md$/, "");

        commands.push({
          name,
          description: parsed.description || getFirstContentLine(content) || `Custom command: ${name}`,
          argsHint: parsed.args,
          source,
          path: filePath,
        });
      }
    }
  } catch (e) {
    console.error(`[Commands] Error loading commands from ${commandsDir}:`, e);
  }

  return commands;
}

/**
 * Get all custom commands (global + project-specific)
 */
export function getAllCommands(projectPath?: string): CustomCommand[] {
  const globalCommandsDir = path.join(os.homedir(), ".claude", "commands");
  const globalCommands = loadCommandsFromDir(globalCommandsDir, "global");

  let projectCommands: CustomCommand[] = [];
  if (projectPath) {
    const projectCommandsDir = path.join(projectPath, ".claude", "commands");
    projectCommands = loadCommandsFromDir(projectCommandsDir, "project");
  }

  // Project commands override global commands with same name
  const allCommands = [...projectCommands];
  for (const gc of globalCommands) {
    if (!allCommands.some(pc => pc.name === gc.name)) {
      allCommands.push(gc);
    }
  }

  return allCommands;
}

/**
 * Get all commands with their settings resolved (for UI display)
 */
export function getResolvedCommands(projectPath?: string, projectId?: string | null): ResolvedCommand[] {
  const commands = getAllCommands(projectPath);
  const settingsMap = commandSettings.getMergedSettings(projectId || null);

  return commands.map((cmd, index) => {
    const setting = settingsMap.get(cmd.name);
    return {
      ...cmd,
      enabled: setting ? setting.enabled === 1 : true,
      sortOrder: setting ? setting.sort_order : index,
      scope: setting ? setting.scope : null,
      config: setting?.config ? JSON.parse(setting.config) : undefined,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get enabled commands only (for command execution)
 */
export function getEnabledCommands(projectPath?: string, projectId?: string | null): ResolvedCommand[] {
  return getResolvedCommands(projectPath, projectId).filter(cmd => cmd.enabled);
}

/**
 * Handle commands routes
 */
export async function handleCommandsRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // GET /api/commands - List all custom commands with settings
  if (pathname === "/api/commands" && method === "GET") {
    const projectPath = url.searchParams.get("projectPath") || undefined;
    const projectId = url.searchParams.get("projectId") || undefined;
    const includeSettings = url.searchParams.get("includeSettings") === "true";

    if (includeSettings) {
      const commands = getResolvedCommands(projectPath, projectId);
      const globalCount = commands.filter(c => c.source === "global").length;
      const workspaceCount = commands.filter(c => c.source === "project").length;
      return json({ commands, globalCount, workspaceCount });
    }

    const commands = getAllCommands(projectPath);
    return json(commands);
  }

  // GET /api/commands/settings/global - Get global command settings
  if (pathname === "/api/commands/settings/global" && method === "GET") {
    const settings = commandSettings.listGlobal();
    return json(settings);
  }

  // GET /api/commands/settings/workspace/:projectId - Get workspace command settings
  const workspaceSettingsMatch = pathname.match(/^\/api\/commands\/settings\/workspace\/([^/]+)$/);
  if (workspaceSettingsMatch && method === "GET") {
    const projectId = decodeURIComponent(workspaceSettingsMatch[1]);
    const settings = commandSettings.listByProject(projectId);
    return json(settings);
  }

  // PUT /api/commands/settings - Update command settings (enable/disable, reorder)
  if (pathname === "/api/commands/settings" && method === "PUT") {
    try {
      const body = await req.json() as {
        commandName: string;
        scope: CommandScope;
        projectId?: string | null;
        enabled?: boolean;
        sortOrder?: number;
        config?: Record<string, unknown>;
      };

      const { commandName, scope, projectId, enabled, sortOrder, config } = body;

      if (!commandName || !scope) {
        return error("commandName and scope are required", 400);
      }

      if (scope === "workspace" && !projectId) {
        return error("projectId is required for workspace scope", 400);
      }

      commandSettings.upsert(
        commandName,
        scope,
        scope === "global" ? null : projectId!,
        enabled ?? true,
        sortOrder,
        config ? JSON.stringify(config) : undefined
      );

      const updated = commandSettings.get(commandName, scope, scope === "global" ? null : projectId);
      return json(updated);
    } catch (e) {
      return error(`Failed to update command settings: ${e}`, 500);
    }
  }

  // PUT /api/commands/settings/toggle - Quick toggle enabled status
  if (pathname === "/api/commands/settings/toggle" && method === "PUT") {
    try {
      const body = await req.json() as {
        commandName: string;
        scope: CommandScope;
        projectId?: string | null;
        enabled: boolean;
      };

      const { commandName, scope, projectId, enabled } = body;

      if (!commandName || !scope || enabled === undefined) {
        return error("commandName, scope, and enabled are required", 400);
      }

      commandSettings.toggleEnabled(
        commandName,
        scope,
        scope === "global" ? null : projectId!,
        enabled
      );

      return json({ success: true, commandName, enabled });
    } catch (e) {
      return error(`Failed to toggle command: ${e}`, 500);
    }
  }

  // PUT /api/commands/settings/reorder - Reorder commands
  if (pathname === "/api/commands/settings/reorder" && method === "PUT") {
    try {
      const body = await req.json() as {
        scope: CommandScope;
        projectId?: string | null;
        orders: { commandName: string; sortOrder: number }[];
      };

      const { scope, projectId, orders } = body;

      if (!scope || !orders || !Array.isArray(orders)) {
        return error("scope and orders array are required", 400);
      }

      commandSettings.updateOrders(
        scope,
        scope === "global" ? null : projectId!,
        orders
      );

      return json({ success: true });
    } catch (e) {
      return error(`Failed to reorder commands: ${e}`, 500);
    }
  }

  // DELETE /api/commands/settings - Delete a command setting
  if (pathname === "/api/commands/settings" && method === "DELETE") {
    try {
      const body = await req.json() as {
        commandName: string;
        scope: CommandScope;
        projectId?: string | null;
      };

      const { commandName, scope, projectId } = body;

      if (!commandName || !scope) {
        return error("commandName and scope are required", 400);
      }

      commandSettings.delete(
        commandName,
        scope,
        scope === "global" ? null : projectId!
      );

      return json({ success: true });
    } catch (e) {
      return error(`Failed to delete command setting: ${e}`, 500);
    }
  }

  // GET /api/commands/:name - Get a specific command's content
  if (pathname.startsWith("/api/commands/") && !pathname.includes("/settings") && method === "GET") {
    const name = pathname.replace("/api/commands/", "");
    const projectPath = url.searchParams.get("projectPath") || undefined;
    const projectId = url.searchParams.get("projectId") || undefined;
    const commands = getAllCommands(projectPath);
    const command = commands.find(c => c.name === name);

    if (!command) {
      return error(`Command not found: ${name}`, 404);
    }

    try {
      const content = fs.readFileSync(command.path, "utf-8");
      const setting = commandSettings.get(name, "workspace", projectId) ||
                      commandSettings.get(name, "global", null);
      return json({
        ...command,
        content,
        setting: setting || null
      });
    } catch (e) {
      return error(`Failed to read command: ${e}`, 500);
    }
  }

  return null;
}
