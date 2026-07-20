import { describe, expect, test } from "bun:test";
import { extractModelContextInfo } from "./context-window";

describe("extractModelContextInfo", () => {
  const opus = {
    inputTokens: 10,
    outputTokens: 4_561,
    cacheReadInputTokens: 737_702,
    cacheCreationInputTokens: 113_618,
    webSearchRequests: 0,
    costUSD: 1.19,
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
  };
  const haiku = {
    inputTokens: 400,
    outputTokens: 20,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0.01,
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  };

  test("returns the reported window for the session model", () => {
    expect(extractModelContextInfo({ "claude-opus-4-8": opus }, "claude-opus-4-8")).toEqual({
      contextWindow: 200_000,
      maxOutputTokens: 32_000,
    });
  });

  test("falls back to the dominant model when the session model is missing", () => {
    // Title generation and subagents can add other models; the main model is the
    // one that consumed the context.
    expect(
      extractModelContextInfo({ "claude-haiku-4-5": haiku, "claude-opus-4-8": opus }, null)
    ).toEqual({ contextWindow: 200_000, maxOutputTokens: 32_000 });
  });

  test("returns null when nothing usable is reported", () => {
    expect(extractModelContextInfo(undefined, "claude-opus-4-8")).toBeNull();
    expect(extractModelContextInfo({}, null)).toBeNull();
    expect(
      extractModelContextInfo({ m: { inputTokens: 1 } as never }, "m")
    ).toBeNull();
  });
});
