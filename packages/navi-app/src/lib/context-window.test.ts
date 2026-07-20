import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CONTEXT_WINDOW,
  getDefaultContextResetThresholdPercent,
  getEffectiveSessionContextWindow,
  getModelContextWindow,
} from "./context-window";

describe("model context window (runtime rule)", () => {
  test("claude models are 200k unless the id opts into [1m]", () => {
    // The bundled Claude Code CLI hardcodes: model id contains "[1m]" → 1M, else 200k.
    expect(getModelContextWindow("claude", "claude-opus-4-8")).toBe(200_000);
    expect(getModelContextWindow("claude", "claude-fable-5")).toBe(200_000);
    expect(getModelContextWindow("claude", "claude-sonnet-5[1m]")).toBe(1_000_000);
    expect(getModelContextWindow("claude", "glm-5.2[1m]")).toBe(1_000_000);
    expect(getModelContextWindow("claude", "glm-5.2")).toBe(200_000);
  });

  test("codex and gemini keep the 1M default", () => {
    expect(getModelContextWindow("codex", "gpt-5.2-codex")).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(getModelContextWindow("gemini", "gemini-3-pro")).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});

describe("effective session context window", () => {
  test("the window reported by the runtime wins over everything", () => {
    expect(
      getEffectiveSessionContextWindow({
        sessionContextWindow: 200_000,
        projectContextWindow: 1_000_000,
        backend: "claude",
        model: "claude-sonnet-5[1m]",
      })
    ).toBe(200_000);
  });

  test("a project budget can cap the model window but never raise it", () => {
    // The 92.8k/1000k incident: project said 1M, the model's real window was 200k.
    expect(
      getEffectiveSessionContextWindow({
        projectContextWindow: 1_000_000,
        backend: "claude",
        model: "claude-opus-4-8",
      })
    ).toBe(200_000);
    expect(
      getEffectiveSessionContextWindow({
        projectContextWindow: 100_000,
        backend: "claude",
        model: "claude-sonnet-5[1m]",
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
