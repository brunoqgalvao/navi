import { execFileSync } from "child_process";
import { globalSettings } from "../db";
import { resolveClaudeCodeExecutable, type ClaudeAuthEnvOverrides } from "./claude-code";

const ZAI_ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";
const CLAUDE_OAUTH_STATUS_TTL_MS = 5000;

export type NaviAuthMode = "oauth" | "api_key" | "zai" | "none";

export type NaviAuthResult = {
  mode: NaviAuthMode;
  overrides: ClaudeAuthEnvOverrides;
  source: string; // Human-readable description of where auth came from
  keyPrefix?: string; // First 8 chars of API key for identification
  error?: string;
};

export type ClaudeOauthStatus = {
  path: string | null;
  loggedIn: boolean;
  authMethod: string | null;
  apiProvider: string | null;
  checkedAt: number;
};

export type ResolveNaviClaudeAuthInputs = {
  model?: string;
  preferredAuth: "oauth" | "api_key" | null;
  storedApiKey: string | null;
  storedZaiApiKey: string | null;
  envZaiApiKey: string | null;
  oauthStatus: ClaudeOauthStatus;
};

let cachedClaudeOauthStatus: ClaudeOauthStatus | null = null;

function stringifyExecOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Buffer) return value.toString("utf-8");
  return "";
}

function getClaudeOauthStatus(): ClaudeOauthStatus {
  const path = resolveClaudeCodeExecutable();
  const now = Date.now();

  if (
    cachedClaudeOauthStatus &&
    cachedClaudeOauthStatus.path === path &&
    now - cachedClaudeOauthStatus.checkedAt < CLAUDE_OAUTH_STATUS_TTL_MS
  ) {
    return cachedClaudeOauthStatus;
  }

  const fallbackStatus: ClaudeOauthStatus = {
    path,
    loggedIn: false,
    authMethod: null,
    apiProvider: null,
    checkedAt: now,
  };

  if (!path) {
    cachedClaudeOauthStatus = fallbackStatus;
    return fallbackStatus;
  }

  let output = "";
  try {
    output = execFileSync(path, ["auth", "status", "--json"], {
      encoding: "utf-8",
      timeout: 1500,
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output = `${stringifyExecOutput((error as any)?.stdout)}${stringifyExecOutput((error as any)?.stderr)}`;
  }

  try {
    const parsed = JSON.parse(output.trim()) as Partial<ClaudeOauthStatus>;
    if (typeof parsed.loggedIn === "boolean") {
      cachedClaudeOauthStatus = {
        path,
        loggedIn: parsed.loggedIn,
        authMethod: typeof parsed.authMethod === "string" ? parsed.authMethod : null,
        apiProvider: typeof parsed.apiProvider === "string" ? parsed.apiProvider : null,
        checkedAt: now,
      };
      return cachedClaudeOauthStatus;
    }
  } catch {}

  cachedClaudeOauthStatus = fallbackStatus;
  return fallbackStatus;
}

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
export function resolveNaviClaudeAuthFromState({
  model,
  preferredAuth,
  storedApiKey,
  storedZaiApiKey,
  envZaiApiKey,
  oauthStatus,
}: ResolveNaviClaudeAuthInputs): NaviAuthResult {
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

  const oauthAvailable = oauthStatus.loggedIn;

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
  if (oauthAvailable) {
    return {
      mode: "oauth",
      overrides: {},
      source: "Claude Code OAuth (claude.ai login)",
    };
  }

  // Fallback to stored API key if OAuth is unavailable
  if (storedApiKey) {
    return {
      mode: "api_key",
      overrides: { apiKey: storedApiKey },
      source: preferredAuth === "oauth"
        ? "Navi settings → Anthropic API key (Claude login unavailable)"
        : "Navi settings → Anthropic API key",
      keyPrefix: storedApiKey.slice(0, 8),
    };
  }

  const error = oauthStatus.path
    ? `Claude login is not active for ${oauthStatus.path}. Run 'claude auth login' or set an Anthropic API key in Settings.`
    : "Claude CLI was not found. Install Claude CLI or set an Anthropic API key in Settings.";

  return {
    mode: "none",
    overrides: {},
    source: "No Claude authentication available",
    error,
  };
}

export function resolveNaviClaudeAuth(model?: string): NaviAuthResult {
  const preferredAuth = globalSettings.get("preferredAuth") as "oauth" | "api_key" | null;
  const storedApiKey = globalSettings.get("anthropicApiKey") as string | null;
  const storedZaiApiKey = globalSettings.get("zaiApiKey") as string | null;
  const envZaiApiKey = process.env.ZAI_API_KEY || null;

  return resolveNaviClaudeAuthFromState({
    model,
    preferredAuth,
    storedApiKey,
    storedZaiApiKey,
    envZaiApiKey,
    oauthStatus: getClaudeOauthStatus(),
  });
}

/**
 * Formats auth info for logging (safe, no secrets exposed)
 */
export function formatAuthForLog(auth: NaviAuthResult): string {
  if (auth.mode === "oauth") {
    return `[Auth] Mode: OAuth | Source: ${auth.source}`;
  }
  if (auth.mode === "none") {
    return `[Auth] Mode: NONE | Source: ${auth.source}`;
  }
  return `[Auth] Mode: ${auth.mode.toUpperCase()} | Source: ${auth.source} | Key: ${auth.keyPrefix}...`;
}
