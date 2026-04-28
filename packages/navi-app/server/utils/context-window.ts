export const DEFAULT_CONTEXT_WINDOW = 1_000_000;

export function getEffectiveContextWindow(contextWindow?: number | null): number {
  return typeof contextWindow === "number" && contextWindow > 0
    ? contextWindow
    : DEFAULT_CONTEXT_WINDOW;
}

export function getDefaultContextResetThreshold(contextWindow?: number | null): number {
  const effectiveContextWindow = getEffectiveContextWindow(contextWindow);
  return effectiveContextWindow >= DEFAULT_CONTEXT_WINDOW ? 0.85 : 0.7;
}
