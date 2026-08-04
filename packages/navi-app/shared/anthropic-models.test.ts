import { describe, expect, test } from "bun:test";

import {
  CLAUDE_FABLE_5,
  CLAUDE_HAIKU_4_5,
  CLAUDE_OPUS_4_8,
  CLAUDE_OPUS_5,
  CLAUDE_SONNET_4_6,
  CLAUDE_SONNET_5,
  getCuratedAnthropicModels,
  mergeAnthropicModelOptions,
  normalizeAnthropicModelValue,
} from "./anthropic-models";

describe("normalizeAnthropicModelValue", () => {
  test("maps Claude SDK aliases to Navi's curated latest models", () => {
    expect(normalizeAnthropicModelValue("default")).toBe(CLAUDE_FABLE_5);
    expect(normalizeAnthropicModelValue("opus")).toBe(CLAUDE_OPUS_5);
    expect(normalizeAnthropicModelValue("fable")).toBe(CLAUDE_FABLE_5);
    expect(normalizeAnthropicModelValue("sonnet")).toBe(CLAUDE_SONNET_5);
    expect(normalizeAnthropicModelValue("haiku")).toBe(CLAUDE_HAIKU_4_5);
  });

  test("passes through previous-generation curated models", () => {
    expect(normalizeAnthropicModelValue(CLAUDE_OPUS_4_8)).toBe(CLAUDE_OPUS_4_8);
    expect(normalizeAnthropicModelValue(CLAUDE_SONNET_4_6)).toBe(CLAUDE_SONNET_4_6);
  });
});

describe("mergeAnthropicModelOptions", () => {
  test("replaces stale SDK alias metadata with curated current models", () => {
    const merged = mergeAnthropicModelOptions([
      {
        value: "default",
        displayName: "Default (recommended)",
        description: "Opus 4.6 · Most capable for complex work",
      },
      {
        value: "sonnet",
        displayName: "Sonnet",
        description: "Sonnet 4.5 · Best for everyday tasks",
      },
      {
        value: "haiku",
        displayName: "Haiku",
        description: "Haiku 4.5 · Fastest for quick answers",
      },
    ]);

    expect(merged).toEqual(getCuratedAnthropicModels());
  });

  test("keeps unknown Claude models after the curated latest set", () => {
    const merged = mergeAnthropicModelOptions([
      {
        value: "claude-opus-4-6",
        displayName: "Claude Opus 4.6",
        description: "Legacy snapshot",
      },
    ]);

    expect(merged[0]?.value).toBe(CLAUDE_FABLE_5);
    expect(merged[1]?.value).toBe(CLAUDE_OPUS_5);
    expect(merged[2]?.value).toBe(CLAUDE_SONNET_5);
    expect(merged[3]?.value).toBe(CLAUDE_OPUS_4_8);
    expect(merged[4]?.value).toBe(CLAUDE_SONNET_4_6);
    expect(merged[5]?.value).toBe(CLAUDE_HAIKU_4_5);
    expect(merged[6]?.value).toBe("claude-opus-4-6");
  });
});
