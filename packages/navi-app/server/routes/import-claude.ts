import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { json } from "../utils/response";
import { projects, sessions, messages, searchIndex } from "../db";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface ExternalClaudeSession {
  claudeSessionId: string;
  filePath: string;
  cwd: string;
  title: string;
  model: string | null;
  entrypoint: string;
  firstTimestamp: number;
  lastTimestamp: number;
  userMessageCount: number;
  assistantMessageCount: number;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function extractUserText(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (
      trimmed.startsWith("<command-") ||
      trimmed.startsWith("<local-command") ||
      trimmed.startsWith("<system-reminder>") ||
      trimmed.startsWith("Caveat:")
    ) {
      return null;
    }
    return trimmed;
  }
  if (Array.isArray(content)) {
    const texts = content
      .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text.trim())
      .filter(Boolean);
    if (texts.length === 0) return null;
    return extractUserText(texts.join("\n\n"));
  }
  return null;
}

export function parseSessionFile(filePath: string): ExternalClaudeSession | null {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const claudeSessionId = basename(filePath, ".jsonl");
  let cwd: string | null = null;
  let title: string | null = null;
  let summary: string | null = null;
  let firstUserText: string | null = null;
  let model: string | null = null;
  let entrypoint: string | null = null;
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;
  let userMessageCount = 0;
  let assistantMessageCount = 0;

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type === "ai-title" && typeof entry.aiTitle === "string") {
      title = entry.aiTitle;
      continue;
    }
    if (entry.type === "summary" && typeof entry.summary === "string") {
      summary = entry.summary;
      continue;
    }
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (entry.isSidechain) continue;

    if (!entrypoint && typeof entry.entrypoint === "string") {
      entrypoint = entry.entrypoint;
    }
    if (!cwd && typeof entry.cwd === "string") {
      cwd = entry.cwd;
    }

    const ts = parseTimestamp(entry.timestamp);
    if (ts) {
      if (!firstTimestamp) firstTimestamp = ts;
      lastTimestamp = ts;
    }

    if (entry.type === "user" && !entry.isMeta) {
      const text = extractUserText(entry.message?.content);
      if (text) {
        userMessageCount++;
        if (!firstUserText) firstUserText = text;
      }
    } else if (entry.type === "assistant") {
      const blocks = entry.message?.content;
      if (Array.isArray(blocks) && blocks.length > 0) {
        assistantMessageCount++;
        if (!model && typeof entry.message?.model === "string") {
          model = entry.message.model;
        }
      }
    }
  }

  if (!cwd || !entrypoint || userMessageCount === 0) return null;

  const fallbackTitle = firstUserText
    ? firstUserText.replace(/\s+/g, " ").slice(0, 80)
    : claudeSessionId;

  return {
    claudeSessionId,
    filePath,
    cwd,
    title: title || summary || fallbackTitle,
    model,
    entrypoint,
    firstTimestamp: firstTimestamp || Date.now(),
    lastTimestamp: lastTimestamp || Date.now(),
    userMessageCount,
    assistantMessageCount,
  };
}

export function scanExternalSessions(days: number): ExternalClaudeSession[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const results: ExternalClaudeSession[] = [];

  for (const dir of readdirSync(CLAUDE_PROJECTS_DIR)) {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dir);
    let files: string[];
    try {
      files = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const filePath = join(dirPath, file);
      try {
        if (statSync(filePath).mtimeMs < cutoff) continue;
      } catch {
        continue;
      }
      const parsed = parseSessionFile(filePath);
      if (parsed && parsed.entrypoint === "cli") {
        results.push(parsed);
      }
    }
  }

  return results.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

function getKnownClaudeSessionIds(): Set<string> {
  const known = new Set<string>();
  for (const project of projects.list(true)) {
    for (const session of sessions.listByProject(project.id, true)) {
      known.add(session.id);
      if (session.claude_session_id) known.add(session.claude_session_id);
      if (session.backend_session_id) known.add(session.backend_session_id);
    }
  }
  return known;
}

function findOrCreateProject(cwd: string): string {
  const existing = projects.list(true).find((p) => p.path === cwd);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Date.now();
  projects.create(id, basename(cwd) || cwd, cwd, null, now, now);
  return id;
}

function backfillMessages(sessionId: string, filePath: string): number {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return 0;
  }

  let count = 0;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.isSidechain) continue;
    const ts = parseTimestamp(entry.timestamp) || Date.now();

    if (entry.type === "user" && !entry.isMeta) {
      const text = extractUserText(entry.message?.content);
      if (text) {
        messages.create(crypto.randomUUID(), sessionId, "user", JSON.stringify(text), ts);
        count++;
      }
    } else if (entry.type === "assistant") {
      const blocks = entry.message?.content;
      if (Array.isArray(blocks) && blocks.length > 0) {
        messages.create(crypto.randomUUID(), sessionId, "assistant", JSON.stringify(blocks), ts);
        count++;
      }
    }
  }
  return count;
}

function importSession(candidate: ExternalClaudeSession): { sessionId: string; messageCount: number } {
  const projectId = findOrCreateProject(candidate.cwd);
  const sessionId = crypto.randomUUID();
  sessions.create(
    sessionId,
    projectId,
    candidate.title,
    candidate.firstTimestamp,
    candidate.lastTimestamp,
    "claude"
  );
  sessions.updateClaudeSession(
    candidate.claudeSessionId,
    candidate.model,
    0,
    0,
    0,
    0,
    candidate.lastTimestamp,
    sessionId
  );
  sessions.updateBackendSessionState(
    candidate.claudeSessionId,
    JSON.stringify({ importedFrom: "claude-cli", importedAt: Date.now() }),
    candidate.lastTimestamp,
    sessionId
  );
  const messageCount = backfillMessages(sessionId, candidate.filePath);
  searchIndex.indexSession(sessionId);
  return { sessionId, messageCount };
}

export async function handleImportClaudeRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  if (url.pathname !== "/api/import/claude-sessions") return null;

  if (method === "GET") {
    const days = parseInt(url.searchParams.get("days") || "30", 10);
    const known = getKnownClaudeSessionIds();
    const candidates = scanExternalSessions(days).filter(
      (c) => !known.has(c.claudeSessionId)
    );
    return json(candidates);
  }

  if (method === "POST") {
    const body = await req.json().catch(() => ({}));
    const days = typeof body.days === "number" ? body.days : 30;
    const requestedIds: string[] | null = Array.isArray(body.sessionIds)
      ? body.sessionIds
      : null;
    if (!requestedIds && body.all !== true) {
      return json({ error: "Provide sessionIds or set all: true" }, 400);
    }

    const known = getKnownClaudeSessionIds();
    let candidates = scanExternalSessions(days).filter(
      (c) => !known.has(c.claudeSessionId)
    );
    if (requestedIds) {
      const wanted = new Set(requestedIds);
      candidates = candidates.filter((c) => wanted.has(c.claudeSessionId));
    }

    const imported = candidates.map((candidate) => {
      const result = importSession(candidate);
      return {
        sessionId: result.sessionId,
        claudeSessionId: candidate.claudeSessionId,
        title: candidate.title,
        cwd: candidate.cwd,
        messageCount: result.messageCount,
      };
    });

    return json({ imported, count: imported.length });
  }

  return null;
}
