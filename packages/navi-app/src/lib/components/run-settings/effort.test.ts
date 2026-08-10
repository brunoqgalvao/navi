import { describe, expect, test } from "bun:test";
import { isEffortDisabled, effortDisabledReason, clampEffort } from "./effort";
import type { ReasoningEffort } from "../../stores";

const ALL: ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

describe("isEffortDisabled", () => {
  test("gemini has no Extra High or Max", () => {
    expect(isEffortDisabled("gemini", "xhigh")).toBe(true);
    expect(isEffortDisabled("gemini", "max")).toBe(true);
    expect(isEffortDisabled("gemini", "high")).toBe(false);
  });

  test("codex has no Max", () => {
    expect(isEffortDisabled("codex", "max")).toBe(true);
    expect(isEffortDisabled("codex", "xhigh")).toBe(false);
  });

  test("claude allows everything", () => {
    for (const effort of ALL) {
      expect(isEffortDisabled("claude", effort)).toBe(false);
    }
  });
});

describe("clampEffort", () => {
  test("an unsupported level falls back to the highest supported one", () => {
    expect(clampEffort("gemini", "max")).toBe("high");
    expect(clampEffort("gemini", "xhigh")).toBe("high");
    expect(clampEffort("codex", "max")).toBe("xhigh");
    expect(clampEffort("claude", "max")).toBe("max");
  });

  test("a supported level is returned untouched", () => {
    for (const effort of ALL) {
      expect(clampEffort("claude", effort)).toBe(effort);
    }
    expect(clampEffort("gemini", "medium")).toBe("medium");
    expect(clampEffort("codex", "xhigh")).toBe("xhigh");
  });

  test("clamping never returns a level it would itself disable", () => {
    for (const backend of ["claude", "codex", "gemini"] as const) {
      for (const effort of ALL) {
        expect(isEffortDisabled(backend, clampEffort(backend, effort))).toBe(false);
      }
    }
  });
});

describe("effortDisabledReason", () => {
  test("explains the clamp rather than just greying out", () => {
    expect(effortDisabledReason("gemini", "max")).toBe("Gemini supports up to High");
    expect(effortDisabledReason("codex", "max")).toBe("Codex supports up to Extra High");
  });

  test("is undefined when nothing is disabled", () => {
    expect(effortDisabledReason("claude", "max")).toBeUndefined();
    expect(effortDisabledReason("codex", "xhigh")).toBeUndefined();
  });
});
