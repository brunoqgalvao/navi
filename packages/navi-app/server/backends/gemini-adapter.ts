/**
 * Google Gemini CLI Backend Adapter
 *
 * Adapts Gemini CLI output to the unified backend interface.
 * Uses `gemini --output-format stream-json` for structured streaming output.
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

export class GeminiAdapter implements BackendAdapter {
  readonly id = "gemini" as const;
  readonly name = "Google Gemini";
  readonly supportsCallbackPermissions = false; // Uses --yolo flag instead
  readonly supportsResume = true;

  readonly models = [
    // Gemini 3 (latest generation)
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    // Gemini 2.5 series
    "gemini-2.5-pro",
    "gemini-2.5-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.5-flash-preview",
    // Gemini 2.0 series
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-thinking",
    // Gemini 1.5 series (legacy)
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    // Experimental
    "gemini-exp-1206",
    "learnlm-1.5-pro-experimental",
  ];
  readonly defaultModel = "gemini-3-flash-preview";

  // Gemini 3 specific options
  private readonly gemini3Options = {
    thinkingLevel: ["low", "medium", "high"] as const,
    mediaResolution: ["low", "medium", "high", "ultra_high"] as const,
  };

  private childProcess: ChildProcess | null = null;

  async detect(): Promise<BackendInfo> {
    try {
      const { execSync } = await import("child_process");

      let geminiPath: string | undefined;
      const pathsToTry = ["which gemini", "command -v gemini"];

      for (const cmd of pathsToTry) {
        try {
          geminiPath = execSync(cmd, { encoding: "utf-8" }).trim();
          if (geminiPath) break;
        } catch {}
      }

      let version: string | undefined;
      if (geminiPath) {
        try {
          version = execSync("gemini --version", { encoding: "utf-8" }).trim();
        } catch {}
      }

      return {
        id: this.id,
        name: this.name,
        description: "Google Gemini CLI - AI agent with 1M context window",
        installed: !!geminiPath,
        version,
        path: geminiPath,
      };
    } catch {
      return {
        id: this.id,
        name: this.name,
        description: "Google Gemini CLI - AI agent with 1M context window",
        installed: false,
      };
    }
  }

  async *query(options: QueryOptions): AsyncGenerator<NormalizedEvent> {
    const model = options.model || this.defaultModel;
    const backendOpts = options.backendOptions || {};

    // Build command args
    const args: string[] = [];

    // Model
    args.push("-m", model);

    // Output format for streaming JSON (for programmatic parsing)
    args.push("-o", "stream-json");

    // Approval mode based on permission mode
    // Gemini uses: default, auto_edit, yolo
    if (options.permissionMode === "auto") {
      args.push("-y"); // yolo mode - auto-approve all
    } else if (options.permissionMode === "confirm") {
      args.push("--approval-mode", "auto_edit"); // auto-approve file edits only
    }
    // "deny" or undefined uses default mode (prompt for each action)

    // Sandbox mode if requested
    if (backendOpts.sandbox) {
      args.push("-s");
    }

    // Additional directories
    if (backendOpts.includeDirectories) {
      const dirs = backendOpts.includeDirectories as string[];
      args.push("--include-directories", dirs.join(","));
    }

    // Gemini 3 specific: thinking level
    if (backendOpts.thinkingLevel) {
      args.push("--thinking-level", backendOpts.thinkingLevel as string);
    }

    // Gemini 3 specific: media resolution for vision
    if (backendOpts.mediaResolution) {
      args.push("--media-resolution", backendOpts.mediaResolution as string);
    }

    // Resume support - uses -r flag with "latest" or session index
    if (options.resume) {
      args.push("-r", options.resume === "latest" ? "latest" : options.resume);
      // When resuming, prompt goes to stdin or after -r
    } else {
      // Add the prompt as positional argument (not -p which is deprecated)
      args.push(options.prompt);
    }

    // Emit init event
    yield {
      type: "system",
      subtype: "init",
      sessionId: options.sessionId,
      backendId: "gemini",
      model,
      cwd: options.cwd,
      tools: ["Read", "Write", "Edit", "Bash", "WebFetch", "WebSearch"],
    };

    // Spawn gemini process
    this.childProcess = spawn("gemini", args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Ensure API key is available
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      },
    });

    const child = this.childProcess;

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
          console.log("[GeminiAdapter] Raw event:", JSON.stringify(event).slice(0, 200));
          const normalized = this.normalizeGeminiEvent(event, options.sessionId);
          if (normalized) {
            console.log("[GeminiAdapter] Normalized:", normalized.type);
            eventQueue.push(normalized);
            resolveNext?.();
          } else {
            console.log("[GeminiAdapter] Skipped event (null normalized)");
          }
        } catch (e) {
          // Non-JSON output - might be progress indicator or plain text
          // Treat as assistant text message
          if (line.trim()) {
            console.log("[GeminiAdapter] Non-JSON output:", line.slice(0, 100));
            eventQueue.push({
              type: "assistant",
              sessionId: options.sessionId,
              content: [{ type: "text", text: line }],
            });
            resolveNext?.();
          }
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      // Log errors
      if (
        text.includes("error") ||
        text.includes("Error") ||
        text.includes("failed") ||
        text.includes("FAILED")
      ) {
        console.error("[GeminiAdapter stderr]", text);
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
      console.log("[GeminiAdapter] Process closed with code:", code);

      // Process remaining buffer
      if (buffer.trim()) {
        console.log("[GeminiAdapter] Processing remaining buffer:", buffer.slice(0, 100));
        try {
          const event = JSON.parse(buffer);
          const normalized = this.normalizeGeminiEvent(event, options.sessionId);
          if (normalized) {
            eventQueue.push(normalized);
          }
        } catch {
          // Plain text remaining
          if (buffer.trim()) {
            eventQueue.push({
              type: "assistant",
              sessionId: options.sessionId,
              content: [{ type: "text", text: buffer.trim() }],
            });
          }
        }
      }

      // Gemini sends a "result" event before closing, so we only need to emit
      // an error if the process exited with a non-zero code
      if (code !== 0 && code !== null) {
        eventQueue.push({
          type: "error",
          sessionId: options.sessionId,
          error: `Gemini exited with code ${code}`,
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
    // Gemini doesn't support callback permissions
    // Permissions are handled via --yolo or --approval-mode flags
    console.warn(
      "[GeminiAdapter] Permission callbacks not supported. Use -y (yolo) mode."
    );
  }

  cancel(): void {
    if (this.childProcess) {
      this.childProcess.kill("SIGTERM");
      this.childProcess = null;
    }
  }

  /**
   * Normalize Gemini stream-json events to unified format
   *
   * Gemini stream-json events (based on CLI docs):
   * - Thinking/reasoning blocks
   * - Tool calls (file ops, shell, web fetch, search)
   * - Text responses
   * - Errors
   */
  private normalizeGeminiEvent(
    event: any,
    sessionId: string
  ): NormalizedEvent | null {
    // Handle different event structures Gemini might emit

    // Event with explicit type field
    if (event.type) {
      switch (event.type) {
        case "thinking":
        case "reasoning":
          return {
            type: "assistant",
            sessionId,
            content: [
              {
                type: "thinking",
                thinking: event.content || event.text || "",
              },
            ],
          };

        case "text":
        case "response":
          return {
            type: "assistant",
            sessionId,
            content: [
              {
                type: "text",
                text: event.content || event.text || "",
              },
            ],
          };

        case "message":
          // Skip user messages - Gemini echoes the user's input
          if (event.role === "user") {
            return null;
          }
          return {
            type: "assistant",
            sessionId,
            content: [
              {
                type: "text",
                text: event.content || event.text || "",
              },
            ],
            // Handle delta streaming
            delta: event.delta,
          };

        case "tool_call":
        case "function_call":
          return this.normalizeToolCall(event, sessionId);

        case "tool_result":
        case "function_result":
          return {
            type: "assistant",
            sessionId,
            content: [
              {
                type: "tool_result",
                tool_use_id: event.tool_use_id || event.id || crypto.randomUUID(),
                content:
                  typeof event.result === "string"
                    ? event.result
                    : JSON.stringify(event.result),
                is_error: event.is_error || event.error,
              },
            ],
          };

        case "error":
          return {
            type: "error",
            sessionId,
            error: event.message || event.error || "Unknown error",
          };

        case "done":
        case "complete":
        case "result":
          // Gemini emits {type: "result", status: "success", stats: {...}}
          return {
            type: "result",
            sessionId,
            subtype: event.status === "success" ? "success" : "error",
            costUsd: event.usage?.cost || event.stats?.cost,
            inputTokens: event.stats?.input_tokens,
            outputTokens: event.stats?.output_tokens,
            numTurns: event.turns || event.stats?.tool_calls,
          };

        default:
          // Unknown type, try to extract content
          if (event.content || event.text) {
            return {
              type: "assistant",
              sessionId,
              content: [
                {
                  type: "text",
                  text: event.content || event.text,
                },
              ],
            };
          }
          return null;
      }
    }

    // Event without type - try to infer from structure
    if (event.thinking || event.reasoning) {
      return {
        type: "assistant",
        sessionId,
        content: [
          {
            type: "thinking",
            thinking: event.thinking || event.reasoning,
          },
        ],
      };
    }

    if (event.tool || event.function) {
      return this.normalizeToolCall(event, sessionId);
    }

    if (event.content || event.text || event.message) {
      return {
        type: "assistant",
        sessionId,
        content: [
          {
            type: "text",
            text: event.content || event.text || event.message,
          },
        ],
      };
    }

    if (event.error) {
      return {
        type: "error",
        sessionId,
        error: event.error,
      };
    }

    // Can't normalize this event
    return null;
  }

  private normalizeToolCall(event: any, sessionId: string): NormalizedEvent {
    const toolName = this.mapGeminiToolName(
      event.tool || event.function || event.name || "unknown"
    );
    const toolId = event.id || crypto.randomUUID();

    return {
      type: "assistant",
      sessionId,
      content: [
        {
          type: "tool_use",
          id: toolId,
          name: toolName,
          input: event.args || event.arguments || event.input || {},
        },
      ],
    };
  }

  /**
   * Map Gemini tool names to our normalized tool names
   */
  private mapGeminiToolName(geminiTool: string): string {
    const toolMap: Record<string, string> = {
      // File operations
      read_file: "Read",
      write_file: "Write",
      edit_file: "Edit",
      file_read: "Read",
      file_write: "Write",
      file_edit: "Edit",

      // Shell
      shell: "Bash",
      run_command: "Bash",
      execute: "Bash",
      terminal: "Bash",

      // Web
      web_fetch: "WebFetch",
      fetch: "WebFetch",
      web_search: "WebSearch",
      search: "WebSearch",
      google_search: "WebSearch",

      // Grep/Glob
      grep: "Grep",
      glob: "Glob",
      find_files: "Glob",
      search_files: "Grep",
    };

    return toolMap[geminiTool.toLowerCase()] || geminiTool;
  }
}

export const geminiAdapter = new GeminiAdapter();
