/**
 * Codex adapter — drives `codex app-server` via JSON-RPC over stdio.
 *
 * Decision: JSON-RPC over stdio, NOT the @openai/codex-sdk.
 * Reason: The SDK (v0.139.0) exposes no approval callback mechanism.
 *         The app-server protocol has `item/commandExecution/requestApproval`
 *         and `item/fileChange/requestApproval` server-initiated requests that
 *         support the full interactive permission round-trip.
 * See: docs/codex-decision.md for full evidence.
 *
 * IMPORTANT: No --yolo / never-ask / bypass flags are used by default.
 *            Only `permissionMode: "acceptAll"` maps to `approvalPolicy: "never"`,
 *            and that is an explicit user opt-in.
 */

import { randomUUID } from "crypto";
import { spawn } from "child_process";
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
  toCodexDecision,
  itemStartedToEvents,
  itemCompletedToEvents,
  tokenUsageToEvent,
  commandApprovalToEvent,
  fileChangeApprovalToEvent,
  type CommandApprovalParams,
  type FileChangeApprovalParams,
  type CodexThreadItem,
  type TokenUsage,
} from "./codex-translate.js";

// ── EventChannel (same pattern as claude.ts) ──────────────────────────────────

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

// ── Permission mode → codex policy ───────────────────────────────────────────

type ApprovalPolicy = "on-request" | "never" | "on-failure" | "untrusted";
type SandboxMode = "workspace-write" | "read-only" | "danger-full-access";

function mapPermissionMode(mode: SessionOptions["permissionMode"]): {
  approvalPolicy: ApprovalPolicy;
  sandboxMode: SandboxMode;
} {
  switch (mode) {
    case "prompt":
      // "untrusted" asks for approval on any action not in an explicit trust list,
      // which is the only policy that reliably surfaces interactive approval callbacks
      // in codex 0.128.0+. "on-request" was found to never fire requestApproval in
      // live testing — the model only asks when it wants escalation under that policy.
      return { approvalPolicy: "untrusted", sandboxMode: "workspace-write" };
    case "acceptEdits":
      // File changes auto-approved at gateway layer; commands still surfaced
      return { approvalPolicy: "on-request", sandboxMode: "workspace-write" };
    case "acceptAll":
      // Explicit user opt-in to never-ask. NOT the default.
      return { approvalPolicy: "never", sandboxMode: "danger-full-access" };
    case "readOnly":
      return { approvalPolicy: "on-request", sandboxMode: "read-only" };
  }
}

// ── CodexSession ──────────────────────────────────────────────────────────────

export class CodexSession implements AgentSession {
  readonly id: string;
  private _opts: SessionOptions;
  private _resumeId: string | undefined;
  private _backendSessionId: string | undefined;
  /** undefined means "use server default" — do not pass model to thread/start */
  private _model: string | undefined;
  private _cancelled = false;

  /** pending permission requests: requestId → { resolve, isFileChange } */
  private _pendingPermissions = new Map<
    string,
    {
      serverReqId: string | number;
      isFileChange: boolean;
      toolName: string;
      resolve: (decision: PermissionDecision) => void;
    }
  >();

  /** tools the user has allowed for the duration of this session */
  private _sessionAllowedTools = new Set<string>();

  private _currentChannel: EventChannel | null = null;
  private _currentTurnId: string | null = null;
  private _rpc: JsonRpcClient | null = null;

  // Injected for testing
  private _spawnFn: typeof spawnAppServer;

  constructor(
    id: string,
    opts: SessionOptions,
    resumeId: string | undefined,
    spawnFn: typeof spawnAppServer = spawnAppServer
  ) {
    this.id = id;
    this._opts = opts;
    this._resumeId = resumeId;
    this._model = opts.model; // undefined = let server use its configured default
    this._spawnFn = spawnFn;
  }

  get backendSessionId(): string | undefined {
    return this._backendSessionId;
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

    // Reject all pending permissions (server will get an error response)
    for (const [, perm] of this._pendingPermissions) {
      // Send "cancel" decision to codex so it doesn't hang
      if (this._rpc && !this._rpc.isClosed) {
        const codexDecision = perm.isFileChange
          ? { decision: "cancel" }
          : { decision: "cancel" };
        this._rpc.respond(perm.serverReqId, codexDecision);
      }
    }
    this._pendingPermissions.clear();

    // Interrupt current turn
    if (this._rpc && !this._rpc.isClosed && this._currentTurnId && this._backendSessionId) {
      try {
        await this._rpc.request("turn/interrupt", {
          threadId: this._backendSessionId,
          turnId: this._currentTurnId,
        });
      } catch {
        // Ignore: turn may have already completed
      }
    }

    // Kill the process; the channel end is handled in _runTurn's finally block
    if (this._rpc && !this._rpc.isClosed) {
      this._rpc.kill("SIGTERM");
    }
  }

  async *send(input: UserInput): AsyncIterable<GatewayEvent> {
    // Reset cancellation state for the new turn
    this._cancelled = false;
    this._pendingPermissions.clear();

    const channel = new EventChannel();
    this._currentChannel = channel;

    const runTurn = this._runTurn(input, channel);

    // Drain events while turn runs
    for await (const evt of channel.iter()) {
      yield evt;
    }

    await runTurn;
    this._currentChannel = null;
  }

  private async _runTurn(input: UserInput, channel: EventChannel): Promise<void> {
    let rpc: JsonRpcClient | null = null;

    try {
      // Spawn a fresh app-server process for this turn
      rpc = this._spawnFn(this._opts.cwd);
      this._rpc = rpc;
      const { approvalPolicy, sandboxMode } = mapPermissionMode(this._opts.permissionMode);

      // Register notification handler
      rpc.onNotification((method, params) => {
        this._handleNotification(method, params, channel);
      });

      // Register server-request handler (approval callbacks)
      rpc.onServerRequest(async (method, params, serverReqId) => {
        return this._handleServerRequest(method, params, serverReqId, channel);
      });

      // Initialize: send the initialize request AND the required "initialized" notification
      // atomically in the same write. The app-server closes stdout if "initialized" is not
      // received promptly (before the microtask for the request promise resolves).
      // Using requestWithNotification sends both lines in a single stdin.write() call.
      await rpc.requestWithNotification(
        "initialize",
        {
          clientInfo: { name: "navi-gateway", title: "Navi Agent Gateway", version: "0.1.0" },
          capabilities: null,
        },
        "initialized"
      );

      let threadId: string;

      if (this._resumeId) {
        // Resume existing thread
        const resp = await rpc.request<{ thread: { id: string }; model: string }>(
          "thread/resume",
          {
            threadId: this._resumeId,
            model: this._model || undefined,
            cwd: this._opts.cwd,
            approvalPolicy,
            sandbox: sandboxMode,
          }
        );
        threadId = resp.thread.id;
        this._backendSessionId = threadId;
        this._model = resp.model ?? this._model;
        channel.push({
          type: "session-meta",
          sessionId: this.id,
          backendSessionId: threadId,
          model: this._model,
          cwd: this._opts.cwd,
        });
      } else if (this._backendSessionId) {
        // Already have a threadId from a previous turn — resume it on the new process
        const resp = await rpc.request<{ thread: { id: string }; model: string }>(
          "thread/resume",
          {
            threadId: this._backendSessionId,
            model: this._model || undefined,
            cwd: this._opts.cwd,
            approvalPolicy,
            sandbox: sandboxMode,
          }
        );
        threadId = resp.thread.id;
        this._model = resp.model ?? this._model;
      } else {
        // Start new thread
        const resp = await rpc.request<{ thread: { id: string }; model: string }>(
          "thread/start",
          {
            model: this._model || undefined,
            cwd: this._opts.cwd,
            approvalPolicy,
            sandbox: sandboxMode,
            developerInstructions: this._opts.systemContext,
          }
        );
        threadId = resp.thread.id;
        this._backendSessionId = threadId;
        this._model = resp.model ?? this._model;
        channel.push({
          type: "session-meta",
          sessionId: this.id,
          backendSessionId: threadId,
          model: this._model,
          cwd: this._opts.cwd,
        });
      }

      // Start the turn
      const turnResp = await rpc.request<{ turn: { id: string } }>("turn/start", {
        threadId,
        input: [{ type: "text", text: input.text, text_elements: [] }],
        approvalPolicy,
      });
      this._currentTurnId = turnResp.turn.id;

      // Wait for turn completion (driven by notifications via the channel)
      await rpc.waitClosed();
    } catch (err) {
      if (this._cancelled) {
        channel.push({ type: "done", sessionId: this.id, reason: "cancelled" });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        channel.push({ type: "error", sessionId: this.id, message, fatal: true });
        channel.push({ type: "done", sessionId: this.id, reason: "error" });
      }
    } finally {
      this._currentTurnId = null;
      this._rpc = null;
      rpc?.kill("SIGTERM");
      channel.end();
    }
  }

  private _handleNotification(method: string, params: unknown, channel: EventChannel): void {
    const p = params as Record<string, unknown>;

    switch (method) {
      case "item/agentMessage/delta": {
        const delta = p.delta as string;
        if (typeof delta === "string") {
          channel.push({ type: "text-delta", sessionId: this.id, text: delta });
        }
        break;
      }

      case "item/reasoning/textDelta":
      case "item/reasoning/summaryTextDelta": {
        const delta = p.delta as string;
        if (typeof delta === "string") {
          channel.push({ type: "thinking-delta", sessionId: this.id, text: delta });
        }
        break;
      }

      case "item/commandExecution/outputDelta": {
        const toolId = p.itemId as string;
        const delta = p.delta as string;
        if (toolId && typeof delta === "string") {
          channel.push({ type: "tool-output", sessionId: this.id, toolId, chunk: delta });
        }
        break;
      }

      case "item/started": {
        const item = p.item as CodexThreadItem;
        if (item) {
          const events = itemStartedToEvents(item, this.id);
          for (const evt of events) channel.push(evt);
        }
        break;
      }

      case "item/completed": {
        const item = p.item as CodexThreadItem;
        if (item) {
          const events = itemCompletedToEvents(item, this.id);
          for (const evt of events) channel.push(evt);
        }
        break;
      }

      case "thread/tokenUsage/updated": {
        const usage = p.tokenUsage as TokenUsage;
        if (usage) {
          const evt = tokenUsageToEvent(usage, this._model, this.id);
          channel.push(evt);
        }
        break;
      }

      case "turn/completed": {
        const turn = (p.turn as Record<string, unknown>) ?? {};
        const status = turn.status as string;
        if (status === "completed") {
          channel.push({ type: "done", sessionId: this.id, reason: "complete" });
        } else if (status === "interrupted") {
          // If interrupted but not explicitly cancelled, treat as cancelled
          channel.push({ type: "done", sessionId: this.id, reason: "cancelled" });
        } else if (status === "failed") {
          const turnError = turn.error as { message?: string } | null;
          const msg = turnError?.message ?? "Turn failed";
          channel.push({ type: "error", sessionId: this.id, message: msg });
          channel.push({ type: "done", sessionId: this.id, reason: "error" });
        }
        // Kill after emitting done so the channel can drain
        this._rpc?.kill("SIGTERM");
        break;
      }

      case "error": {
        const msg = (p as { message?: string }).message ?? "Unknown error";
        channel.push({ type: "error", sessionId: this.id, message: msg });
        break;
      }

      default:
        // All other notifications (turn/started, thread/started, etc.) ignored
        break;
    }
  }

  private async _handleServerRequest(
    method: string,
    params: unknown,
    serverReqId: string | number,
    channel: EventChannel
  ): Promise<unknown> {
    const p = params as Record<string, unknown>;

    if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
      const approvalParams: CommandApprovalParams = {
        threadId: p.threadId as string ?? (p.conversationId as string),
        turnId: p.turnId as string ?? (p.callId as string),
        itemId: p.itemId as string ?? (p.callId as string),
        approvalId: (p.approvalId as string) ?? null,
        command: (p.command as string) ?? (Array.isArray(p.command) ? (p.command as string[]).join(" ") : null),
        cwd: (p.cwd as string) ?? null,
        reason: (p.reason as string) ?? null,
      };

      const toolName = "commandExecution";

      // Short-circuit: already allowed for session
      if (this._sessionAllowedTools.has(toolName)) {
        return { decision: "accept" };
      }

      // Check acceptEdits mode: file changes only, not commands — leave this surfaced
      // Check acceptAll mode: if approvalPolicy is "never" the server won't ask, but
      // just in case, auto-accept
      if (this._opts.permissionMode === "acceptAll") {
        return { decision: "accept" };
      }

      const requestId = randomUUID();
      const evt = commandApprovalToEvent(approvalParams, requestId, this.id);
      channel.push(evt);

      const decision = await new Promise<PermissionDecision>((resolve) => {
        this._pendingPermissions.set(requestId, {
          serverReqId,
          isFileChange: false,
          toolName,
          resolve,
        });
      });

      return { decision: toCodexDecision(decision) };
    }

    if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
      const approvalParams: FileChangeApprovalParams = {
        threadId: p.threadId as string ?? (p.conversationId as string),
        turnId: p.turnId as string ?? (p.callId as string),
        itemId: p.itemId as string ?? (p.callId as string),
        reason: (p.reason as string) ?? null,
        grantRoot: (p.grantRoot as string) ?? null,
      };

      const toolName = "fileChange";

      // Short-circuit: session-allowed or acceptEdits mode
      if (
        this._sessionAllowedTools.has(toolName) ||
        this._opts.permissionMode === "acceptEdits" ||
        this._opts.permissionMode === "acceptAll"
      ) {
        return { decision: "accept" };
      }

      const requestId = randomUUID();
      const evt = fileChangeApprovalToEvent(approvalParams, requestId, this.id);
      channel.push(evt);

      const decision = await new Promise<PermissionDecision>((resolve) => {
        this._pendingPermissions.set(requestId, {
          serverReqId,
          isFileChange: true,
          toolName,
          resolve,
        });
      });

      return { decision: toCodexDecision(decision) };
    }

    if (method === "item/permissions/requestApproval") {
      // Generic permissions request: surface as permission-request
      const toolName = "permissions";
      const requestId = randomUUID();
      const reason = (p.reason as string) ?? "Codex is requesting additional permissions";
      channel.push({
        type: "permission-request",
        sessionId: this.id,
        requestId,
        tool: toolName,
        description: reason,
        input: params,
        options: ["allow", "allow-session", "deny"],
      });

      const decision = await new Promise<PermissionDecision>((resolve) => {
        this._pendingPermissions.set(requestId, {
          serverReqId,
          isFileChange: false,
          toolName,
          resolve,
        });
      });

      return { decision: toCodexDecision(decision) };
    }

    // Unknown server request: respond with error
    throw new Error(`Unhandled server request method: ${method}`);
  }
}

// ── Process spawner ───────────────────────────────────────────────────────────

/**
 * Spawn a `codex app-server` process and wrap it in a JsonRpcClient.
 * Exported for testing (can be replaced with a fake).
 *
 * Passes `--config service_tier=fast` to work around the common case where
 * ~/.codex/config.toml has `service_tier = "priority"` which codex 0.128.0
 * no longer accepts. `fast` is the closest valid equivalent.
 *
 * This override only affects the app-server process, not the user's config file.
 */
export function spawnAppServer(cwd: string): JsonRpcClient {
  const proc = spawn("codex", ["app-server", "--config", "service_tier=fast"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  return new JsonRpcClient(proc);
}

// ── CodexBackend ──────────────────────────────────────────────────────────────

export class CodexBackend implements AgentBackend {
  readonly id = "codex" as const;

  capabilities(): Capabilities {
    return {
      streaming: true,
      thinkingStream: true, // item/reasoning/textDelta is real
      permissions: "callback",
      resume: true,
      mcp: true,
      skills: "injected",
      models: [
        // The actual model list depends on the user's account type (ChatGPT vs API).
        // These are the models available on ChatGPT accounts as of codex-cli 0.128.0.
        // When no model is specified in SessionOptions, the server uses its configured default.
        { id: "gpt-5.5", label: "GPT-5.5", default: true },
        { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
        { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
        { id: "o3", label: "o3" },
        { id: "o4-mini", label: "o4-mini" },
      ],
    };
  }

  async detect(): Promise<DetectResult> {
    try {
      const versionProc = Bun.spawn(["codex", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const versionText = await new Response(versionProc.stdout).text();
      await versionProc.exited;

      if (versionProc.exitCode !== 0) {
        return {
          installed: false,
          authed: false,
          fixHint: "codex CLI not working; run `codex --version` to diagnose",
        };
      }

      const version = versionText.trim().split("\n")[0] ?? versionText.trim();

      // Check auth status
      let authed = false;
      try {
        const authProc = Bun.spawn(["codex", "login", "status"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await authProc.exited;
        authed = authProc.exitCode === 0;
      } catch {
        authed = false;
      }

      return { installed: true, authed, version };
    } catch {
      return {
        installed: false,
        authed: false,
        fixHint: "codex CLI not found; install from https://github.com/openai/codex",
      };
    }
  }

  createSession(opts: SessionOptions): AgentSession {
    return new CodexSession(randomUUID(), opts, undefined);
  }

  resumeSession(backendSessionId: string, opts: SessionOptions): AgentSession {
    return new CodexSession(randomUUID(), opts, backendSessionId);
  }
}
