/**
 * OpenAI Codex CLI Backend Adapter
 *
 * Adapts Codex CLI output to the unified backend interface.
 * Uses `codex exec --json` for structured streaming output.
 */

import { spawn, ChildProcess } from "child_process";
import type {
  BackendAdapter,
  BackendInfo,
  QueryOptions,
  NormalizedEvent,
  PermissionResponse,
  NormalizedContentBlock,
} from "./types";

export class CodexAdapter implements BackendAdapter {
  readonly id = "codex" as const;
  readonly name = "OpenAI Codex";
  readonly supportsCallbackPermissions = false; // Uses --full-auto flag instead
  readonly supportsResume = true;

  readonly models = [
    // GPT-5.x Codex series (agentic coding)
    "gpt-5.2-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex",
    "gpt-5.1-codex-mini",
    "gpt-5.1",
    // GPT-4.x series
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
  ];
  readonly defaultModel = "gpt-5.2-codex";

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
    const model = options.model || this.defaultModel;
    const backendOpts = options.backendOptions || {};
    const reasoningEffort =
      (backendOpts.reasoningEffort as string) || "medium";

    // Build command args
    const args = ["exec", "--json"];

    // Model
    args.push("-m", model);

    // Reasoning effort
    args.push("--config", `model_reasoning_effort="${reasoningEffort}"`);

    // Sandbox mode based on permission mode
    const sandboxMode =
      options.permissionMode === "auto"
        ? "workspace-write"
        : options.permissionMode === "deny"
          ? "read-only"
          : "workspace-write";
    args.push("--sandbox", sandboxMode);

    // Full auto if auto-approve
    if (options.permissionMode === "auto") {
      args.push("--full-auto");
    }

    // Skip git check
    args.push("--skip-git-repo-check");

    // Resume support
    if (options.resume) {
      args.push("resume", "--last");
    } else {
      // Add the prompt as the last argument
      args.push(options.prompt);
    }

    // Emit init event
    yield {
      type: "system",
      subtype: "init",
      sessionId: options.sessionId,
      backendId: "codex",
      model,
      cwd: options.cwd,
      tools: ["Read", "Write", "Edit", "Bash", "WebSearch"],
    };

    // Spawn codex process
    this.childProcess = spawn("codex", args, {
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
    if (options.resume && child.stdin) {
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
   * Codex event types:
   * - thread.started
   * - turn.started / turn.completed / turn.failed
   * - item.started / item.completed (messages, reasoning, commands, file changes, MCP, web search, plan)
   * - error
   */
  private normalizeCodexEvent(
    event: any,
    sessionId: string
  ): NormalizedEvent | null {
    const eventType = event.type || event.event;

    switch (eventType) {
      case "thread.started":
        return {
          type: "system",
          subtype: "status",
          status: "Thread started",
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

      case "item.started":
        return this.normalizeItemStarted(event, sessionId);

      case "item.completed":
        return this.normalizeItemCompleted(event, sessionId);

      case "error":
        return {
          type: "error",
          sessionId,
          error: event.message || event.error || "Unknown error",
          code: event.code,
        };

      default:
        // Unknown event type
        return null;
    }
  }

  private normalizeItemStarted(
    event: any,
    sessionId: string
  ): NormalizedEvent | null {
    const item = event.item || {};
    const itemType = item.type;

    switch (itemType) {
      case "command_execution":
        return {
          type: "tool_progress",
          toolUseId: item.id || crypto.randomUUID(),
          toolName: "Bash",
        };

      case "file_change":
        return {
          type: "tool_progress",
          toolUseId: item.id || crypto.randomUUID(),
          toolName: item.action === "create" ? "Write" : "Edit",
        };

      case "mcp_tool_call":
        return {
          type: "tool_progress",
          toolUseId: item.id || crypto.randomUUID(),
          toolName: `mcp__${item.tool_name || "unknown"}`,
        };

      default:
        return null;
    }
  }

  private normalizeItemCompleted(
    event: any,
    sessionId: string
  ): NormalizedEvent | null {
    const item = event.item || {};
    const itemType = item.type;

    switch (itemType) {
      case "agent_message":
        return {
          type: "assistant",
          sessionId,
          content: this.extractTextContent(item.content || item.text),
          usage: event.usage
            ? {
                input_tokens: event.usage.input_tokens || 0,
                output_tokens: event.usage.output_tokens || 0,
              }
            : undefined,
        };

      case "reasoning":
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "thinking",
              thinking: item.content || item.text || "",
            },
          ],
        };

      case "command_execution": {
        // Use consistent ID for both tool_use and tool_result
        const toolUseId = item.id || crypto.randomUUID();
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: toolUseId,
              name: "Bash",
              input: {
                command: item.command,
                // Add description for cleaner display
                description: this.extractBashDescription(item.command),
              },
            },
            {
              type: "tool_result",
              tool_use_id: toolUseId,
              content: item.output || item.result || "",
              is_error: item.exit_code !== 0,
            },
          ],
        };
      }

      case "file_change": {
        // Use consistent ID for both tool_use and tool_result
        const fileToolUseId = item.id || crypto.randomUUID();
        const toolName = item.action === "create" ? "Write" : "Edit";
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: fileToolUseId,
              name: toolName,
              input: {
                file_path: item.path,
                content: item.content,
              },
            },
            {
              type: "tool_result",
              tool_use_id: fileToolUseId,
              content: `${item.action}: ${item.path}`,
            },
          ],
        };
      }

      case "web_search": {
        // Use consistent ID for both tool_use and tool_result
        const searchToolUseId = item.id || crypto.randomUUID();
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: searchToolUseId,
              name: "WebSearch",
              input: { query: item.query },
            },
            {
              type: "tool_result",
              tool_use_id: searchToolUseId,
              content: item.results
                ? JSON.stringify(item.results, null, 2)
                : "Search completed",
            },
          ],
        };
      }

      case "plan_update":
        // Plan updates shown as assistant messages
        return {
          type: "assistant",
          sessionId,
          content: [
            {
              type: "text",
              text: `📋 **Plan Update**\n${item.plan || item.content || ""}`,
            },
          ],
        };

      default:
        // Generic message fallback
        if (item.content || item.text) {
          return {
            type: "assistant",
            sessionId,
            content: this.extractTextContent(item.content || item.text),
          };
        }
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
