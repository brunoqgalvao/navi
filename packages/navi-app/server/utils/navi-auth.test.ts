import { describe, expect, test } from "bun:test";

import {
  resolveNaviClaudeAuthFromState,
  type ClaudeOauthStatus,
  type ResolveNaviClaudeAuthInputs,
} from "./navi-auth";

function createOauthStatus(overrides: Partial<ClaudeOauthStatus> = {}): ClaudeOauthStatus {
  return {
    path: "/Users/test/.local/bin/claude",
    loggedIn: false,
    authMethod: null,
    apiProvider: null,
    checkedAt: Date.now(),
    ...overrides,
  };
}

function createInputs(overrides: Partial<ResolveNaviClaudeAuthInputs> = {}): ResolveNaviClaudeAuthInputs {
  return {
    model: undefined,
    preferredAuth: null,
    storedApiKey: null,
    storedZaiApiKey: null,
    envZaiApiKey: null,
    oauthStatus: createOauthStatus(),
    ...overrides,
  };
}

describe("resolveNaviClaudeAuthFromState", () => {
  test("uses Claude login when oauth is available", () => {
    const result = resolveNaviClaudeAuthFromState(
      createInputs({
        oauthStatus: createOauthStatus({
          loggedIn: true,
          authMethod: "oauth",
          apiProvider: "firstParty",
        }),
      })
    );

    expect(result.mode).toBe("oauth");
    expect(result.overrides).toEqual({});
    expect(result.source).toBe("Claude Code OAuth (claude.ai login)");
  });

  test("prefers stored Anthropic API key when explicitly configured", () => {
    const result = resolveNaviClaudeAuthFromState(
      createInputs({
        preferredAuth: "api_key",
        storedApiKey: "sk-ant-api-12345678",
        oauthStatus: createOauthStatus({ loggedIn: true }),
      })
    );

    expect(result.mode).toBe("api_key");
    expect(result.overrides).toEqual({ apiKey: "sk-ant-api-12345678" });
    expect(result.keyPrefix).toBe("sk-ant-a");
  });

  test("falls back to stored API key when Claude login is unavailable", () => {
    const result = resolveNaviClaudeAuthFromState(
      createInputs({
        preferredAuth: "oauth",
        storedApiKey: "sk-ant-api-abcdef12",
        oauthStatus: createOauthStatus({ loggedIn: false }),
      })
    );

    expect(result.mode).toBe("api_key");
    expect(result.overrides).toEqual({ apiKey: "sk-ant-api-abcdef12" });
    expect(result.source).toContain("Claude login unavailable");
  });

  test("returns a concrete auth error when neither Claude login nor API key is available", () => {
    const result = resolveNaviClaudeAuthFromState(
      createInputs({
        preferredAuth: "oauth",
        oauthStatus: createOauthStatus({
          path: "/Users/test/.local/bin/claude",
          loggedIn: false,
        }),
      })
    );

    expect(result.mode).toBe("none");
    expect(result.overrides).toEqual({});
    expect(result.error).toContain("/Users/test/.local/bin/claude");
    expect(result.error).toContain("claude auth login");
  });

  test("reports missing Claude CLI when no executable path is available", () => {
    const result = resolveNaviClaudeAuthFromState(
      createInputs({
        oauthStatus: createOauthStatus({
          path: null,
          loggedIn: false,
        }),
      })
    );

    expect(result.mode).toBe("none");
    expect(result.error).toContain("Claude CLI was not found");
  });

  test("uses Z.AI auth for glm models before Claude login or Anthropic API key", () => {
    const result = resolveNaviClaudeAuthFromState(
      createInputs({
        model: "glm-4.7",
        preferredAuth: "api_key",
        storedApiKey: "sk-ant-api-abcdef12",
        envZaiApiKey: "zai-key-12345678",
        oauthStatus: createOauthStatus({ loggedIn: true }),
      })
    );

    expect(result.mode).toBe("zai");
    expect(result.overrides).toEqual({
      apiKey: "zai-key-12345678",
      baseUrl: "https://api.z.ai/api/anthropic",
    });
    expect(result.source).toBe("Environment → ZAI_API_KEY");
  });
});
