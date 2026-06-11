import type { Usage } from "./events.js";

export type PriceEntry = {
  inPerMTok: number;
  outPerMTok: number;
  cacheReadPerMTok?: number;
};

/**
 * Price table in USD per million tokens.
 * Exact values are config — exported so the server can override.
 * Entries use the canonical model key; prefix matching is applied at runtime.
 */
export const PRICE_TABLE: Record<string, PriceEntry> = {
  // Anthropic Claude
  "claude-opus-4-1":    { inPerMTok: 15.0,  outPerMTok: 75.0,  cacheReadPerMTok: 1.5  },
  "claude-sonnet-4-6":  { inPerMTok: 3.0,   outPerMTok: 15.0,  cacheReadPerMTok: 0.3  },
  "claude-haiku-4-5":   { inPerMTok: 0.8,   outPerMTok: 4.0,   cacheReadPerMTok: 0.08 },

  // OpenAI Codex / o-series
  "gpt-5.2-codex":      { inPerMTok: 10.0,  outPerMTok: 30.0  },
  "o3":                 { inPerMTok: 10.0,  outPerMTok: 40.0  },

  // Google Gemini
  "gemini-3-flash-preview": { inPerMTok: 0.075, outPerMTok: 0.3  },
  "gemini-2.5-pro":         { inPerMTok: 1.25,  outPerMTok: 10.0 },
};

/**
 * Find the best matching price entry: exact match first, then longest prefix.
 */
function findEntry(model: string): PriceEntry | undefined {
  if (PRICE_TABLE[model]) return PRICE_TABLE[model];

  let bestKey: string | undefined;
  for (const key of Object.keys(PRICE_TABLE)) {
    if (model.startsWith(key)) {
      if (bestKey === undefined || key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }
  return bestKey ? PRICE_TABLE[bestKey] : undefined;
}

export type NormalizeInput = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
};

export function normalizeUsage(model: string, raw: NormalizeInput): Usage {
  let costUsd: number | undefined;

  if (raw.costUsd !== undefined) {
    costUsd = raw.costUsd;
  } else {
    const entry = findEntry(model);
    if (entry) {
      costUsd =
        (raw.inputTokens / 1e6) * entry.inPerMTok +
        (raw.outputTokens / 1e6) * entry.outPerMTok;

      if (raw.cacheReadTokens !== undefined && entry.cacheReadPerMTok !== undefined) {
        costUsd += (raw.cacheReadTokens / 1e6) * entry.cacheReadPerMTok;
      }
    }
  }

  return {
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    ...(raw.cacheReadTokens !== undefined ? { cacheReadTokens: raw.cacheReadTokens } : {}),
    ...(raw.cacheWriteTokens !== undefined ? { cacheWriteTokens: raw.cacheWriteTokens } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    model,
    raw,
  };
}
