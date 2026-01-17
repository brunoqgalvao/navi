/**
 * Hook Loader Service
 *
 * Discovers and loads hooks from filesystem (.claude/hooks/ directories)
 * making hooks first-class citizens alongside skills and commands.
 *
 * Hook sources (in order of precedence):
 * 1. Project hooks: {projectPath}/.claude/hooks/
 * 2. User hooks: ~/.claude/hooks/
 * 3. Plugin hooks: plugins/{id}/hooks/ (legacy JSON format still supported)
 *
 * Hook file format (HOOK.md with frontmatter):
 * ---
 * name: lint-on-edit
 * description: Runs ESLint after file edits
 * event: PostToolUse
 * matcher: "Edit|Write"
 * type: command
 * timeout: 30000
 * ---
 *
 * npm run lint --fix $FILE
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HookEvent =
  | "SessionStart"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "PreQuery"
  | "PostQuery";

export type HookType = "command" | "prompt";

export interface HookDefinition {
  /** Unique identifier (derived from filename if not specified) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Which lifecycle event triggers this hook */
  event: HookEvent;
  /** Regex pattern to match tool names (for tool-related events) */
  matcher?: string;
  /** Hook type: command (shell) or prompt (inject text) */
  type: HookType;
  /** Shell command or prompt text to execute */
  command: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout: number;
  /** Source path of the hook file */
  filePath: string;
  /** Scope: project, user, or plugin */
  scope: "project" | "user" | "plugin";
  /** Plugin ID if from a plugin */
  pluginId?: string;
  /** Whether hook is enabled */
  enabled: boolean;
}

export interface LoadedHooks {
  /** All discovered hooks */
  hooks: HookDefinition[];
  /** Hooks grouped by event */
  byEvent: Record<HookEvent, HookDefinition[]>;
  /** Error messages from loading */
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter Parser
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedHookFile {
  data: {
    name?: string;
    description?: string;
    event?: string;
    matcher?: string;
    type?: string;
    timeout?: string | number;
    enabled?: boolean | string;
  };
  content: string;
}

function parseFrontmatter(content: string): ParsedHookFile {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content };
  }

  const [, frontmatterStr, body] = match;
  const data: ParsedHookFile["data"] = {};

  for (const line of frontmatterStr.split("\n")) {
    const keyValueMatch = line.match(/^(\w+):\s*(.+)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      const trimmed = value.trim().replace(/^["']|["']$/g, "");

      // Handle specific fields
      if (key === "timeout") {
        data.timeout = parseInt(trimmed, 10);
      } else if (key === "enabled") {
        data.enabled = trimmed === "true" || trimmed === "yes";
      } else {
        (data as any)[key] = trimmed;
      }
    }
  }

  return { data, content: body.trim() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Discovery
// ─────────────────────────────────────────────────────────────────────────────

const VALID_EVENTS: HookEvent[] = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "PreQuery",
  "PostQuery",
];

const VALID_TYPES: HookType[] = ["command", "prompt"];

/**
 * Load a single hook file
 */
function loadHookFile(
  filePath: string,
  scope: "project" | "user" | "plugin",
  pluginId?: string
): { hook?: HookDefinition; error?: string } {
  try {
    const content = readFileSync(filePath, "utf-8");
    const { data, content: command } = parseFrontmatter(content);

    // Derive name from filename if not specified
    const filename = basename(filePath, ".md");
    const name = data.name || filename;

    // Validate event
    const event = data.event as HookEvent;
    if (!event || !VALID_EVENTS.includes(event)) {
      return {
        error: `Invalid or missing event in ${filePath}. Must be one of: ${VALID_EVENTS.join(", ")}`,
      };
    }

    // Validate type
    const type = (data.type || "command") as HookType;
    if (!VALID_TYPES.includes(type)) {
      return {
        error: `Invalid type in ${filePath}. Must be one of: ${VALID_TYPES.join(", ")}`,
      };
    }

    // Validate command content
    if (!command || command.trim().length === 0) {
      return {
        error: `Empty command body in ${filePath}. Hook must have command content after frontmatter.`,
      };
    }

    return {
      hook: {
        name,
        description: data.description,
        event,
        matcher: data.matcher,
        type,
        command: command.trim(),
        timeout: typeof data.timeout === "number" ? data.timeout : 30000,
        filePath,
        scope,
        pluginId,
        enabled: data.enabled !== false, // Default to true
      },
    };
  } catch (err: any) {
    return { error: `Failed to load ${filePath}: ${err.message}` };
  }
}

/**
 * Discover hooks in a directory
 */
function discoverHooksInDir(
  dir: string,
  scope: "project" | "user" | "plugin",
  pluginId?: string
): { hooks: HookDefinition[]; errors: string[] } {
  const hooks: HookDefinition[] = [];
  const errors: string[] = [];

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { hooks, errors };
  }

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stat = statSync(entryPath);

      if (stat.isFile() && entry.endsWith(".md")) {
        const result = loadHookFile(entryPath, scope, pluginId);
        if (result.hook) {
          hooks.push(result.hook);
        } else if (result.error) {
          errors.push(result.error);
        }
      }
    }
  } catch (err: any) {
    errors.push(`Failed to read directory ${dir}: ${err.message}`);
  }

  return { hooks, errors };
}

/**
 * Get project hooks directory
 */
function getProjectHooksDir(projectPath: string): string {
  return join(projectPath, ".claude", "hooks");
}

/**
 * Get user hooks directory
 */
function getUserHooksDir(): string {
  return join(homedir(), ".claude", "hooks");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all hooks for a project (project + user + enabled plugins)
 */
export function loadHooks(projectPath: string): LoadedHooks {
  const allHooks: HookDefinition[] = [];
  const allErrors: string[] = [];

  // 1. Load project hooks (highest precedence)
  const projectDir = getProjectHooksDir(projectPath);
  const projectResult = discoverHooksInDir(projectDir, "project");
  allHooks.push(...projectResult.hooks);
  allErrors.push(...projectResult.errors);

  // 2. Load user hooks
  const userDir = getUserHooksDir();
  const userResult = discoverHooksInDir(userDir, "user");
  allHooks.push(...userResult.hooks);
  allErrors.push(...userResult.errors);

  // Note: Plugin hooks are loaded via plugin-loader.ts and merged in hook-executor.ts
  // to maintain backwards compatibility with JSON format

  // Group by event
  const byEvent: Record<HookEvent, HookDefinition[]> = {
    SessionStart: [],
    PreToolUse: [],
    PostToolUse: [],
    Stop: [],
    PreQuery: [],
    PostQuery: [],
  };

  for (const hook of allHooks) {
    if (hook.enabled) {
      byEvent[hook.event].push(hook);
    }
  }

  return {
    hooks: allHooks,
    byEvent,
    errors: allErrors,
  };
}

/**
 * Load hooks for a specific event
 */
export function loadHooksForEvent(
  projectPath: string,
  event: HookEvent
): HookDefinition[] {
  const { byEvent } = loadHooks(projectPath);
  return byEvent[event] || [];
}

/**
 * List all hooks (for dashboard/API)
 */
export function listHooks(projectPath: string): {
  project: HookDefinition[];
  user: HookDefinition[];
  total: number;
} {
  const { hooks } = loadHooks(projectPath);

  return {
    project: hooks.filter((h) => h.scope === "project"),
    user: hooks.filter((h) => h.scope === "user"),
    total: hooks.length,
  };
}

/**
 * Get hooks directory path (for creating new hooks)
 */
export function getHooksDir(
  scope: "project" | "user",
  projectPath?: string
): string {
  if (scope === "project" && projectPath) {
    return getProjectHooksDir(projectPath);
  }
  return getUserHooksDir();
}

/**
 * Generate a template for a new hook file
 */
export function generateHookTemplate(
  name: string,
  event: HookEvent,
  type: HookType = "command"
): string {
  return `---
name: ${name}
description: TODO - describe what this hook does
event: ${event}
${event.includes("Tool") ? 'matcher: "Edit|Write"  # Regex to match tool names\n' : ""}type: ${type}
timeout: 30000
enabled: true
---

# Your ${type === "command" ? "shell command" : "prompt text"} here
# Available variables: $FILE, $TOOL, $SESSION_ID, $PROJECT_PATH, $TOOL_INPUT, $TOOL_OUTPUT
echo "Hook ${name} executed"
`;
}
