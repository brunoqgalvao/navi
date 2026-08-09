import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CONTEXT_WINDOW,
  getDefaultContextResetThresholdPercent,
  getEffectiveSessionContextWindow,
  getModelContextWindow,
} from "./context-window";

describe("model context window (runtime rule)", () => {
  test("current Anthropic models are 1M native", () => {
    // Mirrors the CLI's own model registry: window 1e6, native_1m.
    expect(getModelContextWindow("claude", "claude-fable-5")).toBe(1_000_000);
    expect(getModelContextWindow("claude", "claude-opus-5")).toBe(1_000_000);
    expect(getModelContextWindow("claude", "claude-opus-4-8")).toBe(1_000_000);
    expect(getModelContextWindow("claude", "claude-sonnet-5")).toBe(1_000_000);
    expect(getModelContextWindow("claude", "claude-sonnet-4-6")).toBe(1_000_000);
  });

  test("haiku is 200k unless the id opts into [1m]", () => {
    expect(getModelContextWindow("claude", "claude-haiku-4-5")).toBe(200_000);
    expect(getModelContextWindow("claude", "claude-haiku-4-5[1m]")).toBe(1_000_000);
  });

  test("unrecognized claude-runtime models fall back to 200k", () => {
    expect(getModelContextWindow("claude", "glm-5.2")).toBe(200_000);
    expect(getModelContextWindow("claude", "glm-5.2[1m]")).toBe(1_000_000);
  });

  test("codex and gemini keep the 1M default", () => {
    expect(getModelContextWindow("codex", "gpt-5.6-sol")).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(getModelContextWindow("gemini", "gemini-3-pro")).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});

describe("effective session context window", () => {
  test("the window reported by the runtime wins over the project budget", () => {
    expect(
      getEffectiveSessionContextWindow({
        sessionContextWindow: 1_000_000,
        projectContextWindow: 200_000,
        backend: "claude",
        model: "claude-fable-5",
      })
    ).toBe(1_000_000);
  });

  test("a runtime window larger than the registry is trusted", () => {
    // e.g. a [1m]-suffixed Haiku session, or a deployment with a raised cap.
    expect(
      getEffectiveSessionContextWindow({
        sessionContextWindow: 1_000_000,
        backend: "claude",
        model: "claude-haiku-4-5",
      })
    ).toBe(1_000_000);
  });

  test("ignores a reported window below the model's native size", () => {
    // A CLI pinned before Fable 5 shipped doesn't know the model and reports a
    // generic 200k, which made a 1M session look 5x fuller than it was.
    expect(
      getEffectiveSessionContextWindow({
        sessionContextWindow: 200_000,
        backend: "claude",
        model: "claude-fable-5",
      })
    ).toBe(1_000_000);
  });

  test("still trusts a genuinely small window for a small model", () => {
    expect(
      getEffectiveSessionContextWindow({
        sessionContextWindow: 200_000,
        backend: "claude",
        model: "claude-haiku-4-5",
      })
    ).toBe(200_000);
  });

  test("a project budget can cap the model window but never raise it", () => {
    expect(
      getEffectiveSessionContextWindow({
        projectContextWindow: 1_000_000,
        backend: "claude",
        model: "claude-haiku-4-5",
      })
    ).toBe(200_000);
    expect(
      getEffectiveSessionContextWindow({
        projectContextWindow: 100_000,
        backend: "claude",
        model: "claude-sonnet-5",
      })
    ).toBe(100_000);
  });

  test("falls back to the 1M default when nothing is known", () => {
    expect(getEffectiveSessionContextWindow({})).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});

describe("auto-compact threshold", () => {
  test("keeps legacy percentages when the output reserve is unknown", () => {
    expect(getDefaultContextResetThresholdPercent(1_000_000)).toBe(85);
    expect(getDefaultContextResetThresholdPercent(200_000)).toBe(70);
  });

  test("reserves the model's max output tokens", () => {
    // opus-4-8: usable input is 200k - 32k; 70% of that is 58.8% of the window.
    expect(getDefaultContextResetThresholdPercent(200_000, 32_000)).toBe(59);
    // 1M model with a 64k reserve: 85% of 936k ≈ 79.6% of the window.
    expect(getDefaultContextResetThresholdPercent(1_000_000, 64_000)).toBe(80);
  });
});
