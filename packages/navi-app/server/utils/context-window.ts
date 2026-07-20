export const DEFAULT_CONTEXT_WINDOW = 1_000_000;

export function getEffectiveContextWindow(contextWindow?: number | null): number {
  return typeof contextWindow === "number" && contextWindow > 0
    ? contextWindow
    : DEFAULT_CONTEXT_WINDOW;
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

// Shape of one entry in the SDK result message's `modelUsage` record.
export interface ModelUsageEntry {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface ModelContextInfo {
  contextWindow: number;
  maxOutputTokens: number | null;
}

/**
 * Pull the runtime-reported context window out of a result message's modelUsage.
 * This is the authoritative window for the session — unlike project settings or
 * model-name heuristics, it is what the runtime actually enforces.
 */
export function extractModelContextInfo(
  modelUsage: Record<string, ModelUsageEntry> | null | undefined,
  model?: string | null
): ModelContextInfo | null {
  if (!modelUsage) return null;

  const toInfo = (entry: ModelUsageEntry | undefined): ModelContextInfo | null => {
    if (!entry || typeof entry.contextWindow !== "number" || entry.contextWindow <= 0) {
      return null;
    }
    return {
      contextWindow: entry.contextWindow,
      maxOutputTokens:
        typeof entry.maxOutputTokens === "number" && entry.maxOutputTokens > 0
          ? entry.maxOutputTokens
          : null,
    };
  };

  if (model) {
    const info = toInfo(modelUsage[model]);
    if (info) return info;
  }

  // Without a session model, take the entry that consumed the most tokens —
  // title generation and subagents appear here too, but the main model dominates.
  let best: ModelContextInfo | null = null;
  let bestTokens = -1;
  for (const entry of Object.values(modelUsage)) {
    const info = toInfo(entry);
    if (!info) continue;
    const tokens =
      (entry.inputTokens ?? 0) +
      (entry.outputTokens ?? 0) +
      (entry.cacheReadInputTokens ?? 0) +
      (entry.cacheCreationInputTokens ?? 0);
    if (tokens > bestTokens) {
      bestTokens = tokens;
      best = info;
    }
  }
  return best;
}
