export const DEFAULT_CONTEXT_WINDOW = 1_000_000;

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

  if (normalizedBackend === "claude" || normalizedBackend === "codex" || normalizedBackend === "gemini") {
    return DEFAULT_CONTEXT_WINDOW;
  }

  if (
    normalizedModel.includes("claude") ||
    normalizedModel.includes("codex") ||
    normalizedModel.includes("gemini")
  ) {
    return DEFAULT_CONTEXT_WINDOW;
  }

  return null;
}

export function getEffectiveSessionContextWindow(options: {
  projectContextWindow?: number | null;
  backend?: ContextBackendId | null;
  model?: string | null;
}): number {
  const projectWindow = getEffectiveContextWindow(options.projectContextWindow);
  const modelWindow = getModelContextWindow(options.backend, options.model);
  return Math.max(projectWindow, modelWindow ?? 0);
}

export function getDefaultContextResetThreshold(contextWindow?: number | null): number {
  const effectiveContextWindow = getEffectiveContextWindow(contextWindow);
  return effectiveContextWindow >= DEFAULT_CONTEXT_WINDOW ? 0.85 : 0.7;
}

export function getDefaultContextResetThresholdPercent(contextWindow?: number | null): number {
  return Math.round(getDefaultContextResetThreshold(contextWindow) * 100);
}
