/**
 * SDK Hook Bridge
 *
 * Converts Navi's filesystem hooks (.claude/hooks/*.md, loaded by hook-loader)
 * into the Claude Agent SDK's native `hooks` query option. This makes hooks run
 * inside the agent loop with real semantics:
 *
 * - PreToolUse command hooks can BLOCK a tool call by exiting with code 2
 *   (stderr becomes the deny reason shown to the model)
 * - SessionStart / UserPromptSubmit hooks inject additionalContext
 *   (command stdout, or the prompt text for prompt-type hooks)
 * - PostToolUse hooks run after tools with $TOOL_OUTPUT available
 * - Stop hooks run when the agent finishes a turn
 *
 * Navi's legacy PreQuery/PostQuery events map to the SDK's
 * UserPromptSubmit/Stop events respectively.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { loadHooks, type HookEvent as NaviHookEvent } from "./hook-loader";
import { getEnabledPlugins } from "./hook-executor";

const execAsync = promisify(exec);

// Minimal structural types for the SDK hook contract (avoids importing SDK
// types into every consumer; shapes match @anthropic-ai/claude-agent-sdk)
type SdkHookInput = {
  hook_event_name: string;
  session_id: string;
  cwd: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
};

type SdkHookOutput = {
  continue?: boolean;
  decision?: "approve" | "block";
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: Record<string, unknown>;
};

type SdkHookCallback = (
  input: SdkHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<SdkHookOutput>;

export interface SdkHookCallbackMatcher {
  matcher?: string;
  hooks: SdkHookCallback[];
  /** Timeout in seconds (SDK convention) */
  timeout?: number;
}

export type SdkHooksConfig = Record<string, SdkHookCallbackMatcher[]>;

/** Navi hook event → SDK hook event */
const EVENT_MAP: Record<NaviHookEvent, string> = {
  SessionStart: "SessionStart",
  PreToolUse: "PreToolUse",
  PostToolUse: "PostToolUse",
  Stop: "Stop",
  PreQuery: "UserPromptSubmit",
  PostQuery: "Stop",
};

/** Events whose hooks can contribute additionalContext */
const CONTEXT_EVENTS = new Set(["SessionStart", "UserPromptSubmit"]);

function substituteVariables(
  command: string,
  input: SdkHookInput,
  projectPath: string
): string {
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
  const filePath =
    typeof toolInput.file_path === "string"
      ? toolInput.file_path
      : typeof toolInput.path === "string"
        ? toolInput.path
        : "";

  return command
    .replaceAll("$FILE", filePath)
    .replaceAll("$TOOL_INPUT", JSON.stringify(input.tool_input ?? {}))
    .replaceAll("$TOOL_OUTPUT", JSON.stringify(input.tool_response ?? {}))
    .replaceAll("$TOOL", input.tool_name ?? "")
    .replaceAll("$SESSION_ID", input.session_id ?? "")
    .replaceAll("$PROJECT_PATH", projectPath);
}

interface HookLike {
  name: string;
  type: string;
  command: string;
  timeout?: number;
}

function makeCallback(hook: HookLike, projectPath: string, execCwd: string): SdkHookCallback {
  return async (input) => {
    const sdkEvent = input.hook_event_name;

    if (hook.type === "prompt") {
      const text = substituteVariables(hook.command, input, projectPath);
      if (CONTEXT_EVENTS.has(sdkEvent)) {
        return {
          hookSpecificOutput: { hookEventName: sdkEvent, additionalContext: text },
        };
      }
      return { systemMessage: text };
    }

    // command hook
    const command = substituteVariables(hook.command, input, projectPath);
    try {
      const { stdout } = await execAsync(command, {
        cwd: execCwd,
        timeout: hook.timeout || 30000,
        env: {
          ...process.env,
          HOOK_EVENT: sdkEvent,
          HOOK_NAME: hook.name,
          TOOL_NAME: input.tool_name ?? "",
          SESSION_ID: input.session_id ?? "",
          PROJECT_PATH: projectPath,
        },
      });

      const output = (stdout || "").trim();
      if (output && CONTEXT_EVENTS.has(sdkEvent)) {
        return {
          hookSpecificOutput: { hookEventName: sdkEvent, additionalContext: output },
        };
      }
      return {};
    } catch (err: any) {
      // Claude Code convention: exit code 2 = blocking error
      if (err?.code === 2) {
        const reason =
          (err.stderr || err.stdout || "").toString().trim() ||
          `Blocked by hook "${hook.name}"`;
        if (sdkEvent === "PreToolUse") {
          return {
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: reason,
            },
          };
        }
        return { decision: "block", reason };
      }
      // Non-blocking failure: log and continue
      console.error(`[SdkHookBridge] Hook "${hook.name}" failed:`, err?.message || err);
      return {};
    }
  };
}

function addHook(
  config: SdkHooksConfig,
  naviEvent: string,
  hook: HookLike,
  hookMatcher: string | undefined,
  projectPath: string,
  execCwd: string
) {
  const sdkEvent = EVENT_MAP[naviEvent as NaviHookEvent];
  if (!sdkEvent) return;

  const matcher: SdkHookCallbackMatcher = {
    hooks: [makeCallback(hook, projectPath, execCwd)],
    timeout: Math.ceil((hook.timeout || 30000) / 1000),
  };
  if (hookMatcher && (sdkEvent === "PreToolUse" || sdkEvent === "PostToolUse")) {
    matcher.matcher = hookMatcher;
  }

  (config[sdkEvent] ||= []).push(matcher);
}

/**
 * Build the SDK `hooks` option from the project's Navi hooks
 * (.claude/hooks/*.md filesystem hooks + legacy plugin JSON hooks).
 * Returns null when no enabled hooks exist.
 */
export function buildSdkHooks(projectPath: string): SdkHooksConfig | null {
  const config: SdkHooksConfig = {};

  // Filesystem hooks: project .claude/hooks + user ~/.claude/hooks
  try {
    for (const hook of loadHooks(projectPath).hooks) {
      if (!hook.enabled) continue;
      addHook(config, hook.event, hook, hook.matcher, projectPath, projectPath);
    }
  } catch (err) {
    console.error("[SdkHookBridge] Failed to load filesystem hooks:", err);
  }

  // Legacy plugin JSON hooks (executed from the plugin's install dir)
  try {
    for (const plugin of getEnabledPlugins(projectPath)) {
      const pluginHooks = plugin.components.hooks;
      if (!pluginHooks) continue;
      for (const [event, entries] of Object.entries(pluginHooks.hooks)) {
        for (const entry of entries) {
          for (const hook of entry.hooks) {
            addHook(
              config,
              event,
              { name: `${plugin.id}:${event}`, type: hook.type, command: hook.command, timeout: hook.timeout },
              entry.matcher,
              projectPath,
              plugin.installPath
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("[SdkHookBridge] Failed to load plugin hooks:", err);
  }

  return Object.keys(config).length > 0 ? config : null;
}
