/**
 * Claude Code Backend Adapter
 *
 * This adapter wraps the existing query-worker.ts to conform to the unified
 * backend interface. It's the reference implementation that others should match.
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import type {
  BackendAdapter,
  BackendInfo,
  QueryOptions,
  NormalizedEvent,
  PermissionResponse,
  NormalizedContentBlock,
} from "./types";

export class ClaudeAdapter implements BackendAdapter {
  readonly id = "claude" as const;
  readonly name = "Claude Code";
  readonly supportsCallbackPermissions = true;
  readonly supportsResume = true;

  readonly models = [
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
    "claude-haiku-3-5-20241022",
  ];
  readonly defaultModel = "claude-sonnet-4-20250514";

  private childProcess: ChildProcess | null = null;
  private permissionResolvers = new Map<
    string,
    (response: PermissionResponse) => void
  >();

  async detect(): Promise<BackendInfo> {
    try {
      const { execSync } = await import("child_process");

      // Try to find claude CLI
      let claudePath: string | undefined;
      const pathsToTry = ["which claude", "command -v claude"];

      for (const cmd of pathsToTry) {
        try {
          claudePath = execSync(cmd, { encoding: "utf-8" }).trim();
          if (claudePath) break;
        } catch {}
      }

      // Try to get version
      let version: string | undefined;
      if (claudePath) {
        try {
          version = execSync("claude --version", { encoding: "utf-8" }).trim();
        } catch {}
      }

      return {
        id: this.id,
        name: this.name,
        description: "Anthropic Claude Code CLI with full agent SDK",
        installed: !!claudePath,
        version,
        path: claudePath,
      };
    } catch {
      return {
        id: this.id,
        name: this.name,
        description: "Anthropic Claude Code CLI with full agent SDK",
        installed: false,
      };
    }
  }

  async *query(options: QueryOptions): AsyncGenerator<NormalizedEvent> {
    const workerPath = path.join(__dirname, "..", "query-worker.ts");

    const inputJson = JSON.stringify({
      prompt: options.prompt,
      cwd: options.cwd,
      resume: options.resume,
      model: options.model,
      sessionId: options.sessionId,
      permissionSettings: {
        autoAcceptAll: options.permissionMode === "auto",
        requireConfirmation:
          options.permissionMode === "confirm"
            ? ["Write", "Edit", "Bash"]
            : [],
      },
    });

    // Spawn the worker process
    this.childProcess = spawn("bun", ["run", workerPath, inputJson], {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NAVI_AUTH_MODE: process.env.NAVI_AUTH_MODE || "api_key",
        NAVI_AUTH_SOURCE: process.env.NAVI_AUTH_SOURCE || "global_settings",
      },
    });

    const child = this.childProcess;

    // Create a promise-based event queue
    const eventQueue: NormalizedEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;
    let error: Error | null = null;

    let buffer = "";

    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const normalized = this.normalizeWorkerMessage(msg, options.sessionId);
          if (normalized) {
            eventQueue.push(normalized);
            resolveNext?.();
          }
        } catch (e) {
          console.error("[ClaudeAdapter] Failed to parse:", line);
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      // Log worker debug output
      console.error("[ClaudeAdapter Worker]", chunk.toString());
    });

    child.on("error", (err) => {
      error = err;
      done = true;
      resolveNext?.();
    });

    child.on("close", (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const msg = JSON.parse(buffer);
          const normalized = this.normalizeWorkerMessage(msg, options.sessionId);
          if (normalized) {
            eventQueue.push(normalized);
          }
        } catch {}
      }

      if (code !== 0 && code !== null) {
        eventQueue.push({
          type: "error",
          sessionId: options.sessionId,
          error: `Worker exited with code ${code}`,
        });
      }

      done = true;
      resolveNext?.();
    });

    // Yield events as they come
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

    if (error) {
      yield {
        type: "error",
        sessionId: options.sessionId,
        error: error.message,
      };
    }

    this.childProcess = null;
  }

  respondToPermission(response: PermissionResponse): void {
    if (this.childProcess?.stdin) {
      const msg = JSON.stringify({
        type: "permission_response",
        requestId: response.requestId,
        approved: response.approved,
        approveAll: response.approveAll,
      });
      this.childProcess.stdin.write(msg + "\n");
    }
  }

  cancel(): void {
    if (this.childProcess) {
      this.childProcess.kill("SIGTERM");
      this.childProcess = null;
    }
  }

  /**
   * Normalize worker output to unified event format
   */
  private normalizeWorkerMessage(
    msg: any,
    sessionId: string
  ): NormalizedEvent | null {
    if (msg.type === "message" && msg.data) {
      return this.normalizeDataMessage(msg.data, sessionId);
    }

    if (msg.type === "permission_request") {
      return {
        type: "permission_request",
        requestId: msg.requestId,
        toolName: msg.toolName,
        toolInput: msg.toolInput,
        message: msg.message,
      };
    }

    if (msg.type === "complete") {
      return {
        type: "complete",
        sessionId,
        lastAssistantContent: this.normalizeContent(msg.lastAssistantContent),
        resultData: msg.resultData,
      };
    }

    if (msg.type === "error") {
      return {
        type: "error",
        sessionId,
        error: msg.error,
      };
    }

    return null;
  }

  private normalizeDataMessage(
    data: any,
    sessionId: string
  ): NormalizedEvent | null {
    switch (data.type) {
      case "system":
        if (data.subtype === "init") {
          return {
            type: "system",
            subtype: "init",
            sessionId: data.claudeSessionId || sessionId,
            backendId: "claude",
            model: data.model,
            cwd: data.cwd,
            tools: data.tools,
          };
        }
        if (data.subtype === "status") {
          return {
            type: "system",
            subtype: "status",
            status: data.status,
          };
        }
        return null;

      case "assistant":
        return {
          type: "assistant",
          sessionId: data.claudeSessionId || sessionId,
          content: this.normalizeContent(data.content),
          parentToolUseId: data.parentToolUseId,
          usage: data.usage,
        };

      case "user":
        return {
          type: "user",
          sessionId: data.claudeSessionId || sessionId,
          content: this.normalizeContent(data.content),
          parentToolUseId: data.parentToolUseId,
        };

      case "tool_progress":
        return {
          type: "tool_progress",
          toolUseId: data.toolUseId,
          toolName: data.toolName,
          elapsedTimeSeconds: data.elapsedTimeSeconds,
        };

      case "result":
        return {
          type: "result",
          sessionId: data.claudeSessionId || sessionId,
          subtype: data.isError ? "error" : "success",
          costUsd: data.costUsd,
          durationMs: data.durationMs,
          numTurns: data.numTurns,
          isError: data.isError,
          result: data.result,
          errors: data.errors,
        };

      default:
        return null;
    }
  }

  private normalizeContent(content: any[]): NormalizedContentBlock[] {
    if (!Array.isArray(content)) return [];

    return content
      .map((block): NormalizedContentBlock | null => {
        if (block.type === "text") {
          return { type: "text", text: block.text };
        }
        if (block.type === "tool_use") {
          return {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        if (block.type === "tool_result") {
          return {
            type: "tool_result",
            tool_use_id: block.tool_use_id,
            content:
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content),
            is_error: block.is_error,
          };
        }
        if (block.type === "thinking") {
          return { type: "thinking", thinking: block.thinking };
        }
        return null;
      })
      .filter((b): b is NormalizedContentBlock => b !== null);
  }
}

export const claudeAdapter = new ClaudeAdapter();
