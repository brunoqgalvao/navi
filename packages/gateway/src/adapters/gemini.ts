/**
 * gemini.ts — drives `gemini --experimental-acp` via ACP (JSON-RPC 2.0 over stdio).
 *
 * Decision: raw JSON-RPC over stdio via our jsonrpc.ts, NOT @agentclientprotocol/sdk.
 * Reason: The SDK's Connection class wraps stdin/stdout differently from our
 *         ChildProcess-based JsonRpcClient. Our jsonrpc.ts is already hardened,
 *         supports server-initiated requests (needed for session/request_permission),
 *         and is shared with the codex adapter.
 *
 * Key spike findings (see docs/gemini-spike.md):
 *   a) session/request_permission = server-initiated request → permissions: "callback"
 *   b) agent_thought_chunk streams → thinkingStream: true
 *   c) No session/load or session/resume in 0.24.4 → resume: false
 *   d) No usage_update notifications → usage events omitted
 *
 * Process lifecycle: one `gemini --experimental-acp` process per GeminiSession lifetime.
 * The session/new ACP session persists inside that process for multi-turn conversation.
 * On cancel(), session/cancel notification is sent then the process is killed.
 */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { GatewayEvent, PermissionDecision } from "../events.js";
import type {
  AgentBackend,
  AgentSession,
  Capabilities,
  DetectResult,
  SessionOptions,
  UserInput,
} from "../types.js";
import { JsonRpcClient } from "./jsonrpc.js";
import {
  agentMessageChunkToEvent,
  agentThoughtChunkToEvent,
  toolCallToStartEvent,
  toolCallUpdateToEvents,
  permissionRequestToEvent,
  stopReasonToDoneReason,
  toAcpOutcome,
  autoAcceptOutcome,
  type AcpSessionUpdate,
  type AcpPermissionRequestParams,
  type AcpToolCallUpdate,
} from "./gemini-translate.js";

// ── EventChannel (same pattern as claude/codex adapters) ─────────────────────

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

  async *iter(): AsyncIterable<GatewayEvent> {
    while (true) {
      while (this._queue.length === 0) {
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

// ── GeminiSession ─────────────────────────────────────────────────────────────

export class GeminiSession implements AgentSession {
  readonly id: string;
  private _opts: SessionOptions;

  /** ACP sessionId returned by session/new, populated after first send */
  private _acpSessionId: string | undefined;

  private _model: string | undefined;
  private _cancelled = false;

  /** Pending permission requests: requestId → { serverReqId, options, resolve } */
  private _pendingPermissions = new Map<
    string,
    {
      serverReqId: string | number;
      options: AcpPermissionRequestParams["options"];
      toolName: string;
      resolve: (decision: PermissionDecision) => void;
    }
  >();

  /** Tools the user has allowed for the duration of this session (allow-session) */
  private _sessionAllowedTools = new Set<string>();

  private _rpc: JsonRpcClient | null = null;

  // Injected for testing
  private _spawnFn: typeof spawnGeminiAcp;

  constructor(
    id: string,
    opts: SessionOptions,
    spawnFn: typeof spawnGeminiAcp = spawnGeminiAcp
  ) {
    this.id = id;
    this._opts = opts;
    this._model = opts.model;
    this._spawnFn = spawnFn;
  }

  get backendSessionId(): string | undefined {
    return this._acpSessionId;
  }

  respondToPermission(requestId: string, decision: PermissionDecision): void {
    const pending = this._pendingPermissions.get(requestId);
    if (!pending) return; // unknown / stale id — silent no-op
    this._pendingPermissions.delete(requestId);

    if (decision === "allow-session") {
      this._sessionAllowedTools.add(pending.toolName);
    }
    pending.resolve(decision);
  }

  async cancel(): Promise<void> {
    this._cancelled = true;

    // Settle all pending permission promises (cancel = deny) and send cancel response
    for (const [, perm] of this._pendingPermissions) {
      perm.resolve("deny");
      if (this._rpc && !this._rpc.isClosed) {
        this._rpc.respond(perm.serverReqId, {
          outcome: { outcome: "cancelled" },
        });
      }
    }
    this._pendingPermissions.clear();

    // Send session/cancel notification to the agent (best-effort)
    if (this._rpc && !this._rpc.isClosed && this._acpSessionId) {
      this._rpc.notify("session/cancel", { sessionId: this._acpSessionId });
    }

    // Kill process — the channel end is handled in _runTurn's finally block
    if (this._rpc && !this._rpc.isClosed) {
      this._rpc.kill("SIGTERM");
    }
  }

  async *send(input: UserInput): AsyncIterable<GatewayEvent> {
    // Reset cancellation state for the new turn
    this._cancelled = false;
    this._pendingPermissions.clear();

    const channel = new EventChannel();
    const runTurn = this._runTurn(input, channel);

    for await (const evt of channel.iter()) {
      yield evt;
    }

    await runTurn;
  }

  private async _runTurn(input: UserInput, channel: EventChannel): Promise<void> {
    let rpc: JsonRpcClient | null = null;
    let donePushed = false;

    try {
      // Spawn a fresh gemini process for this session (one process per GeminiSession lifetime)
      // If we already have a live rpc (multi-turn within same session), reuse it.
      // But gemini ACP keeps the session alive inside the process, so we keep one process.
      // Per the codex pattern each _runTurn spawns a new process. For Gemini, the ACP
      // session is process-scoped: session/new creates a session, and subsequent session/prompt
      // calls on the same sessionId continue the conversation. We therefore keep one process
      // and one rpc for the session's lifetime, spawning only on the first turn.
      if (!this._rpc || this._rpc.isClosed) {
        rpc = this._spawnFn(this._opts.cwd, this._model);
        this._rpc = rpc;
        this._acpSessionId = undefined; // reset so we create a new ACP session
      } else {
        rpc = this._rpc;
      }

      // Register handlers (safe to re-register — last one wins in JsonRpcClient)
      rpc.onNotification((method, params) => {
        this._handleNotification(method, params, channel);
      });

      rpc.onServerRequest(async (method, params, serverReqId) => {
        return this._handleServerRequest(method, params, serverReqId, channel);
      });

      // Initialize + create ACP session if not done yet
      if (!this._acpSessionId) {
        // Step 1: initialize
        const initResult = await rpc.request<{
          protocolVersion: number;
          agentCapabilities?: Record<string, unknown>;
        }>("initialize", {
          protocolVersion: 1,
          clientInfo: { name: "navi-gateway", version: "0.1.0" },
          clientCapabilities: {},
        });

        // Step 2: create session
        const sessionResult = await rpc.request<{ sessionId: string }>(
          "session/new",
          {
            cwd: this._opts.cwd,
            mcpServers: [],
          }
        );

        this._acpSessionId = sessionResult.sessionId;

        // Emit session-meta
        channel.push({
          type: "session-meta",
          sessionId: this.id,
          backendSessionId: this._acpSessionId,
          model: this._model,
          cwd: this._opts.cwd,
        });

        // Suppress unused variable warning
        void initResult;
      }

      // Step 3: send prompt — this resolves when the turn completes
      const promptResult = await rpc.request<{ stopReason: string }>(
        "session/prompt",
        {
          sessionId: this._acpSessionId,
          prompt: [{ type: "text", text: input.text }],
        }
      );

      donePushed = true;
      const reason = stopReasonToDoneReason(promptResult.stopReason);

      if (reason === "cancelled") {
        channel.push({ type: "done", sessionId: this.id, reason: "cancelled" });
      } else if (reason === "error") {
        channel.push({ type: "error", sessionId: this.id, message: `Turn stopped: ${promptResult.stopReason}` });
        channel.push({ type: "done", sessionId: this.id, reason: "error" });
      } else {
        channel.push({ type: "done", sessionId: this.id, reason: "complete" });
      }
    } catch (err) {
      if (!donePushed) {
        if (this._cancelled) {
          channel.push({ type: "done", sessionId: this.id, reason: "cancelled" });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          channel.push({ type: "error", sessionId: this.id, message, fatal: true });
          channel.push({ type: "done", sessionId: this.id, reason: "error" });
        }
      }
    } finally {
      channel.end();
      // Note: we do NOT kill the rpc here for multi-turn support.
      // The process is killed in cancel() or when the GeminiSession is garbage collected.
      // For error/cancelled cases, the process should also be killed.
      if (this._cancelled || !this._acpSessionId) {
        rpc?.kill("SIGTERM");
        this._rpc = null;
      }
    }
  }

  private _handleNotification(method: string, params: unknown, channel: EventChannel): void {
    if (method !== "session/update") return;

    const p = params as { sessionId?: string; update?: AcpSessionUpdate };
    const update = p.update;
    if (!update || typeof update !== "object") return;

    const sessionUpdate = (update as AcpSessionUpdate).sessionUpdate;

    switch (sessionUpdate) {
      case "agent_message_chunk": {
        const evt = agentMessageChunkToEvent(
          update as { content: { type: string; text: string } },
          this.id
        );
        if (evt) channel.push(evt);
        break;
      }

      case "agent_thought_chunk": {
        const evt = agentThoughtChunkToEvent(
          update as { content: { type: string; text: string } },
          this.id
        );
        if (evt) channel.push(evt);
        break;
      }

      case "tool_call": {
        const u = update as AcpSessionUpdate & { sessionUpdate: "tool_call" };
        const evt = toolCallToStartEvent(u, this.id);
        channel.push(evt);
        break;
      }

      case "tool_call_update": {
        const u = update as AcpToolCallUpdate & { sessionUpdate: "tool_call_update" };
        const evts = toolCallUpdateToEvents(u, this.id);
        for (const evt of evts) channel.push(evt);
        break;
      }

      default:
        // plan, plan_update, usage_update, current_mode_update etc. — ignored
        break;
    }
  }

  private async _handleServerRequest(
    method: string,
    params: unknown,
    serverReqId: string | number,
    channel: EventChannel
  ): Promise<unknown> {
    if (method === "session/request_permission") {
      const p = params as AcpPermissionRequestParams;
      const toolName = p.toolCall.title ?? p.toolCall.toolCallId;

      // permissionMode: acceptAll → auto-accept with allow_always option
      if (this._opts.permissionMode === "acceptAll") {
        return { outcome: autoAcceptOutcome(p.options) };
      }

      // permissionMode: readOnly → always deny
      if (this._opts.permissionMode === "readOnly") {
        return { outcome: { outcome: "cancelled" } };
      }

      // Short-circuit: session-allowed tool
      if (this._sessionAllowedTools.has(toolName)) {
        const allowOpt = p.options.find((o) => o.kind === "allow_always" || o.kind === "allow_once");
        const optionId = allowOpt?.optionId ?? "proceed_once";
        return { outcome: { outcome: "selected", optionId } };
      }

      // permissionMode: acceptEdits → auto-accept file-related tools
      if (this._opts.permissionMode === "acceptEdits") {
        const kind = p.toolCall.kind ?? "";
        if (kind === "file" || kind === "edit") {
          const opt = p.options.find((o) => o.kind === "allow_once") ?? p.options[0];
          if (opt) return { outcome: { outcome: "selected", optionId: opt.optionId } };
        }
        // Non-file tools fall through to prompt
      }

      // Surface the permission request to the gateway consumer
      const requestId = randomUUID();
      const evt = permissionRequestToEvent(p, requestId, this.id);
      channel.push(evt);

      const decision = await new Promise<PermissionDecision>((resolve) => {
        this._pendingPermissions.set(requestId, {
          serverReqId,
          options: p.options,
          toolName,
          resolve,
        });
      });

      return { outcome: toAcpOutcome(decision, p.options) };
    }

    // Unknown server request
    throw new Error(`Unhandled server request method: ${method}`);
  }
}

// ── Process spawner ───────────────────────────────────────────────────────────

/**
 * Spawn `gemini --experimental-acp` and wrap it in a JsonRpcClient.
 * Exported for testing (can be replaced with a fake).
 *
 * Passes `-m <model>` to override any stale default model in ~/.gemini/settings.json.
 * Default model: gemini-2.5-flash (confirmed working in spike).
 */
export function spawnGeminiAcp(cwd: string, model?: string): JsonRpcClient {
  const resolvedModel = model ?? "gemini-2.5-flash";
  const proc = spawn(
    "gemini",
    ["--experimental-acp", "-m", resolvedModel],
    {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    }
  );
  return new JsonRpcClient(proc);
}

// ── GeminiBackend ─────────────────────────────────────────────────────────────

export class GeminiBackend implements AgentBackend {
  readonly id = "gemini" as const;

  capabilities(): Capabilities {
    return {
      streaming: true,
      // agent_thought_chunk notifications confirmed in spike (gemini-2.5-flash)
      thinkingStream: true,
      // session/request_permission is a server-initiated request → full callback round-trip
      permissions: "callback",
      // session/load and session/resume both return -32601 in 0.24.4
      resume: false,
      // ACP supports mcpServers in session/new — pass-through possible
      mcp: true,
      // Gemini CLI has injected tools (write_file, read_file, shell, etc.)
      skills: "injected",
      models: [
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", default: true },
        { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro" },
      ],
    };
  }

  async detect(): Promise<DetectResult> {
    try {
      const versionProc = Bun.spawn(["gemini", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const versionText = await new Response(versionProc.stdout).text();
      await versionProc.exited;

      if (versionProc.exitCode !== 0) {
        return {
          installed: false,
          authed: false,
          fixHint: "gemini CLI not working; run `gemini --version` to diagnose",
        };
      }

      const version = versionText.trim().split("\n")[0] ?? versionText.trim();

      // Check auth by attempting a minimal ACP init (fast, no model needed)
      // We probe by checking if google_accounts.json exists (OAuth) or GEMINI_API_KEY is set
      let authed = false;
      try {
        const { existsSync } = await import("node:fs");
        const { homedir } = await import("node:os");
        const accountsFile = `${homedir()}/.gemini/google_accounts.json`;
        authed = existsSync(accountsFile) || !!process.env["GEMINI_API_KEY"];
      } catch {
        authed = false;
      }

      return { installed: true, authed, version };
    } catch {
      return {
        installed: false,
        authed: false,
        fixHint: "gemini CLI not found; install from https://github.com/google-gemini/gemini-cli",
      };
    }
  }

  createSession(opts: SessionOptions): AgentSession {
    return new GeminiSession(randomUUID(), opts);
  }

  resumeSession(_backendSessionId: string, opts: SessionOptions): AgentSession {
    // resume: false — session/load and session/resume not supported in 0.24.4.
    // Create a new session; conversation history is NOT restored.
    // This is documented in capabilities().resume = false.
    return new GeminiSession(randomUUID(), opts);
  }
}
