import { afterAll, beforeAll, describe, expect, test } from "bun:test";

describe("codex session reset", () => {
  let handleSessionRoutes: typeof import("./sessions").handleSessionRoutes;
  let dbModule: typeof import("../db");

  const unique = Date.now().toString(36);
  const projectId = `proj-codex-reset-${unique}`;
  const sessionId = `sess-codex-reset-${unique}`;

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
  });

  afterAll(() => {
    try {
      dbModule.sessions.delete(sessionId);
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
  });
});
