import { beforeAll, describe, expect, test } from "bun:test";

describe("session inspect recall", () => {
  let handleSessionRoutes: typeof import("./sessions").handleSessionRoutes;
  let dbModule: typeof import("../db");

  const unique = `inspect-${Date.now().toString(36)}`;
  const projectId = `proj-${unique}`;
  const sessionId = `sess-${unique}`;

  async function inspect(params: string): Promise<any> {
    const url = new URL(`http://localhost/api/sessions/${sessionId}/inspect?${params}`);
    const res = await handleSessionRoutes(url, "GET", new Request(url), new Set(), new Map());
    expect(res).not.toBeNull();
    return res!.json();
  }

  beforeAll(async () => {
    dbModule = await import("../db");
    await dbModule.initDb();
    ({ handleSessionRoutes } = await import("./sessions"));

    const now = Date.now();
    dbModule.projects.create(projectId, "Inspect Test", `/tmp/${unique}`, null, now, now);
    dbModule.sessions.create(sessionId, projectId, "Inspect Test Session", now, now, "claude");

    // A realistic agentic transcript: one early text exchange, then tool-only traffic.
    const rows: Array<[string, unknown]> = [
      ["user", [{ type: "text", text: "build the bonds tracker pipeline" }]],
      ["assistant", [{ type: "text", text: "Starting with the manual overrides CSV." }]],
      ["assistant", [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node scripts/build_monthly_views.mjs" } }]],
      ["user", [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "wrote outputs/monthly_views.csv" }] }]],
      ["assistant", [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "manual_overrides.csv" } }]],
      ["user", [{ type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "isin,price\nNSM633H0AOIN,98.2" }] }]],
    ];
    rows.forEach(([role, content], i) => {
      dbModule.messages.create(`msg-${unique}-${i}`, sessionId, role as string, JSON.stringify(content), Date.now() + i);
    });
  });

  test("scope=last skips messages that extract to empty text", async () => {
    const data = await inspect("scope=last&last=3");
    expect(data.messages.length).toBeGreaterThan(0);
    for (const message of data.messages) {
      expect(String(message.text).trim().length).toBeGreaterThan(0);
    }
  });

  test("scope=last surfaces tool activity, not blanks", async () => {
    const data = await inspect("scope=last&last=6");
    const joined = data.messages.map((m: any) => m.text).join("\n");
    expect(joined).toContain("build_monthly_views");
  });

  test("scope=search finds content that lives in tool calls", async () => {
    const data = await inspect("scope=search&search=manual_overrides");
    expect(Array.isArray(data.matches)).toBe(true);
    expect(data.matches.length).toBeGreaterThan(0);
  });

  test("scope=search finds content in tool results", async () => {
    const data = await inspect("scope=search&search=NSM633H0AOIN");
    expect(data.matches.length).toBeGreaterThan(0);
  });
});
