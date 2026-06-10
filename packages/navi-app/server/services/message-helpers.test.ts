import { describe, expect, test } from "bun:test";

import { shouldPersistUserMessage } from "./message-helpers";

const COMPACT_SUMMARY = `This session is being continued from a previous conversation that ran out of context.

Summary:
1. Primary Request and Intent:
   - Keep working from the compacted thread.`;

describe("shouldPersistUserMessage", () => {
  test("does not persist compact summaries even when the SDK omits isSynthetic", () => {
    expect(
      shouldPersistUserMessage({
        type: "user",
        content: COMPACT_SUMMARY,
      })
    ).toBe(false);
  });

  test("does not persist ordinary user prompts", () => {
    expect(
      shouldPersistUserMessage({
        type: "user",
        content: "Please continue fixing the bug.",
      })
    ).toBe(false);
  });

  test("persists tool-result user messages", () => {
    expect(
      shouldPersistUserMessage({
        type: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_123",
            content: "done",
          },
        ],
      })
    ).toBe(true);
  });
});
