export const DEFAULT_CONTEXT_WINDOW = 1_000_000;

// The Claude Code runtime hardcodes this: a model id containing "[1m]" gets the
// 1M window, every other model runs at 200k. There is no env override.
export const CLAUDE_RUNTIME_CONTEXT_WINDOW = 200_000;

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

  // Anything executed by the Claude Code runtime (Anthropic models and z.ai GLM
  // models routed through it) follows the runtime's "[1m]" rule.
  const runsOnClaudeRuntime =
    normalizedBackend === "claude" ||
    normalizedModel.includes("claude") ||
    normalizedModel.startsWith("glm-");
  if (runsOnClaudeRuntime) {
    return normalizedModel.includes("[1m]")
      ? DEFAULT_CONTEXT_WINDOW
      : CLAUDE_RUNTIME_CONTEXT_WINDOW;
  }

  if (normalizedBackend === "codex" || normalizedBackend === "gemini") {
    return DEFAULT_CONTEXT_WINDOW;
  }

  if (normalizedModel.includes("codex") || normalizedModel.includes("gemini")) {
    return DEFAULT_CONTEXT_WINDOW;
  }

  return null;
}

export function getEffectiveSessionContextWindow(options: {
  sessionContextWindow?: number | null;
  projectContextWindow?: number | null;
  backend?: ContextBackendId | null;
  model?: string | null;
}): number {
  // The window the runtime reported for this session is the truth.
  if (typeof options.sessionContextWindow === "number" && options.sessionContextWindow > 0) {
    return options.sessionContextWindow;
  }

  const modelWindow = getModelContextWindow(options.backend, options.model);
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
