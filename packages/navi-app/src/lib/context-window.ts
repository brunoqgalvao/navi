import { getAnthropicModelContextWindow } from "../../shared/anthropic-models";

export const DEFAULT_CONTEXT_WINDOW = 1_000_000;

// Fallback for a Claude-runtime model we don't recognize at all. Every current
// Anthropic model is 1M native except Haiku 4.5; 200k is the conservative floor
// for anything older or unrecognized.
export const CLAUDE_RUNTIME_CONTEXT_WINDOW = 200_000;

// Every model in the Codex CLI's registry — the whole gpt-5.6 family, 5.5,
// 5.4, 5.2 — carries context_window 272000. Assuming 1M here let a Codex
// session look a quarter full when it was about to overflow.
export const CODEX_CONTEXT_WINDOW = 272_000;

export type ContextBackendId = "claude" | "codex" | "gemini" | string;

export function getEffectiveContextWindow(contextWindow?: number | null): number {
  return typeof contextWindow === "number" && contextWindow > 0
    ? contextWindow
    : DEFAULT_CONTEXT_WINDOW;
}

export function getModelContextWindow(
  backend?: ContextBackendId | null,
  model?: string | null
): number | null {
  const normalizedBackend = backend?.toLowerCase();
  const normalizedModel = model?.toLowerCase() ?? "";

  // Anything executed by the Claude Code runtime: Anthropic models, plus z.ai
  // GLM models routed through it.
  const runsOnClaudeRuntime =
    normalizedBackend === "claude" ||
    normalizedModel.includes("claude") ||
    normalizedModel.startsWith("glm-");
  if (runsOnClaudeRuntime) {
    // The "[1m]" suffix opts a model into 1M where that isn't already native
    // (Haiku 4.5 is the only current model that needs it).
    if (normalizedModel.includes("[1m]")) return DEFAULT_CONTEXT_WINDOW;
    // Every current Anthropic model is 1M native except Haiku 4.5. The curated
    // table is the source of truth; it mirrors the CLI's own model registry.
    return (
      getAnthropicModelContextWindow(normalizedModel) ?? CLAUDE_RUNTIME_CONTEXT_WINDOW
    );
  }

  if (normalizedBackend === "codex") return CODEX_CONTEXT_WINDOW;
  if (normalizedBackend === "gemini") return DEFAULT_CONTEXT_WINDOW;

  if (normalizedModel.includes("codex") || normalizedModel.startsWith("gpt-")) {
    return CODEX_CONTEXT_WINDOW;
  }
  if (normalizedModel.includes("gemini")) return DEFAULT_CONTEXT_WINDOW;

  return null;
}

export function getEffectiveSessionContextWindow(options: {
  sessionContextWindow?: number | null;
  projectContextWindow?: number | null;
  backend?: ContextBackendId | null;
  model?: string | null;
}): number {
  const modelWindow = getModelContextWindow(options.backend, options.model);

  // The window the runtime reported for this session is normally the truth —
  // but a CLI pinned before a model shipped doesn't recognize it and falls back
  // to a generic 200k, which showed a 1M Fable session as 5x fuller than it was.
  // A reported window below the model's known native size means the runtime is
  // guessing, so the model registry wins.
  if (typeof options.sessionContextWindow === "number" && options.sessionContextWindow > 0) {
    if (modelWindow !== null && modelWindow > options.sessionContextWindow) {
      return modelWindow;
    }
    return options.sessionContextWindow;
  }

  const projectWindow =
    typeof options.projectContextWindow === "number" && options.projectContextWindow > 0
      ? options.projectContextWindow
      : null;

  // A project budget may cap the model window, but can't grant tokens the model
  // doesn't have (a 1M project setting on a 200k Opus session hid a real overflow
  // behind a "9% used" display).
  if (modelWindow !== null && projectWindow !== null) {
    return Math.min(modelWindow, projectWindow);
  }
  return modelWindow ?? projectWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function getDefaultContextResetThreshold(
  contextWindow?: number | null,
  maxOutputTokens?: number | null
): number {
  const effectiveContextWindow = getEffectiveContextWindow(contextWindow);
  const factor = effectiveContextWindow >= DEFAULT_CONTEXT_WINDOW ? 0.85 : 0.7;
  // The runtime reserves the model's max output tokens out of the window; input
  // that crosses (window - reserve) is rejected, so thresholds must too.
  const reserve =
    typeof maxOutputTokens === "number" && maxOutputTokens > 0 ? maxOutputTokens : 0;
  const usable = Math.max(0, effectiveContextWindow - reserve);
  return (usable * factor) / effectiveContextWindow;
}

export function getDefaultContextResetThresholdPercent(
  contextWindow?: number | null,
  maxOutputTokens?: number | null
): number {
  return Math.round(getDefaultContextResetThreshold(contextWindow, maxOutputTokens) * 100);
}
