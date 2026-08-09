import { describe, expect, test } from "bun:test";
import { deriveRunAvailability, type ProviderAuthStatus } from "./run-availability";
import type { BackendInfo, CodexHealthInfo } from "../api";

const backend = (id: "claude" | "codex" | "gemini", installed: boolean): BackendInfo => ({
  id,
  name: id,
  description: "",
  installed,
});

const auth = (over: Partial<ProviderAuthStatus> = {}): ProviderAuthStatus => ({
  claudeInstalled: true,
  claudePath: "",
  authenticated: true,
  authMethod: "oauth",
  hasApiKey: false,
  apiKeyPreview: null,
  hasOAuth: true,
  preferredAuth: "oauth",
  hasZaiKey: true,
  zaiKeyPreview: null,
  zaiKeySource: "settings",
  ...over,
});

const codex = (over: Partial<CodexHealthInfo> = {}): CodexHealthInfo => ({
  backend: "codex",
  installed: true,
  authMode: "chatgpt",
  config: {},
  issues: [],
  checkedAt: "",
  ...over,
});

const all = [backend("claude", true), backend("codex", true), backend("gemini", true)];

describe("deriveRunAvailability", () => {
  test("everything ready when installed and signed in", () => {
    const a = deriveRunAvailability(all, codex(), auth());
    expect([a.claude.state, a.codex.state, a.gemini.state, a.zai.state]).toEqual([
      "ready",
      "ready",
      "ready",
      "ready",
    ]);
  });

  // One case per mapping-table row. Each asserts the exact reason AND the exact fix,
  // because rendering the wrong affordance is the failure mode that matters.
  test("claude CLI missing", () => {
    const a = deriveRunAvailability(
      [backend("claude", false), backend("codex", true), backend("gemini", true)],
      codex(),
      auth()
    );
    expect(a.claude).toEqual({
      state: "needs-setup",
      reason: "Claude CLI not found",
      fix: { kind: "command", command: "npm i -g @anthropic-ai/claude-code" },
    });
  });

  test("claude installed but signed out", () => {
    const a = deriveRunAvailability(all, codex(), auth({ hasOAuth: false, hasApiKey: false }));
    expect(a.claude).toEqual({
      state: "needs-setup",
      reason: "Not signed in",
      fix: { kind: "settings" },
    });
  });

  test("codex CLI missing beats an unreadable auth mode", () => {
    const a = deriveRunAvailability(
      [backend("claude", true), backend("codex", false), backend("gemini", true)],
      codex({ installed: false, authMode: "unknown" }),
      auth()
    );
    expect(a.codex).toEqual({
      state: "needs-setup",
      reason: "Codex CLI not found",
      fix: { kind: "command", command: "npm i -g @openai/codex" },
    });
  });

  test("codex not logged in", () => {
    const a = deriveRunAvailability(all, codex({ authMode: "not_logged_in" }), auth());
    expect(a.codex).toEqual({
      state: "needs-setup",
      reason: "Not signed in",
      fix: { kind: "settings" },
    });
  });

  test("codex auth mode unreadable is not treated as ready", () => {
    const a = deriveRunAvailability(all, codex({ authMode: "unknown" }), auth());
    expect(a.codex).toEqual({
      state: "needs-setup",
      reason: "Couldn't read sign-in state",
      fix: { kind: "settings" },
    });
  });

  test("api_key counts as signed in", () => {
    expect(deriveRunAvailability(all, codex({ authMode: "api_key" }), auth()).codex.state).toBe(
      "ready"
    );
  });

  test("gemini CLI missing", () => {
    const a = deriveRunAvailability(
      [backend("claude", true), backend("codex", true), backend("gemini", false)],
      codex(),
      auth()
    );
    expect(a.gemini).toEqual({
      state: "needs-setup",
      reason: "Gemini CLI not found",
      fix: { kind: "command", command: "npm i -g @google/gemini-cli" },
    });
  });

  test("no zai key", () => {
    const a = deriveRunAvailability(all, codex(), auth({ hasZaiKey: false }));
    expect(a.zai).toEqual({
      state: "needs-setup",
      reason: "No Z.ai API key",
      fix: { kind: "settings" },
    });
  });

  test("zai inherits claude's reason and fix verbatim, not just its state", () => {
    const a = deriveRunAvailability(
      [backend("claude", false), backend("codex", true), backend("gemini", true)],
      codex(),
      auth({ hasZaiKey: true })
    );
    // Asserted by value, not by reference: a.zai === a.claude would pass even if the
    // implementation returned the wrong object.
    expect(a.zai).toEqual({
      state: "needs-setup",
      reason: "Claude CLI not found",
      fix: { kind: "command", command: "npm i -g @anthropic-ai/claude-code" },
    });
  });

  test("a missing codex health payload does not crash", () => {
    expect(deriveRunAvailability(all, null, auth()).codex.state).toBe("needs-setup");
  });
});
