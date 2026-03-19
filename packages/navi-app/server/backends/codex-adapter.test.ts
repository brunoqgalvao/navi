import { describe, expect, test } from "bun:test";

import { buildCodexExecPlan, buildCodexModelCatalog } from "./codex-adapter";
import type { QueryOptions } from "./types";

function createOptions(overrides: Partial<QueryOptions> = {}): QueryOptions {
  return {
    prompt: "Reply with OK.",
    cwd: process.cwd(),
    sessionId: "test-session",
    ...overrides,
  };
}

describe("codex adapter helpers", () => {
  test("merges the locally configured model into the visible model catalog", () => {
    const models = buildCodexModelCatalog("gpt-5.4");

    expect(models[0]).toBe("gpt-5.4");
    expect(models).toContain("gpt-5.2-codex");
    expect(models).toContain("gpt-5-codex");
    expect(models).toContain("codex-mini-latest");
  });

  test("uses workspace-write plus full-auto for auto-approved runs", () => {
    const plan = buildCodexExecPlan(
      createOptions({
        model: "gpt-5.2-codex",
        permissionMode: "auto",
      }),
      "gpt-5.2-codex"
    );

    expect(plan.args).toContain("--sandbox");
    expect(plan.args).toContain("workspace-write");
    expect(plan.args).toContain("--full-auto");
    expect(plan.downgradedToReadOnly).toBe(false);
  });

  test("downgrades confirm mode to read-only because exec has no approval callback bridge", () => {
    const plan = buildCodexExecPlan(
      createOptions({
        model: "gpt-5.2-codex",
        permissionMode: "confirm",
      }),
      "gpt-5.2-codex"
    );

    expect(plan.args).toContain("--sandbox");
    expect(plan.args).toContain("read-only");
    expect(plan.args).not.toContain("--full-auto");
    expect(plan.downgradedToReadOnly).toBe(true);
  });

  test("clamps incompatible reasoning effort for any model", () => {
    const plan = buildCodexExecPlan(
      createOptions({
        model: "gpt-5.4",
        backendOptions: {
          reasoningEffort: "xhigh",
        },
      }),
      "gpt-5.4"
    );

    expect(plan.adjustedReasoningEffort).toEqual({
      from: "xhigh",
      to: "high",
    });
    expect(plan.args).toContain('model_reasoning_effort="high"');
  });

  test("accepts valid reasoning effort values without clamping", () => {
    for (const effort of ["minimal", "low", "medium", "high"]) {
      const plan = buildCodexExecPlan(
        createOptions({
          model: "gpt-5.4",
          backendOptions: { reasoningEffort: effort },
        }),
        "gpt-5.4"
      );
      expect(plan.adjustedReasoningEffort).toBeUndefined();
      expect(plan.args).toContain(`model_reasoning_effort="${effort}"`);
    }
  });
});
