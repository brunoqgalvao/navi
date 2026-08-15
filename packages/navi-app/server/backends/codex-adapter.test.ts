import { describe, expect, test } from "bun:test";

import {
  buildCodexExecPlan,
  buildCodexModelCatalog,
  describeCodexExit,
  unwrapCodexErrorMessage,
  CODEX_AUTO_COMPACT_TOKEN_LIMIT,
  CODEX_CONTEXT_WINDOW,
} from "./codex-adapter";
import { CodexAdapter } from "./codex-adapter";
import type { NormalizedEvent, QueryOptions } from "./types";

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

  test("uses workspace-write for auto-approved runs", () => {
    const plan = buildCodexExecPlan(
      createOptions({
        model: "gpt-5.2-codex",
        permissionMode: "auto",
      }),
      "gpt-5.2-codex"
    );

    expect(plan.args).toContain("--sandbox");
    expect(plan.args).toContain("workspace-write");
    // --full-auto is a deprecated alias for exactly this sandbox mode; passing
    // both only earns a deprecation warning on stderr.
    expect(plan.args).not.toContain("--full-auto");
    expect(plan.downgradedToReadOnly).toBe(false);
  });

  test("opens network access in the workspace-write sandbox", () => {
    const plan = buildCodexExecPlan(
      createOptions({ model: "gpt-5.4", permissionMode: "auto" }),
      "gpt-5.4",
      "workspace-write"
    );

    // Codex's workspace-write sandbox blocks DNS unless this is set, which
    // silently breaks every API/CLI the agent tries to reach.
    expect(plan.args).toContain("sandbox_workspace_write.network_access=true");
    expect(plan.networkAccess).toBe(true);
  });

  test("honors a danger-full-access sandbox configured by the user", () => {
    const plan = buildCodexExecPlan(
      createOptions({ model: "gpt-5.4", permissionMode: "auto" }),
      "gpt-5.4",
      "danger-full-access"
    );

    expect(plan.args).toContain("danger-full-access");
    expect(plan.args).not.toContain("workspace-write");
    // That mode is already unrestricted, so the network override is redundant.
    expect(plan.args).not.toContain("sandbox_workspace_write.network_access=true");
    expect(plan.networkAccess).toBe(true);
  });

  test("never widens the sandbox past read-only when approvals are required", () => {
    const plan = buildCodexExecPlan(
      createOptions({ model: "gpt-5.4", permissionMode: "confirm" }),
      "gpt-5.4",
      "danger-full-access"
    );

    expect(plan.args).toContain("read-only");
    expect(plan.args).not.toContain("danger-full-access");
    expect(plan.args).not.toContain("sandbox_workspace_write.network_access=true");
    expect(plan.networkAccess).toBe(false);
    expect(plan.downgradedToReadOnly).toBe(true);
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

describe("codex thread items", () => {
  // normalizeCodexItem is private; go through the public event normalizer.
  const normalize = (event: unknown) =>
    (new CodexAdapter() as any).normalizeCodexEvent(event, "s1") as NormalizedEvent | null;

  test("renders the agent's reply as an assistant message", () => {
    const event = normalize({
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "OK" },
    });

    expect(event).toEqual({
      type: "assistant",
      sessionId: "s1",
      content: [{ type: "text", text: "OK" }],
    });
  });

  test("renders reasoning as thinking", () => {
    const event = normalize({
      type: "item.completed",
      item: { type: "reasoning", text: "considering options" },
    });

    expect(event?.type).toBe("assistant");
    expect((event as any).content[0]).toEqual({
      type: "thinking",
      thinking: "considering options",
    });
  });

  test("renders a shell call as a Bash tool use plus result", () => {
    const event = normalize({
      type: "item.completed",
      item: {
        id: "item_3",
        type: "command_execution",
        command: "ls -la",
        aggregated_output: "total 0",
        exit_code: 0,
      },
    }) as any;

    expect(event.content[0].name).toBe("Bash");
    expect(event.content[0].input.command).toBe("ls -la");
    expect(event.content[1].content).toBe("total 0");
    expect(event.content[1].is_error).toBe(false);
  });

  test("marks a failed command as an error result", () => {
    const event = normalize({
      type: "item.completed",
      item: { type: "command_execution", command: "false", exit_code: 1 },
    }) as any;

    expect(event.content[1].is_error).toBe(true);
  });

  test("surfaces Codex's own compaction as status", () => {
    const event = normalize({
      type: "item.completed",
      item: { type: "context_compaction" },
    });

    expect(event?.type).toBe("system");
    expect((event as any).status).toContain("compacted");
  });

  test("ignores item types Navi has no rendering for", () => {
    expect(normalize({ type: "item.completed", item: { type: "todo_list" } })).toBeNull();
  });
});

describe("codex native compaction", () => {
  test("turns on auto-compaction with headroom below the context window", () => {
    const plan = buildCodexExecPlan(createOptions({ model: "gpt-5.6-sol" }), "gpt-5.6-sol");

    expect(plan.args).toContain(
      `model_auto_compact_token_limit=${CODEX_AUTO_COMPACT_TOKEN_LIMIT}`
    );
    expect(CODEX_AUTO_COMPACT_TOKEN_LIMIT).toBeLessThan(CODEX_CONTEXT_WINDOW);
  });
});
