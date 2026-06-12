/**
 * Tests for the Claude adapter — translation layer and permission pending-map.
 * No live SDK calls. All fixtures are plain objects matching SDK shapes.
 */
import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
  claudeMessageToEvents,
  ClaudeSession,
  makePermissionResult,
} from "../src/adapters/claude.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { GatewayEvent } from "../src/events.js";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeSystemInit(overrides: Record<string, unknown> = {}): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: "sdk-session-abc",
    model: "claude-opus-4-1",
    cwd: "/tmp/project",
    permissionMode: "default",
    tools: ["Bash", "Read", "Edit"],
    mcp_servers: [],
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.170",
    slash_commands: [],
    output_style: "plain",
    skills: [],
    plugins: [],
    uuid: "uuid-1" as `${string}-${string}-${string}-${string}-${string}`,
    ...overrides,
  } as SDKMessage;
}

function makeAssistantMsg(content: unknown[], overrides: Record<string, unknown> = {}): SDKMessage {
  return {
    type: "assistant",
    message: {
      id: "msg_abc",
      type: "message",
      role: "assistant",
      content,
      model: "claude-opus-4-1",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 10,
        cache_creation: null,
        inference_geo: null,
        iterations: null,
        output_tokens_details: null,
        server_tool_use: null,
        service_tier: null,
      },
      container: null,
      context_management: null,
      diagnostics: null,
      stop_details: null,
    },
    parent_tool_use_id: null,
    session_id: "sdk-session-abc",
    uuid: "uuid-2" as `${string}-${string}-${string}-${string}-${string}`,
    ...overrides,
  } as SDKMessage;
}

function makeResultSuccess(overrides: Record<string, unknown> = {}): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    session_id: "sdk-session-abc",
    duration_ms: 1234,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    result: "Done",
    stop_reason: "end_turn",
    total_cost_usd: 0.00123,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 5,
      cache_read_input_tokens: 10,
      webSearchRequests: 0,
      costUSD: 0.00123,
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "uuid-3" as `${string}-${string}-${string}-${string}-${string}`,
    ...overrides,
  } as SDKMessage;
}

function makeResultError(overrides: Record<string, unknown> = {}): SDKMessage {
  return {
    type: "result",
    subtype: "error_during_execution",
    session_id: "sdk-session-abc",
    duration_ms: 100,
    duration_api_ms: 50,
    is_error: true,
    num_turns: 0,
    stop_reason: null,
    total_cost_usd: 0,
    usage: {
      input_tokens: 10,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      webSearchRequests: 0,
      costUSD: 0,
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    modelUsage: {},
    permission_denials: [],
    errors: ["something broke"],
    uuid: "uuid-4" as `${string}-${string}-${string}-${string}-${string}`,
    ...overrides,
  } as SDKMessage;
}

function makeUserMsgWithToolResult(
  toolUseId: string,
  isError: boolean,
  content: unknown
): SDKMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: typeof content === "string" ? content : JSON.stringify(content),
          is_error: isError,
        },
      ],
    },
    parent_tool_use_id: null,
    session_id: "sdk-session-abc",
    uuid: "uuid-u1" as `${string}-${string}-${string}-${string}-${string}`,
  } as SDKMessage;
}

// ── claudeMessageToEvents tests ───────────────────────────────────────────────

describe("claudeMessageToEvents", () => {
  const SID = "gw-session-1";

  test("system/init → session-meta with backendSessionId and model", () => {
    const events = claudeMessageToEvents(makeSystemInit(), SID);
    expect(events).toEqual([
      {
        type: "session-meta",
        sessionId: SID,
        backendSessionId: "sdk-session-abc",
        model: "claude-opus-4-1",
        cwd: "/tmp/project",
      },
    ]);
  });

  test("assistant with text block → text-delta", () => {
    const msg = makeAssistantMsg([{ type: "text", text: "Hello world", citations: null }]);
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toContainEqual({
      type: "text-delta",
      sessionId: SID,
      text: "Hello world",
    });
  });

  test("assistant with thinking block → thinking-delta", () => {
    const msg = makeAssistantMsg([
      { type: "thinking", thinking: "Let me reason...", signature: "sig123" },
    ]);
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toContainEqual({
      type: "thinking-delta",
      sessionId: SID,
      text: "Let me reason...",
    });
  });

  test("assistant with tool_use block → tool-start", () => {
    const msg = makeAssistantMsg([
      {
        type: "tool_use",
        id: "tool-id-1",
        name: "Bash",
        input: { command: "ls -la" },
      },
    ]);
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toContainEqual({
      type: "tool-start",
      sessionId: SID,
      toolId: "tool-id-1",
      tool: "Bash",
      input: { command: "ls -la" },
    });
  });

  test("assistant with multiple content blocks → multiple events", () => {
    const msg = makeAssistantMsg([
      { type: "thinking", thinking: "thinking...", signature: "s" },
      { type: "text", text: "Here is my answer", citations: null },
      { type: "tool_use", id: "t1", name: "Read", input: { path: "foo.ts" } },
    ]);
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe("thinking-delta");
    expect(events[1]!.type).toBe("text-delta");
    expect(events[2]!.type).toBe("tool-start");
  });

  test("assistant with empty content → empty array", () => {
    const msg = makeAssistantMsg([]);
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toEqual([]);
  });

  test("assistant with error → error event", () => {
    const msg = makeAssistantMsg([], { error: "rate_limit" });
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", sessionId: SID })
    );
  });

  test("result/success → usage + done(complete)", () => {
    const events = claudeMessageToEvents(makeResultSuccess(), SID);
    const usage = events.find((e) => e.type === "usage");
    const done = events.find((e) => e.type === "done");
    expect(usage).toBeDefined();
    expect((usage as Extract<GatewayEvent, { type: "usage" }>).usage.inputTokens).toBe(100);
    expect((usage as Extract<GatewayEvent, { type: "usage" }>).usage.outputTokens).toBe(50);
    expect(done).toEqual({ type: "done", sessionId: SID, reason: "complete" });
  });

  test("result/success usage carries model from context (passed in)", () => {
    const events = claudeMessageToEvents(makeResultSuccess(), SID, "claude-opus-4-1");
    const usage = events.find((e) => e.type === "usage") as Extract<GatewayEvent, { type: "usage" }>;
    expect(usage!.usage.model).toBe("claude-opus-4-1");
  });

  test("result/error_during_execution → error + done(error)", () => {
    const events = claudeMessageToEvents(makeResultError(), SID);
    const errEvt = events.find((e) => e.type === "error");
    const done = events.find((e) => e.type === "done");
    expect(errEvt).toBeDefined();
    expect(done).toEqual({ type: "done", sessionId: SID, reason: "error" });
  });

  test("user message with tool_result → tool-end", () => {
    const msg = makeUserMsgWithToolResult("tool-id-1", false, "file content here");
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toContainEqual({
      type: "tool-end",
      sessionId: SID,
      toolId: "tool-id-1",
      result: "file content here",
      isError: false,
    });
  });

  test("user message with error tool_result → tool-end with isError true", () => {
    const msg = makeUserMsgWithToolResult("tool-id-2", true, "Permission denied");
    const events = claudeMessageToEvents(msg, SID);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool-end",
        sessionId: SID,
        toolId: "tool-id-2",
        isError: true,
      })
    );
  });

  test("unrecognized system subtype → empty array (no throw)", () => {
    const msg = {
      type: "system",
      subtype: "status",
      status: null,
      session_id: "sdk-session-abc",
      uuid: "uuid-x" as `${string}-${string}-${string}-${string}-${string}`,
    } as SDKMessage;
    expect(() => claudeMessageToEvents(msg, SID)).not.toThrow();
    expect(claudeMessageToEvents(msg, SID)).toEqual([]);
  });

  test("tool_progress message → empty array (no throw)", () => {
    const msg = {
      type: "tool_progress",
      tool_use_id: "t1",
      tool_name: "Bash",
      parent_tool_use_id: null,
      elapsed_time_seconds: 1.5,
      session_id: "sdk-session-abc",
      uuid: "uuid-tp" as `${string}-${string}-${string}-${string}-${string}`,
    } as SDKMessage;
    expect(() => claudeMessageToEvents(msg, SID)).not.toThrow();
    expect(claudeMessageToEvents(msg, SID)).toEqual([]);
  });
});

// ── makePermissionResult tests ────────────────────────────────────────────────

describe("makePermissionResult", () => {
  test("allow → behavior allow", () => {
    const r = makePermissionResult("allow", "Bash", "tool-id-1");
    expect(r.behavior).toBe("allow");
  });

  test("deny → behavior deny with message", () => {
    const r = makePermissionResult("deny", "Bash", "tool-id-1");
    expect(r.behavior).toBe("deny");
    if (r.behavior === "deny") {
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  test("allow-session → behavior allow with updatedPermissions for session", () => {
    const r = makePermissionResult("allow-session", "Bash", "tool-id-1");
    expect(r.behavior).toBe("allow");
    if (r.behavior === "allow") {
      expect(r.updatedPermissions).toBeDefined();
      expect(r.updatedPermissions!.length).toBeGreaterThan(0);
      const rule = r.updatedPermissions![0]!;
      expect(rule.type).toBe("addRules");
      if (rule.type === "addRules") {
        expect(rule.destination).toBe("session");
        expect(rule.behavior).toBe("allow");
      }
    }
  });
});

// ── Permission pending-map (ClaudeSession internals) ─────────────────────────

describe("ClaudeSession permission pending-map", () => {
  // We test by constructing a fake query function that calls canUseTool
  // and verifying the full round-trip without touching the real SDK.

  test("canUseTool callback → emits permission-request → respondToPermission resolves", async () => {
    // Arrange: a fake query that fires canUseTool once and yields messages
    type FakeQueryFn = (params: {
      prompt: string;
      options: { canUseTool?: Function; cwd?: string; model?: string };
    }) => AsyncGenerator<SDKMessage, void>;

    let capturedCanUseTool: Function | undefined;

    const fakeMessages: SDKMessage[] = [
      makeSystemInit(),
      makeResultSuccess(),
    ];

    const fakeQuery: FakeQueryFn = function* (params) {
      capturedCanUseTool = params.options?.canUseTool;
      for (const msg of fakeMessages) {
        yield msg;
      }
    } as unknown as FakeQueryFn;

    // Create a ClaudeSession with the fake query
    const session = new ClaudeSession(
      "gw-sess-1",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined, // no resume
      fakeQuery as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query
    );

    // Collect events from a send()
    const events: GatewayEvent[] = [];
    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "hello" })) {
        events.push(evt);
      }
    })();

    // Allow the generator to start and capture canUseTool
    await new Promise((r) => setTimeout(r, 0));

    // Verify canUseTool was wired
    expect(capturedCanUseTool).toBeDefined();

    // Await send to complete
    await sendPromise;

    // Should have seen session-meta, usage, done
    expect(events.some((e) => e.type === "session-meta")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  test("permission-request event emitted and respondToPermission resolves canUseTool", async () => {
    let resolvePermission: ((v: unknown) => void) | undefined;
    let capturedCanUseTool: Function | undefined;

    // fakeQuery that suspends on canUseTool, letting us test the callback path
    async function* fakeQuery(params: { prompt: string; options?: Record<string, unknown> }) {
      capturedCanUseTool = params.options?.canUseTool as Function;
      // yield init so session-meta fires
      yield makeSystemInit();
      // "use" canUseTool — simulate the SDK asking before a tool call
      if (capturedCanUseTool) {
        // Fire canUseTool asynchronously so the consumer can respond
        const permResultPromise = capturedCanUseTool("Bash", { command: "ls" }, {
          toolUseID: "t-perm-1",
          signal: new AbortController().signal,
          title: "Claude wants to run a command",
          description: "Run ls",
          displayName: "Run command",
        });
        // yield an assistant message with tool_use
        yield makeAssistantMsg([
          { type: "tool_use", id: "t-perm-1", name: "Bash", input: { command: "ls" } },
        ]);
        // wait for permission
        await permResultPromise;
      }
      yield makeResultSuccess();
    }

    const session = new ClaudeSession(
      "gw-sess-2",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      fakeQuery as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query
    );

    const events: GatewayEvent[] = [];
    let permRequestId: string | undefined;

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "run ls" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          permRequestId = evt.requestId;
          // Respond immediately
          session.respondToPermission(permRequestId, "allow");
        }
      }
    })();

    await sendPromise;

    // Verify we saw a permission-request event
    const permEvt = events.find((e) => e.type === "permission-request") as
      | Extract<GatewayEvent, { type: "permission-request" }>
      | undefined;
    expect(permEvt).toBeDefined();
    expect(permEvt!.tool).toBe("Bash");
    expect(permEvt!.sessionId).toBe("gw-sess-2");
    // tool-start should also be emitted
    expect(events.some((e) => e.type === "tool-start")).toBe(true);
    // done should arrive
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  test("deny respondToPermission → tool-end with isError (via user msg) or permission denied path", async () => {
    async function* fakeQuery(params: { prompt: string; options?: Record<string, unknown> }) {
      const canUseTool = params.options?.canUseTool as Function;
      yield makeSystemInit();
      if (canUseTool) {
        const permResult = canUseTool("Bash", { command: "rm -rf /" }, {
          toolUseID: "t-deny-1",
          signal: new AbortController().signal,
        });
        yield makeAssistantMsg([
          { type: "tool_use", id: "t-deny-1", name: "Bash", input: { command: "rm -rf /" } },
        ]);
        await permResult;
        // After denial, SDK would emit a user message with error tool_result
        yield makeUserMsgWithToolResult("t-deny-1", true, "Permission denied");
      }
      yield makeResultSuccess();
    }

    const session = new ClaudeSession(
      "gw-sess-3",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      fakeQuery as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query
    );

    const events: GatewayEvent[] = [];
    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "delete everything" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          session.respondToPermission(evt.requestId, "deny");
        }
      }
    })();
    await sendPromise;

    expect(events.some((e) => e.type === "permission-request")).toBe(true);
    const toolEnd = events.find((e) => e.type === "tool-end") as
      | Extract<GatewayEvent, { type: "tool-end" }>
      | undefined;
    expect(toolEnd).toBeDefined();
    expect(toolEnd!.isError).toBe(true);
  });

  // ── Fix 1: cancelled reason ──────────────────────────────────────────────────

  test("cancel() mid-stream → done{reason:'cancelled'} and no error event", async () => {
    // fakeQuery yields one message then blocks forever until the abort signal fires
    async function* fakeQuery(params: { prompt: string; options?: Record<string, unknown> }) {
      const abortController = params.options?.abortController as AbortController | undefined;
      yield makeSystemInit();
      // Block until abort fires (or a short safety timeout)
      await new Promise<void>((resolve) => {
        if (abortController?.signal.aborted) {
          resolve();
          return;
        }
        const onAbort = () => resolve();
        abortController?.signal.addEventListener("abort", onAbort, { once: true });
        // Safety: also resolve after 2 s so test can't hang forever
        setTimeout(resolve, 2000);
      });
      // Throw an AbortError as the SDK would when the signal fires
      const err = new DOMException("Aborted", "AbortError");
      throw err;
    }

    const session = new ClaudeSession(
      "gw-cancel-1",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      fakeQuery as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query
    );

    const events: GatewayEvent[] = [];

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "hello" })) {
        events.push(evt);
        // Cancel as soon as we see session-meta (i.e., after the first message)
        if (evt.type === "session-meta") {
          await session.cancel();
        }
      }
    })();

    await sendPromise;

    const doneEvt = events.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("cancelled");
    // No error event should be emitted on a clean cancel
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  // ── Fix 2: allow-session local guarantee ────────────────────────────────────

  test("allow-session: second canUseTool for same tool → no new permission-request", async () => {
    // fakeQuery calls canUseTool twice for the same tool name
    async function* fakeQuery(params: { prompt: string; options?: Record<string, unknown> }) {
      const canUseTool = params.options?.canUseTool as Function;
      yield makeSystemInit();

      // First canUseTool call — should emit a permission-request
      if (canUseTool) {
        const perm1 = canUseTool("Bash", { command: "ls" }, {
          toolUseID: "t-sess-1",
          signal: new AbortController().signal,
          title: "Run command",
        });
        yield makeAssistantMsg([
          { type: "tool_use", id: "t-sess-1", name: "Bash", input: { command: "ls" } },
        ]);
        await perm1;

        // Second canUseTool call for the same tool — should NOT emit permission-request
        const perm2 = canUseTool("Bash", { command: "pwd" }, {
          toolUseID: "t-sess-2",
          signal: new AbortController().signal,
          title: "Run command again",
        });
        yield makeAssistantMsg([
          { type: "tool_use", id: "t-sess-2", name: "Bash", input: { command: "pwd" } },
        ]);
        await perm2;
      }

      yield makeResultSuccess();
    }

    const session = new ClaudeSession(
      "gw-sess-allow",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      fakeQuery as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query
    );

    const events: GatewayEvent[] = [];
    let permissionRequestCount = 0;

    const sendPromise = (async () => {
      for await (const evt of session.send({ text: "run stuff" })) {
        events.push(evt);
        if (evt.type === "permission-request") {
          permissionRequestCount++;
          // Respond allow-session on the first (and only expected) request
          session.respondToPermission(evt.requestId, "allow-session");
        }
      }
    })();

    await sendPromise;

    // Exactly one permission-request should have been emitted
    expect(permissionRequestCount).toBe(1);
    // Both tool-start events should appear (both tool invocations were allowed)
    const toolStarts = events.filter((e) => e.type === "tool-start");
    expect(toolStarts).toHaveLength(2);
    // Stream should complete normally
    const doneEvt = events.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(doneEvt).toBeDefined();
    expect(doneEvt!.reason).toBe("complete");
  });

  // ── Fix 3: session reuse after cancel ────────────────────────────────────────

  test("send→cancel→send again on same session → second turn completes with done{reason:'complete'}", async () => {
    // First fakeQuery: blocks until abort, then throws AbortError
    let queryCallCount = 0;

    function makeFakeQuery() {
      return async function* fakeQuery(params: { prompt: string; options?: Record<string, unknown> }) {
        queryCallCount++;
        const callIndex = queryCallCount;

        if (callIndex === 1) {
          // First call: yield init, then block until abort
          const abortController = params.options?.abortController as AbortController | undefined;
          yield makeSystemInit();
          await new Promise<void>((resolve) => {
            if (abortController?.signal.aborted) {
              resolve();
              return;
            }
            abortController?.signal.addEventListener("abort", () => resolve(), { once: true });
            setTimeout(resolve, 2000); // safety timeout
          });
          throw new DOMException("Aborted", "AbortError");
        } else {
          // Second call: complete normally
          yield makeSystemInit();
          yield makeAssistantMsg([{ type: "text", text: "hello again", citations: null }]);
          yield makeResultSuccess();
        }
      };
    }

    const session = new ClaudeSession(
      "gw-reuse-1",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      makeFakeQuery() as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query
    );

    // --- First turn: cancel mid-stream ---
    const firstEvents: GatewayEvent[] = [];
    const firstSend = (async () => {
      for await (const evt of session.send({ text: "first" })) {
        firstEvents.push(evt);
        if (evt.type === "session-meta") {
          await session.cancel();
        }
      }
    })();
    await firstSend;

    const firstDone = firstEvents.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(firstDone).toBeDefined();
    expect(firstDone!.reason).toBe("cancelled");

    // --- Second turn: same session, normal completion ---
    const secondEvents: GatewayEvent[] = [];
    for await (const evt of session.send({ text: "second" })) {
      secondEvents.push(evt);
    }

    const secondDone = secondEvents.find((e) => e.type === "done") as
      | Extract<GatewayEvent, { type: "done" }>
      | undefined;
    expect(secondDone).toBeDefined();
    expect(secondDone!.reason).toBe("complete");
    // No error event on second turn
    expect(secondEvents.some((e) => e.type === "error")).toBe(false);
  });

  // ── Fix 4: respondToPermission with unknown requestId is a no-op ─────────────

  test("respondToPermission with unknown/stale requestId → silent no-op (no throw)", async () => {
    async function* fakeQuery(params: { prompt: string; options?: Record<string, unknown> }) {
      yield makeSystemInit();
      yield makeResultSuccess();
    }

    const session = new ClaudeSession(
      "gw-noop-1",
      { cwd: "/tmp", permissionMode: "prompt" },
      undefined,
      fakeQuery as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query
    );

    const events: GatewayEvent[] = [];
    for await (const evt of session.send({ text: "hello" })) {
      events.push(evt);
    }

    // After send completes, call respondToPermission with a bogus id — must not throw
    expect(() => {
      session.respondToPermission("totally-unknown-id", "allow");
    }).not.toThrow();

    // Also test after a cancel() clears pending permissions
    await session.cancel();
    expect(() => {
      session.respondToPermission("cleared-after-cancel-id", "deny");
    }).not.toThrow();
  });
});
