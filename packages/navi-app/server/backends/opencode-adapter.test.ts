import { describe, expect, test } from "bun:test";
import {
  buildOpencodeCatalog,
  buildOpencodeRunArgs,
  createStreamState,
  normalizeOpencodeEvent,
  CURATED_PAID_OPENCODE_MODELS,
  DEFAULT_OPENCODE_MODEL,
} from "./opencode-adapter";
import type { QueryOptions } from "./types";

const baseOptions = (overrides: Partial<QueryOptions> = {}): QueryOptions => ({
  prompt: "do the thing",
  cwd: "/tmp/project",
  sessionId: "ui-session",
  ...overrides,
});

describe("buildOpencodeRunArgs", () => {
  test("defaults to the free model and auto-approves", () => {
    const { args, model } = buildOpencodeRunArgs(baseOptions(), DEFAULT_OPENCODE_MODEL);

    expect(model).toBe(DEFAULT_OPENCODE_MODEL);
    expect(args.slice(0, 5)).toEqual(["run", "--format", "json", "-m", DEFAULT_OPENCODE_MODEL]);
    expect(args).toContain("--auto");
    expect(args[args.length - 1]).toBe("do the thing");
  });

  test("pins the working directory with --dir: opencode ignores the spawn cwd", () => {
    const { args } = buildOpencodeRunArgs(
      baseOptions({ cwd: "/tmp/project" }),
      DEFAULT_OPENCODE_MODEL
    );

    expect(args[args.indexOf("--dir") + 1]).toBe("/tmp/project");
  });

  test("passes a supported effort as --variant", () => {
    const { args, variant } = buildOpencodeRunArgs(
      baseOptions({ backendOptions: { reasoningEffort: "high" } }),
      DEFAULT_OPENCODE_MODEL
    );

    expect(variant).toBe("high");
    expect(args).toContain("--variant");
    expect(args[args.indexOf("--variant") + 1]).toBe("high");
  });

  test("maps xhigh down to high, since opencode has no xhigh variant", () => {
    const { variant } = buildOpencodeRunArgs(
      baseOptions({ backendOptions: { reasoningEffort: "xhigh" } }),
      DEFAULT_OPENCODE_MODEL
    );

    expect(variant).toBe("high");
  });

  test("drops an unknown effort instead of guessing: a bad --variant fails the run", () => {
    const { args, variant } = buildOpencodeRunArgs(
      baseOptions({ backendOptions: { reasoningEffort: "turbo" } }),
      DEFAULT_OPENCODE_MODEL
    );

    expect(variant).toBeUndefined();
    expect(args).not.toContain("--variant");
  });

  test("resumes with -s", () => {
    const { args } = buildOpencodeRunArgs(
      baseOptions({ resume: "ses_abc" }),
      DEFAULT_OPENCODE_MODEL
    );

    expect(args[args.indexOf("-s") + 1]).toBe("ses_abc");
  });

  test("omits --auto when permissions deny", () => {
    const { args } = buildOpencodeRunArgs(
      baseOptions({ permissionMode: "deny" }),
      DEFAULT_OPENCODE_MODEL
    );

    expect(args).not.toContain("--auto");
  });
});

describe("buildOpencodeCatalog", () => {
  const apiModels = [
    {
      id: "nvidia/nemotron-3.5-lightning:free",
      context_length: 1_000_000,
      pricing: { prompt: "0" },
      supported_parameters: ["tools"],
    },
    {
      id: "z-ai/glm-5.2:free",
      context_length: 256_000,
      pricing: { prompt: "0" },
      supported_parameters: ["tools"],
    },
    {
      id: "someone/chat-only:free",
      context_length: 999_999,
      pricing: { prompt: "0" },
      supported_parameters: ["temperature"],
    },
    {
      id: "anthropic/claude-opus-4.6",
      context_length: 1_000_000,
      pricing: { prompt: "0.000005" },
      supported_parameters: ["tools"],
    },
  ];

  test("keeps only tool-capable models: a chat-only model cannot drive the harness", () => {
    const { models } = buildOpencodeCatalog(apiModels);

    expect(models).not.toContain("openrouter/someone/chat-only:free");
  });

  test("orders free models first, widest context first", () => {
    const { models } = buildOpencodeCatalog(apiModels);

    expect(models[0]).toBe("openrouter/nvidia/nemotron-3.5-lightning:free");
    expect(models[1]).toBe("openrouter/z-ai/glm-5.2:free");
  });

  test("appends curated paid models that still exist upstream", () => {
    const { models } = buildOpencodeCatalog(apiModels);

    expect(models).toContain("openrouter/anthropic/claude-opus-4.6");
    // Curated but absent from this catalog: must not be offered.
    expect(models).not.toContain("openrouter/openai/gpt-5.6-sol");
    expect(CURATED_PAID_OPENCODE_MODELS).toContain("openai/gpt-5.6-sol");
  });

  test("records the context window so the meter can use the model's real budget", () => {
    const { byId } = buildOpencodeCatalog(apiModels);

    expect(byId.get("openrouter/z-ai/glm-5.2:free")?.contextLength).toBe(256_000);
  });

  test("a :free id that is not actually free is treated as paid", () => {
    const { models } = buildOpencodeCatalog([
      {
        id: "vendor/not-really:free",
        context_length: 100,
        pricing: { prompt: "0.000001" },
        supported_parameters: ["tools"],
      },
    ]);

    expect(models).not.toContain("openrouter/vendor/not-really:free");
  });
});

describe("normalizeOpencodeEvent", () => {
  test("announces the backend session once, for resume", () => {
    const state = createStreamState();
    const first = normalizeOpencodeEvent({ type: "step_start", sessionID: "ses_1" }, "ui", state);
    const second = normalizeOpencodeEvent({ type: "step_start", sessionID: "ses_1" }, "ui", state);

    expect(first[0]).toEqual({
      type: "backend_session",
      backendId: "opencode",
      backendSessionId: "ses_1",
    });
    expect(second).toHaveLength(0);
  });

  test("emits finished text once, ignoring the in-progress version of the same part", () => {
    const state = createStreamState();
    const partial = normalizeOpencodeEvent(
      { type: "text", sessionID: "ses_1", part: { id: "prt_1", type: "text", text: "he" } },
      "ui",
      state
    );
    const finished = normalizeOpencodeEvent(
      {
        type: "text",
        sessionID: "ses_1",
        part: { id: "prt_1", type: "text", text: "hello", time: { start: 1, end: 2 } },
      },
      "ui",
      state
    );
    const repeat = normalizeOpencodeEvent(
      {
        type: "text",
        sessionID: "ses_1",
        part: { id: "prt_1", type: "text", text: "hello", time: { start: 1, end: 2 } },
      },
      "ui",
      state
    );

    expect(partial.filter((e) => e.type === "assistant")).toHaveLength(0);
    expect(finished.filter((e) => e.type === "assistant")).toHaveLength(1);
    expect(repeat).toHaveLength(0);
  });

  test("maps reasoning parts to thinking blocks", () => {
    const state = createStreamState();
    state.sessionAnnounced = true;
    const events = normalizeOpencodeEvent(
      {
        type: "reasoning",
        part: { id: "prt_r", type: "reasoning", text: "hmm", time: { start: 1, end: 2 } },
      },
      "ui",
      state
    );

    expect(events[0]).toMatchObject({
      type: "assistant",
      content: [{ type: "thinking", thinking: "hmm" }],
    });
  });

  test("emits tool_use once and tool_result on completion", () => {
    const state = createStreamState();
    state.sessionAnnounced = true;
    const running = normalizeOpencodeEvent(
      {
        type: "tool",
        part: {
          id: "prt_t",
          type: "tool",
          callID: "call_1",
          tool: "write",
          state: { status: "running", input: { filePath: "a.txt" }, time: { start: 1 } },
        },
      },
      "ui",
      state
    );
    const completed = normalizeOpencodeEvent(
      {
        type: "tool",
        part: {
          id: "prt_t",
          type: "tool",
          callID: "call_1",
          tool: "write",
          state: {
            status: "completed",
            input: { filePath: "a.txt" },
            output: "wrote a.txt",
            title: "write",
            metadata: {},
            time: { start: 1, end: 2 },
          },
        },
      },
      "ui",
      state
    );

    expect(running.filter((e) => e.type === "assistant")).toHaveLength(1);
    expect(running.some((e) => e.type === "tool_progress")).toBe(true);
    // The completed frame repeats the same call: no second tool_use.
    expect(completed.filter((e) => e.type === "assistant")).toHaveLength(0);
    expect(completed[0]).toMatchObject({
      type: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: "wrote a.txt" }],
    });
  });

  test("marks a failed tool as an error result", () => {
    const state = createStreamState();
    state.sessionAnnounced = true;
    state.emittedToolUse.add("call_2");
    const events = normalizeOpencodeEvent(
      {
        type: "tool",
        part: {
          id: "prt_e",
          type: "tool",
          callID: "call_2",
          tool: "bash",
          state: { status: "error", input: {}, error: "boom", time: { start: 1, end: 2 } },
        },
      },
      "ui",
      state
    );

    expect(events[0]).toMatchObject({
      content: [{ type: "tool_result", is_error: true, content: "boom" }],
    });
  });

  test("counts cached tokens toward context occupancy", () => {
    const state = createStreamState();
    state.sessionAnnounced = true;
    normalizeOpencodeEvent(
      {
        type: "step_finish",
        part: {
          id: "prt_s",
          type: "step-finish",
          reason: "stop",
          cost: 0.25,
          tokens: { input: 2210, output: 79, reasoning: 34, cache: { read: 97920, write: 0 } },
        },
      },
      "ui",
      state
    );

    expect(state.lastStep).toEqual({ input: 100130, output: 113, cost: 0.25 });
    expect(state.totalCost).toBe(0.25);
  });

  test("surfaces an upstream API error with its message", () => {
    const state = createStreamState();
    state.sessionAnnounced = true;
    const events = normalizeOpencodeEvent(
      {
        type: "error",
        error: { name: "APIError", data: { message: "glm-5.2:free is temporarily rate-limited" } },
      },
      "ui",
      state
    );

    expect(events[0]).toMatchObject({
      type: "error",
      error: "glm-5.2:free is temporarily rate-limited",
    });
  });
});
