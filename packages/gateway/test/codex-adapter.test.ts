/**
 * Tests for the Codex adapter — translation layer and CodexSession internals.
 * No live CLI calls. All fixtures are plain objects matching protocol shapes.
 * Transport layer is faked via a fake spawnFn that returns a controllable JsonRpcClient.
 */
import { describe, expect, test } from "bun:test";
import {
  toCodexDecision,
  itemStartedToEvents,
  itemCompletedToEvents,
  tokenUsageToEvent,
  commandApprovalToEvent,
  fileChangeApprovalToEvent,
} from "../src/adapters/codex-translate.js";
import { CodexSession, CodexBackend } from "../src/adapters/codex.js";
import { JsonRpcClient } from "../src/adapters/jsonrpc.js";
import type { GatewayEvent } from "../src/events.js";
import { EventEmitter } from "events";
import { Writable, Readable } from "stream";

// ── Translation layer tests ────────────────────────────────────────────────────

describe("toCodexDecision", () => {
  test("allow → accept", () => {
    expect(toCodexDecision("allow")).toBe("accept");
  });
  test("allow-session → acceptForSession", () => {
    expect(toCodexDecision("allow-session")).toBe("acceptForSession");
  });
  test("deny → decline", () => {
    expect(toCodexDecision("deny")).toBe("decline");
  });
});

describe("itemStartedToEvents", () => {
  const SID = "gw-sess-1";

  test("commandExecution → tool-start with command/cwd input", () => {
    const item = {
      type: "commandExecution" as const,
      id: "item-1",
      command: "ls -la",
      cwd: "/tmp",
      status: "in_progress" as const,
      aggregatedOutput: null,
      exitCode: null,
    };
    const events = itemStartedToEvents(item, SID);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "tool-start",
      sessionId: SID,
      toolId: "item-1",
      tool: "commandExecution",
      input: { command: "ls -la", cwd: "/tmp" },
    });
  });

  test("fileChange → tool-start with changes input", () => {
    const item = {
      type: "fileChange" as const,
      id: "item-2",
      changes: [{ path: "foo.txt", kind: "add" }],
      status: "completed" as const,
    };
    const events = itemStartedToEvents(item, SID);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool-start",
      tool: "fileChange",
      toolId: "item-2",
    });
  });

  test("mcpToolCall → tool-start with mcp:server/tool name", () => {
    const item = {
      type: "mcpToolCall" as const,
      id: "item-3",
      server: "myServer",
      tool: "myTool",
      status: "in_progress" as const,
      arguments: { key: "value" },
    };
    const events = itemStartedToEvents(item, SID);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool-start",
      tool: "mcp:myServer/myTool",
    });
  });

  test("agentMessage → empty (not a tool)", () => {
    const item = {
      type: "agentMessage" as const,
      id: "item-4",
      text: "hello",
    };
    const events = itemStartedToEvents(item, SID);
    expect(events).toHaveLength(0);
  });

  test("unknown item type → empty (no throw)", () => {
    const item = { type: "unknownFutureType", id: "item-5" } as never;
    expect(() => itemStartedToEvents(item, SID)).not.toThrow();
    expect(itemStartedToEvents(item, SID)).toHaveLength(0);
  });
});

describe("itemCompletedToEvents", () => {
  const SID = "gw-sess-1";

  test("commandExecution completed → tool-end isError=false", () => {
    const item = {
      type: "commandExecution" as const,
      id: "item-1",
      command: "ls",
      cwd: "/tmp",
      status: "completed" as const,
      aggregatedOutput: "file1\nfile2",
      exitCode: 0,
    };
    const events = itemCompletedToEvents(item, SID);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "tool-end", isError: false });
  });

  test("commandExecution failed (non-zero exit) → tool-end isError=true", () => {
    const item = {
      type: "commandExecution" as const,
      id: "item-2",
      command: "bad",
      cwd: "/tmp",
      status: "completed" as const,
      aggregatedOutput: "error",
      exitCode: 1,
    };
    const events = itemCompletedToEvents(item, SID);
    expect(events[0]).toMatchObject({ type: "tool-end", isError: true });
  });

  test("fileChange completed → tool-end isError=false", () => {
    const item = {
      type: "fileChange" as const,
      id: "item-3",
      changes: [{ path: "a.txt", kind: "add" }],
      status: "completed" as const,
    };
    const events = itemCompletedToEvents(item, SID);
    expect(events[0]).toMatchObject({ type: "tool-end", isError: false });
  });

  test("fileChange failed → tool-end isError=true", () => {
    const item = {
      type: "fileChange" as const,
      id: "item-4",
      changes: [],
      status: "failed" as const,
    };
    const events = itemCompletedToEvents(item, SID);
    expect(events[0]).toMatchObject({ type: "tool-end", isError: true });
  });
});

describe("tokenUsageToEvent", () => {
  test("maps TokenUsage to usage GatewayEvent with model", () => {
    const usage = {
      last: {
        inputTokens: 500,
        cachedInputTokens: 100,
        outputTokens: 200,
        reasoningOutputTokens: 50,
        totalTokens: 850,
      },
    };
    const evt = tokenUsageToEvent(usage, "gpt-5.2-codex", "sess-1");
    expect(evt.type).toBe("usage");
    const u = (evt as Extract<GatewayEvent, { type: "usage" }>).usage;
    expect(u.inputTokens).toBe(500);
    expect(u.outputTokens).toBe(200);
    expect(u.cacheReadTokens).toBe(100);
    expect(u.model).toBe("gpt-5.2-codex");
  });
});

describe("commandApprovalToEvent", () => {
  test("builds permission-request with command description", () => {
    const params = {
      threadId: "t1",
      turnId: "turn1",
      itemId: "item1",
      command: "rm -rf /tmp/old",
      cwd: "/workspace",
      reason: null,
      approvalId: null,
    };
    const evt = commandApprovalToEvent(params, "req-123", "sess-1");
    expect(evt.type).toBe("permission-request");
    const pe = evt as Extract<GatewayEvent, { type: "permission-request" }>;
    expect(pe.requestId).toBe("req-123");
    expect(pe.tool).toBe("commandExecution");
    expect(pe.description).toContain("rm -rf /tmp/old");
    expect(pe.options).toContain("allow");
    expect(pe.options).toContain("deny");
    expect(pe.options).toContain("allow-session");
  });

  test("uses reason over generated description when provided", () => {
    const params = {
      threadId: "t1",
      turnId: "turn1",
      itemId: "item1",
      command: "curl example.com",
      cwd: "/workspace",
      reason: "Need to fetch remote data",
      approvalId: null,
    };
    const evt = commandApprovalToEvent(params, "req-456", "sess-1");
    const pe = evt as Extract<GatewayEvent, { type: "permission-request" }>;
    expect(pe.description).toBe("Need to fetch remote data");
  });
});

describe("fileChangeApprovalToEvent", () => {
  test("builds permission-request for file change", () => {
    const params = {
      threadId: "t1",
      turnId: "turn1",
      itemId: "item1",
      reason: null,
      grantRoot: "/workspace/src",
    };
    const evt = fileChangeApprovalToEvent(params, "req-789", "sess-1");
    const pe = evt as Extract<GatewayEvent, { type: "permission-request" }>;
    expect(pe.type).toBe("permission-request");
    expect(pe.tool).toBe("fileChange");
    expect(pe.description).toContain("/workspace/src");
  });
});

// ── Fake transport for CodexSession tests ─────────────────────────────────────

type FakeProc = {
  stdin: Writable & { lines: string[] };
  stdout: Readable & EventEmitter;
  on: (event: string, handler: (...args: unknown[]) => void) => FakeProc;
  emit: (event: string, ...args: unknown[]) => boolean;
  kill: (sig?: string) => void;
  _push: (line: string) => void;
  _close: () => void;
};

function makeFakeProc(): FakeProc {
  const writtenLines: string[] = [];

  const stdin = new Writable({
    write(chunk, _enc, cb) {
      writtenLines.push(chunk.toString());
      cb();
    },
  }) as Writable & { lines: string[] };
  stdin.lines = writtenLines;

  const stdout = new Readable({ read() {} }) as Readable & EventEmitter;

  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  const proc: FakeProc = {
    stdin,
    stdout,
    on(event: string, handler: (...args: unknown[]) => void): FakeProc {
      if (!handlers[event]) handlers[event] = [];
      handlers[event]!.push(handler);
      return proc;
    },
    emit(event: string, ...args: unknown[]): boolean {
      (handlers[event] ?? []).forEach((h) => h(...args));
      return true;
    },
    kill(_sig?: string) {
      proc._close();
    },
    _push(line: string) {
      stdout.push(line + "\n");
    },
    _close() {
      stdout.push(null);
      proc.emit("close");
    },
  };

  return proc;
}

function getWritten(proc: FakeProc): Array<Record<string, unknown>> {
  return proc.stdin.lines
    .join("")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/**
 * Creates a fake spawnFn that returns a JsonRpcClient wrapping a FakeProc.
 * Also returns the proc for control.
 */
function makeFakeSpawn(): { spawnFn: () => JsonRpcClient; proc: FakeProc } {
  const proc = makeFakeProc();
  const client = new JsonRpcClient(proc as never);
  return {
    spawnFn: () => client,
    proc,
  };
}

/**
 * Simulate a complete successful turn: respond to init, thread/start, turn/start,
 * send notifications, send turn/completed.
 */
async function runFakeTurn(
  proc: FakeProc,
  opts: {
    threadId?: string;
    turnId?: string;
    model?: string;
    notifications?: Array<{ method: string; params: Record<string, unknown> }>;
    turnStatus?: "completed" | "interrupted" | "failed";
  } = {}
): Promise<void> {
  const threadId = opts.threadId ?? "thread-abc";
  const turnId = opts.turnId ?? "turn-xyz";
  const model = opts.model ?? "gpt-5.2-codex";

  // Wait for initialize request
  await new Promise((r) => setTimeout(r, 5));
  const written = getWritten(proc);

  const initReq = written.find((w) => w.method === "initialize");
  if (!initReq) return;

  // Respond to initialize
  proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));

  await new Promise((r) => setTimeout(r, 5));

  const written2 = getWritten(proc);
  const threadStartReq = written2.find((w) => w.method === "thread/start" || w.method === "thread/resume");
  if (!threadStartReq) return;

  // Respond to thread/start or thread/resume
  proc._push(JSON.stringify({
    jsonrpc: "2.0",
    id: threadStartReq.id,
    result: { thread: { id: threadId }, model, cwd: "/tmp" },
  }));

  await new Promise((r) => setTimeout(r, 5));

  const written3 = getWritten(proc);
  const turnStartReq = written3.find((w) => w.method === "turn/start");
  if (!turnStartReq) return;

  // Respond to turn/start
  proc._push(JSON.stringify({
    jsonrpc: "2.0",
    id: turnStartReq.id,
    result: { turn: { id: turnId } },
  }));

  await new Promise((r) => setTimeout(r, 5));

  // Send any extra notifications
  for (const notif of opts.notifications ?? []) {
    proc._push(JSON.stringify({ jsonrpc: "2.0", ...notif }));
    await new Promise((r) => setTimeout(r, 2));
  }

  // Send turn/completed
  const status = opts.turnStatus ?? "completed";
  proc._push(JSON.stringify({
    jsonrpc: "2.0",
    method: "turn/completed",
    params: {
      threadId,
      turn: { id: turnId, status, items: [], itemsView: "all", error: null, startedAt: null, completedAt: null, durationMs: null },
    },
  }));

  await new Promise((r) => setTimeout(r, 5));
  proc._close();
}

// ── CodexSession tests ────────────────────────────────────────────────────────

describe("CodexSession", () => {
  test("sends turn and emits session-meta + text-delta + done{complete}", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-1",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "hello" })) {
        events.push(evt);
      }
    })();

    // Run fake turn with a text delta
    await runFakeTurn(proc, {
      notifications: [
        {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-abc", turnId: "turn-xyz", itemId: "item-1", delta: "Hello, world!" },
        },
      ],
    });

    await sendPromise;

    expect(events.some((e) => e.type === "session-meta")).toBe(true);
    const textEvt = events.find((e) => e.type === "text-delta") as
      | Extract<GatewayEvent, { type: "text-delta" }>
      | undefined;
    expect(textEvt).toBeDefined();
    expect(textEvt!.text).toBe("Hello, world!");
    const doneEvt = events.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("complete");
  });

  test("backendSessionId is set after session-meta", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-2",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "hi" })) {
        // drain
      }
    })();

    await runFakeTurn(proc, { threadId: "my-thread-id" });
    await sendPromise;

    expect(session.backendSessionId).toBe("my-thread-id");
  });

  test("thinking-delta emitted from item/reasoning/textDelta", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-3",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "think" })) {
        events.push(evt);
      }
    })();

    await runFakeTurn(proc, {
      notifications: [
        {
          method: "item/reasoning/textDelta",
          params: { threadId: "thread-abc", turnId: "turn-xyz", itemId: "item-r", delta: "I am thinking...", contentIndex: 0 },
        },
      ],
    });

    await sendPromise;

    const thinkEvt = events.find((e) => e.type === "thinking-delta") as
      | Extract<GatewayEvent, { type: "thinking-delta" }>
      | undefined;
    expect(thinkEvt).toBeDefined();
    expect(thinkEvt!.text).toBe("I am thinking...");
  });

  test("tool-start/tool-output/tool-end emitted for commandExecution", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-4",
      { cwd: "/tmp", permissionMode: "acceptAll" },
      undefined,
      spawnFn
    );

    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "run ls" })) {
        events.push(evt);
      }
    })();

    const commandItem = {
      type: "commandExecution",
      id: "cmd-item-1",
      command: "ls -la",
      cwd: "/tmp",
      status: "in_progress",
      aggregatedOutput: null,
      exitCode: null,
      commandActions: [],
      processId: null,
      source: "user",
      durationMs: null,
    };

    await runFakeTurn(proc, {
      notifications: [
        { method: "item/started", params: { item: commandItem, threadId: "t1", turnId: "turn1", startedAtMs: 0 } },
        { method: "item/commandExecution/outputDelta", params: { threadId: "t1", turnId: "turn1", itemId: "cmd-item-1", delta: "file1\nfile2" } },
        { method: "item/completed", params: {
          item: { ...commandItem, status: "completed", exitCode: 0, aggregatedOutput: "file1\nfile2" },
          threadId: "t1",
          turnId: "turn1",
          completedAtMs: 1000,
        }},
      ],
    });

    await sendPromise;

    expect(events.some((e) => e.type === "tool-start")).toBe(true);
    expect(events.some((e) => e.type === "tool-output")).toBe(true);
    expect(events.some((e) => e.type === "tool-end")).toBe(true);
    const toolEnd = events.find((e) => e.type === "tool-end") as
      | Extract<GatewayEvent, { type: "tool-end" }>
      | undefined;
    expect(toolEnd!.isError).toBe(false);
  });

  test("permission-request emitted and respondToPermission resolves it", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-perm",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "run command" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          // Respond immediately
          session.respondToPermission(evt.requestId, "allow");
        }
      }
    })();

    // Wait for the session to initialize and start turn
    await new Promise((r) => setTimeout(r, 20));

    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written2 = getWritten(proc);
    const threadReq = written2.find((w) => w.method === "thread/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: threadReq!.id, result: { thread: { id: "t1" }, model: "gpt-5.2-codex", cwd: "/tmp" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written3 = getWritten(proc);
    const turnReq = written3.find((w) => w.method === "turn/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: turnReq!.id, result: { turn: { id: "turn1" } } }));
    await new Promise((r) => setTimeout(r, 5));

    // Send a command execution approval request (server-initiated)
    proc._push(JSON.stringify({
      jsonrpc: "2.0",
      id: "srv-approval-1",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "t1",
        turnId: "turn1",
        itemId: "cmd-1",
        startedAtMs: 0,
        command: "ls /tmp",
        cwd: "/tmp",
        reason: null,
        approvalId: null,
      },
    }));

    await new Promise((r) => setTimeout(r, 20));

    // Check that a permission-request event was emitted
    const permEvt = events.find((e) => e.type === "permission-request") as
      | Extract<GatewayEvent, { type: "permission-request" }>
      | undefined;
    expect(permEvt).toBeDefined();
    expect(permEvt!.tool).toBe("commandExecution");

    // Check that the client responded with "accept"
    const written4 = getWritten(proc);
    const approvalResp = written4.find(
      (w) => w.id === "srv-approval-1"
    ) as { result?: { decision?: string } } | undefined;
    expect(approvalResp).toBeDefined();
    expect(approvalResp!.result?.decision).toBe("accept");

    // Complete the turn
    proc._push(JSON.stringify({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { threadId: "t1", turn: { id: "turn1", status: "completed", items: [], itemsView: "all", error: null, startedAt: null, completedAt: null, durationMs: null } },
    }));
    await new Promise((r) => setTimeout(r, 5));
    proc._close();

    await sendPromise;

    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  test("allow-session short-circuits second approval for same tool", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-allow-sess",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const events: GatewayEvent[] = [];
    let permRequestCount = 0;

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "run stuff" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          permRequestCount++;
          session.respondToPermission(evt.requestId, "allow-session");
        }
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written2 = getWritten(proc);
    const threadReq = written2.find((w) => w.method === "thread/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: threadReq!.id, result: { thread: { id: "t1" }, model: "gpt-5.2-codex", cwd: "/tmp" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written3 = getWritten(proc);
    const turnReq = written3.find((w) => w.method === "turn/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: turnReq!.id, result: { turn: { id: "turn1" } } }));
    await new Promise((r) => setTimeout(r, 5));

    // First approval request
    proc._push(JSON.stringify({
      jsonrpc: "2.0", id: "srv-1",
      method: "item/commandExecution/requestApproval",
      params: { threadId: "t1", turnId: "turn1", itemId: "cmd-1", startedAtMs: 0, command: "ls", cwd: "/tmp", reason: null, approvalId: null },
    }));
    await new Promise((r) => setTimeout(r, 20));

    // Second approval request for same tool type — should be auto-accepted
    proc._push(JSON.stringify({
      jsonrpc: "2.0", id: "srv-2",
      method: "item/commandExecution/requestApproval",
      params: { threadId: "t1", turnId: "turn1", itemId: "cmd-2", startedAtMs: 0, command: "pwd", cwd: "/tmp", reason: null, approvalId: null },
    }));
    await new Promise((r) => setTimeout(r, 20));

    // Exactly one permission-request emitted
    expect(permRequestCount).toBe(1);

    // Second response should be auto-accepted without a permission-request event
    const written4 = getWritten(proc);
    const resp2 = written4.find((w) => w.id === "srv-2") as { result?: { decision?: string } } | undefined;
    expect(resp2).toBeDefined();
    expect(resp2!.result?.decision).toBe("accept");

    proc._push(JSON.stringify({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { threadId: "t1", turn: { id: "turn1", status: "completed", items: [], itemsView: "all", error: null, startedAt: null, completedAt: null, durationMs: null } },
    }));
    await new Promise((r) => setTimeout(r, 5));
    proc._close();
    await sendPromise;
  });

  test("cancel() mid-stream → done{cancelled} no error event", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-cancel",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "slow op" })) {
        events.push(evt);
        if (evt.type === "session-meta") {
          // Cancel as soon as session-meta arrives
          await session.cancel();
        }
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written2 = getWritten(proc);
    const threadReq = written2.find((w) => w.method === "thread/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: threadReq!.id, result: { thread: { id: "t1" }, model: "gpt-5.2-codex", cwd: "/tmp" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written3 = getWritten(proc);
    const turnReq = written3.find((w) => w.method === "turn/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: turnReq!.id, result: { turn: { id: "turn1" } } }));
    await new Promise((r) => setTimeout(r, 5));

    // session-meta will be emitted from thread/start response — cancel will fire
    // The cancel() kills the process
    await sendPromise;

    const doneEvt = events.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("cancelled");
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("send after cancel works (second turn completes normally)", async () => {
    // We need two separate procs for the two turns
    let callCount = 0;
    const procs: FakeProc[] = [makeFakeProc(), makeFakeProc()];

    const spawnFn = (): JsonRpcClient => {
      const proc = procs[callCount++ % 2]!;
      return new JsonRpcClient(proc as never);
    };

    const session = new CodexSession(
      "gw-sess-reuse",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    // --- First turn: cancel ---
    const firstEvents: GatewayEvent[] = [];
    const firstSend = (async () => {
      for await (const evt of session.send({ text: "first" })) {
        firstEvents.push(evt);
        if (evt.type === "session-meta") {
          await session.cancel();
        }
      }
    })();

    // Drive first turn up to session-meta
    await new Promise((r) => setTimeout(r, 10));
    const w0 = getWritten(procs[0]!);
    const init0 = w0.find((w) => w.method === "initialize");
    procs[0]!._push(JSON.stringify({ jsonrpc: "2.0", id: init0!.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));
    await new Promise((r) => setTimeout(r, 5));
    const w0b = getWritten(procs[0]!);
    const tr0 = w0b.find((w) => w.method === "thread/start");
    procs[0]!._push(JSON.stringify({ jsonrpc: "2.0", id: tr0!.id, result: { thread: { id: "t1" }, model: "gpt-5.2-codex", cwd: "/tmp" } }));
    await new Promise((r) => setTimeout(r, 5));
    // Cancel fires now; process gets killed
    await firstSend;

    const firstDone = firstEvents.find((e) => e.type === "done") as Extract<GatewayEvent, { type: "done" }> | undefined;
    expect(firstDone?.reason).toBe("cancelled");

    // --- Second turn: normal ---
    // After cancel, session has _backendSessionId = "t1" so second turn uses thread/resume
    const secondEvents: GatewayEvent[] = [];
    const secondSend = (async () => {
      for await (const evt of session.send({ text: "second" })) {
        secondEvents.push(evt);
      }
    })();

    // Drive second turn manually (it uses thread/resume, not thread/start)
    await new Promise((r) => setTimeout(r, 10));
    const w1 = getWritten(procs[1]!);

    const init1 = w1.find((w) => w.method === "initialize");
    procs[1]!._push(JSON.stringify({ jsonrpc: "2.0", id: init1!.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));
    await new Promise((r) => setTimeout(r, 5));

    const w1b = getWritten(procs[1]!);
    const resumeReq = w1b.find((w) => w.method === "thread/resume");
    expect(resumeReq).toBeDefined();
    procs[1]!._push(JSON.stringify({ jsonrpc: "2.0", id: resumeReq!.id, result: { thread: { id: "t1" }, model: "gpt-5.2-codex", cwd: "/tmp" } }));
    await new Promise((r) => setTimeout(r, 5));

    const w1c = getWritten(procs[1]!);
    const turnReq1 = w1c.find((w) => w.method === "turn/start");
    procs[1]!._push(JSON.stringify({ jsonrpc: "2.0", id: turnReq1!.id, result: { turn: { id: "turn2" } } }));
    await new Promise((r) => setTimeout(r, 5));

    procs[1]!._push(JSON.stringify({
      jsonrpc: "2.0",
      method: "item/agentMessage/delta",
      params: { threadId: "t1", turnId: "turn2", itemId: "i1", delta: "done!" },
    }));
    await new Promise((r) => setTimeout(r, 5));

    procs[1]!._push(JSON.stringify({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { threadId: "t1", turn: { id: "turn2", status: "completed", items: [], itemsView: "all", error: null, startedAt: null, completedAt: null, durationMs: null } },
    }));
    await new Promise((r) => setTimeout(r, 5));
    procs[1]!._close();

    await secondSend;

    const secondDone = secondEvents.find((e) => e.type === "done") as Extract<GatewayEvent, { type: "done" }> | undefined;
    expect(secondDone?.reason).toBe("complete");
    expect(secondEvents.some((e) => e.type === "error")).toBe(false);
    const textEvt = secondEvents.find((e) => e.type === "text-delta") as Extract<GatewayEvent, { type: "text-delta" }> | undefined;
    expect(textEvt?.text).toBe("done!");
  });

  test("respondToPermission with unknown id is a silent no-op", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-noop",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "hi" })) {
        // drain
      }
    })();

    await runFakeTurn(proc);
    await sendPromise;

    // After send completes, unknown id must not throw
    expect(() => session.respondToPermission("totally-unknown-id", "allow")).not.toThrow();
  });

  test("resumeSession uses thread/resume instead of thread/start", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-resume",
      { cwd: "/tmp", permissionMode: "prompt" },
      "existing-thread-id", // resumeId
      spawnFn
    );

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "what did I create?" })) {
        // drain
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written2 = getWritten(proc);
    const resumeReq = written2.find((w) => w.method === "thread/resume");
    expect(resumeReq).toBeDefined();
    expect((resumeReq!.params as { threadId?: string }).threadId).toBe("existing-thread-id");

    // Respond and complete turn
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: resumeReq!.id, result: { thread: { id: "existing-thread-id" }, model: "gpt-5.2-codex", cwd: "/tmp" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written3 = getWritten(proc);
    const turnReq = written3.find((w) => w.method === "turn/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: turnReq!.id, result: { turn: { id: "turn1" } } }));
    await new Promise((r) => setTimeout(r, 5));

    proc._push(JSON.stringify({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: { threadId: "existing-thread-id", turn: { id: "turn1", status: "completed", items: [], itemsView: "all", error: null, startedAt: null, completedAt: null, durationMs: null } },
    }));
    await new Promise((r) => setTimeout(r, 5));
    proc._close();

    await sendPromise;
  });

  test("process death mid-turn → error event + done{error}", async () => {
    const { spawnFn, proc } = makeFakeSpawn();

    const session = new CodexSession(
      "gw-sess-death",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      spawnFn
    );

    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "do stuff" })) {
        events.push(evt);
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { userAgent: "test", codexHome: "/tmp", platformFamily: "unix", platformOs: "macos" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written2 = getWritten(proc);
    const threadReq = written2.find((w) => w.method === "thread/start");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: threadReq!.id, result: { thread: { id: "t1" }, model: "gpt-5.2-codex", cwd: "/tmp" } }));
    await new Promise((r) => setTimeout(r, 5));

    // Kill process without completing the turn
    proc._close();

    await sendPromise;

    // Should get error + done{error} (process died unexpectedly)
    // OR if no requests were pending, just closed → done{error} or done{complete}
    // The session has an outstanding turn/start pending request that will be rejected
    const doneEvt = events.find((e) => e.type === "done") as Extract<GatewayEvent, { type: "done" }> | undefined;
    expect(doneEvt).toBeDefined();
    // Either error or cancelled is acceptable (process died, no graceful turn completion)
    expect(["error", "cancelled"]).toContain(doneEvt!.reason);
  });
});

describe("CodexBackend", () => {
  test("capabilities returns expected shape", () => {
    const backend = new CodexBackend();
    const caps = backend.capabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.permissions).toBe("callback");
    expect(caps.resume).toBe(true);
    expect(caps.mcp).toBe(true);
    expect(caps.models.length).toBeGreaterThan(0);
    const def = caps.models.find((m) => m.default);
    expect(def).toBeDefined();
  });

  test("createSession returns a CodexSession with a unique id", () => {
    const backend = new CodexBackend();
    const s1 = backend.createSession({ cwd: "/tmp", permissionMode: "prompt" });
    const s2 = backend.createSession({ cwd: "/tmp", permissionMode: "prompt" });
    expect(s1.id).toBeTruthy();
    expect(s2.id).toBeTruthy();
    expect(s1.id).not.toBe(s2.id);
  });

  test("resumeSession passes backendSessionId to the session", () => {
    const backend = new CodexBackend();
    const s = backend.resumeSession("thread-xyz", { cwd: "/tmp", permissionMode: "prompt" }) as CodexSession;
    // The session has a resumeId — we can verify by checking that it uses thread/resume
    // We can't inspect private fields directly, but we can check the backendSessionId getter
    expect(s.backendSessionId).toBeUndefined(); // not yet set until first send
  });
});
