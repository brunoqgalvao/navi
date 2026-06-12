/**
 * Tests for the Gemini adapter — translation layer and GeminiSession internals.
 * No live CLI calls. All fixtures use real ACP shapes from the spike.
 * Transport is faked via a controllable JsonRpcClient.
 *
 * Spike reference: docs/gemini-spike.md
 */
import { describe, expect, test } from "bun:test";
import {
  toAcpOutcome,
  autoAcceptOutcome,
  agentMessageChunkToEvent,
  agentThoughtChunkToEvent,
  toolCallToStartEvent,
  toolCallUpdateToEvents,
  permissionRequestToEvent,
  stopReasonToDoneReason,
  type AcpPermissionRequestParams,
} from "../src/adapters/gemini-translate.js";
import { GeminiSession, GeminiBackend } from "../src/adapters/gemini.js";
import { JsonRpcClient } from "../src/adapters/jsonrpc.js";
import type { GatewayEvent } from "../src/events.js";
import { EventEmitter } from "events";
import { Writable, Readable } from "stream";

// ── Translation layer tests ───────────────────────────────────────────────────

describe("toAcpOutcome", () => {
  const OPTIONS = [
    { optionId: "proceed_always", name: "Allow All", kind: "allow_always" as const },
    { optionId: "proceed_once",   name: "Allow",     kind: "allow_once"  as const },
    { optionId: "cancel",         name: "Reject",    kind: "reject_once" as const },
  ];

  test("allow → proceed_once (allow_once option)", () => {
    const outcome = toAcpOutcome("allow", OPTIONS);
    expect(outcome).toEqual({ outcome: "selected", optionId: "proceed_once" });
  });

  test("allow-session → proceed_always (allow_always option)", () => {
    const outcome = toAcpOutcome("allow-session", OPTIONS);
    expect(outcome).toEqual({ outcome: "selected", optionId: "proceed_always" });
  });

  test("deny → cancelled", () => {
    const outcome = toAcpOutcome("deny", OPTIONS);
    expect(outcome).toEqual({ outcome: "cancelled" });
  });

  test("allow with no allow_once → falls back to any allow kind", () => {
    const opts = [
      { optionId: "proceed_always", kind: "allow_always" as const },
    ];
    const outcome = toAcpOutcome("allow", opts);
    // falls back to any allow_ option
    expect(outcome.outcome).toBe("selected");
  });

  test("allow-session with no allow_always → falls back to allow_once", () => {
    const opts = [
      { optionId: "proceed_once", kind: "allow_once" as const },
      { optionId: "cancel", kind: "reject_once" as const },
    ];
    const outcome = toAcpOutcome("allow-session", opts);
    // no allow_always — falls back to allow
    expect(outcome.outcome).toBe("selected");
    expect((outcome as { optionId: string }).optionId).toBe("proceed_once");
  });
});

describe("autoAcceptOutcome", () => {
  test("prefers allow_always option", () => {
    const opts = [
      { optionId: "proceed_always", kind: "allow_always" as const },
      { optionId: "proceed_once", kind: "allow_once" as const },
    ];
    expect(autoAcceptOutcome(opts)).toEqual({ outcome: "selected", optionId: "proceed_always" });
  });

  test("falls back to allow_once if no allow_always", () => {
    const opts = [
      { optionId: "proceed_once", kind: "allow_once" as const },
    ];
    expect(autoAcceptOutcome(opts)).toEqual({ outcome: "selected", optionId: "proceed_once" });
  });

  test("empty options → cancelled", () => {
    expect(autoAcceptOutcome([])).toEqual({ outcome: "cancelled" });
  });
});

describe("agentMessageChunkToEvent", () => {
  test("text content → text-delta", () => {
    const update = { content: { type: "text" as const, text: "Hello! 2+2 equals 4." } };
    const evt = agentMessageChunkToEvent(update, "sess-1");
    expect(evt).toEqual({ type: "text-delta", sessionId: "sess-1", text: "Hello! 2+2 equals 4." });
  });

  test("non-text content → null", () => {
    const update = { content: { type: "image", data: "base64..." } };
    const evt = agentMessageChunkToEvent(update as never, "sess-1");
    expect(evt).toBeNull();
  });
});

describe("agentThoughtChunkToEvent", () => {
  test("text content → thinking-delta", () => {
    // Exact shape from spike
    const update = {
      content: {
        type: "text" as const,
        text: "**Delivering the Solution**\n\nI've crafted a direct response...",
      },
    };
    const evt = agentThoughtChunkToEvent(update, "sess-2");
    expect(evt).toEqual({
      type: "thinking-delta",
      sessionId: "sess-2",
      text: "**Delivering the Solution**\n\nI've crafted a direct response...",
    });
  });

  test("non-text content → null", () => {
    const evt = agentThoughtChunkToEvent({ content: { type: "image" } } as never, "sess-2");
    expect(evt).toBeNull();
  });
});

describe("toolCallToStartEvent", () => {
  test("tool_call → tool-start with title and rawInput", () => {
    const update = {
      sessionUpdate: "tool_call" as const,
      toolCallId: "write_file-123",
      title: "write_file",
      status: "pending",
      rawInput: { path: "/tmp/hello.txt", content: "hello" },
      content: [],
      locations: [{ path: "/tmp/hello.txt" }],
      kind: "file",
    };
    const evt = toolCallToStartEvent(update, "sess-3");
    expect(evt).toMatchObject({
      type: "tool-start",
      sessionId: "sess-3",
      toolId: "write_file-123",
      tool: "write_file",
    });
  });

  test("tool_call without title → toolCallId as tool name", () => {
    const update = {
      sessionUpdate: "tool_call" as const,
      toolCallId: "shell-456",
      content: [],
      locations: [],
    };
    const evt = toolCallToStartEvent(update, "sess-3");
    expect(evt).toMatchObject({ tool: "shell-456" });
  });
});

describe("toolCallUpdateToEvents", () => {
  test("status pending → tool-start", () => {
    const update = {
      sessionUpdate: "tool_call_update" as const,
      toolCallId: "write_file-111",
      status: "pending",
      title: "write_file",
      content: [],
      locations: [],
    };
    const evts = toolCallUpdateToEvents(update, "sess-4");
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({ type: "tool-start", toolId: "write_file-111" });
  });

  test("status in_progress with text content → tool-output", () => {
    const update = {
      sessionUpdate: "tool_call_update" as const,
      toolCallId: "shell-222",
      status: "in_progress",
      title: "shell",
      content: [
        { type: "content" as const, content: { type: "text", text: "file1\nfile2\n" } },
      ],
      locations: [],
    };
    const evts = toolCallUpdateToEvents(update, "sess-4");
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({ type: "tool-output", toolId: "shell-222", chunk: "file1\nfile2\n" });
  });

  test("status completed → tool-end isError=false", () => {
    const update = {
      sessionUpdate: "tool_call_update" as const,
      toolCallId: "write_file-333",
      status: "completed",
      title: "write_file",
      content: [],
      locations: [],
    };
    const evts = toolCallUpdateToEvents(update, "sess-4");
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({ type: "tool-end", isError: false });
  });

  test("status failed → tool-end isError=true", () => {
    // Exact shape from spike — failed write_file with error JSON in content
    const update = {
      sessionUpdate: "tool_call_update" as const,
      toolCallId: "write_file-1781297111442",
      status: "failed",
      title: "write_file",
      content: [
        {
          type: "content" as const,
          content: {
            type: "text",
            text: '[{"expected":"proceed_once","received":"undefined","code":"invalid_type","path":[],"message":"Required"}]',
          },
        },
      ],
      locations: [],
    };
    const evts = toolCallUpdateToEvents(update, "sess-4");
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({ type: "tool-end", isError: true });
  });

  test("unknown status → empty events (no throw)", () => {
    const update = {
      sessionUpdate: "tool_call_update" as const,
      toolCallId: "unknown-999",
      status: "some_future_status",
      content: [],
      locations: [],
    };
    expect(() => toolCallUpdateToEvents(update, "sess-4")).not.toThrow();
    expect(toolCallUpdateToEvents(update, "sess-4")).toHaveLength(0);
  });
});

describe("permissionRequestToEvent", () => {
  test("builds permission-request with correct shape from spike fixture", () => {
    // Real shape from spike (write_file tool)
    const params: AcpPermissionRequestParams = {
      sessionId: "96b33483-38cf-4f0a-83a2-0068f631a04f",
      options: [
        { optionId: "proceed_always", name: "Allow All Edits", kind: "allow_always" },
        { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
        { optionId: "cancel", name: "Reject", kind: "reject_once" },
      ],
      toolCall: {
        toolCallId: "write_file-1781297128764",
        status: "pending",
        title: "write_file",
        content: [],
        locations: [],
        kind: "file",
      },
    };
    const evt = permissionRequestToEvent(params, "req-abc", "gw-sess-1");
    expect(evt.type).toBe("permission-request");
    const pe = evt as Extract<GatewayEvent, { type: "permission-request" }>;
    expect(pe.requestId).toBe("req-abc");
    expect(pe.tool).toBe("write_file");
    expect(pe.options).toContain("allow");
    expect(pe.options).toContain("allow-session");
    expect(pe.options).toContain("deny");
  });

  test("no allow_always → options without allow-session", () => {
    const params: AcpPermissionRequestParams = {
      sessionId: "sess",
      options: [
        { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
        { optionId: "cancel", name: "Reject", kind: "reject_once" },
      ],
      toolCall: {
        toolCallId: "shell-1",
        title: "shell",
        status: "pending",
        content: [],
        locations: [],
      },
    };
    const evt = permissionRequestToEvent(params, "req-1", "sess-1");
    const pe = evt as Extract<GatewayEvent, { type: "permission-request" }>;
    expect(pe.options).not.toContain("allow-session");
    expect(pe.options).toContain("allow");
    expect(pe.options).toContain("deny");
  });
});

describe("stopReasonToDoneReason", () => {
  test("end_turn → complete", () => { expect(stopReasonToDoneReason("end_turn")).toBe("complete"); });
  test("max_tokens → complete", () => { expect(stopReasonToDoneReason("max_tokens")).toBe("complete"); });
  test("cancelled → cancelled", () => { expect(stopReasonToDoneReason("cancelled")).toBe("cancelled"); });
  test("unknown → complete", () => { expect(stopReasonToDoneReason("something_else")).toBe("complete"); });
});

// ── Fake transport for GeminiSession tests ───────────────────────────────────

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

function makeFakeSpawn(): { spawnFn: () => JsonRpcClient; proc: FakeProc } {
  const proc = makeFakeProc();
  const client = new JsonRpcClient(proc as never);
  return { spawnFn: () => client, proc };
}

/**
 * Drive a complete ACP session: respond to initialize + session/new + session/prompt.
 */
async function runFakeTurn(
  proc: FakeProc,
  opts: {
    sessionId?: string;
    notifications?: Array<{ method: string; params: Record<string, unknown> }>;
    stopReason?: string;
  } = {}
): Promise<void> {
  const sessionId = opts.sessionId ?? "acp-sess-abc";
  const stopReason = opts.stopReason ?? "end_turn";

  // Wait for initialize
  await new Promise((r) => setTimeout(r, 5));
  const written = getWritten(proc);
  const initReq = written.find((w) => w.method === "initialize");
  if (!initReq) return;

  proc._push(
    JSON.stringify({
      jsonrpc: "2.0",
      id: initReq.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: false },
      },
    })
  );

  await new Promise((r) => setTimeout(r, 5));

  const written2 = getWritten(proc);
  const newSessionReq = written2.find((w) => w.method === "session/new");
  if (!newSessionReq) return;

  proc._push(
    JSON.stringify({
      jsonrpc: "2.0",
      id: newSessionReq.id,
      result: { sessionId },
    })
  );

  await new Promise((r) => setTimeout(r, 5));

  const written3 = getWritten(proc);
  const promptReq = written3.find((w) => w.method === "session/prompt");
  if (!promptReq) return;

  // Send notifications before resolving prompt
  for (const notif of opts.notifications ?? []) {
    proc._push(JSON.stringify({ jsonrpc: "2.0", ...notif }));
    await new Promise((r) => setTimeout(r, 2));
  }

  // Resolve session/prompt
  proc._push(
    JSON.stringify({
      jsonrpc: "2.0",
      id: promptReq.id,
      result: { stopReason },
    })
  );
}

// ── GeminiSession tests ───────────────────────────────────────────────────────

describe("GeminiSession", () => {
  test("sends turn and emits session-meta + text-delta + done{complete}", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-1", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "hello" })) {
        events.push(evt);
      }
    })();

    await runFakeTurn(proc, {
      notifications: [
        {
          method: "session/update",
          params: {
            sessionId: "acp-sess-abc",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "Hello! 2+2 equals 4." },
            },
          },
        },
      ],
    });

    await sendPromise;

    expect(events.some((e) => e.type === "session-meta")).toBe(true);
    const textEvt = events.find((e) => e.type === "text-delta") as
      | Extract<GatewayEvent, { type: "text-delta" }>
      | undefined;
    expect(textEvt).toBeDefined();
    expect(textEvt!.text).toBe("Hello! 2+2 equals 4.");
    const doneEvt = events.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("complete");
  });

  test("backendSessionId populated after session-meta", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-2", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "hi" })) {}
    })();

    await runFakeTurn(proc, { sessionId: "my-acp-session" });
    await sendPromise;

    expect(session.backendSessionId).toBe("my-acp-session");
  });

  test("thinking-delta emitted from agent_thought_chunk", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-3", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "think" })) {
        events.push(evt);
      }
    })();

    await runFakeTurn(proc, {
      notifications: [
        {
          method: "session/update",
          params: {
            sessionId: "acp-sess-abc",
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: "I am thinking..." },
            },
          },
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

  test("tool-start/tool-end emitted for tool_call_update", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-4", { cwd: "/tmp", permissionMode: "acceptAll" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "create file" })) {
        events.push(evt);
      }
    })();

    await runFakeTurn(proc, {
      notifications: [
        {
          method: "session/update",
          params: {
            sessionId: "acp-sess-abc",
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: "write_file-111",
              status: "pending",
              title: "write_file",
              content: [],
              locations: [],
              kind: "file",
            },
          },
        },
        {
          method: "session/update",
          params: {
            sessionId: "acp-sess-abc",
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: "write_file-111",
              status: "completed",
              content: [],
              locations: [],
            },
          },
        },
      ],
    });

    await sendPromise;

    expect(events.some((e) => e.type === "tool-start")).toBe(true);
    expect(events.some((e) => e.type === "tool-end")).toBe(true);
    const toolEnd = events.find((e) => e.type === "tool-end") as
      | Extract<GatewayEvent, { type: "tool-end" }>
      | undefined;
    expect(toolEnd!.isError).toBe(false);
  });

  test("permission-request emitted and respondToPermission resolves it", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-perm", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "create file" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          session.respondToPermission(evt.requestId, "allow");
        }
      }
    })();

    // Drive up to session/prompt
    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: false } } }));
    await new Promise((r) => setTimeout(r, 5));

    const written2 = getWritten(proc);
    const newSessReq = written2.find((w) => w.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSessReq!.id, result: { sessionId: "acp-perm-sess" } }));
    await new Promise((r) => setTimeout(r, 5));

    const written3 = getWritten(proc);
    const promptReq = written3.find((w) => w.method === "session/prompt");
    // promptReq is pending — send a server-initiated permission request before resolving it
    void promptReq; // used below after permission round-trip

    // Send session/request_permission (server-initiated request)
    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "srv-perm-1",
        method: "session/request_permission",
        params: {
          sessionId: "acp-perm-sess",
          options: [
            { optionId: "proceed_always", name: "Allow All Edits", kind: "allow_always" },
            { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
            { optionId: "cancel", name: "Reject", kind: "reject_once" },
          ],
          toolCall: {
            toolCallId: "write_file-999",
            status: "pending",
            title: "write_file",
            content: [],
            locations: [],
            kind: "file",
          },
        },
      })
    );

    await new Promise((r) => setTimeout(r, 20));

    // Verify permission-request event was emitted
    const permEvt = events.find((e) => e.type === "permission-request") as
      | Extract<GatewayEvent, { type: "permission-request" }>
      | undefined;
    expect(permEvt).toBeDefined();
    expect(permEvt!.tool).toBe("write_file");

    // Verify response was sent with proceed_once (allow_once)
    const writtenAll = getWritten(proc);
    const permResp = writtenAll.find((w) => w.id === "srv-perm-1") as
      | { result?: { outcome?: { outcome?: string; optionId?: string } } }
      | undefined;
    expect(permResp).toBeDefined();
    expect(permResp!.result?.outcome?.outcome).toBe("selected");
    expect(permResp!.result?.outcome?.optionId).toBe("proceed_once");

    // Now resolve the prompt
    const written4 = getWritten(proc);
    const promptReq2 = written4.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq2!.id, result: { stopReason: "end_turn" } }));

    await sendPromise;
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  test("acceptAll mode auto-accepts permissions without surfacing event", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-yolo", { cwd: "/tmp", permissionMode: "acceptAll" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "do stuff" })) {
        events.push(evt);
      }
    })();

    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: {} } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s1" } }));
    await new Promise((r) => setTimeout(r, 5));

    // Send permission request
    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "srv-auto-1",
        method: "session/request_permission",
        params: {
          sessionId: "s1",
          options: [
            { optionId: "proceed_always", name: "Allow All", kind: "allow_always" },
            { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
            { optionId: "cancel", name: "Reject", kind: "reject_once" },
          ],
          toolCall: {
            toolCallId: "shell-1",
            status: "pending",
            title: "shell",
            content: [],
            locations: [],
            kind: "shell",
          },
        },
      })
    );
    await new Promise((r) => setTimeout(r, 15));

    // No permission-request event emitted
    expect(events.some((e) => e.type === "permission-request")).toBe(false);

    // Response should be auto-accept with allow_always
    const writtenAll = getWritten(proc);
    const autoResp = writtenAll.find((w) => w.id === "srv-auto-1") as
      | { result?: { outcome?: { outcome?: string; optionId?: string } } }
      | undefined;
    expect(autoResp).toBeDefined();
    expect(autoResp!.result?.outcome?.outcome).toBe("selected");
    expect(autoResp!.result?.outcome?.optionId).toBe("proceed_always");

    // Complete the turn
    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq!.id, result: { stopReason: "end_turn" } }));
    await sendPromise;
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  test("readOnly mode auto-denies permissions", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-ro", { cwd: "/tmp", permissionMode: "readOnly" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "write" })) {
        events.push(evt);
      }
    })();

    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: {} } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s2" } }));
    await new Promise((r) => setTimeout(r, 5));

    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "srv-ro-1",
        method: "session/request_permission",
        params: {
          sessionId: "s2",
          options: [
            { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
            { optionId: "cancel", name: "Reject", kind: "reject_once" },
          ],
          toolCall: { toolCallId: "write_file-1", status: "pending", title: "write_file", content: [], locations: [] },
        },
      })
    );
    await new Promise((r) => setTimeout(r, 15));

    const writtenAll = getWritten(proc);
    const denyResp = writtenAll.find((w) => w.id === "srv-ro-1") as
      | { result?: { outcome?: { outcome?: string } } }
      | undefined;
    expect(denyResp).toBeDefined();
    expect(denyResp!.result?.outcome?.outcome).toBe("cancelled");

    // No permission-request event surfaced
    expect(events.some((e) => e.type === "permission-request")).toBe(false);

    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq!.id, result: { stopReason: "end_turn" } }));
    await sendPromise;
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  test("allow-session short-circuits second permission for same tool", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-allow-s", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];
    let permCount = 0;

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "do stuff" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          permCount++;
          session.respondToPermission(evt.requestId, "allow-session");
        }
      }
    })();

    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: {} } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s3" } }));
    await new Promise((r) => setTimeout(r, 5));

    const permParams = {
      sessionId: "s3",
      options: [
        { optionId: "proceed_always", name: "Allow All", kind: "allow_always" as const },
        { optionId: "proceed_once", name: "Allow", kind: "allow_once" as const },
        { optionId: "cancel", name: "Reject", kind: "reject_once" as const },
      ],
      toolCall: { toolCallId: "shell-1", status: "pending", title: "shell", content: [], locations: [], kind: "shell" },
    };

    // First permission request — will surface event
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: "perm-1", method: "session/request_permission", params: { ...permParams, toolCall: { ...permParams.toolCall, toolCallId: "shell-1" } } }));
    await new Promise((r) => setTimeout(r, 20));

    // Second permission request for same tool title — should auto-allow
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: "perm-2", method: "session/request_permission", params: { ...permParams, toolCall: { ...permParams.toolCall, toolCallId: "shell-2" } } }));
    await new Promise((r) => setTimeout(r, 20));

    // Exactly one permission-request emitted
    expect(permCount).toBe(1);

    // Second response should be auto-accepted
    const writtenAll = getWritten(proc);
    const resp2 = writtenAll.find((w) => w.id === "perm-2") as
      | { result?: { outcome?: { outcome?: string } } }
      | undefined;
    expect(resp2).toBeDefined();
    expect(resp2!.result?.outcome?.outcome).toBe("selected");

    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq!.id, result: { stopReason: "end_turn" } }));
    await sendPromise;
  });

  test("cancel() mid-turn → done{cancelled}, no error", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-sess-cancel", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "slow" })) {
        events.push(evt);
        if (evt.type === "session-meta") {
          await session.cancel();
        }
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: {} } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s-cancel" } }));
    await new Promise((r) => setTimeout(r, 5));

    // session-meta fires after session/new — cancel() will kill the proc
    await sendPromise;

    const doneEvt = events.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("cancelled");
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("respondToPermission with unknown id is silent no-op", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-noop", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "hi" })) {}
    })();

    await runFakeTurn(proc);
    await sendPromise;

    expect(() => session.respondToPermission("totally-unknown-id", "allow")).not.toThrow();
  });

  test("process death mid-turn → error + done{error}", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-death", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "do stuff" })) {
        events.push(evt);
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: {} } }));
    await new Promise((r) => setTimeout(r, 5));

    // Kill process before session/new responds
    proc._close();

    await sendPromise;

    const doneEvt = events.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("error");
  });

  test("stopReason cancelled → done{cancelled}", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-cancel-stop", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "hi" })) {
        events.push(evt);
      }
    })();

    await runFakeTurn(proc, { stopReason: "cancelled" });
    await sendPromise;

    const doneEvt = events.find((e) => e.type === "done") as Extract<GatewayEvent, { type: "done" }> | undefined;
    expect(doneEvt?.reason).toBe("cancelled");
  });
});

// ── GeminiBackend tests ───────────────────────────────────────────────────────

describe("GeminiBackend", () => {
  test("capabilities returns expected shape", () => {
    const backend = new GeminiBackend();
    const caps = backend.capabilities();
    expect(caps.streaming).toBe(true);
    expect(caps.thinkingStream).toBe(true);
    expect(caps.permissions).toBe("callback");
    expect(caps.resume).toBe(false);
    expect(caps.mcp).toBe(true);
    expect(caps.skills).toBe("injected");
    expect(caps.models.length).toBeGreaterThan(0);
    const def = caps.models.find((m) => m.default);
    expect(def).toBeDefined();
    expect(def!.id).toBe("gemini-2.5-flash");
  });

  test("createSession returns unique ids", () => {
    const backend = new GeminiBackend();
    const s1 = backend.createSession({ cwd: "/tmp", permissionMode: "prompt" });
    const s2 = backend.createSession({ cwd: "/tmp", permissionMode: "prompt" });
    expect(s1.id).not.toBe(s2.id);
    expect(s1.id).toBeTruthy();
  });

  test("resumeSession creates new session (resume: false)", () => {
    const backend = new GeminiBackend();
    const s = backend.resumeSession("old-session-id", { cwd: "/tmp", permissionMode: "prompt" });
    // backendSessionId is undefined until first send (new session, not restored)
    expect(s.backendSessionId).toBeUndefined();
    expect(s.id).toBeTruthy();
  });
});
