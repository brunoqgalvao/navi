export type ClaudeAuthEnvOverrides = {
  apiKey?: string | null;
  baseUrl?: string | null;
};

export function getClaudeCodeRuntimeOptions(): { executable?: "bun" | "node"; executableArgs?: string[] } {
  const isBun = Boolean((process as any)?.versions?.bun);
  if (!isBun) return { executable: "node" };
  return { executable: "bun", executableArgs: ["--env-file=/dev/null"] };
}

export function buildClaudeCodeEnv(baseEnv: NodeJS.ProcessEnv, overrides?: ClaudeAuthEnvOverrides) {
  const env: Record<string, string | undefined> = { ...baseEnv };

  // Clean all auth-related env vars - Navi provides auth explicitly
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_BASE_URL;
  delete env.NAVI_ANTHROPIC_API_KEY;
  delete env.NAVI_ANTHROPIC_BASE_URL;
  delete env.NAVI_AUTH_MODE;
  delete env.NAVI_AUTH_SOURCE;

  // Apply Navi-controlled overrides
  const apiKey = overrides?.apiKey ?? null;
  const baseUrl = overrides?.baseUrl ?? null;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;

  return env;
}

export function getNaviAuthOverridesFromEnv(env: NodeJS.ProcessEnv): ClaudeAuthEnvOverrides {
  return {
    apiKey: env.NAVI_ANTHROPIC_API_KEY ?? null,
    baseUrl: env.NAVI_ANTHROPIC_BASE_URL ?? null,
  };
}
