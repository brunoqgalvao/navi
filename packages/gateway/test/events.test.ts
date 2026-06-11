import { describe, expect, test } from "bun:test";
import { GatewayEventSchema, type GatewayEvent } from "../src/events";

describe("GatewayEventSchema", () => {
  test("parses a text-delta event", () => {
    const e: GatewayEvent = { type: "text-delta", sessionId: "s1", text: "hi" };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a thinking-delta event", () => {
    const e: GatewayEvent = { type: "thinking-delta", sessionId: "s1", text: "hmm..." };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a tool-start event", () => {
    const e: GatewayEvent = {
      type: "tool-start",
      sessionId: "s1",
      toolId: "t1",
      tool: "bash",
      input: { command: "ls" },
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a tool-output event", () => {
    const e: GatewayEvent = {
      type: "tool-output",
      sessionId: "s1",
      toolId: "t1",
      chunk: "file1.txt\n",
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a tool-end event (minimal)", () => {
    const e: GatewayEvent = { type: "tool-end", sessionId: "s1", toolId: "t1" };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a tool-end event (full)", () => {
    const e: GatewayEvent = {
      type: "tool-end",
      sessionId: "s1",
      toolId: "t1",
      result: { exitCode: 0 },
      isError: false,
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a permission-request event", () => {
    const e: GatewayEvent = {
      type: "permission-request",
      sessionId: "s1",
      requestId: "r1",
      tool: "bash",
      description: "run ls",
      input: { command: "ls" },
      options: ["allow", "allow-session", "deny"],
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a usage event with normalized fields", () => {
    const e: GatewayEvent = {
      type: "usage",
      sessionId: "s1",
      usage: { inputTokens: 10, outputTokens: 5, model: "claude-opus-4-1", raw: {} },
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a usage event with all optional fields", () => {
    const e: GatewayEvent = {
      type: "usage",
      sessionId: "s1",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        costUsd: 0.003,
        model: "gpt-4o",
        raw: { prompt_tokens: 100 },
      },
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a session-meta event", () => {
    const e: GatewayEvent = {
      type: "session-meta",
      sessionId: "s1",
      backendSessionId: "backend-abc",
      model: "claude-opus-4-1",
      cwd: "/tmp/project",
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a session-meta event (empty)", () => {
    const e: GatewayEvent = { type: "session-meta", sessionId: "s1" };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses an agent-spawned event", () => {
    const e: GatewayEvent = {
      type: "agent-spawned",
      sessionId: "s1",
      childSessionId: "child-1",
      backend: "codex",
      task: "create hello.txt",
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses an error event (minimal)", () => {
    const e: GatewayEvent = { type: "error", sessionId: "s1", message: "something went wrong" };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses an error event (full)", () => {
    const e: GatewayEvent = {
      type: "error",
      sessionId: "s1",
      message: "fatal crash",
      detail: { code: 1 },
      fatal: true,
    };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a done event with reason complete", () => {
    const e: GatewayEvent = { type: "done", sessionId: "s1", reason: "complete" };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a done event with reason cancelled", () => {
    const e: GatewayEvent = { type: "done", sessionId: "s1", reason: "cancelled" };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("parses a done event with reason error", () => {
    const e: GatewayEvent = { type: "done", sessionId: "s1", reason: "error" };
    expect(GatewayEventSchema.parse(e)).toEqual(e);
  });

  test("rejects unknown event types", () => {
    expect(() => GatewayEventSchema.parse({ type: "nope", sessionId: "s1" })).toThrow();
  });

  test("rejects missing sessionId", () => {
    expect(() => GatewayEventSchema.parse({ type: "text-delta", text: "hi" })).toThrow();
  });

  test("rejects done event with invalid reason", () => {
    expect(() =>
      GatewayEventSchema.parse({ type: "done", sessionId: "s1", reason: "finished" })
    ).toThrow();
  });
});
