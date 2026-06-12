/**
 * Tests for the JSON-RPC stdio client.
 * Uses a fake child process (EventEmitter-based) instead of spawning real processes.
 */
import { describe, expect, test } from "bun:test";
import { JsonRpcClient } from "../src/adapters/jsonrpc.js";
import { EventEmitter } from "events";
import { Writable, Readable } from "stream";

// ── Fake process ──────────────────────────────────────────────────────────────

type FakeProc = {
  stdin: Writable & { lines: string[] };
  stdout: Readable & EventEmitter;
  emit: (event: string, ...args: unknown[]) => boolean;
  on: (event: string, handler: (...args: unknown[]) => void) => FakeProc;
  kill: () => void;
  _push: (line: string) => void;
  _close: () => void;
};

function makeFakeProc(): FakeProc {
  const writtenLines: string[] = [];

  // Writable stdin that collects lines
  const stdin = new Writable({
    write(chunk, _enc, cb) {
      const s = chunk.toString();
      writtenLines.push(s);
      cb();
    },
  }) as Writable & { lines: string[] };
  stdin.lines = writtenLines;

  // Readable stdout we can push data into
  const stdout = new Readable({ read() {} }) as Readable & EventEmitter;

  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  const proc: FakeProc = {
    stdin,
    stdout,
    emit(event: string, ...args: unknown[]): boolean {
      (handlers[event] ?? []).forEach((h) => h(...args));
      return true;
    },
    on(event: string, handler: (...args: unknown[]) => void): FakeProc {
      if (!handlers[event]) handlers[event] = [];
      handlers[event]!.push(handler);
      return proc;
    },
    kill() {
      proc._close();
    },
    _push(line: string) {
      stdout.push(line + "\n");
    },
    _close() {
      stdout.push(null); // EOF
      proc.emit("close");
    },
  };

  return proc;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWrittenObjects(proc: FakeProc): unknown[] {
  return proc.stdin.lines
    .join("")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("JsonRpcClient", () => {
  test("sends a request with correct jsonrpc fields and resolves on response", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    const reqPromise = client.request<{ pong: true }>("ping", { value: 1 });

    // Let the event loop tick so the request is written
    await new Promise((r) => setTimeout(r, 0));

    // Parse what was written to stdin
    const written = getWrittenObjects(proc);
    expect(written.length).toBeGreaterThanOrEqual(1);

    const req = written[0] as { jsonrpc: string; id: number; method: string; params: unknown };
    expect(req.jsonrpc).toBe("2.0");
    expect(req.method).toBe("ping");
    expect(req.id).toBeTypeOf("number");
    expect((req.params as { value: number }).value).toBe(1);

    // Send a response from the server
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { pong: true } }));

    const result = await reqPromise;
    expect(result).toEqual({ pong: true });
  });

  test("rejects request on JSON-RPC error response", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    const reqPromise = client.request("doSomething");
    await new Promise((r) => setTimeout(r, 0));

    const written = getWrittenObjects(proc);
    const req = written[0] as { id: number };

    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: "Method not found" },
      })
    );

    await expect(reqPromise).rejects.toThrow("Method not found");
  });

  test("routes server-initiated requests to onServerRequest handler", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    let capturedMethod: string | undefined;
    let capturedParams: unknown;

    client.onServerRequest(async (method, params, _id) => {
      capturedMethod = method;
      capturedParams = params;
      return { decision: "accept" };
    });

    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "server-req-1",
        method: "item/commandExecution/requestApproval",
        params: { command: "ls", threadId: "t1", turnId: "turn1", itemId: "item1", startedAtMs: 0 },
      })
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(capturedMethod).toBe("item/commandExecution/requestApproval");
    expect((capturedParams as { command: string }).command).toBe("ls");

    // Client should have sent a response back
    const written = getWrittenObjects(proc);
    const resp = written.find(
      (o) => (o as { id?: unknown }).id === "server-req-1"
    ) as { result: unknown } | undefined;
    expect(resp).toBeDefined();
    expect((resp!.result as { decision: string }).decision).toBe("accept");
  });

  test("routes notifications to onNotification handler (no response sent)", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    let capturedMethod: string | undefined;
    let capturedParams: unknown;

    client.onNotification((method, params) => {
      capturedMethod = method;
      capturedParams = params;
    });

    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "item/agentMessage/delta",
        params: { delta: "hello", threadId: "t1", turnId: "turn1", itemId: "item1" },
      })
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(capturedMethod).toBe("item/agentMessage/delta");
    expect((capturedParams as { delta: string }).delta).toBe("hello");

    // No response should have been sent
    const written = getWrittenObjects(proc);
    expect(written.length).toBe(0);
  });

  test("rejects all pending requests when process closes", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    const reqPromise = client.request("slowOp");
    await new Promise((r) => setTimeout(r, 0));

    // Close the process
    proc._close();

    await expect(reqPromise).rejects.toThrow();
  });

  test("handles multiple concurrent requests with correct correlation", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    const p1 = client.request<string>("method1");
    const p2 = client.request<string>("method2");
    const p3 = client.request<string>("method3");

    await new Promise((r) => setTimeout(r, 0));

    const written = getWrittenObjects(proc) as Array<{ id: number; method: string }>;
    expect(written.length).toBe(3);

    const ids = written.map((w) => w.id);
    // Respond out of order
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: ids[2], result: "three" }));
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: ids[0], result: "one" }));
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: ids[1], result: "two" }));

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe("one");
    expect(r2).toBe("two");
    expect(r3).toBe("three");
  });

  test("handles malformed JSON lines without crashing", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    // Push non-JSON line
    proc._push("not json at all");
    proc._push("{ broken json");

    await new Promise((r) => setTimeout(r, 10));

    // Client is still alive; make a normal request
    const reqPromise = client.request<string>("hello");
    await new Promise((r) => setTimeout(r, 0));

    const written = getWrittenObjects(proc).filter(
      (o) => (o as { method?: string }).method === "hello"
    ) as Array<{ id: number }>;
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: written[0]!.id, result: "world" }));

    const result = await reqPromise;
    expect(result).toBe("world");
  });

  test("isClosed returns false initially and true after process closes", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    expect(client.isClosed).toBe(false);
    proc._close();
    await new Promise((r) => setTimeout(r, 10));
    expect(client.isClosed).toBe(true);
  });

  test("respond() sends a response with the given id and result", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    client.respond("srv-req-42", { decision: "accept" });

    await new Promise((r) => setTimeout(r, 0));
    const written = getWrittenObjects(proc) as Array<{ id: unknown; result: unknown }>;
    expect(written.length).toBe(1);
    expect(written[0]!.id).toBe("srv-req-42");
    expect((written[0]!.result as { decision: string }).decision).toBe("accept");
  });

  test("proc 'error' event: in-flight request rejects AND subsequent request() rejects immediately", async () => {
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    // Send a request that will never get a response
    const inflight = client.request("hanging");
    await new Promise((r) => setTimeout(r, 0));

    // Emit an "error" event as if the spawn failed
    const spawnError = new Error("spawn ENOENT");
    proc.emit("error", spawnError);

    // The in-flight request should reject
    await expect(inflight).rejects.toThrow();

    // After the error, the client must be marked closed
    // so a subsequent request() rejects immediately rather than hanging
    const afterError = client.request("another");
    await expect(afterError).rejects.toThrow();
  });

  test("accepts non-conformant responses without jsonrpc field (codex app-server protocol)", async () => {
    // codex app-server omits "jsonrpc":"2.0" from all its responses and notifications.
    // The client must accept these rather than silently dropping them.
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);

    let notifMethod: string | undefined;
    client.onNotification((method) => { notifMethod = method; });

    const reqPromise = client.request<{ pong: true }>("ping");
    await new Promise((r) => setTimeout(r, 0));

    const written = getWrittenObjects(proc) as Array<{ id: number }>;
    const id = written[0]!.id;

    // Server responds WITHOUT "jsonrpc":"2.0"
    proc._push(JSON.stringify({ id, result: { pong: true } }));
    // Server sends a notification WITHOUT "jsonrpc":"2.0"
    proc._push(JSON.stringify({ method: "server/event", params: { x: 1 } }));

    const result = await reqPromise;
    expect(result).toEqual({ pong: true });

    await new Promise((r) => setTimeout(r, 10));
    expect(notifMethod).toBe("server/event");
  });
});
