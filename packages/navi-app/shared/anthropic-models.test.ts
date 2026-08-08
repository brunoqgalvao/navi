import { describe, expect, test } from "bun:test";

import {
  CLAUDE_FABLE_5,
  CLAUDE_HAIKU_4_5,
  CLAUDE_OPUS_5,
  CLAUDE_SONNET_5,
  getAnthropicModelContextWindow,
  getCuratedAnthropicModels,
  mergeAnthropicModelOptions,
  normalizeAnthropicModelValue,
} from "./anthropic-models";

describe("normalizeAnthropicModelValue", () => {
  test("maps Claude SDK aliases to Navi's curated latest models", () => {
    expect(normalizeAnthropicModelValue("default")).toBe(CLAUDE_FABLE_5);
    expect(normalizeAnthropicModelValue("fable")).toBe(CLAUDE_FABLE_5);
    expect(normalizeAnthropicModelValue("opus")).toBe(CLAUDE_OPUS_5);
    expect(normalizeAnthropicModelValue("sonnet")).toBe(CLAUDE_SONNET_5);
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

    const curated = getCuratedAnthropicModels();
    expect(merged.slice(0, curated.length).map((m) => m.value)).toEqual(
      curated.map((m) => m.value)
    );
    expect(merged[curated.length]?.value).toBe("claude-opus-4-6");
  });
});

describe("getAnthropicModelContextWindow", () => {
  test("returns 1M for Fable/Opus/Sonnet-tier models", () => {
    expect(getAnthropicModelContextWindow(CLAUDE_FABLE_5)).toBe(1_000_000);
    expect(getAnthropicModelContextWindow("fable")).toBe(1_000_000);
    expect(getAnthropicModelContextWindow(CLAUDE_OPUS_5)).toBe(1_000_000);
    expect(getAnthropicModelContextWindow(CLAUDE_SONNET_5)).toBe(1_000_000);
    expect(getAnthropicModelContextWindow("claude-opus-4-6")).toBe(1_000_000);
  });

  test("returns 200K for Haiku models, including dated snapshots", () => {
    expect(getAnthropicModelContextWindow(CLAUDE_HAIKU_4_5)).toBe(200_000);
    expect(getAnthropicModelContextWindow("claude-haiku-4-5-20251001")).toBe(200_000);
  });

  test("returns null for unknown or non-Anthropic models", () => {
    expect(getAnthropicModelContextWindow("gpt-5.2-codex")).toBeNull();
    expect(getAnthropicModelContextWindow("")).toBeNull();
    expect(getAnthropicModelContextWindow(null)).toBeNull();
  });
});
