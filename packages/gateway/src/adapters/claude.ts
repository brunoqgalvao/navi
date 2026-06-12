/**
 * Claude adapter — wraps @anthropic-ai/claude-agent-sdk for the gateway.
 *
 * Translation layer (claudeMessageToEvents) is pure and unit-tested.
 * ClaudeSession implements AgentSession using the SDK's query() function.
 */
import { randomUUID } from "node:crypto";
import {
  query as sdkQuery,
  type SDKMessage,
  type PermissionResult,
  type CanUseTool,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import type { GatewayEvent, PermissionDecision } from "../events.js";
import type {
  AgentBackend,
  AgentSession,
  Capabilities,
  DetectResult,
  SessionOptions,
  UserInput,
} from "../types.js";
import { normalizeUsage } from "../usage.js";

// ── Types for BetaContentBlock (just the shapes we need) ─────────────────────
type TextBlock = { type: "text"; text: string };
type ThinkingBlock = { type: "thinking"; thinking: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

// ── Translation layer ─────────────────────────────────────────────────────────

/**
 * Convert one SDKMessage to zero or more GatewayEvents.
 *
 * @param msg - The SDK message to translate
 * @param sessionId - The gateway session ID (not the SDK session_id)
 * @param model - Optional model hint (used for usage events when msg doesn't carry it)
 */
export function claudeMessageToEvents(
  msg: SDKMessage,
  sessionId: string,
  model?: string
): GatewayEvent[] {
  const events: GatewayEvent[] = [];

  if (msg.type === "system" && msg.subtype === "init") {
    events.push({
      type: "session-meta",
      sessionId,
      backendSessionId: msg.session_id,
      model: msg.model,
      cwd: msg.cwd,
    });
    return events;
  }

  if (msg.type === "assistant") {
    // If the SDK flagged an API error on the assistant message
    if (msg.error) {
      events.push({
        type: "error",
        sessionId,
        message: `Claude API error: ${msg.error}`,
        detail: msg.error,
      });
      return events;
    }

    const content = msg.message?.content ?? [];
    for (const block of content as unknown[]) {
      const b = block as { type: string };
      if (b.type === "text") {
        const tb = b as TextBlock;
        events.push({ type: "text-delta", sessionId, text: tb.text });
      } else if (b.type === "thinking") {
        const th = b as ThinkingBlock;
        events.push({ type: "thinking-delta", sessionId, text: th.thinking });
      } else if (b.type === "tool_use") {
        const tu = b as ToolUseBlock;
        events.push({
          type: "tool-start",
          sessionId,
          toolId: tu.id,
          tool: tu.name,
          input: tu.input,
        });
      }
      // Other block types (redacted_thinking, mcp_tool_use, etc.) are silently skipped
    }
    return events;
  }

  if (msg.type === "user") {
    // Translate tool_result blocks back to tool-end events
    const content = (msg.message as { content?: unknown[] })?.content ?? [];
    for (const block of content as unknown[]) {
      const b = block as { type: string };
      if (b.type === "tool_result") {
        const tr = b as ToolResultBlock;
        events.push({
          type: "tool-end",
          sessionId,
          toolId: tr.tool_use_id,
          result: tr.content,
          isError: tr.is_error ?? false,
        });
      }
    }
    return events;
  }

  if (msg.type === "result") {
    const resultModel = model ?? "unknown";
    const u = msg.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      costUSD?: number;
    };

    const normalized = normalizeUsage(resultModel, {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens,
      costUsd: (msg as { total_cost_usd?: number }).total_cost_usd,
    });
    events.push({ type: "usage", sessionId, usage: normalized });

    if (msg.subtype === "success") {
      events.push({ type: "done", sessionId, reason: "complete" });
    } else {
      const errors: string[] = (msg as { errors?: string[] }).errors ?? [];
      events.push({
        type: "error",
        sessionId,
        message: errors.join("; ") || `Query ended with: ${msg.subtype}`,
        detail: { subtype: msg.subtype, errors },
      });
      events.push({ type: "done", sessionId, reason: "error" });
    }
    return events;
  }

  // All other message types (tool_progress, system/status, etc.) → empty
  return events;
}

// ── Permission result builder ─────────────────────────────────────────────────

/**
 * Map a gateway PermissionDecision to an SDK PermissionResult.
 */
export function makePermissionResult(
  decision: PermissionDecision,
  toolName: string,
  _toolUseID: string
): PermissionResult {
  if (decision === "allow") {
    // NOTE: The SDK bridge validates updatedInput as a Record — pass {} explicitly
    // to avoid "expected record, received undefined" ZodError from the bridge.
    return { behavior: "allow", updatedInput: {} };
  }
  if (decision === "allow-session") {
    return {
      behavior: "allow",
      updatedInput: {},
      updatedPermissions: [
        {
          type: "addRules",
          rules: [{ toolName }],
          behavior: "allow",
          destination: "session",
        },
      ],
    };
  }
  // deny
  return {
    behavior: "deny",
    message: "User denied permission",
  };
}

// ── Async channel ─────────────────────────────────────────────────────────────

/**
 * A simple async channel for streaming GatewayEvents from concurrent
 * producers (canUseTool callback + SDK message loop) to a single consumer
 * (the send() generator).
 *
 * push() enqueues an item (or resolves a waiting consumer).
 * end() signals completion.
 */
class EventChannel {
  private _queue: Array<GatewayEvent | { __done: true }> = [];
  private _waiter: (() => void) | undefined;

  private _notify(): void {
    const w = this._waiter;
    this._waiter = undefined;
    w?.();
  }

  push(evt: GatewayEvent): void {
    this._queue.push(evt);
    this._notify();
  }

  end(): void {
    this._queue.push({ __done: true });
    this._notify();
  }

  /** Returns an AsyncIterable that yields events until end() */
  async *iter(): AsyncIterable<GatewayEvent> {
    while (true) {
      while (this._queue.length === 0) {
        // Wait for a producer to push something
        await new Promise<void>((res) => {
          this._waiter = res;
        });
      }
      const item = this._queue.shift()!;
      if ("__done" in item) return;
      yield item as GatewayEvent;
    }
  }
}

// ── ClaudeSession ─────────────────────────────────────────────────────────────

type QueryFn = typeof sdkQuery;

export class ClaudeSession implements AgentSession {
  readonly id: string;
  private _backendSessionId: string | undefined;
  private _model: string | undefined;
  private _opts: SessionOptions;
  private _resumeId: string | undefined;
  private _queryFn: QueryFn;
  private _abortController: AbortController | undefined;
  /** set to true by cancel() so the catch block can emit cancelled instead of error */
  private _cancelled = false;
  /** tools the user has allowed for the duration of this session */
  private _sessionAllowedTools = new Set<string>();

  /** pending permission requests: requestId → { toolName, toolUseID, resolve } */
  private _pendingPermissions = new Map<
    string,
    {
      toolName: string;
      toolUseID: string;
      resolve: (result: PermissionResult) => void;
    }
  >();

  constructor(
    id: string,
    opts: SessionOptions,
    resumeId: string | undefined,
    queryFn: QueryFn = sdkQuery
  ) {
    this.id = id;
    this._opts = opts;
    this._resumeId = resumeId;
    this._queryFn = queryFn;
  }

  respondToPermission(requestId: string, decision: PermissionDecision): void {
    const pending = this._pendingPermissions.get(requestId);
    if (!pending) return;
    this._pendingPermissions.delete(requestId);
    if (decision === "allow-session") {
      // Local guarantee: remember this tool so subsequent canUseTool calls skip the prompt
      this._sessionAllowedTools.add(pending.toolName);
    }
    pending.resolve(makePermissionResult(decision, pending.toolName, pending.toolUseID));
  }

  async cancel(): Promise<void> {
    this._cancelled = true;
    this._pendingPermissions.clear();
    this._abortController?.abort();
  }

  async *send(input: UserInput): AsyncIterable<GatewayEvent> {
    // Reset cancellation flag so a prior cancel() does not mislabel errors in
    // subsequent turns as "cancelled".
    this._cancelled = false;
    // Abandon any leftover permission resolvers from a cancelled prior turn.
    this._pendingPermissions.clear();
    this._abortController = new AbortController();
    const channel = new EventChannel();

    const canUseTool: CanUseTool = (toolName, toolInput, options) => {
      // Local session-allow guarantee: skip the prompt for tools the user already
      // approved for the whole session (belt-and-suspenders alongside updatedPermissions).
      if (this._sessionAllowedTools.has(toolName)) {
        return Promise.resolve({ behavior: "allow", updatedInput: {} });
      }

      return new Promise<PermissionResult>((resolve) => {
        const requestId = randomUUID();
        this._pendingPermissions.set(requestId, {
          toolName,
          toolUseID: options.toolUseID,
          resolve,
        });
        // Push permission-request event directly to the channel so it gets
        // yielded to the consumer while the SDK generator is still blocked.
        channel.push({
          type: "permission-request",
          sessionId: this.id,
          requestId,
          tool: toolName,
          description:
            options.description ??
            options.title ??
            `Claude wants to use tool: ${toolName}`,
          input: toolInput,
          options: ["allow", "allow-session", "deny"],
        });
        // The promise resolves when respondToPermission() is called
      });
    };

    const sdkOptions: Options = {
      cwd: this._opts.cwd,
      model: this._opts.model,
      abortController: this._abortController,
      canUseTool,
    };

    // Map gateway permissionMode → SDK permissionMode
    switch (this._opts.permissionMode) {
      case "prompt":
        sdkOptions.permissionMode = "default";
        break;
      case "acceptEdits":
        sdkOptions.permissionMode = "acceptEdits";
        break;
      case "acceptAll":
        sdkOptions.permissionMode = "bypassPermissions";
        sdkOptions.allowDangerouslySkipPermissions = true;
        break;
      case "readOnly":
        sdkOptions.permissionMode = "plan";
        break;
    }

    if (this._resumeId) {
      sdkOptions.resume = this._resumeId;
    }

    // Pass MCP servers
    if (this._opts.mcpServers && this._opts.mcpServers.length > 0) {
      sdkOptions.mcpServers = {};
      for (const srv of this._opts.mcpServers) {
        sdkOptions.mcpServers[srv.name] = {
          command: srv.command,
          args: srv.args,
          env: srv.env,
        };
      }
    }

    // Pass systemContext as appended system prompt
    if (this._opts.systemContext) {
      sdkOptions.systemPrompt = {
        type: "preset",
        preset: "claude_code",
        append: this._opts.systemContext,
      };
    }

    // Run the SDK query in the background, feeding events into the channel.
    // The channel is then drained by the consumer below. This allows
    // canUseTool to push permission-request events concurrently with the
    // SDK generator producing SDKMessages.
    const runSdk = async (): Promise<void> => {
      try {
        const sdkGen = this._queryFn({ prompt: input.text, options: sdkOptions });
        for await (const msg of sdkGen) {
          const events = claudeMessageToEvents(msg, this.id, this._model);
          for (const evt of events) {
            if (evt.type === "session-meta" && evt.backendSessionId) {
              this._backendSessionId = evt.backendSessionId;
              if (evt.model) this._model = evt.model;
            }
            channel.push(evt);
          }
        }
        channel.end();
      } catch (err) {
        if (this._cancelled) {
          // Abort triggered by cancel() — not an error; just signal done
          channel.push({ type: "done", sessionId: this.id, reason: "cancelled" });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          channel.push({ type: "error", sessionId: this.id, message, fatal: true });
          channel.push({ type: "done", sessionId: this.id, reason: "error" });
        }
        channel.end();
      }
    };

    // Start the SDK runner as a background promise (fire and forget from the
    // generator's perspective — the channel bridges the two).
    const sdkDone = runSdk();

    // Yield events from the channel
    for await (const evt of channel.iter()) {
      yield evt;
    }

    // Ensure the SDK runner is fully settled (shouldn't be needed but safe)
    await sdkDone;
  }

  get backendSessionId(): string | undefined {
    return this._backendSessionId;
  }
}

// ── ClaudeBackend ─────────────────────────────────────────────────────────────

export class ClaudeBackend implements AgentBackend {
  readonly id = "claude" as const;

  capabilities(): Capabilities {
    return {
      streaming: true,
      thinkingStream: true,
      permissions: "callback",
      resume: true,
      mcp: true,
      skills: "native",
      models: [
        { id: "claude-opus-4-1", label: "Claude Opus 4.1", default: true },
        { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
        { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      ],
    };
  }

  async detect(): Promise<DetectResult> {
    try {
      const proc = Bun.spawn(["claude", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const text = await new Response(proc.stdout).text();
      await proc.exited;

      if (proc.exitCode !== 0) {
        return {
          installed: false,
          authed: false,
          fixHint: "claude CLI not working; run `claude --version` to diagnose",
        };
      }

      // Best-effort auth check: look for ~/.claude.json
      let authed = false;
      try {
        const home = process.env.HOME ?? "";
        const stat = await Bun.file(`${home}/.claude.json`).exists();
        authed = stat;
      } catch {
        authed = false;
      }

      const version = text.trim().split("\n")[0] ?? text.trim();
      return { installed: true, authed, version };
    } catch {
      return {
        installed: false,
        authed: false,
        fixHint: "claude CLI not found; install from https://claude.ai/code",
      };
    }
  }

  createSession(opts: SessionOptions): AgentSession {
    return new ClaudeSession(randomUUID(), opts, undefined);
  }

  resumeSession(backendSessionId: string, opts: SessionOptions): AgentSession {
    return new ClaudeSession(randomUUID(), opts, backendSessionId);
  }
}
