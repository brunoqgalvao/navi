import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";

describe("prune-tool-results route", () => {
  let handleSessionRoutes: typeof import("./sessions").handleSessionRoutes;
  let dbModule: typeof import("../db");

  const unique = Date.now().toString(36);
  const projectId = `proj-prune-test-${unique}`;
  const sessionId = `sess-prune-test-${unique}`;
  const claudeSessionId = `claude-prune-test-${unique}`;
  const recentOnlySessionId = `sess-prune-recent-${unique}`;
  const recentOnlyClaudeSessionId = `claude-prune-recent-${unique}`;
  const projectPath = mkdtempSync(join(tmpdir(), "navi-prune-workspace-"));

  const encodedProjectPath = projectPath.replace(/[\\/]/g, "-");
  const claudeProjectDir = join(homedir(), ".claude", "projects", encodedProjectPath);
  const sessionFilePath = join(claudeProjectDir, `${claudeSessionId}.jsonl`);
  const recentOnlySessionFilePath = join(claudeProjectDir, `${recentOnlyClaudeSessionId}.jsonl`);
  const toolResultsDir = join(claudeProjectDir, claudeSessionId, "tool-results");
  const recentOnlyToolResultsDir = join(claudeProjectDir, recentOnlyClaudeSessionId, "tool-results");
  const externalToolResultPath = join(toolResultsDir, "toolu_old_external.txt");
  const recentOnlyExternalToolResultPath = join(recentOnlyToolResultsDir, "toolu_recent_only.txt");

  beforeAll(async () => {
    dbModule = await import("../db");
    await dbModule.initDb();
    ({ handleSessionRoutes } = await import("./sessions"));

    mkdirSync(projectPath, { recursive: true });
    mkdirSync(toolResultsDir, { recursive: true });
    mkdirSync(recentOnlyToolResultsDir, { recursive: true });

    const now = Date.now();
    dbModule.projects.create(projectId, "Prune Test Project", projectPath, null, now, now);
    dbModule.sessions.create(sessionId, projectId, "Prune Test Session", now, now, "claude");
    dbModule.sessions.updateClaudeSession(claudeSessionId, "claude-sonnet-4-5", 0, 0, 0, 0, now, sessionId);
    dbModule.sessions.create(recentOnlySessionId, projectId, "Recent Prune Test Session", now, now, "claude");
    dbModule.sessions.updateClaudeSession(recentOnlyClaudeSessionId, "claude-sonnet-4-5", 0, 0, 0, 0, now, recentOnlySessionId);
    dbModule.messages.create(
      `msg-user-${unique}`,
      sessionId,
      "user",
      JSON.stringify("Investigate why prune + continue loses context"),
      now
    );
    dbModule.messages.create(
      `msg-assistant-${unique}`,
      sessionId,
      "assistant",
      JSON.stringify([{ type: "text", text: "I found that prune resets the session but does not provide a usable handoff." }]),
      now + 1
    );
    dbModule.messages.create(
      `msg-user-latest-${unique}`,
      sessionId,
      "user",
      JSON.stringify("most recent turn should be preserved"),
      now + 2
    );

    const veryLongText = "A".repeat(3000);
    const veryLongNestedText = "B".repeat(2800);
    const veryLongToolUseResult = {
      filePath: "/tmp/example.ts",
      originalFile: "C".repeat(5000),
      newContent: "D".repeat(4500),
    };

    const transcriptLines = [
      JSON.stringify({
        type: "user",
        timestamp: "2026-03-01T10:00:00.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_old_external",
              content: veryLongText,
            },
          ],
        },
        toolUseResult: veryLongToolUseResult,
      }),
      JSON.stringify({
        type: "progress",
        timestamp: "2026-03-01T10:01:00.000Z",
        data: {
          message: {
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "toolu_old_nested",
                  content: veryLongNestedText,
                },
              ],
            },
          },
        },
      }),
      JSON.stringify({
        type: "user",
        timestamp: "2026-03-01T10:02:00.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "most recent turn should be preserved",
            },
          ],
        },
      }),
    ];

    writeFileSync(sessionFilePath, transcriptLines.join("\n") + "\n");
    writeFileSync(externalToolResultPath, "E".repeat(3500));

    writeFileSync(
      recentOnlySessionFilePath,
      JSON.stringify({
        type: "user",
        timestamp: "2026-03-01T11:00:00.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_recent_only",
              content: "F".repeat(3200),
            },
          ],
        },
        tool_use_result: {
          command: "cat very-large-file.txt",
          stdout: "G".repeat(4200),
        },
      }) + "\n"
    );
    writeFileSync(recentOnlyExternalToolResultPath, "H".repeat(3600));
  });

  afterAll(() => {
    try {
      dbModule.messages.deleteBySession(sessionId);
      dbModule.messages.deleteBySession(recentOnlySessionId);
      dbModule.sessions.delete(sessionId);
      dbModule.sessions.delete(recentOnlySessionId);
      dbModule.projects.delete(projectId);
      dbModule.saveDb();
    } catch {}

    rmSync(claudeProjectDir, { recursive: true, force: true });
    rmSync(projectPath, { recursive: true, force: true });
  });

  test("prunes inline, nested, metadata, and external tool-result payloads", async () => {
    const req = new Request(
      `http://localhost/api/sessions/${sessionId}/prune-tool-results`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preserveRecentCount: 1,
          maxPrunedLength: 120,
        }),
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
      prunedCount: number;
      tokensSaved: number;
      prunedToolUseIds: string[];
      historyContext?: string;
    };

    expect(payload.success).toBe(true);
    expect(payload.prunedCount).toBeGreaterThanOrEqual(4);
    expect(payload.tokensSaved).toBeGreaterThan(0);
    expect(payload.prunedToolUseIds).toContain("toolu_old_external");
    expect(payload.historyContext).toContain("Continuation Handoff");
    expect(payload.historyContext).toContain("mcp__navi-context__recall_session_context");
    expect(payload.historyContext).toContain("most recent turn should be preserved");

    const updatedLines = readFileSync(sessionFilePath, "utf-8").trim().split("\n");
    const oldUserEntry = JSON.parse(updatedLines[0]);
    const nestedProgressEntry = JSON.parse(updatedLines[1]);
    const recentEntry = JSON.parse(updatedLines[2]);

    const prunedTopLevelContent = oldUserEntry.message.content[0].content as string;
    expect(prunedTopLevelContent.length).toBeLessThan(260);
    expect(prunedTopLevelContent).toContain("chars pruned");

    const prunedNestedContent = nestedProgressEntry.data.message.message.content[0].content as string;
    expect(prunedNestedContent.length).toBeLessThan(260);
    expect(prunedNestedContent).toContain("chars pruned");

    expect(oldUserEntry.toolUseResult.pruned).toBe(true);
    expect(String(oldUserEntry.toolUseResult.summary)).toContain("chars pruned");
    expect(oldUserEntry.toolUseResult.originalFile).toBeUndefined();

    // Most recent user line is preserved.
    expect(recentEntry.message.content[0].text).toBe("most recent turn should be preserved");

    const prunedExternalToolResult = readFileSync(externalToolResultPath, "utf-8");
    expect(prunedExternalToolResult.length).toBeLessThan(300);
    expect(prunedExternalToolResult).toContain("chars pruned");
  });

  test("default pruning handles recent-only tool output instead of preserving the whole no-op", async () => {
    const req = new Request(
      `http://localhost/api/sessions/${recentOnlySessionId}/prune-tool-results`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxPrunedLength: 120 }),
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
      prunedCount: number;
      tokensSaved: number;
      prunedToolUseIds: string[];
    };

    expect(payload.success).toBe(true);
    expect(payload.prunedCount).toBeGreaterThanOrEqual(3);
    expect(payload.tokensSaved).toBeGreaterThan(0);
    expect(payload.prunedToolUseIds).toContain("toolu_recent_only");

    const updatedEntry = JSON.parse(readFileSync(recentOnlySessionFilePath, "utf-8").trim());
    expect(updatedEntry.message.content[0].content.length).toBeLessThan(260);
    expect(updatedEntry.message.content[0].content).toContain("chars pruned");
    expect(updatedEntry.tool_use_result.pruned).toBe(true);
    expect(String(updatedEntry.tool_use_result.summary)).toContain("chars pruned");

    const prunedExternalToolResult = readFileSync(recentOnlyExternalToolResultPath, "utf-8");
    expect(prunedExternalToolResult.length).toBeLessThan(300);
    expect(prunedExternalToolResult).toContain("chars pruned");

    const secondResponse = await handleSessionRoutes(
      new URL(req.url),
      "POST",
      new Request(req.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxPrunedLength: 120 }),
      }),
      new Set<string>(),
      new Map()
    );
    expect(secondResponse).not.toBeNull();
    expect(secondResponse!.status).toBe(200);
    const secondPayload = await secondResponse!.json() as {
      success: boolean;
      prunedCount: number;
      tokensSaved: number;
      error?: string;
    };
    expect(secondPayload.success).toBe(false);
    expect(secondPayload.prunedCount).toBe(0);
    expect(secondPayload.tokensSaved).toBe(0);
    expect(secondPayload.error).toContain("No large tool outputs");
  });
});
