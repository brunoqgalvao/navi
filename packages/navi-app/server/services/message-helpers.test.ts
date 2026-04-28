import { describe, expect, test } from "bun:test";

import { shouldPersistUserMessage } from "./message-helpers";

const COMPACT_SUMMARY = `This session is being continued from a previous conversation that ran out of context.

Summary:
1. Primary Request and Intent:
   - Keep working from the compacted thread.`;

describe("shouldPersistUserMessage", () => {
  test("persists compact summaries even when the SDK omits isSynthetic", () => {
    expect(
      shouldPersistUserMessage({
        type: "user",
        content: COMPACT_SUMMARY,
      })
    ).toBe(true);
  });

  test("does not persist ordinary user prompts", () => {
    expect(
      shouldPersistUserMessage({
        type: "user",
        content: "Please continue fixing the bug.",
      })
    ).toBe(false);
  });
});
