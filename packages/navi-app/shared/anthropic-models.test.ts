import { describe, expect, test } from "bun:test";

import {
  CLAUDE_HAIKU_4_5,
  CLAUDE_OPUS_4_7,
  CLAUDE_SONNET_4_6,
  getCuratedAnthropicModels,
  mergeAnthropicModelOptions,
  normalizeAnthropicModelValue,
} from "./anthropic-models";

describe("normalizeAnthropicModelValue", () => {
  test("maps Claude SDK aliases to Navi's curated latest models", () => {
    expect(normalizeAnthropicModelValue("default")).toBe(CLAUDE_OPUS_4_7);
    expect(normalizeAnthropicModelValue("sonnet")).toBe(CLAUDE_SONNET_4_6);
    expect(normalizeAnthropicModelValue("haiku")).toBe(CLAUDE_HAIKU_4_5);
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

    expect(merged[0]?.value).toBe(CLAUDE_OPUS_4_7);
    expect(merged[1]?.value).toBe(CLAUDE_SONNET_4_6);
    expect(merged[2]?.value).toBe(CLAUDE_HAIKU_4_5);
    expect(merged[3]?.value).toBe("claude-opus-4-6");
  });
});
