import { afterAll, beforeAll, describe, expect, test } from "bun:test";

describe("codex session reset", () => {
  let handleSessionRoutes: typeof import("./sessions").handleSessionRoutes;
  let dbModule: typeof import("../db");

  const unique = Date.now().toString(36);
  const projectId = `proj-codex-reset-${unique}`;
  const sessionId = `sess-codex-reset-${unique}`;
  const compactSessionId = `sess-compact-policy-${unique}`;
  const compactClaudeSessionId = `claude-compact-policy-${unique}`;
  const overflowSessionId = `sess-overflow-policy-${unique}`;
  const overflowClaudeSessionId = `claude-overflow-policy-${unique}`;

  beforeAll(async () => {
    dbModule = await import("../db");
    await dbModule.initDb();
    ({ handleSessionRoutes } = await import("./sessions"));

    const now = Date.now();
    dbModule.projects.create(
      projectId,
      "Codex Reset Project",
      "/tmp/codex-reset-project",
      null,
      now,
      now
    );
    dbModule.sessions.create(
      sessionId,
      projectId,
      "Codex Reset Session",
      now,
      now,
      "codex"
    );
    dbModule.sessions.updateBackendSessionState(
      "thread-codex-reset",
      JSON.stringify({ thread_id: "thread-codex-reset" }),
      now,
      sessionId
    );
    dbModule.messages.create(
      `msg-codex-user-${unique}`,
      sessionId,
      "user",
      JSON.stringify("Continue after reset without losing this task"),
      now
    );
    dbModule.messages.create(
      `msg-codex-assistant-${unique}`,
      sessionId,
      "assistant",
      JSON.stringify([{ type: "text", text: "The latest state should survive as a handoff." }]),
      now + 1
    );
    dbModule.sessions.create(
      compactSessionId,
      projectId,
      "Compact Policy Session",
      now,
      now,
      "claude"
    );
    dbModule.sessions.updateClaudeSession(
      compactClaudeSessionId,
      "claude-sonnet-4-5",
      0,
      0,
      1000,
      0,
      now,
      compactSessionId
    );
    dbModule.messages.create(
      `msg-compact-user-${unique}`,
      compactSessionId,
      "user",
      JSON.stringify("Recover this context on overflow"),
      now
    );
    dbModule.sessions.create(
      overflowSessionId,
      projectId,
      "Overflow Policy Session",
      now,
      now,
      "claude"
    );
    dbModule.sessions.updateClaudeSession(
      overflowClaudeSessionId,
      "claude-sonnet-4-5",
      0,
      0,
      1000,
      0,
      now,
      overflowSessionId
    );
    dbModule.messages.create(
      `msg-overflow-user-${unique}`,
      overflowSessionId,
      "user",
      JSON.stringify("Recover this context on overflow"),
      now
    );
  });

  afterAll(() => {
    try {
      dbModule.messages.deleteBySession(sessionId);
      dbModule.messages.deleteBySession(compactSessionId);
      dbModule.messages.deleteBySession(overflowSessionId);
      dbModule.sessions.delete(sessionId);
      dbModule.sessions.delete(compactSessionId);
      dbModule.sessions.delete(overflowSessionId);
      dbModule.projects.delete(projectId);
      dbModule.saveDb();
    } catch {}
  });

  test("reset-context clears generic backend session state", async () => {
    const req = new Request(
      `http://localhost/api/sessions/${sessionId}/reset-context`,
      { method: "POST" }
    );

    const response = await handleSessionRoutes(
      new URL(req.url),
      "POST",
      req,
      new Set<string>(),
      new Map()
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const payload = await response!.json() as {
      success: boolean;
      sessionReset: boolean;
    };

    expect(payload.success).toBe(true);
    expect(payload.sessionReset).toBe(true);

    const updated = dbModule.sessions.get(sessionId);
    expect(updated?.backend_session_id).toBeNull();
    expect(updated?.backend_session_metadata).toBeNull();
    expect(updated?.claude_session_id).toBeNull();
    expect(updated?.pending_context_handoff).toContain("Continuation Handoff");
    expect(updated?.pending_context_handoff).toContain("Continue after reset");
  });

  test("threshold compact delegates to SDK without resetting", async () => {
    const req = new Request(
      `http://localhost/api/sessions/${compactSessionId}/reduce-context`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "compact", reason: "threshold" }),
      }
    );

    const response = await handleSessionRoutes(
      new URL(req.url),
      "POST",
      req,
      new Set<string>(),
      new Map()
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const payload = await response!.json() as {
      success: boolean;
      nextAction: string;
      sessionReset: boolean;
    };

    expect(payload.success).toBe(true);
    expect(payload.nextAction).toBe("sdk_compact");
    expect(payload.sessionReset).toBe(false);
    expect(dbModule.sessions.get(compactSessionId)?.claude_session_id).toBe(compactClaudeSessionId);
  });

  test("overflow compact falls back to persisted handoff reset", async () => {
    const req = new Request(
      `http://localhost/api/sessions/${overflowSessionId}/reduce-context`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "compact", reason: "overflow" }),
      }
    );

    const response = await handleSessionRoutes(
      new URL(req.url),
      "POST",
      req,
      new Set<string>(),
      new Map()
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const payload = await response!.json() as {
      success: boolean;
      effectiveMethod: string;
      nextAction: string;
      sessionReset: boolean;
      historyContext?: string;
    };

    expect(payload.success).toBe(true);
    expect(payload.effectiveMethod).toBe("prune-then-compact");
    expect(payload.nextAction).toBe("continue");
    expect(payload.sessionReset).toBe(true);
    expect(payload.historyContext).toContain("Recover this context on overflow");

    const updated = dbModule.sessions.get(overflowSessionId);
    expect(updated?.claude_session_id).toBeNull();
    expect(updated?.pending_context_handoff).toContain("Recover this context on overflow");
  });
});
