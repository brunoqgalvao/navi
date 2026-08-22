/**
 * opencode Backend Adapter
 *
 * Adapts the opencode CLI (`opencode run --format json`) to the unified backend
 * interface. opencode speaks NDJSON: one JSON object per line, each carrying a
 * `part` whose shape is documented in @opencode-ai/sdk (TextPart, ReasoningPart,
 * ToolPart, StepFinishPart).
 *
 * Models come from OpenRouter: opencode routes `openrouter/<vendor>/<model>` natively
 * as long as OPENROUTER_API_KEY is in the environment, so Navi contributes the key and
 * the catalog rather than an OpenRouter client of its own. The default is a free model
 * on purpose — an opencode turn spends ~90-100k input tokens on its system prompt and
 * tool definitions before doing any work, which is expensive on a paid model.
 */

import { spawn, execFileSync, ChildProcess } from "child_process";
import { resolveCliExecutable } from "../utils/cli-resolver";
import { globalSettings } from "../db";
import type {
  BackendAdapter,
  BackendInfo,
  QueryOptions,
  NormalizedEvent,
  PermissionResponse,
} from "./types";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** Verified free + tool-capable, and the cheapest possible way to run this harness. */
export const DEFAULT_OPENCODE_MODEL = "openrouter/nvidia/nemotron-3.5-lightning:free";

/**
 * Fallback catalog for when the OpenRouter API is unreachable. Free, tool-capable
 * models only — a model without tool support cannot drive an agent harness at all.
 */
export const FALLBACK_OPENCODE_MODELS = [
  "openrouter/nvidia/nemotron-3.5-lightning:free",
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/z-ai/glm-5.2:free",
  "openrouter/cohere/north-mini-code:free",
  "openrouter/google/gemma-4-31b-it:free",
  "openrouter/dots-studio/dots-3-note-preview:free",
];

/**
 * Paid models worth offering next to the free tier. Filtered against the live catalog,
 * so an id that disappears upstream simply stops being offered.
 */
export const CURATED_PAID_OPENCODE_MODELS = [
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6",
  "google/gemini-3-pro-preview",
  "google/gemini-2.5-flash",
  "z-ai/glm-5.2",
];

/** opencode's --variant is provider-specific; these are the levels it accepts. */
const OPENCODE_VARIANTS = new Set(["minimal", "low", "medium", "high", "max"]);

const CATALOG_TTL_MS = 60 * 60 * 1000;

type CatalogEntry = { id: string; contextLength: number; free: boolean };

let catalogCache: { models: string[]; byId: Map<string, CatalogEntry>; fetchedAt: number } | null =
  null;
let catalogInFlight: Promise<void> | null = null;

export function resolveOpencodeExecutable(): string | null {
  return resolveCliExecutable({
    command: "opencode",
    envVarNames: ["NAVI_OPENCODE_PATH", "OPENCODE_PATH", "OPENCODE_EXECUTABLE"],
    // The user's own install wins: opencode ships as a compiled binary per platform,
    // and a stale bundled copy is the harder failure to diagnose.
    preferInstalled: true,
  });
}

/** The key opencode needs to see for its `openrouter` provider to exist at all. */
export function resolveOpenrouterKey(): string | null {
  let stored: string | null = null;
  try {
    stored = globalSettings.get("openrouterApiKey");
  } catch {
    // The settings table is unavailable outside a booted server (scripts, tests).
    // The env var is a complete answer on its own, so this is not worth failing over.
  }
  return (stored && stored.trim()) || process.env.OPENROUTER_API_KEY || null;
}

/**
 * Build the OpenRouter model catalog: every free tool-capable model, then the curated
 * paid ones that still exist upstream. Tool support is the hard filter — opencode drives
 * everything through tool calls, so a chat-only model produces a turn that does nothing.
 */
export function buildOpencodeCatalog(apiModels: any[]): {
  models: string[];
  byId: Map<string, CatalogEntry>;
} {
  const byId = new Map<string, CatalogEntry>();
  const free: string[] = [];
  const available = new Set<string>();

  for (const model of apiModels) {
    const id = typeof model?.id === "string" ? model.id : null;
    if (!id) continue;

    const supported = Array.isArray(model?.supported_parameters)
      ? model.supported_parameters
      : [];
    if (!supported.includes("tools")) continue;

    const promptPrice = Number(model?.pricing?.prompt ?? 1);
    const isFree = id.endsWith(":free") && promptPrice === 0;
    const entry: CatalogEntry = {
      id: `openrouter/${id}`,
      contextLength: Number(model?.context_length ?? 0),
      free: isFree,
    };

    available.add(id);
    byId.set(entry.id, entry);
    if (isFree) free.push(entry.id);
  }

  // Free first, widest context first: the free tier is the default, so the model most
  // likely to survive a long run should be at the top of it.
  free.sort((a, b) => (byId.get(b)?.contextLength ?? 0) - (byId.get(a)?.contextLength ?? 0));

  const paid = CURATED_PAID_OPENCODE_MODELS.filter((id) => available.has(id)).map(
    (id) => `openrouter/${id}`
  );

  return { models: [...free, ...paid], byId };
}

async function refreshCatalog(): Promise<void> {
  if (catalogInFlight) return catalogInFlight;

  catalogInFlight = (async () => {
    try {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return;

      const payload = (await response.json()) as { data?: any[] };
      const { models, byId } = buildOpencodeCatalog(payload?.data ?? []);
      if (models.length) {
        catalogCache = { models, byId, fetchedAt: Date.now() };
      }
    } catch (e) {
      console.error(
        "[OpencodeAdapter] OpenRouter catalog fetch failed, using fallback list:",
        e instanceof Error ? e.message : e
      );
    } finally {
      catalogInFlight = null;
    }
  })();

  return catalogInFlight;
}

function catalogIsStale(): boolean {
  return !catalogCache || Date.now() - catalogCache.fetchedAt > CATALOG_TTL_MS;
}

export function buildOpencodeRunArgs(
  options: QueryOptions,
  defaultModel: string
): { args: string[]; model: string; variant?: string } {
  const model = options.model || defaultModel;
  const backendOpts = options.backendOptions || {};
  const requestedEffort =
    typeof backendOpts.reasoningEffort === "string" ? backendOpts.reasoningEffort.trim() : "";

  // Navi's "xhigh" has no opencode equivalent; "max" does. Anything unknown is dropped
  // rather than guessed — an unsupported --variant fails the whole run.
  const effort = requestedEffort === "xhigh" ? "high" : requestedEffort;
  const variant = OPENCODE_VARIANTS.has(effort) ? effort : undefined;

  // --dir is not optional: `opencode run` resolves its project directory from the
  // environment, not from the spawn cwd, and without it a chat in one project writes
  // files into whichever directory the Navi server itself was started in.
  const args = ["run", "--format", "json", "-m", model, "--dir", options.cwd];
  if (variant) args.push("--variant", variant);
  if (options.resume) args.push("-s", options.resume);
  // `run` already executes tools without prompting; --auto additionally clears the
  // permissions that are merely not-explicitly-allowed, so the turn cannot stall
  // waiting on a TTY that Navi never gives it.
  if (options.permissionMode !== "deny") args.push("--auto");
  args.push(options.prompt);

  return { args, model, variant };
}

type StreamState = {
  emittedText: Set<string>;
  emittedToolUse: Set<string>;
  emittedToolResult: Set<string>;
  sessionAnnounced: boolean;
  lastStep: { input: number; output: number; cost: number } | null;
  totalCost: number;
};

export function createStreamState(): StreamState {
  return {
    emittedText: new Set(),
    emittedToolUse: new Set(),
    emittedToolResult: new Set(),
    sessionAnnounced: false,
    lastStep: null,
    totalCost: 0,
  };
}

/**
 * Map one opencode NDJSON line to normalized events.
 *
 * opencode re-emits a part every time it changes, so every branch is keyed by part id
 * or callID: without that, a streamed answer lands in the transcript several times over.
 */
export function normalizeOpencodeEvent(
  event: any,
  sessionId: string,
  state: StreamState
): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  if (!event || typeof event !== "object") return out;

  if (!state.sessionAnnounced && typeof event.sessionID === "string" && event.sessionID) {
    state.sessionAnnounced = true;
    out.push({
      type: "backend_session",
      backendId: "opencode",
      backendSessionId: event.sessionID,
    });
  }

  if (event.type === "error") {
    const data = event.error?.data ?? {};
    const message =
      (typeof data.message === "string" && data.message) ||
      (typeof event.error?.name === "string" && event.error.name) ||
      "opencode reported an error";
    out.push({ type: "error", sessionId, error: message });
    return out;
  }

  const part = event.part;
  if (!part || typeof part !== "object") return out;

  switch (part.type) {
    case "text": {
      // Only finished text is emitted: opencode marks completion with time.end, and an
      // in-progress part would otherwise be appended again on every update.
      const text = typeof part.text === "string" ? part.text : "";
      if (!text || part.synthetic || part.ignored) break;
      if (!part.time?.end) break;
      if (state.emittedText.has(part.id)) break;
      state.emittedText.add(part.id);
      out.push({ type: "assistant", sessionId, content: [{ type: "text", text }] });
      break;
    }

    case "reasoning": {
      const text = typeof part.text === "string" ? part.text : "";
      if (!text || !part.time?.end) break;
      if (state.emittedText.has(part.id)) break;
      state.emittedText.add(part.id);
      out.push({
        type: "assistant",
        sessionId,
        content: [{ type: "thinking", thinking: text }],
      });
      break;
    }

    case "tool": {
      const callId = part.callID || part.id;
      const status = part.state?.status;
      if (!callId || !status) break;

      if (status !== "pending" && !state.emittedToolUse.has(callId)) {
        state.emittedToolUse.add(callId);
        out.push({
          type: "assistant",
          sessionId,
          content: [
            {
              type: "tool_use",
              id: callId,
              name: part.tool || "tool",
              input: (part.state?.input as Record<string, unknown>) || {},
            },
          ],
        });
      }

      if (status === "running") {
        out.push({
          type: "tool_progress",
          toolUseId: callId,
          toolName: part.tool || "tool",
        });
      }

      if ((status === "completed" || status === "error") && !state.emittedToolResult.has(callId)) {
        state.emittedToolResult.add(callId);
        out.push({
          type: "user",
          sessionId,
          content: [
            {
              type: "tool_result",
              tool_use_id: callId,
              content:
                status === "error"
                  ? String(part.state?.error ?? "Tool failed")
                  : String(part.state?.output ?? ""),
              ...(status === "error" && { is_error: true }),
            },
          ],
        });
      }
      break;
    }

    case "step-finish": {
      const tokens = part.tokens ?? {};
      // Cached tokens still occupy the context window, so the meter needs their sum —
      // opencode reports a resumed step as ~2k fresh input plus ~98k cache read.
      const input =
        (tokens.input ?? 0) + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0);
      const output = (tokens.output ?? 0) + (tokens.reasoning ?? 0);
      state.lastStep = { input, output, cost: Number(part.cost ?? 0) };
      state.totalCost += Number(part.cost ?? 0);
      break;
    }
  }

  return out;
}

export class OpencodeAdapter implements BackendAdapter {
  readonly id = "opencode" as const;
  readonly name = "opencode";
  readonly supportsCallbackPermissions = false; // `run` mode has no approval bridge
  readonly supportsResume = true;

  readonly defaultModel = DEFAULT_OPENCODE_MODEL;

  get models(): string[] {
    if (catalogIsStale()) void refreshCatalog();
    return catalogCache?.models ?? FALLBACK_OPENCODE_MODELS;
  }

  /** Context budget for a model, when the OpenRouter catalog knows it. */
  contextWindowFor(model: string): number | undefined {
    const entry = catalogCache?.byId.get(model);
    return entry?.contextLength || undefined;
  }

  private childProcess: ChildProcess | null = null;

  async detect(): Promise<BackendInfo> {
    const opencodePath = resolveOpencodeExecutable();

    // Warm the catalog while the UI is asking about backends anyway.
    if (catalogIsStale()) void refreshCatalog();

    let version: string | undefined;
    if (opencodePath) {
      try {
        version = execFileSync(opencodePath, ["--version"], {
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
      } catch {}
    }

    return {
      id: this.id,
      name: this.name,
      description: "opencode CLI - agent harness running OpenRouter models",
      installed: !!opencodePath,
      version,
      path: opencodePath || undefined,
    };
  }

  async *query(options: QueryOptions): AsyncGenerator<NormalizedEvent> {
    const opencodePath = resolveOpencodeExecutable();
    const { args, model, variant } = buildOpencodeRunArgs(options, this.defaultModel);

    yield {
      type: "system",
      subtype: "init",
      sessionId: options.sessionId,
      backendId: "opencode",
      model,
      cwd: options.cwd,
      tools: ["read", "write", "edit", "bash", "grep", "glob", "webfetch"],
    };

    if (!opencodePath) {
      yield {
        type: "error",
        sessionId: options.sessionId,
        error:
          "opencode CLI not found. Install it with `npm i -g opencode-ai`, or set NAVI_OPENCODE_PATH.",
      };
      return;
    }

    const openrouterKey = resolveOpenrouterKey();
    if (model.startsWith("openrouter/") && !openrouterKey) {
      yield {
        type: "error",
        sessionId: options.sessionId,
        error:
          "No OpenRouter API key. Add one in Navi settings, or export OPENROUTER_API_KEY, to run opencode on OpenRouter models.",
      };
      return;
    }

    if (options.permissionMode === "confirm") {
      yield {
        type: "system",
        subtype: "status",
        status:
          "opencode manual approvals are not wired in Navi yet. This turn auto-approves its own tool calls.",
      };
    }

    const requestedEffort = options.backendOptions?.reasoningEffort;
    if (typeof requestedEffort === "string" && requestedEffort && !variant) {
      yield {
        type: "system",
        subtype: "status",
        status: `opencode does not accept reasoning effort "${requestedEffort}". Running at the model's default.`,
      };
    }

    this.childProcess = spawn(opencodePath, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // PWD is what opencode reads to place itself; a stale one from the Navi
        // server's own shell would defeat --dir.
        PWD: options.cwd,
        ...(openrouterKey && { OPENROUTER_API_KEY: openrouterKey }),
      },
    });

    const child = this.childProcess;
    // opencode reads stdin for interactive input; an open pipe leaves the turn hanging.
    child.stdin?.end();

    const state = createStreamState();
    const eventQueue: NormalizedEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;
    let sawError = false;
    let buffer = "";
    let stderrTail = "";

    const pushEvents = (events: NormalizedEvent[]) => {
      for (const normalized of events) {
        if (normalized.type === "error") sawError = true;
        eventQueue.push(normalized);
      }
      if (events.length) resolveNext?.();
    };

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      try {
        pushEvents(normalizeOpencodeEvent(JSON.parse(line), options.sessionId, state));
      } catch {
        // opencode prints its banner and plugin notices as plain text; not an error.
      }
    };

    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) consumeLine(line);
    });

    child.stderr?.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });

    child.on("error", (err) => {
      eventQueue.push({ type: "error", sessionId: options.sessionId, error: err.message });
      done = true;
      resolveNext?.();
    });

    child.on("close", (code) => {
      if (buffer.trim()) consumeLine(buffer);

      const contextWindow = this.contextWindowFor(model);
      eventQueue.push({
        type: "result",
        sessionId: options.sessionId,
        subtype: sawError || (code !== 0 && code !== null) ? "error" : "success",
        numTurns: 1,
        ...(state.totalCost > 0 && { costUsd: state.totalCost }),
        ...(state.lastStep?.input && { inputTokens: state.lastStep.input }),
        ...(state.lastStep?.output && { outputTokens: state.lastStep.output }),
        ...(contextWindow && { contextWindow }),
      });

      eventQueue.push({ type: "complete", sessionId: options.sessionId });

      // Only fall back to the exit code when opencode explained nothing itself —
      // its own error frame is the useful one and would otherwise be buried.
      if (code !== 0 && code !== null && !sawError) {
        const detail = stderrTail.trim().split("\n").slice(-3).join(" ").slice(0, 400);
        eventQueue.push({
          type: "error",
          sessionId: options.sessionId,
          error: detail
            ? `opencode exited with code ${code}: ${detail}`
            : `opencode exited with code ${code}`,
        });
      }

      done = true;
      resolveNext?.();
    });

    while (!done || eventQueue.length > 0) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
        resolveNext = null;
      }
    }

    this.childProcess = null;
  }

  respondToPermission(_response: PermissionResponse): void {
    console.warn("[OpencodeAdapter] Permission callbacks not supported; runs auto-approved.");
  }

  cancel(): void {
    if (this.childProcess) {
      this.childProcess.kill("SIGTERM");
      this.childProcess = null;
    }
  }
}

export const opencodeAdapter = new OpencodeAdapter();
