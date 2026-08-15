import { beforeEach, describe, expect, test } from "bun:test";
import { get } from "svelte/store";

import { createMessageHandler } from "./messageHandler";
import { sessionMessages } from "../stores/session";
import { streamingStore } from "./streamingStore";

const SESSION_ID = "session-compact-test";
const COMPACT_SUMMARY = `This session is being continued from a previous conversation that ran out of context.

Summary:
1. Primary Request and Intent:
   - Keep working from the compacted thread.`;

describe("createMessageHandler", () => {
  beforeEach(() => {
    sessionMessages.set(new Map());
  });

  test("ignores compact summary user messages even without SDK metadata", () => {
    const handler = createMessageHandler({
      callbacks: {},
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    handler.handle({
      type: "user",
      uiSessionId: SESSION_ID,
      content: COMPACT_SUMMARY,
      parentToolUseId: null,
    });

    const stored = get(sessionMessages).get(SESSION_ID) || [];
    expect(stored).toHaveLength(0);
  });

  test("ignores ordinary plain user messages", () => {
    const handler = createMessageHandler({
      callbacks: {},
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    handler.handle({
      type: "user",
      uiSessionId: SESSION_ID,
      content: "Please continue fixing the bug.",
      parentToolUseId: null,
    });

    expect(get(sessionMessages).get(SESSION_ID) || []).toHaveLength(0);
  });

  test("stores SDK tool-result user messages", () => {
    const handler = createMessageHandler({
      callbacks: {},
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    const content = [
      {
        type: "tool_result" as const,
        tool_use_id: "toolu_123",
        content: "done",
      },
    ];

    handler.handle({
      type: "user",
      uiSessionId: SESSION_ID,
      content,
      parentToolUseId: null,
      isSynthetic: true,
    });

    const stored = get(sessionMessages).get(SESSION_ID) || [];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.role).toBe("user");
    expect(stored[0]?.content).toBe(content);
    expect(stored[0]?.isSynthetic).toBe(true);
  });

  test("live-updates context usage from main-chain assistant messages", () => {
    const updates: Array<{
      sessionId: string;
      usage: { input_tokens: number; cache_read_input_tokens?: number };
    }> = [];
    const handler = createMessageHandler({
      callbacks: {
        onAssistantUsage: (sessionId, usage) => updates.push({ sessionId, usage }),
      },
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    handler.handle({
      type: "assistant",
      uiSessionId: SESSION_ID,
      content: [{ type: "text", text: "working on it" }],
      parentToolUseId: null,
      usage: {
        input_tokens: 2,
        output_tokens: 11_301,
        cache_creation_input_tokens: 66_870,
        cache_read_input_tokens: 97_039,
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.sessionId).toBe(SESSION_ID);
    expect(updates[0]?.usage.cache_read_input_tokens).toBe(97_039);
  });

  test("ignores usage from sidechain and synthetic assistant messages", () => {
    const updates: unknown[] = [];
    const handler = createMessageHandler({
      callbacks: {
        onAssistantUsage: (sessionId, usage) => updates.push([sessionId, usage]),
      },
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    // Subagent (sidechain) usage tracks the subagent's context, not this session's.
    handler.handle({
      type: "assistant",
      uiSessionId: SESSION_ID,
      content: [{ type: "text", text: "subagent output" }],
      parentToolUseId: "toolu_parent",
      usage: {
        input_tokens: 5,
        output_tokens: 100,
        cache_read_input_tokens: 50_000,
        cache_creation_input_tokens: 0,
      },
    });

    // Synthetic error messages ("Prompt is too long") report all-zero usage.
    handler.handle({
      type: "assistant",
      uiSessionId: SESSION_ID,
      content: [{ type: "text", text: "Prompt is too long" }],
      parentToolUseId: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });

    expect(updates).toHaveLength(0);
  });

  test("keeps subagent streaming out of the parent's bubble", () => {
    const handler = createMessageHandler({
      callbacks: {},
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    handler.handle({
      type: "stream_event",
      uiSessionId: SESSION_ID,
      parentToolUseId: "toolu_subagent_1",
      event: { type: "message_start" },
    });
    handler.handle({
      type: "stream_event",
      uiSessionId: SESSION_ID,
      parentToolUseId: "toolu_subagent_1",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "subagent thinking out loud" },
      },
    });

    // The sidechain has its own transcript; leaking it here made the parent's
    // text appear and then jump when the real message landed.
    expect(get(streamingStore).get(SESSION_ID)?.partialText || "").toBe("");
  });

  test("still streams the parent's own tokens", () => {
    const handler = createMessageHandler({
      callbacks: {},
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    handler.handle({
      type: "stream_event",
      uiSessionId: SESSION_ID,
      parentToolUseId: null,
      event: { type: "message_start" },
    });
    handler.handle({
      type: "stream_event",
      uiSessionId: SESSION_ID,
      parentToolUseId: null,
      event: {
        type: "content_block_start",
        content_block: { type: "text", text: "" },
      },
    });
    handler.handle({
      type: "stream_event",
      uiSessionId: SESSION_ID,
      parentToolUseId: null,
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "parent speaking" },
      },
    });

    expect(get(streamingStore).get(SESSION_ID)?.isStreaming).toBe(true);
  });

  test("forwards the runtime-reported context window on done", () => {
    const infos: Array<{ contextWindow?: number; maxOutputTokens?: number }> = [];
    const handler = createMessageHandler({
      callbacks: {
        onContextInfo: (_sessionId, info) => infos.push(info),
      },
      getCurrentSessionId: () => SESSION_ID,
      getProjectId: () => "project-1",
    });

    handler.handle({
      type: "done",
      uiSessionId: SESSION_ID,
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
    });

    expect(infos).toEqual([{ contextWindow: 200_000, maxOutputTokens: 32_000 }]);
  });
});
