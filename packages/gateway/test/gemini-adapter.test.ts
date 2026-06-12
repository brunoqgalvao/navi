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
import { GeminiSession, GeminiBackend, stableToolName } from "../src/adapters/gemini.js";
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

  test("allow with no allow_once and no proceed_once optionId → cancelled (no over-grant)", () => {
    // Only allow_always present — must NOT select it (would be an over-grant).
    // The fix: remove the startsWith("allow") fallback; return cancelled instead.
    const opts = [
      { optionId: "proceed_always", kind: "allow_always" as const },
    ];
    const outcome = toAcpOutcome("allow", opts);
    expect(outcome).toEqual({ outcome: "cancelled" });
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
  test("max_turn_requests → complete", () => { expect(stopReasonToDoneReason("max_turn_requests")).toBe("complete"); });
  test("refusal → complete (agent refused — successful agentic decision, not a system error)", () => {
    // "refusal" means the agent chose to decline the request; it will have emitted
    // a text message explaining why. Mapping to "complete" is correct because the
    // session ran successfully to a terminal state — the refusal is content, not failure.
    expect(stopReasonToDoneReason("refusal")).toBe("complete");
  });
  test("cancelled → cancelled", () => { expect(stopReasonToDoneReason("cancelled")).toBe("cancelled"); });
  test("unknown stop reason → error (fail loud, not silent complete)", () => {
    // Unknown values must surface as errors so unexpected protocol changes are noticed.
    expect(stopReasonToDoneReason("something_totally_unknown")).toBe("error");
    expect(stopReasonToDoneReason("tool_error")).toBe("error");
    expect(stopReasonToDoneReason("")).toBe("error");
  });
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

  test("unknown stopReason → error event + done{error}", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-unknown-stop", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "hi" })) {
        events.push(evt);
      }
    })();

    await runFakeTurn(proc, { stopReason: "some_future_unknown_reason" });
    await sendPromise;

    const errorEvt = events.find((e) => e.type === "error") as Extract<GatewayEvent, { type: "error" }> | undefined;
    expect(errorEvt).toBeDefined();
    expect(errorEvt!.message).toContain("some_future_unknown_reason");

    const doneEvt = events.find((e) => e.type === "done") as Extract<GatewayEvent, { type: "done" }> | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("error");
  });

  test("cancel() while permission-request is outstanding → done{cancelled}, no error, pending permission resolved as deny", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-cancel-perm", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const events: GatewayEvent[] = [];
    let permRequestSeen = false;

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "do something" })) {
        events.push(evt);
        if (evt.type === "permission-request" && !permRequestSeen) {
          permRequestSeen = true;
          // Cancel while the permission promise is still unresolved
          await session.cancel();
        }
      }
    })();

    // Drive initialize and session/new
    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: {} } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "acp-cancel-perm" } }));
    await new Promise((r) => setTimeout(r, 5));

    // session/prompt is now outstanding — send a permission request
    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "srv-perm-cancel",
        method: "session/request_permission",
        params: {
          sessionId: "acp-cancel-perm",
          options: [
            { optionId: "proceed_always", name: "Allow All", kind: "allow_always" },
            { optionId: "proceed_once",   name: "Allow",     kind: "allow_once"  },
            { optionId: "cancel",         name: "Reject",    kind: "reject_once" },
          ],
          toolCall: {
            toolCallId: "write_file-pending",
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
    // cancel() fires inside the for-await when permission-request event is seen

    await sendPromise;

    // The stream must end with done{cancelled} and no error event
    expect(permRequestSeen).toBe(true);
    const doneEvt = events.find((e) => e.type === "done") as Extract<GatewayEvent, { type: "done" }> | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("cancelled");
    expect(events.some((e) => e.type === "error")).toBe(false);

    // The server permission response must have been sent as cancelled
    const writtenAll = getWritten(proc);
    const permResp = writtenAll.find((w) => w.id === "srv-perm-cancel") as
      | { result?: { outcome?: { outcome?: string } } }
      | undefined;
    expect(permResp).toBeDefined();
    expect(permResp!.result?.outcome?.outcome).toBe("cancelled");
  });

  test("acceptEdits mode: file/edit tool auto-accepted without permission-request event", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-ae-file", { cwd: "/tmp", permissionMode: "acceptEdits" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "write something" })) {
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
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "acp-ae" } }));
    await new Promise((r) => setTimeout(r, 5));

    // File tool permission request — should be auto-accepted
    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "srv-ae-file",
        method: "session/request_permission",
        params: {
          sessionId: "acp-ae",
          options: [
            { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
            { optionId: "cancel", name: "Reject", kind: "reject_once" },
          ],
          toolCall: {
            toolCallId: "write_file-111",
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

    // No permission-request event surfaced for file/edit tools
    expect(events.some((e) => e.type === "permission-request")).toBe(false);

    const writtenAll = getWritten(proc);
    const fileResp = writtenAll.find((w) => w.id === "srv-ae-file") as
      | { result?: { outcome?: { outcome?: string } } }
      | undefined;
    expect(fileResp).toBeDefined();
    expect(fileResp!.result?.outcome?.outcome).toBe("selected");

    // Complete the turn
    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq!.id, result: { stopReason: "end_turn" } }));
    await sendPromise;
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  test("acceptEdits mode: non-edit tool (shell) still surfaces permission-request", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-ae-shell", { cwd: "/tmp", permissionMode: "acceptEdits" }, spawnFn);
    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "run something" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          session.respondToPermission(evt.requestId, "allow");
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
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "acp-ae-shell" } }));
    await new Promise((r) => setTimeout(r, 5));

    // Shell tool permission request — must NOT be auto-accepted, must surface event
    proc._push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "srv-ae-shell",
        method: "session/request_permission",
        params: {
          sessionId: "acp-ae-shell",
          options: [
            { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
            { optionId: "cancel", name: "Reject", kind: "reject_once" },
          ],
          toolCall: {
            toolCallId: "shell-111",
            status: "pending",
            title: "shell",
            content: [],
            locations: [],
            kind: "shell",
          },
        },
      })
    );
    await new Promise((r) => setTimeout(r, 20));

    // permission-request event must be emitted for shell tool
    expect(events.some((e) => e.type === "permission-request")).toBe(true);
    const permEvt = events.find((e) => e.type === "permission-request") as
      | Extract<GatewayEvent, { type: "permission-request" }>
      | undefined;
    expect(permEvt!.tool).toBe("shell");

    // Complete the turn
    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq!.id, result: { stopReason: "end_turn" } }));
    await sendPromise;
  });
});

// ── stableToolName tests ──────────────────────────────────────────────────────

describe("stableToolName", () => {
  test("strips trailing -<digits> suffix", () => {
    expect(stableToolName("write_file-1781297128764")).toBe("write_file");
    expect(stableToolName("shell-123")).toBe("shell");
    expect(stableToolName("read_file-9999999999999")).toBe("read_file");
  });

  test("no digits suffix → returns toolCallId as-is", () => {
    expect(stableToolName("write_file")).toBe("write_file");
    expect(stableToolName("my-tool-name-without-digits")).toBe("my-tool-name-without-digits");
  });

  test("no digit suffix, title provided → returns title (stable tool name)", () => {
    // toolCallId has no digit suffix; title is the stable name to use
    expect(stableToolName("sometool", "display_name")).toBe("display_name");
  });

  test("prefers id-stripped name over title when suffix is present", () => {
    expect(stableToolName("write_file-111", "Write File")).toBe("write_file");
  });

  test("uses title as fallback when id has no digit suffix and title is provided", () => {
    // The id itself doesn't match the digit suffix pattern — fall through to title
    expect(stableToolName("xyz", "my_title")).toBe("my_title");
  });

  test("uses toolCallId when both id has no suffix and no title", () => {
    expect(stableToolName("bare_id")).toBe("bare_id");
  });
});

// ── toAcpOutcome missing-option tests ─────────────────────────────────────────

describe("toAcpOutcome — missing option edge cases", () => {
  test("allow with only reject options → cancelled (no over-grant)", () => {
    const opts = [{ optionId: "cancel", kind: "reject_once" as const }];
    expect(toAcpOutcome("allow", opts)).toEqual({ outcome: "cancelled" });
  });

  test("allow-session with only reject options → cancelled", () => {
    const opts = [{ optionId: "cancel", kind: "reject_once" as const }];
    // Falls back to allow → cancelled since no allow_once either
    expect(toAcpOutcome("allow-session", opts)).toEqual({ outcome: "cancelled" });
  });

  test("allow-session with only allow_always and no allow_once → selects allow_always (correct grant level)", () => {
    // allow-session IS allow_always — should select it, not cancel
    const opts = [
      { optionId: "proceed_always", kind: "allow_always" as const },
      { optionId: "cancel", kind: "reject_once" as const },
    ];
    expect(toAcpOutcome("allow-session", opts)).toEqual({
      outcome: "selected",
      optionId: "proceed_always",
    });
  });

  test("allow-session fallback: no allow_always but allow_once present → falls back to allow-once", () => {
    const opts = [
      { optionId: "proceed_once", kind: "allow_once" as const },
      { optionId: "cancel", kind: "reject_once" as const },
    ];
    const outcome = toAcpOutcome("allow-session", opts);
    expect(outcome).toEqual({ outcome: "selected", optionId: "proceed_once" });
  });

  test("allow-session with proceed_always optionId (no kind) → selects it", () => {
    const opts = [{ optionId: "proceed_always" }];
    expect(toAcpOutcome("allow-session", opts)).toEqual({
      outcome: "selected",
      optionId: "proceed_always",
    });
  });
});

// ── Process lifecycle / orphan prevention tests ───────────────────────────────

describe("GeminiSession process lifecycle", () => {
  test("clean turn 1 → process NOT killed (multi-turn reuse)", async () => {
    let killCalled = false;
    const proc = makeFakeProc();
    const origKill = proc.kill.bind(proc);
    proc.kill = (_sig?: string) => {
      killCalled = true;
      origKill(_sig);
    };

    const client = new JsonRpcClient(proc as never);
    const spawnFn = () => client;

    const session = new GeminiSession("gw-lifecycle-1", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "turn 1" })) {}
    })();

    await runFakeTurn(proc, { sessionId: "s-lt-1" });
    await sendPromise;

    // Process should remain alive for multi-turn reuse
    expect(killCalled).toBe(false);
  });

  test("turn 1 OK, turn 2 errors mid-stream → session._rpc nulled, session emits error+done{error}", async () => {
    // Use a multi-turn proc: turn 1 completes cleanly, turn 2 dies mid-stream.
    // We verify:
    //   1. After turn 1, _rpc is still set (process kept alive for multi-turn).
    //   2. After turn 2 error, events are error+done{error}.
    //   3. After turn 2, _rpc is null (process was cleaned up).
    const proc = makeFakeProc();
    const client = new JsonRpcClient(proc as never);
    const spawnFn = () => client;

    const session = new GeminiSession("gw-lifecycle-2", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);
    const turn1Events: GatewayEvent[] = [];

    // Turn 1 — completes cleanly
    const turn1 = (async () => {
      for await (const evt of session.send({ text: "turn 1" })) {
        turn1Events.push(evt);
      }
    })();

    await runFakeTurn(proc, { sessionId: "s-lt-2" });
    await turn1;

    // After turn 1, _rpc is still set (process reused for multi-turn)
    expect((session as unknown as { _rpc: unknown })._rpc).not.toBeNull();
    expect(turn1Events.some((e) => e.type === "done" && (e as Extract<GatewayEvent, { type: "done" }>).reason === "complete")).toBe(true);

    // Turn 2 — errors mid-stream (process dies while session/prompt is pending)
    const turn2Events: GatewayEvent[] = [];
    const turn2 = (async () => {
      for await (const evt of session.send({ text: "turn 2" })) {
        turn2Events.push(evt);
      }
    })();

    // Wait for session/prompt to be sent on turn 2
    await new Promise((r) => setTimeout(r, 20));

    // Kill the process mid-stream (simulates process death / error)
    proc._close();

    await turn2;

    // After an error turn, _rpc must be null (process cleaned up)
    expect((session as unknown as { _rpc: unknown })._rpc).toBeNull();

    // Turn 2 must emit error + done{error}
    const errorEvt = turn2Events.find((e) => e.type === "error") as Extract<GatewayEvent, { type: "error" }> | undefined;
    expect(errorEvt).toBeDefined();

    const doneEvt = turn2Events.find((e) => e.type === "done") as Extract<GatewayEvent, { type: "done" }> | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("error");
  });
});

// ── mcpServers pass-through tests ────────────────────────────────────────────

describe("GeminiSession mcpServers / systemContext", () => {
  test("mcpServers passed in opts appear in session/new params", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession(
      "gw-mcp-1",
      {
        cwd: "/tmp",
        permissionMode: "prompt",
        mcpServers: [
          { name: "my-server", command: "npx", args: ["my-mcp"], env: { FOO: "bar" } },
        ],
      },
      spawnFn
    );

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "hi" })) {}
    })();

    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);

    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1, agentCapabilities: {} } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    expect(newSess).toBeDefined();

    const params = newSess!.params as { mcpServers?: unknown };
    expect(Array.isArray(params.mcpServers)).toBe(true);
    const servers = params.mcpServers as Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
    expect(servers).toHaveLength(1);
    expect(servers[0]!.name).toBe("my-server");
    expect(servers[0]!.command).toBe("npx");
    expect(servers[0]!.args).toEqual(["my-mcp"]);
    expect(servers[0]!.env).toEqual({ FOO: "bar" });

    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s-mcp" } }));
    await new Promise((r) => setTimeout(r, 5));
    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq!.id, result: { stopReason: "end_turn" } }));
    await sendPromise;
  });

  test("no mcpServers → session/new params has empty array", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession("gw-mcp-empty", { cwd: "/tmp", permissionMode: "prompt" }, spawnFn);

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "hi" })) {}
    })();

    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);
    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1 } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    const params = newSess!.params as { mcpServers?: unknown };
    expect(params.mcpServers).toEqual([]);

    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s-empty" } }));
    await new Promise((r) => setTimeout(r, 5));
    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: promptReq!.id, result: { stopReason: "end_turn" } }));
    await sendPromise;
  });

  test("systemContext prepended to first prompt text only", async () => {
    const { spawnFn, proc } = makeFakeSpawn();
    const session = new GeminiSession(
      "gw-sys-ctx",
      { cwd: "/tmp", permissionMode: "prompt", systemContext: "You are a helpful assistant." },
      spawnFn
    );

    const sendPromise = (async () => {
      for await (const _ of session.send({ text: "hello" })) {}
    })();

    await new Promise((r) => setTimeout(r, 15));
    const written = getWritten(proc);
    const initReq = written.find((w) => w.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1 } }));
    await new Promise((r) => setTimeout(r, 5));

    const w2 = getWritten(proc);
    const newSess = w2.find((w) => w.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s-sysctx" } }));
    await new Promise((r) => setTimeout(r, 5));

    const w3 = getWritten(proc);
    const promptReq = w3.find((w) => w.method === "session/prompt") as
      | { params?: { prompt?: Array<{ type: string; text: string }> } }
      | undefined;
    expect(promptReq).toBeDefined();
    const firstTextBlock = promptReq!.params?.prompt?.[0];
    expect(firstTextBlock?.text).toContain("Context:\nYou are a helpful assistant.");
    expect(firstTextBlock?.text).toContain("---\nhello");

    proc._push(JSON.stringify({ jsonrpc: "2.0", id: (promptReq as Record<string, unknown>).id, result: { stopReason: "end_turn" } }));
    await sendPromise;
  });

  test("systemContext NOT prepended to second prompt turn", async () => {
    const proc = makeFakeProc();
    let killCallCount = 0;
    proc.kill = (_sig?: string) => {
      killCallCount++;
      proc._close();
    };
    const client = new JsonRpcClient(proc as never);
    const spawnFn = () => client;

    const session = new GeminiSession(
      "gw-sysctx-turn2",
      { cwd: "/tmp", permissionMode: "prompt", systemContext: "Be concise." },
      spawnFn
    );

    // Turn 1
    const turn1 = (async () => {
      for await (const _ of session.send({ text: "turn 1" })) {}
    })();

    await new Promise((r) => setTimeout(r, 15));
    const w = getWritten(proc);
    const initReq = w.find((w2) => w2.method === "initialize");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: initReq!.id, result: { protocolVersion: 1 } }));
    await new Promise((r) => setTimeout(r, 5));
    const w2 = getWritten(proc);
    const newSess = w2.find((w2) => w2.method === "session/new");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: newSess!.id, result: { sessionId: "s-t2" } }));
    await new Promise((r) => setTimeout(r, 5));
    const w3 = getWritten(proc);
    const p1 = w3.find((w2) => w2.method === "session/prompt") as Record<string, unknown>;
    // Verify turn 1 has context prepended
    const prompt1 = (p1.params as { prompt: Array<{ text: string }> }).prompt[0]!.text;
    expect(prompt1).toContain("Context:\nBe concise.");
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: p1.id, result: { stopReason: "end_turn" } }));
    await turn1;

    // Turn 2 — reuses same process (no kill happened)
    expect(killCallCount).toBe(0);

    const turn2 = (async () => {
      for await (const _ of session.send({ text: "turn 2" })) {}
    })();
    await new Promise((r) => setTimeout(r, 10));
    const w4 = getWritten(proc);
    const p2 = w4.find((w2) => w2.method === "session/prompt" && (w2.params as { sessionId?: string }).sessionId === "s-t2") as Record<string, unknown> | undefined;
    // Find the second session/prompt (same sessionId) — it should NOT have context prefix
    // We find the last session/prompt request
    const allPrompts = w4.filter((w2) => w2.method === "session/prompt") as Array<Record<string, unknown>>;
    const lastPrompt = allPrompts[allPrompts.length - 1]!;
    const promptText2 = (lastPrompt.params as { prompt: Array<{ text: string }> }).prompt[0]!.text;
    expect(promptText2).toBe("turn 2");
    expect(promptText2).not.toContain("Context:");

    void p2; // suppress unused warning
    proc._push(JSON.stringify({ jsonrpc: "2.0", id: lastPrompt.id, result: { stopReason: "end_turn" } }));
    await turn2;
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

  test("resumeSession throws because capabilities.resume=false", () => {
    const backend = new GeminiBackend();
    // resume: false — no session/load or session/resume in gemini ACP 0.24.4.
    // Callers must check capabilities().resume before calling resumeSession.
    expect(() =>
      backend.resumeSession("old-session-id", { cwd: "/tmp", permissionMode: "prompt" })
    ).toThrow(/capabilities\.resume=false/);
  });
});
