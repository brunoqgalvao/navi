import { describe, expect, test } from "bun:test";

import {
  getSdkUserMessageFlags,
  isCompactSummaryContent,
  shouldDisplayOrPersistUserMessage,
} from "./sdk-user-message";

const COMPACT_SUMMARY = `This session is being continued from a previous conversation that ran out of context.

Summary:
1. Primary Request and Intent:
   - Keep working from the compacted thread.`;

describe("sdk user message helpers", () => {
  test("detects compact summary text without explicit SDK flags", () => {
    expect(isCompactSummaryContent(COMPACT_SUMMARY)).toBe(true);

    expect(
      getSdkUserMessageFlags({
        message: { content: COMPACT_SUMMARY },
      })
    ).toEqual({
      isCompactSummary: true,
      isReplay: false,
      isSynthetic: true,
      toolUseResult: undefined,
    });
  });

  test("does not treat regular user text as a compact summary", () => {
    expect(isCompactSummaryContent("Please continue fixing the bug.")).toBe(false);

    expect(
      shouldDisplayOrPersistUserMessage({
        content: "Please continue fixing the bug.",
      })
    ).toBe(false);
  });
});
