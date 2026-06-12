/**
 * jsonrpc.ts — reusable stdio JSON-RPC 2.0 client with JSONL framing.
 *
 * Supports:
 * - Client-initiated requests (with response correlation)
 * - Server-initiated requests (callbacks routed to registered handlers)
 * - Server notifications (no id, no response expected)
 *
 * Framing: each JSON-RPC message is one UTF-8 line terminated by \n.
 */

import { randomUUID } from "crypto";
import type { ChildProcess } from "child_process";

// ── JSON-RPC 2.0 wire types ───────────────────────────────────────────────────

export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  // NOTE: no id field
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

export type JsonRpcIncoming = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// ── Handler types ─────────────────────────────────────────────────────────────

/** Called for server-initiated requests. Return value is sent back as the result. */
export type ServerRequestHandler = (
  method: string,
  params: unknown,
  id: JsonRpcId
) => Promise<unknown>;

/** Called for server notifications (fire-and-forget from server). */
export type NotificationHandler = (method: string, params: unknown) => void;

// ── JsonRpcClient ─────────────────────────────────────────────────────────────

export class JsonRpcClient {
  private _proc: ChildProcess;
  private _nextId = 1;
  private _pending = new Map<JsonRpcId, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private _serverRequestHandler: ServerRequestHandler | null = null;
  private _notificationHandler: NotificationHandler | null = null;
  private _lineBuffer = "";
  private _closed = false;
  private _closeWaiters: Array<() => void> = [];

  constructor(proc: ChildProcess) {
    this._proc = proc;

    proc.stdout!.on("data", (chunk: Buffer | string) => {
      this._lineBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      // Process all complete lines
      let nl: number;
      while ((nl = this._lineBuffer.indexOf("\n")) !== -1) {
        const line = this._lineBuffer.slice(0, nl).trim();
        this._lineBuffer = this._lineBuffer.slice(nl + 1);
        if (line.length > 0) {
          this._handleLine(line);
        }
      }
    });

    proc.stdout!.on("end", () => {
      this._onClose();
    });

    proc.on("close", () => {
      this._onClose();
    });

    proc.on("error", (err) => {
      this._rejectAll(err);
    });
  }

  private _onClose(): void {
    if (this._closed) return;
    this._closed = true;
    this._rejectAll(new Error("JSON-RPC client: process closed"));
    for (const w of this._closeWaiters) w();
    this._closeWaiters = [];
  }

  private _rejectAll(err: Error): void {
    for (const { reject } of this._pending.values()) {
      reject(err);
    }
    this._pending.clear();
  }

  private _handleLine(line: string): void {
    let msg: JsonRpcIncoming;
    try {
      msg = JSON.parse(line) as JsonRpcIncoming;
    } catch {
      // Ignore non-JSON lines (startup messages, etc.)
      return;
    }

    // Accept both conformant {"jsonrpc":"2.0",...} messages and non-conformant ones
    // (codex app-server omits the "jsonrpc" field from its responses and notifications).
    if (!msg || typeof msg !== "object") return;
    const jsonrpcField = (msg as { jsonrpc?: unknown }).jsonrpc;
    if (jsonrpcField !== undefined && jsonrpcField !== "2.0") return;

    const hasId = "id" in msg && msg.id !== undefined && msg.id !== null;
    const hasMethod = "method" in msg && typeof (msg as { method?: unknown }).method === "string";
    const hasResult = "result" in msg;
    const hasError = "error" in msg;

    if (hasId && hasMethod && !hasResult && !hasError) {
      // Server-initiated request
      this._handleServerRequest(msg as JsonRpcRequest);
    } else if (!hasId && hasMethod) {
      // Notification
      const notif = msg as JsonRpcNotification;
      this._notificationHandler?.(notif.method, notif.params);
    } else if (hasId && (hasResult || hasError)) {
      // Response to a client request
      const resp = msg as JsonRpcResponse;
      const pending = this._pending.get(resp.id);
      if (!pending) return;
      this._pending.delete(resp.id);
      if ("error" in resp) {
        pending.reject(new Error(`JSON-RPC error ${resp.error.code}: ${resp.error.message}`));
      } else {
        pending.resolve(resp.result);
      }
    }
  }

  private _handleServerRequest(req: JsonRpcRequest): void {
    if (!this._serverRequestHandler) {
      // No handler: send error response
      this._send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: "Method not found" },
      });
      return;
    }

    this._serverRequestHandler(req.method, req.params, req.id)
      .then((result) => {
        this._send({ jsonrpc: "2.0", id: req.id, result });
      })
      .catch((err: Error) => {
        this._send({
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32603, message: err.message },
        });
      });
  }

  private _send(obj: unknown): void {
    if (this._closed) return;
    try {
      this._proc.stdin!.write(JSON.stringify(obj) + "\n");
    } catch {
      // Process may have died; ignore write errors
    }
  }

  /** Send a JSON-RPC request and await the response. */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this._nextId++;
    return new Promise<T>((resolve, reject) => {
      if (this._closed) {
        reject(new Error("JSON-RPC client: closed"));
        return;
      }
      this._pending.set(id, {
        resolve: (r) => resolve(r as T),
        reject,
      });
      this._send({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Send a client notification (no id, no response expected). */
  notify(method: string, params?: unknown): void {
    this._send({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) });
  }

  /**
   * Send a JSON-RPC request and a follow-up notification in the SAME write call.
   * This is needed for the LSP-style initialize/initialized handshake where the
   * server may close the connection before a microtask resolves if the notification
   * is not sent atomically with the request.
   *
   * Returns a promise that resolves with the request's response.
   */
  requestWithNotification<T = unknown>(
    requestMethod: string,
    requestParams: unknown,
    notificationMethod: string,
    notificationParams?: unknown
  ): Promise<T> {
    const id = this._nextId++;
    const reqStr =
      JSON.stringify({ jsonrpc: "2.0", id, method: requestMethod, params: requestParams }) +
      "\n" +
      JSON.stringify({
        jsonrpc: "2.0",
        method: notificationMethod,
        ...(notificationParams !== undefined ? { params: notificationParams } : {}),
      }) +
      "\n";

    return new Promise<T>((resolve, reject) => {
      if (this._closed) {
        reject(new Error("JSON-RPC client: closed"));
        return;
      }
      this._pending.set(id, {
        resolve: (r) => resolve(r as T),
        reject,
      });
      try {
        this._proc.stdin!.write(reqStr);
      } catch {
        // Process may have died
        this._pending.delete(id);
        reject(new Error("JSON-RPC client: stdin write failed"));
      }
    });
  }

  /** Send a response to a server-initiated request (by id). */
  respond(id: JsonRpcId, result: unknown): void {
    this._send({ jsonrpc: "2.0", id, result });
  }

  /** Send an error response to a server-initiated request. */
  respondError(id: JsonRpcId, code: number, message: string): void {
    this._send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  /** Register a handler for server-initiated requests. */
  onServerRequest(handler: ServerRequestHandler): void {
    this._serverRequestHandler = handler;
  }

  /** Register a handler for server notifications. */
  onNotification(handler: NotificationHandler): void {
    this._notificationHandler = handler;
  }

  /** Wait until the underlying process closes. */
  waitClosed(): Promise<void> {
    if (this._closed) return Promise.resolve();
    return new Promise<void>((res) => this._closeWaiters.push(res));
  }

  /** Kill the underlying process. */
  kill(signal?: NodeJS.Signals): void {
    if (!this._closed) {
      try {
        this._proc.kill(signal ?? "SIGTERM");
      } catch {
        // Already gone
      }
    }
  }

  get isClosed(): boolean {
    return this._closed;
  }
}
