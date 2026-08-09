/**
 * OpenAI Codex CLI Backend Adapter
 *
 * Adapts Codex CLI output to the unified backend interface.
 * Uses `codex exec --json` for structured streaming output.
 */

import { spawn, execFileSync, ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import {
  buildEnvWithPrependedPath,
  firstExisting,
  getNaviAppRootCandidates,
  resolveCliExecutable,
  resolveExplicitExecutable,
  resolveNodeExecutable,
} from "../utils/cli-resolver";
import type {
  BackendAdapter,
  BackendInfo,
  QueryOptions,
  NormalizedEvent,
  PermissionResponse,
  NormalizedContentBlock,
} from "./types";

const DEFAULT_CODEX_MODEL = "gpt-5.6-sol";
// Every model in the Codex registry reports context_window 272000.
export const CODEX_CONTEXT_WINDOW = 272_000;
// Leave room for the summarization turn itself; compacting at the very edge of
// the window fails the same way the overflow it is meant to prevent does.
export const CODEX_AUTO_COMPACT_TOKEN_LIMIT = Math.round(CODEX_CONTEXT_WINDOW * 0.8);
// The Codex CLI only accepts these values for model_reasoning_effort (any model)
const COMPATIBLE_CODEX_REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const BASE_CODEX_MODELS = [
  // Current generation. A ChatGPT-account login can only reach these — the
  // older `*-codex` slugs below are API-key-only and fail with a 400.
  "gpt-5.6-sol",
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-pro",
  "gpt-5.6",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  // Prior Codex snapshots still seen in existing sessions
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.1",
  "gpt-5-codex",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "codex-mini-latest",
  // Experimental
  "exp",
] as const;

type CodexExecutionPlan = {
  args: string[];
  model: string;
  downgradedToReadOnly: boolean;
  adjustedReasoningEffort?: {
    from: string;
    to: string;
  };
};

type CodexRunCommand = {
  command: string;
  args: string[];
  displayPath: string;
  env: NodeJS.ProcessEnv;
};

function getCodexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

function readCodexConfigValue(key: string): string | undefined {
  const configPath = getCodexConfigPath();
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const match = content.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function getConfiguredCodexModel(): string | undefined {
  return readCodexConfigValue("model");
}

export function getConfiguredCodexReasoningEffort(): string | undefined {
  return readCodexConfigValue("model_reasoning_effort");
}

export function buildCodexModelCatalog(configuredModel?: string): string[] {
  const models: string[] = [...BASE_CODEX_MODELS];

  if (configuredModel && !models.includes(configuredModel)) {
    models.unshift(configuredModel);
  }

  return models;
}

export function resolveCodexExecutable(): string | null {
  const envVarNames = ["NAVI_CODEX_PATH", "CODEX_PATH", "CODEX_EXECUTABLE"];

  return (
    resolveExplicitExecutable(envVarNames) ||
    // The user's own install wins over the copy vendored into node_modules.
    // The vendored binary is unsigned, so macOS XProtect quarantines and
    // deletes it — which surfaced only as "Codex exited with code 1" — and
    // being version-pinned it also shadows a newer CLI the user installed.
    // It stays as the fallback for machines with no codex at all.
    resolveCliExecutable({
      command: "codex",
      packageName: "@openai/codex",
      packageBinPath: "bin/codex.js",
      preferInstalled: true,
    }) ||
    resolveCodexNativeExecutable()
  );
}

function getCodexTargetTriple(): string | null {
  if (process.platform === "darwin") {
    if (process.arch === "arm64") return "aarch64-apple-darwin";
    if (process.arch === "x64") return "x86_64-apple-darwin";
  }

  if (process.platform === "linux") {
    if (process.arch === "arm64") return "aarch64-unknown-linux-musl";
    if (process.arch === "x64") return "x86_64-unknown-linux-musl";
  }

  if (process.platform === "win32") {
    if (process.arch === "arm64") return "aarch64-pc-windows-msvc";
    if (process.arch === "x64") return "x86_64-pc-windows-msvc";
  }

  return null;
}

function getCodexPlatformPackageName(): string | null {
  if (process.platform === "darwin") {
    if (process.arch === "arm64") return "@openai/codex-darwin-arm64";
    if (process.arch === "x64") return "@openai/codex-darwin-x64";
  }

  if (process.platform === "linux") {
    if (process.arch === "arm64") return "@openai/codex-linux-arm64";
    if (process.arch === "x64") return "@openai/codex-linux-x64";
  }

  if (process.platform === "win32") {
    if (process.arch === "arm64") return "@openai/codex-win32-arm64";
    if (process.arch === "x64") return "@openai/codex-win32-x64";
  }

  return null;
}

function resolveCodexNativeExecutable(): string | null {
  const targetTriple = getCodexTargetTriple();
  const packageName = getCodexPlatformPackageName();
  if (!targetTriple || !packageName) return null;

  const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
  return firstExisting(
    getNaviAppRootCandidates().map((root) =>
      join(
        root,
        "node_modules",
        ...packageName.split("/").filter(Boolean),
        "vendor",
        targetTriple,
        "codex",
        binaryName
      )
    )
  );
}

function getCodexExtraPathDirs(codexPath: string): string[] {
  const targetTriple = getCodexTargetTriple();
  if (!targetTriple || !codexPath.includes(`${targetTriple}/codex/`)) return [];

  const archRoot = dirname(dirname(codexPath));
  const pathDir = join(archRoot, "path");
  return existsSync(pathDir) ? [pathDir] : [];
}

function buildCodexRunCommand(args: string[]): CodexRunCommand | null {
  const codexPath = resolveCodexExecutable();
  if (!codexPath) return null;

  const extraPathDirs = getCodexExtraPathDirs(codexPath);
  if (codexPath.endsWith(".js")) {
    const nodePath = resolveNodeExecutable();
    if (!nodePath) return null;
    return {
      command: nodePath,
      args: [codexPath, ...args],
      displayPath: codexPath,
      env: buildEnvWithPrependedPath(process.env, [dirname(nodePath), ...extraPathDirs]),
    };
  }

  return {
    command: codexPath,
    args,
    displayPath: codexPath,
    env: buildEnvWithPrependedPath(process.env, extraPathDirs),
  };
}

/**
 * Codex nests its API failures inside a JSON string, so the useful sentence is
 * buried under two layers of escaping by the time it reaches a chat bubble.
 */
export function unwrapCodexErrorMessage(raw: unknown): string {
  let message = typeof raw === "string" ? raw : "";
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    message =
      (typeof obj.message === "string" && obj.message) ||
      (typeof obj.error === "string" && obj.error) ||
      JSON.stringify(raw);
  }

  for (let depth = 0; depth < 3; depth++) {
    const trimmed = message.trim();
    if (!trimmed.startsWith("{")) break;
    try {
      const parsed = JSON.parse(trimmed);
      const next =
        (typeof parsed?.error?.message === "string" && parsed.error.message) ||
        (typeof parsed?.message === "string" && parsed.message) ||
        (typeof parsed?.error === "string" && parsed.error);
      if (!next) break;
      message = next;
    } catch {
      break;
    }
  }

  return message.trim();
}

export function describeCodexExit(
  code: number,
  model: string,
  stderrTail: string
): string {
  const tail = stderrTail.trim().split("\n").filter(Boolean).slice(-3).join(" ");
  const base = `Codex exited with code ${code} (model "${model}")`;
  return tail ? `${base}: ${tail}` : `${base}.`;
}

export function buildCodexExecPlan(
  options: QueryOptions,
  defaultModel: string
): CodexExecutionPlan {
  const model = options.model || defaultModel;
  const backendOpts = options.backendOptions || {};
  const requestedReasoningEffort =
    typeof backendOpts.reasoningEffort === "string" &&
    backendOpts.reasoningEffort.trim()
      ? backendOpts.reasoningEffort.trim()
      : "medium";

  let reasoningEffort = requestedReasoningEffort;
  let adjustedReasoningEffort: CodexExecutionPlan["adjustedReasoningEffort"];

  // The Codex CLI rejects any reasoning effort outside its known set for ALL models,
  // not just codex-named ones. Always clamp to a valid value.
  if (!COMPATIBLE_CODEX_REASONING_EFFORTS.has(requestedReasoningEffort)) {
    reasoningEffort = "high";
    adjustedReasoningEffort = {
      from: requestedReasoningEffort,
      to: reasoningEffort,
    };
  }

  // Codex exec does not expose approval callbacks. Preserve write access only
  // for explicit auto-approve mode; otherwise run safely in read-only mode.
  const downgradedToReadOnly = options.permissionMode !== "auto";
  const sandboxMode = downgradedToReadOnly ? "read-only" : "workspace-write";

  const args = ["exec", "--json", "-m", model];
  args.push("--config", `model_reasoning_effort="${reasoningEffort}"`);
  // Codex ships with auto-compaction off (auto_compact_token_limit: null), so a
  // long run just overflows. Give it a limit with enough headroom to summarize.
  args.push("--config", `model_auto_compact_token_limit=${CODEX_AUTO_COMPACT_TOKEN_LIMIT}`);
  args.push("--sandbox", sandboxMode);

  if (options.permissionMode === "auto") {
    args.push("--full-auto");
  }

  args.push("--skip-git-repo-check");

  if (options.resume) {
    args.push("resume");
    if (options.resume === "last") {
      args.push("--last");
    } else {
      args.push(options.resume);
    }
  } else {
    args.push(options.prompt);
  }

  return {
    args,
    model,
    downgradedToReadOnly,
    adjustedReasoningEffort,
  };
}

export class CodexAdapter implements BackendAdapter {
  readonly id = "codex" as const;
  readonly name = "OpenAI Codex";
  readonly supportsCallbackPermissions = false; // Exec mode has no callback approval bridge
  readonly supportsResume = true;

  get models(): string[] {
    return buildCodexModelCatalog(getConfiguredCodexModel());
  }

  get defaultModel(): string {
    return getConfiguredCodexModel() || DEFAULT_CODEX_MODEL;
  }

  private childProcess: ChildProcess | null = null;

  async detect(): Promise<BackendInfo> {
    try {
      const runCommand = buildCodexRunCommand(["--version"]);
      const codexPath = runCommand?.displayPath;

      let version: string | undefined;
      if (runCommand) {
        try {
          const versionOutput = execFileSync(runCommand.command, runCommand.args, {
            encoding: "utf-8",
            env: runCommand.env,
          }).trim();
          // Parse "codex-cli 0.77.0" -> "0.77.0"
          const match = versionOutput.match(/[\d.]+/);
          version = match ? match[0] : versionOutput;
        } catch {}
      }

      return {
        id: this.id,
        name: this.name,
        description: "OpenAI Codex CLI - agentic coding with GPT-5",
        installed: !!codexPath,
        version,
        path: codexPath,
      };
    } catch {
      return {
        id: this.id,
        name: this.name,
        description: "OpenAI Codex CLI - agentic coding with GPT-5",
        installed: false,
      };
    }
  }

  async *query(options: QueryOptions): AsyncGenerator<NormalizedEvent> {
    const plan = buildCodexExecPlan(options, this.defaultModel);
    const runCommand = buildCodexRunCommand(plan.args);

    // Emit init event
    yield {
      type: "system",
      subtype: "init",
      sessionId: options.sessionId,
      backendId: "codex",
      model: plan.model,
      cwd: options.cwd,
      tools: ["Read", "Write", "Edit", "Bash", "WebSearch"],
    };

    if (options.permissionMode === "confirm" && plan.downgradedToReadOnly) {
      yield {
        type: "system",
        subtype: "status",
        status:
          "Codex manual approvals are not wired in Navi yet. Running this turn in read-only mode.",
      };
    }

    if (plan.adjustedReasoningEffort) {
      yield {
        type: "system",
        subtype: "status",
        status: `Codex model ${plan.model} does not support reasoning effort "${plan.adjustedReasoningEffort.from}". Using "${plan.adjustedReasoningEffort.to}".`,
      };
    }

    if (!runCommand) {
      yield {
        type: "error",
        sessionId: options.sessionId,
        error:
          "Codex CLI could not be launched from Navi. Run `bun install` in the Navi app directory and make sure Node.js is installed.",
      };
      return;
    }

    // Spawn codex process
    this.childProcess = spawn(runCommand.command, runCommand.args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...runCommand.env,
        // Ensure API key is available
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    });

    const child = this.childProcess;

    // For resume, pipe the prompt to stdin. Either way stdin must be closed:
    // `codex exec` reads it for extra input and blocks forever on an open pipe,
    // so leaving it open hangs the turn with no output and no error.
    if (child.stdin) {
      if (options.resume && options.prompt) {
        child.stdin.write(options.prompt);
      }
      child.stdin.end();
    }

    // Event handling
    const eventQueue: NormalizedEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;

    let buffer = "";
    // Codex reports the real failure (bad model, auth, quota) as a JSON event and
    // *then* exits non-zero. Without this flag the generic "exited with code N"
    // frame lands last and is the only thing the user sees.
    let sawError = false;
    let stderrTail = "";

    const pushEvent = (normalized: NormalizedEvent) => {
      if (normalized.type === "error") sawError = true;
      eventQueue.push(normalized);
      resolveNext?.();
    };

    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          const normalized = this.normalizeCodexEvent(event, options.sessionId);
          if (normalized) {
            pushEvent(normalized);
          }
        } catch (e) {
          // Non-JSON output, might be progress text
          console.error("[CodexAdapter] Non-JSON:", line.slice(0, 100));
        }
      }
    });

    // Stderr carries reasoning tokens plus, occasionally, the only description of
    // a launch failure. Keep a bounded tail so a non-zero exit can explain itself.
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-2000);
      // Only log if it looks like an error, not thinking
      if (
        text.includes("error") ||
        text.includes("Error") ||
        text.includes("failed")
      ) {
        console.error("[CodexAdapter stderr]", text);
      }
    });

    child.on("error", (err) => {
      eventQueue.push({
        type: "error",
        sessionId: options.sessionId,
        error: err.message,
      });
      done = true;
      resolveNext?.();
    });

    child.on("close", (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          const normalized = this.normalizeCodexEvent(event, options.sessionId);
          if (normalized) {
            if (normalized.type === "error") sawError = true;
            eventQueue.push(normalized);
          }
        } catch {}
      }

      // Emit completion
      eventQueue.push({
        type: "complete",
        sessionId: options.sessionId,
      });

      // A bare exit code tells the user nothing, and it would be the last error
      // frame they see — only fall back to it when Codex explained nothing itself.
      if (code !== 0 && code !== null && !sawError) {
        eventQueue.push({
          type: "error",
          sessionId: options.sessionId,
          error: describeCodexExit(code, plan.model, stderrTail),
        });
      }

      done = true;
      resolveNext?.();
    });

    // Yield events
    while (!done || eventQueue.length > 0) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
        resolveNext = null;
      }
    }

    this.childProcess = null;
  }

  respondToPermission(_response: PermissionResponse): void {
    // Codex doesn't support callback permissions
    // Permissions are handled via --full-auto flag
    console.warn(
      "[CodexAdapter] Permission callbacks not supported. Use --full-auto mode."
    );
  }

  cancel(): void {
    if (this.childProcess) {
      this.childProcess.kill("SIGTERM");
      this.childProcess = null;
    }
  }

  /**
   * Normalize Codex JSON events to unified format
   *
   * Codex CLI v0.23+ uses a wrapped event format:
   *   {"id":"0","msg":{"type":"task_started"}}
   *   {"id":"0","msg":{"type":"agent_message","message":"..."}}
   *   {"id":"0","msg":{"type":"exec_command_begin","call_id":"...","command":[...]}}
   *   {"id":"0","msg":{"type":"exec_command_end","call_id":"...","stdout":"...","exit_code":0}}
   *   {"id":"0","msg":{"type":"agent_reasoning","text":"..."}}
   *   {"id":"0","msg":{"type":"token_count","input_tokens":...}}
   *
   * There are also top-level config/prompt echo lines (no "msg" key):
   *   {"reasoning summaries":"auto","model":"gpt-5.4",...}
   *   {"prompt":"..."}
   */
  private normalizeCodexEvent(
    event: any,
    sessionId: string
  ): NormalizedEvent | null {
    // New format: events are wrapped in {"id":"X","msg":{...}}
    const msg = event.msg;
    if (msg && typeof msg === "object" && msg.type) {
      return this.normalizeCodexMsg(msg, sessionId);
    }

    // Top-level config echo line (has "model" key but no "msg")
    if (event.model && !event.type && !event.msg) {
      return null; // Skip config echo
    }

    // Top-level prompt echo line
    if (event.prompt && !event.type && !event.msg) {
      return null; // Skip prompt echo
    }

    // Legacy format fallback: events with top-level "type" (older Codex versions)
    const eventType = event.type || event.event;
    if (eventType) {
      return this.normalizeLegacyCodexEvent(event, eventType, sessionId);
    }

    return null;
  }

  /**
   * Normalize the inner "msg" object from Codex v0.23+ wrapped events
   */
  private normalizeCodexMsg(
    msg: any,
    sessionId: string
  ): NormalizedEvent | null {
    switch (msg.type) {
      case "task_started":
        return {
          type: "system",
          subtype: "status",
          status: "Processing...",
        };

      case "agent_message":
        return {
          type: "assistant",
          sessionId,
          content: this.extractTextContent(msg.message || msg.content || msg.text),
        };

      case "agent_reasoning":
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "thinking",
              thinking: msg.text || msg.content || "",
            },
          ],
        };

      case "agent_reasoning_section_break":
        return null; // UI separator, skip

      case "exec_command_begin":
        return {
          type: "tool_progress",
          toolUseId: msg.call_id || crypto.randomUUID(),
          toolName: "Bash",
        };

      case "exec_command_end": {
        const toolUseId = msg.call_id || crypto.randomUUID();
        const cmdStr = Array.isArray(msg.command) ? msg.command.join(" ") : msg.command || "";
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: toolUseId,
              name: "Bash",
              input: {
                command: cmdStr,
                description: this.extractBashDescription(cmdStr),
              },
            },
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content: msg.stdout || msg.output || "",
              is_error: msg.exit_code !== 0,
            },
          ],
        };
      }

      case "exec_command_output_delta":
        return null; // Streaming chunk, we use exec_command_end for final output

      case "file_change_begin":
        return {
          type: "tool_progress",
          toolUseId: msg.call_id || crypto.randomUUID(),
          toolName: msg.action === "create" ? "Write" : "Edit",
        };

      case "file_change_end": {
        const fileToolId = msg.call_id || crypto.randomUUID();
        const toolName = msg.action === "create" ? "Write" : "Edit";
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: fileToolId,
              name: toolName,
              input: {
                file_path: msg.path || msg.file,
                content: msg.content,
              },
            },
            {
              type: "tool_result",
              tool_use_id: fileToolId,
              content: `${msg.action || "modified"}: ${msg.path || msg.file}`,
            },
          ],
        };
      }

      case "token_count":
        // Token usage events — emit as result with usage info
        return {
          type: "result",
          sessionId,
          subtype: "success",
          numTurns: 1,
        };

      case "error":
        return {
          type: "error",
          sessionId,
          error: msg.message || msg.error || "Unknown error",
          code: msg.code,
        };

      default:
        return null;
    }
  }

  /**
   * Legacy event normalizer for older Codex versions (top-level "type" field)
   */
  /**
   * Normalize one `item.completed` payload from Codex 0.14x's thread protocol.
   */
  private normalizeCodexItem(item: any, sessionId: string): NormalizedEvent | null {
    if (!item || typeof item !== "object") return null;

    switch (item.type) {
      case "agent_message":
        return {
          type: "assistant",
          sessionId,
          content: this.extractTextContent(item.text ?? item.message ?? ""),
        };

      case "reasoning":
        return {
          type: "assistant",
          sessionId,
          content: [{ type: "thinking", thinking: item.text ?? item.summary_text ?? "" }],
        };

      case "command_execution": {
        const toolUseId = item.id || crypto.randomUUID();
        const command = Array.isArray(item.command) ? item.command.join(" ") : item.command || "";
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: toolUseId,
              name: "Bash",
              input: { command, description: this.extractBashDescription(command) },
            },
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content: item.aggregated_output ?? item.stdout ?? "",
              is_error: typeof item.exit_code === "number" && item.exit_code !== 0,
            },
          ],
        };
      }

      case "file_change": {
        const toolUseId = item.id || crypto.randomUUID();
        const paths = Array.isArray(item.changes)
          ? item.changes.map((change: any) => change?.path).filter(Boolean).join(", ")
          : item.path || "";
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: toolUseId,
              name: "Edit",
              input: { file_path: paths },
            },
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content: paths ? `Updated ${paths}` : "Updated files",
            },
          ],
        };
      }

      case "web_search":
        return {
          type: "system",
          subtype: "status",
          status: item.query ? `Searched the web for "${item.query}"` : "Searched the web",
        };

      case "context_compaction":
        return {
          type: "system",
          subtype: "status",
          status: "Codex compacted its context to make room to continue.",
        };

      case "error": {
        const text = unwrapCodexErrorMessage(item.message);
        return text ? { type: "system", subtype: "status", status: `Codex: ${text}` } : null;
      }

      // user_message is our own prompt echoed back; todo_list / image_view /
      // mcp_tool_call have no Navi rendering yet.
      default:
        return null;
    }
  }

  private normalizeLegacyCodexEvent(
    event: any,
    eventType: string,
    sessionId: string
  ): NormalizedEvent | null {
    switch (eventType) {
      case "thread.started":
        return {
          type: "backend_session",
          backendId: "codex",
          backendSessionId: event.thread_id,
          metadata: event.thread_id ? { thread_id: event.thread_id } : undefined,
        };

      case "turn.started":
        return {
          type: "system",
          subtype: "status",
          status: "Processing...",
        };

      case "turn.completed": {
        const usage = event.usage ?? {};
        // Codex reports the fresh and cached halves of the prompt separately;
        // both occupy the context window, so the meter needs their sum.
        const inputTokens =
          (usage.input_tokens ?? 0) +
          (usage.cached_input_tokens ?? 0) +
          (usage.cache_write_input_tokens ?? 0);
        const outputTokens = (usage.output_tokens ?? 0) + (usage.reasoning_output_tokens ?? 0);
        return {
          type: "result",
          sessionId,
          subtype: "success",
          costUsd: usage.total_cost,
          numTurns: 1,
          ...(inputTokens > 0 && { inputTokens }),
          ...(outputTokens > 0 && { outputTokens }),
          contextWindow: CODEX_CONTEXT_WINDOW,
        };
      }

      // Codex compacts its own context mid-run once it crosses the auto-compact
      // limit. Report it the same way the Claude backend reports a boundary so
      // the UI can show one story for both.
      case "item.started":
      case "item.updated":
        return null;

      case "turn.failed":
        return {
          type: "result",
          sessionId,
          subtype: "error",
          isError: true,
          errors: [unwrapCodexErrorMessage(event.error) || "Turn failed"],
        };

      case "error":
        return {
          type: "error",
          sessionId,
          error: unwrapCodexErrorMessage(event.message ?? event.error) || "Unknown error",
          code: event.code,
        };

      // Codex reports non-fatal problems (unknown model metadata, unsupported
      // service tier) as completed items of type "error" rather than top-level
      // error events. Surfacing them as status keeps them out of the error path
      // while still telling the user why a run behaved oddly.
      // Codex 0.14x reports everything the agent does as a completed thread
      // item. Anything unhandled here is silently dropped — which is why the
      // agent's own replies never reached the chat.
      case "item.completed":
        return this.normalizeCodexItem(event.item, sessionId);

      default:
        return null;
    }
  }

  private extractTextContent(content: any): NormalizedContentBlock[] {
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }
    if (Array.isArray(content)) {
      return content
        .map((c): NormalizedContentBlock | null => {
          if (typeof c === "string") {
            return { type: "text", text: c };
          }
          if (c.type === "text") {
            return { type: "text", text: c.text };
          }
          return null;
        })
        .filter((c): c is NormalizedContentBlock => c !== null);
    }
    return [{ type: "text", text: JSON.stringify(content) }];
  }

  /**
   * Extract a clean description from a bash command for display purposes.
   * Converts raw commands like "rg -n 'foo' packages/" into "Search for 'foo'"
   */
  private extractBashDescription(command: string): string {
    if (!command) return "";

    // Clean up shell wrapper if present
    const cleanCmd = command
      .replace(/^\/bin\/\w+\s+-lc\s+['"]?/, "")
      .replace(/['"]$/, "")
      .trim();

    // Extract first command and arguments
    const parts = cleanCmd.split(/\s+/);
    const baseCmd = parts[0]?.split("/").pop() || "";

    // Map common commands to friendly descriptions
    const cmdDescriptions: Record<string, (args: string[]) => string> = {
      rg: (args) => {
        const pattern = args.find((a) => !a.startsWith("-") && a !== "rg");
        return pattern ? `Search for "${pattern}"` : "Search files";
      },
      grep: (args) => {
        const pattern = args.find((a) => !a.startsWith("-") && a !== "grep");
        return pattern ? `Search for "${pattern}"` : "Search files";
      },
      cat: (args) => {
        const file = args.find((a) => !a.startsWith("-"))?.split("/").pop();
        return file ? `Read ${file}` : "Read file";
      },
      ls: (args) => {
        const dir = args.find((a) => !a.startsWith("-"))?.split("/").pop();
        return dir ? `List ${dir}` : "List directory";
      },
      cd: (args) => {
        const dir = args[1]?.split("/").pop();
        return dir ? `Change to ${dir}` : "Change directory";
      },
      mkdir: () => "Create directory",
      rm: () => "Remove files",
      mv: () => "Move files",
      cp: () => "Copy files",
      git: (args) => {
        const subCmd = args[1];
        return subCmd ? `git ${subCmd}` : "Git operation";
      },
      npm: (args) => {
        const subCmd = args[1];
        return subCmd ? `npm ${subCmd}` : "npm operation";
      },
      bun: (args) => {
        const subCmd = args[1];
        return subCmd ? `bun ${subCmd}` : "bun operation";
      },
      node: (args) => {
        const file = args.find((a) => !a.startsWith("-"))?.split("/").pop();
        return file ? `Run ${file}` : "Run Node.js";
      },
      python: (args) => {
        const file = args.find((a) => !a.startsWith("-"))?.split("/").pop();
        return file ? `Run ${file}` : "Run Python";
      },
    };

    const descFn = cmdDescriptions[baseCmd];
    if (descFn) {
      return descFn(parts);
    }

    // Default: show truncated command
    return cleanCmd.length > 50 ? cleanCmd.slice(0, 47) + "..." : cleanCmd;
  }
}

export const codexAdapter = new CodexAdapter();
