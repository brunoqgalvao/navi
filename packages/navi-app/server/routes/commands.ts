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
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { json, error } from "../utils/response";

export interface CustomCommand {
  name: string;
  description: string;
  argsHint?: string;
  source: "global" | "project";
  path: string;
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
 * Handle commands routes
 */
export async function handleCommandsRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // GET /api/commands - List all custom commands
  if (pathname === "/api/commands" && method === "GET") {
    const projectPath = url.searchParams.get("projectPath") || undefined;
    const commands = getAllCommands(projectPath);
    return json(commands);
  }

  // GET /api/commands/:name - Get a specific command's content
  if (pathname.startsWith("/api/commands/") && method === "GET") {
    const name = pathname.replace("/api/commands/", "");
    const projectPath = url.searchParams.get("projectPath") || undefined;
    const commands = getAllCommands(projectPath);
    const command = commands.find(c => c.name === name);

    if (!command) {
      return error(`Command not found: ${name}`, 404);
    }

    try {
      const content = fs.readFileSync(command.path, "utf-8");
      return json({ ...command, content });
    } catch (e) {
      return error(`Failed to read command: ${e}`, 500);
    }
  }

  return null;
}
