import { beforeEach, describe, expect, test } from "bun:test";
import { get } from "svelte/store";

import { createMessageHandler } from "./messageHandler";
import { sessionMessages } from "../stores/session";

const SESSION_ID = "session-compact-test";
const COMPACT_SUMMARY = `This session is being continued from a previous conversation that ran out of context.

Summary:
1. Primary Request and Intent:
   - Keep working from the compacted thread.`;

describe("createMessageHandler", () => {
  beforeEach(() => {
    sessionMessages.set(new Map());
  });

  test("stores compact summary user messages even without SDK metadata", () => {
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
    expect(stored).toHaveLength(1);
    expect(stored[0]?.role).toBe("user");
    expect(stored[0]?.content).toBe(COMPACT_SUMMARY);
    expect(stored[0]?.isSynthetic).toBe(true);
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
});
