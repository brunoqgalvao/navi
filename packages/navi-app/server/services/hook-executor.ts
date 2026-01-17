/**
 * Hook Executor Service
 *
 * Executes hooks at various lifecycle points:
 * - SessionStart: When a new session begins
 * - PreToolUse: Before a tool is executed
 * - PostToolUse: After a tool is executed
 * - Stop: When session is ending
 * - PreQuery: Before sending query to Claude
 * - PostQuery: After receiving response from Claude
 *
 * Hook sources (in priority order):
 * 1. Project hooks: .claude/hooks/*.md
 * 2. User hooks: ~/.claude/hooks/*.md
 * 3. Plugin hooks: plugins/{id}/hooks/hooks.json (legacy)
 *
 * Hooks can be of type:
 * - command: Execute a shell command
 * - prompt: Inject text into the conversation
 */

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  loadAllPlugins,
  type PluginHookConfig,
  type LoadedPlugin,
} from "./plugin-loader";
import {
  loadHooks,
  type HookDefinition,
  type HookEvent as NewHookEvent,
} from "./hook-loader";

const execAsync = promisify(exec);

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

export interface HookContext {
  sessionId?: string;
  projectPath: string;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
  file?: string;
  prompt?: string;
}

export interface HookResult {
  success: boolean;
  output?: string;
  error?: string;
  promptInjection?: string; // For prompt-type hooks
  duration: number;
}

export interface HookExecutionSummary {
  event: HookEvent;
  pluginId: string;
  hookType: string;
  result: HookResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".claude", "settings.json");
}

function getUserSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function readSettings(path: string): any {
  if (!existsSync(path)) {
    return { enabledPlugins: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { enabledPlugins: {} };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape shell metacharacters to prevent command injection
 */
function escapeShellArg(arg: string): string {
  // Replace single quotes with escaped version and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Substitute variables in hook command
 * Note: Variables are shell-escaped to prevent command injection
 */
function substituteVariables(command: string, context: HookContext): string {
  let result = command;

  // File path (escaped)
  if (context.file) {
    result = result.replace(/\$FILE/g, escapeShellArg(context.file));
  }

  // Tool name (escaped)
  if (context.toolName) {
    result = result.replace(/\$TOOL/g, escapeShellArg(context.toolName));
  }

  // Session ID (escaped)
  if (context.sessionId) {
    result = result.replace(/\$SESSION_ID/g, escapeShellArg(context.sessionId));
  }

  // Project path (escaped)
  result = result.replace(/\$PROJECT_PATH/g, escapeShellArg(context.projectPath));

  // Tool input (as JSON, escaped)
  if (context.toolInput) {
    result = result.replace(
      /\$TOOL_INPUT/g,
      escapeShellArg(JSON.stringify(context.toolInput))
    );
  }

  // Tool output (as JSON, escaped)
  if (context.toolOutput) {
    result = result.replace(
      /\$TOOL_OUTPUT/g,
      escapeShellArg(JSON.stringify(context.toolOutput))
    );
  }

  return result;
}

/**
 * Execute a single hook
 */
async function executeHook(
  hook: { type: string; command: string; timeout?: number },
  context: HookContext,
  pluginPath: string
): Promise<HookResult> {
  const startTime = Date.now();
  const timeout = hook.timeout || 30000; // Default 30 second timeout

  try {
    if (hook.type === "command") {
      const command = substituteVariables(hook.command, context);

      const { stdout, stderr } = await execAsync(command, {
        cwd: pluginPath,
        timeout,
        env: {
          ...process.env,
          PLUGIN_PROJECT_PATH: context.projectPath,
          PLUGIN_SESSION_ID: context.sessionId || "",
          PLUGIN_TOOL_NAME: context.toolName || "",
        },
      });

      return {
        success: true,
        output: stdout || stderr,
        duration: Date.now() - startTime,
      };
    } else if (hook.type === "prompt") {
      // Prompt hooks inject text into the conversation
      const promptText = substituteVariables(hook.command, context);
      return {
        success: true,
        promptInjection: promptText,
        duration: Date.now() - startTime,
      };
    } else {
      return {
        success: false,
        error: `Unknown hook type: ${hook.type}`,
        duration: Date.now() - startTime,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Get all enabled plugins for a project
 */
function getEnabledPlugins(projectPath: string): LoadedPlugin[] {
  const projectSettings = readSettings(getProjectSettingsPath(projectPath));
  const userSettings = readSettings(getUserSettingsPath());

  const allPlugins = loadAllPlugins();

  return allPlugins.filter((plugin) => {
    return (
      projectSettings.enabledPlugins?.[plugin.id] ||
      userSettings.enabledPlugins?.[plugin.id]
    );
  });
}

/**
 * Execute a filesystem-based hook (from .claude/hooks/)
 */
async function executeFilesystemHook(
  hookDef: HookDefinition,
  context: HookContext
): Promise<HookResult> {
  const startTime = Date.now();

  try {
    if (hookDef.type === "command") {
      const command = substituteVariables(hookDef.command, context);
      const cwd = context.projectPath;

      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: hookDef.timeout,
        env: {
          ...process.env,
          HOOK_NAME: hookDef.name,
          HOOK_PROJECT_PATH: context.projectPath,
          HOOK_SESSION_ID: context.sessionId || "",
          HOOK_TOOL_NAME: context.toolName || "",
        },
      });

      return {
        success: true,
        output: stdout || stderr,
        duration: Date.now() - startTime,
      };
    } else if (hookDef.type === "prompt") {
      const promptText = substituteVariables(hookDef.command, context);
      return {
        success: true,
        promptInjection: promptText,
        duration: Date.now() - startTime,
      };
    } else {
      return {
        success: false,
        error: `Unknown hook type: ${hookDef.type}`,
        duration: Date.now() - startTime,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Execute all hooks for an event (filesystem + plugins)
 */
export async function executeHooks(
  event: HookEvent,
  context: HookContext
): Promise<HookExecutionSummary[]> {
  const results: HookExecutionSummary[] = [];

  // 1. Execute filesystem-based hooks first (project + user)
  const { byEvent } = loadHooks(context.projectPath);
  const filesystemHooks = byEvent[event as NewHookEvent] || [];

  for (const hookDef of filesystemHooks) {
    // Check matcher for tool-related events
    if (hookDef.matcher && context.toolName) {
      try {
        const matcherRegex = new RegExp(hookDef.matcher);
        if (!matcherRegex.test(context.toolName)) {
          continue;
        }
      } catch (regexErr) {
        console.error(
          `[Hooks] Invalid regex matcher "${hookDef.matcher}" in ${hookDef.filePath}:`,
          regexErr
        );
        continue;
      }
    }

    const result = await executeFilesystemHook(hookDef, context);
    results.push({
      event,
      pluginId: hookDef.scope === "project" ? "project" : "user",
      hookType: hookDef.type,
      result,
    });
  }

  // 2. Execute plugin hooks (legacy JSON format)
  const enabledPlugins = getEnabledPlugins(context.projectPath);

  for (const plugin of enabledPlugins) {
    const hooks = plugin.components.hooks;
    if (!hooks) continue;

    const eventHooks = hooks.hooks[event];
    if (!eventHooks || eventHooks.length === 0) continue;

    for (const entry of eventHooks) {
      // Check matcher for tool-related events
      if (entry.matcher && context.toolName) {
        try {
          const matcherRegex = new RegExp(entry.matcher);
          if (!matcherRegex.test(context.toolName)) {
            continue;
          }
        } catch (regexErr) {
          // Invalid regex in hook config - log and skip this entry
          console.error(
            `[Hooks] Invalid regex matcher "${entry.matcher}" in ${plugin.id}:`,
            regexErr
          );
          continue;
        }
      }

      // Execute each hook in the entry
      for (const hook of entry.hooks) {
        const result = await executeHook(hook, context, plugin.installPath);
        results.push({
          event,
          pluginId: plugin.id,
          hookType: hook.type,
          result,
        });
      }
    }
  }

  return results;
}

/**
 * Execute SessionStart hooks
 */
export async function executeSessionStartHooks(
  projectPath: string,
  sessionId?: string
): Promise<HookExecutionSummary[]> {
  return executeHooks("SessionStart", { projectPath, sessionId });
}

/**
 * Execute PreToolUse hooks
 */
export async function executePreToolUseHooks(
  projectPath: string,
  toolName: string,
  toolInput?: any,
  sessionId?: string
): Promise<HookExecutionSummary[]> {
  // Extract file path from tool input if present
  let file: string | undefined;
  if (toolInput?.file_path) {
    file = toolInput.file_path;
  } else if (toolInput?.path) {
    file = toolInput.path;
  }

  return executeHooks("PreToolUse", {
    projectPath,
    toolName,
    toolInput,
    file,
    sessionId,
  });
}

/**
 * Execute PostToolUse hooks
 */
export async function executePostToolUseHooks(
  projectPath: string,
  toolName: string,
  toolInput?: any,
  toolOutput?: any,
  sessionId?: string
): Promise<HookExecutionSummary[]> {
  // Extract file path from tool input if present
  let file: string | undefined;
  if (toolInput?.file_path) {
    file = toolInput.file_path;
  } else if (toolInput?.path) {
    file = toolInput.path;
  }

  return executeHooks("PostToolUse", {
    projectPath,
    toolName,
    toolInput,
    toolOutput,
    file,
    sessionId,
  });
}

/**
 * Execute Stop hooks
 */
export async function executeStopHooks(
  projectPath: string,
  sessionId?: string
): Promise<HookExecutionSummary[]> {
  return executeHooks("Stop", { projectPath, sessionId });
}

/**
 * Check if any hooks exist for a given event (filesystem + plugins)
 */
export function hasHooksForEvent(
  projectPath: string,
  event: HookEvent
): boolean {
  // Check filesystem hooks
  const { byEvent } = loadHooks(projectPath);
  const filesystemHooks = byEvent[event as NewHookEvent] || [];
  if (filesystemHooks.length > 0) {
    return true;
  }

  // Check plugin hooks
  const enabledPlugins = getEnabledPlugins(projectPath);

  for (const plugin of enabledPlugins) {
    const hooks = plugin.components.hooks;
    if (!hooks) continue;

    const eventHooks = hooks.hooks[event];
    if (eventHooks && eventHooks.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Get prompt injections from hook results
 */
export function getPromptInjections(results: HookExecutionSummary[]): string[] {
  return results
    .filter((r) => r.result.success && r.result.promptInjection)
    .map((r) => r.result.promptInjection!);
}
