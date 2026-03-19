/**
 * OpenAI Codex CLI Backend Adapter
 *
 * Adapts Codex CLI output to the unified backend interface.
 * Uses `codex exec --json` for structured streaming output.
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type {
  BackendAdapter,
  BackendInfo,
  QueryOptions,
  NormalizedEvent,
  PermissionResponse,
  NormalizedContentBlock,
} from "./types";

const DEFAULT_CODEX_MODEL = "gpt-5.2-codex";
// The Codex CLI only accepts these values for model_reasoning_effort (any model)
const COMPATIBLE_CODEX_REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high"]);
const BASE_CODEX_MODELS = [
  // Current Codex-focused models
  "gpt-5.2-codex",
  "gpt-5-codex",
  "codex-mini-latest",
  // Prior Codex snapshots still seen in existing sessions
  "gpt-5.1-codex-max",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  // General OpenAI models that Codex CLI can also target
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5.1",
  "o4-mini",
  "o3",
  "o3-mini",
  "o1",
  "o1-mini",
  "o1-preview",
  "gpt-4.5-preview",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
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
  const models = [...BASE_CODEX_MODELS];

  if (configuredModel && !models.includes(configuredModel as (typeof BASE_CODEX_MODELS)[number])) {
    models.unshift(configuredModel);
  }

  return models;
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
      const { execSync } = await import("child_process");

      let codexPath: string | undefined;
      const pathsToTry = ["which codex", "command -v codex"];

      for (const cmd of pathsToTry) {
        try {
          codexPath = execSync(cmd, { encoding: "utf-8" }).trim();
          if (codexPath) break;
        } catch {}
      }

      let version: string | undefined;
      if (codexPath) {
        try {
          const versionOutput = execSync("codex --version", {
            encoding: "utf-8",
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

    // Spawn codex process
    this.childProcess = spawn("codex", plan.args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Ensure API key is available
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    });

    const child = this.childProcess;

    // For resume, pipe the prompt to stdin
    if (options.resume && options.prompt && child.stdin) {
      child.stdin.write(options.prompt);
      child.stdin.end();
    }

    // Event handling
    const eventQueue: NormalizedEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;

    let buffer = "";

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
            eventQueue.push(normalized);
            resolveNext?.();
          }
        } catch (e) {
          // Non-JSON output, might be progress text
          console.error("[CodexAdapter] Non-JSON:", line.slice(0, 100));
        }
      }
    });

    // Stderr contains thinking tokens - we suppress them by default
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
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
            eventQueue.push(normalized);
          }
        } catch {}
      }

      // Emit completion
      eventQueue.push({
        type: "complete",
        sessionId: options.sessionId,
      });

      if (code !== 0 && code !== null) {
        eventQueue.push({
          type: "error",
          sessionId: options.sessionId,
          error: `Codex exited with code ${code}`,
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

      case "turn.completed":
        return {
          type: "result",
          sessionId,
          subtype: "success",
          costUsd: event.usage?.total_cost,
          numTurns: 1,
        };

      case "turn.failed":
        return {
          type: "result",
          sessionId,
          subtype: "error",
          isError: true,
          errors: [event.error || "Turn failed"],
        };

      case "error":
        return {
          type: "error",
          sessionId,
          error: event.message || event.error || "Unknown error",
          code: event.code,
        };

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
