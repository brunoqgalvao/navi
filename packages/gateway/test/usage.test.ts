import { describe, expect, test } from "bun:test";
import { normalizeUsage, PRICE_TABLE } from "../src/usage";

describe("normalizeUsage", () => {
  test("passes through token fields and sets model and raw", () => {
    const result = normalizeUsage("claude-sonnet-4-6", {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.raw).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  test("passes through optional cache token fields", () => {
    const result = normalizeUsage("claude-sonnet-4-6", {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
    });
    expect(result.cacheReadTokens).toBe(20);
    expect(result.cacheWriteTokens).toBe(10);
  });

  test("computes costUsd from PRICE_TABLE for known model", () => {
    const entry = PRICE_TABLE["claude-sonnet-4-6"];
    expect(entry).toBeDefined();

    const inputTokens = 1_000_000;
    const outputTokens = 1_000_000;
    const result = normalizeUsage("claude-sonnet-4-6", { inputTokens, outputTokens });
    const expected = entry.inPerMTok + entry.outPerMTok;
    expect(result.costUsd).toBeCloseTo(expected, 8);
  });

  test("explicit costUsd wins over computed value", () => {
    const result = normalizeUsage("claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      costUsd: 0.999,
    });
    expect(result.costUsd).toBe(0.999);
  });

  test("unknown model yields costUsd undefined (never throws)", () => {
    const result = normalizeUsage("some-future-model-x99", {
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(result.costUsd).toBeUndefined();
  });

  test("prefix matching: full versioned model name matches PRICE_TABLE entry", () => {
    // "claude-opus-4-1-20250805" should match "claude-opus-4-1"
    const result = normalizeUsage("claude-opus-4-1-20250805", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const entry = PRICE_TABLE["claude-opus-4-1"];
    expect(entry).toBeDefined();
    expect(result.costUsd).toBeCloseTo(entry.inPerMTok, 8);
  });

  test("prefix matching: longer prefix wins over shorter one", () => {
    // If PRICE_TABLE has "claude" and "claude-haiku-4-5", then
    // "claude-haiku-4-5-20260101" should match "claude-haiku-4-5" not "claude"
    const result = normalizeUsage("claude-haiku-4-5-20260101", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const entry = PRICE_TABLE["claude-haiku-4-5"];
    expect(entry).toBeDefined();
    expect(result.costUsd).toBeCloseTo(entry.inPerMTok, 8);
  });

  test("cache tokens are priced when table entry has cacheReadPerMTok", () => {
    // Find a model that has cacheReadPerMTok in the table
    const modelWithCache = Object.entries(PRICE_TABLE).find(([, v]) => v.cacheReadPerMTok != null);
    expect(modelWithCache).toBeDefined();
    const [modelId, entry] = modelWithCache!;

    const result = normalizeUsage(modelId, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    });
    const expected = entry.cacheReadPerMTok!;
    expect(result.costUsd).toBeCloseTo(expected, 8);
  });

  test("PRICE_TABLE is exported and contains expected model keys", () => {
    const expectedKeys = [
      "claude-opus-4-1",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "gpt-5.2-codex",
      "o3",
      "gemini-3-flash-preview",
      "gemini-2.5-pro",
    ];
    for (const key of expectedKeys) {
      expect(PRICE_TABLE[key], `expected PRICE_TABLE["${key}"] to exist`).toBeDefined();
    }
  });

  test("PRICE_TABLE entries have numeric inPerMTok and outPerMTok", () => {
    for (const [key, entry] of Object.entries(PRICE_TABLE)) {
      expect(typeof entry.inPerMTok, `${key}.inPerMTok`).toBe("number");
      expect(typeof entry.outPerMTok, `${key}.outPerMTok`).toBe("number");
    }
  });
});
