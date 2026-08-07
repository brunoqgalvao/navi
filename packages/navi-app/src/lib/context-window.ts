import { getAnthropicModelContextWindow } from "../../shared/anthropic-models";

export const DEFAULT_CONTEXT_WINDOW = 1_000_000;

/**
 * Resolve the context window for a session: the model's real context window
 * when known (e.g. Fable 5 = 1M, Haiku 4.5 = 200K), otherwise the project's
 * configured value, otherwise the default.
 */
export function resolveContextWindow(
  model: string | null | undefined,
  projectContextWindow?: number | null
): number {
  return (
    getAnthropicModelContextWindow(model) ??
    getEffectiveContextWindow(projectContextWindow)
  );
}

export function getEffectiveContextWindow(contextWindow?: number | null): number {
  return typeof contextWindow === "number" && contextWindow > 0
    ? contextWindow
    : DEFAULT_CONTEXT_WINDOW;
}

export function getDefaultContextResetThreshold(contextWindow?: number | null): number {
  const effectiveContextWindow = getEffectiveContextWindow(contextWindow);
  return effectiveContextWindow >= DEFAULT_CONTEXT_WINDOW ? 0.85 : 0.7;
}

export function getDefaultContextResetThresholdPercent(contextWindow?: number | null): number {
  return Math.round(getDefaultContextResetThreshold(contextWindow) * 100);
}
