import { beforeAll, describe, expect, test } from "bun:test";

describe("session model persistence", () => {
  let dbModule: typeof import("./db");

  const unique = `model-persist-${Date.now().toString(36)}`;
  const projectId = `proj-${unique}`;

  beforeAll(async () => {
    dbModule = await import("./db");
    await dbModule.initDb();
    const now = Date.now();
    dbModule.projects.create(projectId, "Model Persist Test", `/tmp/${unique}`, null, now, now);
  });

  function createSession(suffix: string): string {
    const id = `sess-${unique}-${suffix}`;
    dbModule.sessions.create(id, projectId, "Model Persist Session", Date.now(), Date.now(), "claude");
    return id;
  }

  test("updateClaudeSession with null model keeps the user's selected model", () => {
    const sessionId = createSession("keep-model");
    dbModule.sessions.updateModel("claude-fable-5", sessionId);

    dbModule.sessions.updateClaudeSession(null, null, 0, 1, 0, 0, Date.now(), sessionId);

    expect(dbModule.sessions.get(sessionId)?.model).toBe("claude-fable-5");
  });

  test("updateClaudeSession with null claude_session_id keeps the existing resume id", () => {
    const sessionId = createSession("keep-resume");
    dbModule.sessions.updateClaudeSession("claude-resume-123", "claude-fable-5", 0, 1, 0, 0, Date.now(), sessionId);

    dbModule.sessions.updateClaudeSession(null, null, 0, 1, 0, 0, Date.now(), sessionId);

    const session = dbModule.sessions.get(sessionId);
    expect(session?.claude_session_id).toBe("claude-resume-123");
    expect(session?.model).toBe("claude-fable-5");
  });

  test("updateClaudeSession with real values still updates them", () => {
    const sessionId = createSession("update");
    dbModule.sessions.updateModel("claude-fable-5", sessionId);

    dbModule.sessions.updateClaudeSession("claude-resume-456", "claude-sonnet-4-6", 0.01, 1, 10, 20, Date.now(), sessionId);

    const session = dbModule.sessions.get(sessionId);
    expect(session?.claude_session_id).toBe("claude-resume-456");
    expect(session?.model).toBe("claude-sonnet-4-6");
  });
});
