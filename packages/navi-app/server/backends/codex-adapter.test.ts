import { describe, expect, test } from "bun:test";

import {
  buildCodexExecPlan,
  buildCodexModelCatalog,
  describeCodexExit,
  unwrapCodexErrorMessage,
} from "./codex-adapter";
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
    const models = buildCodexModelCatalog("some-private-preview");

    expect(models[0]).toBe("some-private-preview");
    expect(models).toContain("gpt-5.6-sol");
    expect(models).toContain("gpt-5.2-codex");
    expect(models).toContain("codex-mini-latest");
  });

  test("does not duplicate a configured model that is already in the catalog", () => {
    const models = buildCodexModelCatalog("gpt-5.6-sol");

    expect(models.filter((m) => m === "gpt-5.6-sol")).toHaveLength(1);
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
          reasoningEffort: "extreme",
        },
      }),
      "gpt-5.4"
    );

    expect(plan.adjustedReasoningEffort).toEqual({
      from: "extreme",
      to: "high",
    });
    expect(plan.args).toContain('model_reasoning_effort="high"');
  });

  test("accepts valid reasoning effort values without clamping", () => {
    for (const effort of ["minimal", "low", "medium", "high", "xhigh"]) {
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

describe("codex error reporting", () => {
  test("unwraps the API message nested inside Codex's JSON error string", () => {
    const raw =
      '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5.2-codex\' model is not supported when using Codex with a ChatGPT account."}}';

    expect(unwrapCodexErrorMessage(raw)).toBe(
      "The 'gpt-5.2-codex' model is not supported when using Codex with a ChatGPT account."
    );
  });

  test("unwraps a turn.failed error object", () => {
    expect(unwrapCodexErrorMessage({ message: "Turn blew up" })).toBe("Turn blew up");
  });

  test("passes plain messages through untouched", () => {
    expect(unwrapCodexErrorMessage("stream disconnected")).toBe("stream disconnected");
  });

  test("names the model and echoes stderr when Codex exits without explaining itself", () => {
    const described = describeCodexExit(1, "gpt-5.2-codex", "boom: could not start\n");

    expect(described).toContain("gpt-5.2-codex");
    expect(described).toContain("boom: could not start");
  });

  test("still produces a usable message when stderr is empty", () => {
    expect(describeCodexExit(1, "gpt-5.6-sol", "")).toBe(
      'Codex exited with code 1 (model "gpt-5.6-sol").'
    );
  });
});
