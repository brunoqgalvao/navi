import { globalSettings } from "../db";
import type { ClaudeAuthEnvOverrides } from "./claude-code";

const ZAI_ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";

export type NaviAuthMode = "oauth" | "api_key" | "zai";

export type NaviAuthResult = {
  mode: NaviAuthMode;
  overrides: ClaudeAuthEnvOverrides;
  source: string; // Human-readable description of where auth came from
  keyPrefix?: string; // First 8 chars of API key for identification
};

/**
 * Resolves authentication for Claude API calls based on Navi settings.
 *
 * Priority order:
 * 1. Z.AI key (if model is glm-*)
 * 2. Stored Anthropic API key (if preferredAuth === "api_key")
 * 3. OAuth (fallback - uses Claude Code's built-in OAuth flow)
 *
 * IMPORTANT: This intentionally ignores any project-level or env-level Anthropic API keys.
 * Z.AI keys may be sourced from env for CLI/desktop setups where settings are unavailable.
 * All other auth is controlled through Navi's settings UI.
 */
export function resolveNaviClaudeAuth(model?: string): NaviAuthResult {
  const preferredAuth = globalSettings.get("preferredAuth") as "oauth" | "api_key" | null;
  const storedApiKey = globalSettings.get("anthropicApiKey") as string | null;
  const storedZaiApiKey = globalSettings.get("zaiApiKey") as string | null;
  const envZaiApiKey = process.env.ZAI_API_KEY || null;
  const zaiApiKey = storedZaiApiKey || envZaiApiKey;

  const isGlmModel = model?.startsWith("glm-");

  // Priority 1: Z.AI for GLM models
  if (isGlmModel && zaiApiKey) {
    return {
      mode: "zai",
      overrides: { apiKey: zaiApiKey, baseUrl: ZAI_ANTHROPIC_BASE_URL },
      source: storedZaiApiKey ? "Navi settings → Z.AI API key" : "Environment → ZAI_API_KEY",
      keyPrefix: zaiApiKey.slice(0, 8),
    };
  }

  // Priority 2: Stored Anthropic API key (if user preference is api_key)
  if (preferredAuth === "api_key" && storedApiKey) {
    return {
      mode: "api_key",
      overrides: { apiKey: storedApiKey },
      source: "Navi settings → Anthropic API key",
      keyPrefix: storedApiKey.slice(0, 8),
    };
  }

  // Priority 3: OAuth (Claude Code's built-in flow)
  return {
    mode: "oauth",
    overrides: {},
    source: "Claude Code OAuth (claude.ai login)",
  };
}

/**
 * Formats auth info for logging (safe, no secrets exposed)
 */
export function formatAuthForLog(auth: NaviAuthResult): string {
  if (auth.mode === "oauth") {
    return `[Auth] Mode: OAuth | Source: ${auth.source}`;
  }
  return `[Auth] Mode: ${auth.mode.toUpperCase()} | Source: ${auth.source} | Key: ${auth.keyPrefix}...`;
}
