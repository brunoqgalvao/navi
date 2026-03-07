import { json } from "../utils/response";
import { projects, sessions, messages, searchIndex, pendingQuestions, sessionHierarchy, sessionFolders, workflows, workflowRuns, type Message } from "../db";
import { enableUntilDone, disableUntilDone, getUntilDoneSessions, cleanupSessionState, skipSessionWait, getActiveWaits } from "../websocket/handler";
import { nativePreviewService } from "../services/native-preview";
import { sessionManager } from "../services/session-manager";
import { homedir } from "os";
import { join, dirname, basename } from "path";
import { readdir, readFile, stat, writeFile } from "fs/promises";
import type { Dirent } from "fs";

function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function encodeClaudeProjectPath(projectPath: string): string {
  return projectPath.replace(/[\\/]/g, "-");
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

function buildPrunedSummary(originalContent: string, maxPrunedLength: number): string {
  const contentLines = originalContent.split("\n");
  const lineCount = contentLines.length;

  if (lineCount > 3) {
    return contentLines.slice(0, 2).join("\n") + `\n... [${lineCount - 2} lines, ${originalContent.length} chars pruned]`;
  }

  return originalContent.slice(0, Math.max(0, maxPrunedLength - 30)) + `... [${originalContent.length} chars pruned]`;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function scanToolResultsDirs(sessionDir: string, maxDepth: number = 4): Promise<string[]> {
  const found: string[] = [];

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth < 0) return;

    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.name === "tool-results") {
        found.push(fullPath);
        continue;
      }
      await walk(fullPath, depth - 1);
    }
  }

  await walk(sessionDir, maxDepth);
  return found;
}

interface ClaudeSessionArtifacts {
  sessionFile: string | null;
  toolResultsDirs: string[];
}

async function resolveClaudeSessionArtifacts(
  claudeSessionId: string,
  candidateProjectPaths: Array<string | null | undefined>
): Promise<ClaudeSessionArtifacts> {
  const claudeConfigDir = getClaudeConfigDir();
  const projectDirs = dedupeStrings(
    candidateProjectPaths
      .filter((value): value is string => !!value)
      .map((projectPath) => join(claudeConfigDir, "projects", encodeClaudeProjectPath(projectPath)))
  );

  const sessionsDir = join(claudeConfigDir, "sessions");

  const sessionFileCandidates: string[] = [];
  for (const projectDir of projectDirs) {
    sessionFileCandidates.push(join(projectDir, `${claudeSessionId}.jsonl`));
    sessionFileCandidates.push(join(projectDir, claudeSessionId, "session.jsonl"));
    sessionFileCandidates.push(join(projectDir, claudeSessionId, "conversation.jsonl"));
    sessionFileCandidates.push(join(projectDir, claudeSessionId, "transcript.jsonl"));
  }
  sessionFileCandidates.push(join(sessionsDir, `${claudeSessionId}.jsonl`));
  sessionFileCandidates.push(join(sessionsDir, claudeSessionId, "session.jsonl"));
  sessionFileCandidates.push(join(sessionsDir, claudeSessionId, "conversation.jsonl"));
  sessionFileCandidates.push(join(sessionsDir, claudeSessionId, "transcript.jsonl"));

  let sessionFile: string | null = null;
  for (const candidate of sessionFileCandidates) {
    if (await isFile(candidate)) {
      sessionFile = candidate;
      break;
    }
  }

  // Fallback search for unknown layouts under projects/* and sessions/*.
  if (!sessionFile) {
    const projectsRoot = join(claudeConfigDir, "projects");
    if (await isDirectory(projectsRoot)) {
      const projectEntries = await readdir(projectsRoot, { withFileTypes: true });
      for (const entry of projectEntries) {
        if (!entry.isDirectory()) continue;
        const projectDir = join(projectsRoot, entry.name);
        const direct = join(projectDir, `${claudeSessionId}.jsonl`);
        if (await isFile(direct)) {
          sessionFile = direct;
          break;
        }
        const nestedCandidates = [
          join(projectDir, claudeSessionId, "session.jsonl"),
          join(projectDir, claudeSessionId, "conversation.jsonl"),
          join(projectDir, claudeSessionId, "transcript.jsonl"),
        ];
        for (const nested of nestedCandidates) {
          if (await isFile(nested)) {
            sessionFile = nested;
            break;
          }
        }
        if (sessionFile) break;
      }
    }
  }

  if (!sessionFile && await isDirectory(sessionsDir)) {
    const direct = join(sessionsDir, `${claudeSessionId}.jsonl`);
    if (await isFile(direct)) {
      sessionFile = direct;
    }
  }

  const sessionDirs = dedupeStrings([
    ...projectDirs.map((projectDir) => join(projectDir, claudeSessionId)),
    join(sessionsDir, claudeSessionId),
    ...(sessionFile
      ? [
          basename(dirname(sessionFile)) === claudeSessionId
            ? dirname(sessionFile)
            : join(dirname(sessionFile), claudeSessionId),
        ]
      : []),
  ]);

  const toolResultsDirs = dedupeStrings(
    (
      await Promise.all(
        sessionDirs.map(async (sessionDir) => {
          if (!(await isDirectory(sessionDir))) return [];
          return scanToolResultsDirs(sessionDir);
        })
      )
    ).flat()
  );

  return { sessionFile, toolResultsDirs };
}

interface PruneCounters {
  prunedCount: number;
  charsSaved: number;
  prunedToolUseIds: Set<string>;
}

function pruneToolResultBlocks(
  blocks: any[],
  maxPrunedLength: number,
  counters: PruneCounters
): { modified: boolean; blocks: any[] } {
  let modified = false;
  const prunedBlocks = blocks.map((block) => {
    if (!block || block.type !== "tool_result") {
      return block;
    }

    const originalContent = typeof block.content === "string"
      ? block.content
      : JSON.stringify(block.content);

    if (originalContent.length <= maxPrunedLength) {
      return block;
    }

    modified = true;
    const summary = buildPrunedSummary(originalContent, maxPrunedLength);
    counters.prunedCount++;
    counters.charsSaved += Math.max(0, originalContent.length - summary.length);
    if (typeof block.tool_use_id === "string" && block.tool_use_id.length > 0) {
      counters.prunedToolUseIds.add(block.tool_use_id);
    }

    return {
      ...block,
      content: summary,
    };
  });

  return { modified, blocks: prunedBlocks };
}

function pruneToolUseResultPayload(
  payload: unknown,
  maxPrunedLength: number,
  counters: PruneCounters
): { changed: boolean; value: unknown } {
  if (payload == null) {
    return { changed: false, value: payload };
  }

  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (serialized.length <= maxPrunedLength) {
    return { changed: false, value: payload };
  }

  const summary = buildPrunedSummary(serialized, maxPrunedLength);
  const originalChars = serialized.length;
  const nextValue: Record<string, unknown> = {
    pruned: true,
    summary,
    originalChars,
  };

  if (payload && typeof payload === "object") {
    const payloadObject = payload as Record<string, unknown>;
    if (typeof payloadObject.filePath === "string") nextValue.filePath = payloadObject.filePath;
    if (typeof payloadObject.path === "string") nextValue.path = payloadObject.path;
    if (typeof payloadObject.command === "string") nextValue.command = payloadObject.command;
  }

  counters.prunedCount++;
  counters.charsSaved += Math.max(0, originalChars - JSON.stringify(nextValue).length);
  return { changed: true, value: nextValue };
}

async function pruneToolResultFiles(
  toolResultsDirs: string[],
  prunedToolUseIds: Set<string>,
  preserveRecentCount: number,
  maxPrunedLength: number
): Promise<{ prunedCount: number; charsSaved: number }> {
  let prunedCount = 0;
  let charsSaved = 0;

  const pruneFile = async (filePath: string): Promise<void> => {
    if (!(await isFile(filePath))) return;
    const originalContent = await readFile(filePath, "utf-8");
    if (originalContent.length <= maxPrunedLength) return;
    const summary = buildPrunedSummary(originalContent, maxPrunedLength);
    await writeFile(filePath, summary + "\n");
    prunedCount++;
    charsSaved += Math.max(0, originalContent.length - summary.length);
  };

  if (prunedToolUseIds.size > 0) {
    const targetFiles = dedupeStrings(
      toolResultsDirs.flatMap((toolResultsDir) =>
        Array.from(prunedToolUseIds).map((toolUseId) => join(toolResultsDir, `${toolUseId}.txt`))
      )
    );
    for (const filePath of targetFiles) {
      await pruneFile(filePath);
    }
    return { prunedCount, charsSaved };
  }

  // Fallback for layouts with only tool-results files and no JSONL session file.
  const txtFilesWithMtime: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const toolResultsDir of toolResultsDirs) {
    let entries: Dirent[];
    try {
      entries = await readdir(toolResultsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
      const filePath = join(toolResultsDir, entry.name);
      try {
        const fileStat = await stat(filePath);
        txtFilesWithMtime.push({ filePath, mtimeMs: fileStat.mtimeMs });
      } catch {}
    }
  }

  txtFilesWithMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const filesToPrune = txtFilesWithMtime.slice(Math.max(0, preserveRecentCount)).map((file) => file.filePath);
  for (const filePath of dedupeStrings(filesToPrune)) {
    await pruneFile(filePath);
  }

  return { prunedCount, charsSaved };
}

export function createSessionApprovedAllSet(): Set<string> {
  return new Set<string>();
}

export async function handleSessionRoutes(
  url: URL,
  method: string,
  req: Request,
  sessionApprovedAll: Set<string>,
  pendingPermissions: Map<string, { sessionId: string; payload: any }>
): Promise<Response | null> {
  if (url.pathname === "/api/sessions/recent" && method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    // Use light query for sidebar (excludes heavy JSON columns)
    return json(sessions.listRecentLight(limit, includeArchived));
  }

  if (url.pathname === "/api/sessions/active" && method === "GET") {
    const permissionSessions = new Set(
      Array.from(pendingPermissions.values()).map((pending) => pending.sessionId)
    );
    // Note: activeProcesses needs to be passed in or accessed differently
    // For now, return empty - will be fixed in websocket integration
    return json([]);
  }

  const sessionsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/sessions$/);
  if (sessionsMatch) {
    const projectId = sessionsMatch[1];
    if (method === "GET") {
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      // Use light query for sidebar (excludes heavy JSON columns)
      return json(sessions.listByProjectLight(projectId, includeArchived));
    }
    if (method === "POST") {
      const body = await req.json();
      const id = crypto.randomUUID();
      const now = Date.now();
      sessions.create(id, projectId, body.title || "New conversation", now, now, body.backend);
      searchIndex.indexSession(id);
      return json(sessions.get(id), 201);
    }
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const id = sessionMatch[1];
    if (method === "GET") {
      const session = sessions.get(id);
      return session ? json(session) : json({ error: "Not found" }, 404);
    }
    if (method === "PATCH") {
      const body = await req.json();
      if (body.title) {
        sessions.updateTitle(body.title, Date.now(), id);
        searchIndex.indexSession(id);
      }
      if (body.model !== undefined) {
        sessions.updateModel(body.model, id);
      }
      if (body.backend !== undefined) {
        sessions.updateBackend(body.backend, id);
      }
      return json(sessions.get(id));
    }
    if (method === "DELETE") {
      const workflow = workflows.getByRootSession(id);
      // Clean up server-side state (WebSocket maps, active processes, etc.) before deleting
      cleanupSessionState(id);
      // Stop any running preview for this session
      await nativePreviewService.stopForSession(id);
      // Clean up session manager runtime state
      sessionManager.cleanup(id);
      if (workflow) {
        const descendants = sessionHierarchy.getDescendants(id);
        for (const descendant of descendants) {
          cleanupSessionState(descendant.id);
          messages.deleteBySession(descendant.id);
          searchIndex.removeSession(descendant.id);
          sessions.delete(descendant.id);
        }
        workflowRuns.deleteByWorkflow(workflow.id);
        workflows.delete(workflow.id);
      }
      searchIndex.removeSession(id);
      messages.deleteBySession(id);
      sessions.delete(id);
      return json({ success: true });
    }
  }

  const sessionPinMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/pin$/);
  if (sessionPinMatch && method === "POST") {
    const id = sessionPinMatch[1];
    const body = await req.json();
    sessions.togglePin(id, body.pinned);
    return json(sessions.get(id));
  }

  const sessionFavoriteMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/favorite$/);
  if (sessionFavoriteMatch && method === "POST") {
    const id = sessionFavoriteMatch[1];
    const body = await req.json();
    sessions.toggleFavorite(id, body.favorite);
    return json(sessions.get(id));
  }

  const sessionArchiveMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/archive$/);
  if (sessionArchiveMatch && method === "POST") {
    const id = sessionArchiveMatch[1];
    const body = await req.json();
    sessions.setArchived(id, body.archived);
    return json(sessions.get(id));
  }

  // Archive all non-starred sessions in a project
  const archiveAllNonStarredMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/sessions\/archive-all-non-starred$/);
  if (archiveAllNonStarredMatch && method === "POST") {
    const projectId = archiveAllNonStarredMatch[1];
    sessions.archiveAllNonStarred(projectId);
    return json({ success: true });
  }

  const sessionMarkedForReviewMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/mark-for-review$/);
  if (sessionMarkedForReviewMatch && method === "POST") {
    const id = sessionMarkedForReviewMatch[1];
    const body = await req.json();
    sessions.setMarkedForReview(id, body.markedForReview);
    return json(sessions.get(id));
  }

  const sessionAutoAcceptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/auto-accept$/);
  if (sessionAutoAcceptMatch && method === "POST") {
    const id = sessionAutoAcceptMatch[1];
    const body = await req.json();
    sessions.setAutoAcceptAll(id, body.autoAcceptAll);
    if (body.autoAcceptAll) {
      sessionApprovedAll.add(id);
    } else {
      sessionApprovedAll.delete(id);
    }
    return json(sessions.get(id));
  }

  // Reset claude session ID (used when pruning context)
  const sessionResetContextMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/reset-context$/);
  if (sessionResetContextMatch && method === "POST") {
    const id = sessionResetContextMatch[1];
    const session = sessions.get(id);
    if (!session) {
      return json({ error: "Session not found" }, 404);
    }
    // Clear backend-specific session state so the next query starts fresh.
    sessions.clearBackendSessionState(id);
    return json({ success: true, sessionReset: true });
  }

  const sessionsReorderMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/sessions\/reorder$/);
  if (sessionsReorderMatch && method === "POST") {
    const body = await req.json();
    for (let i = 0; i < body.order.length; i++) {
      sessions.updateOrder(body.order[i], i);
    }
    return json({ success: true });
  }

  const forkMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/fork$/);
  if (forkMatch && method === "POST") {
    const sourceSessionId = forkMatch[1];
    const body = await req.json();
    const fromMessageId = body.fromMessageId;

    const sourceSession = sessions.get(sourceSessionId);
    if (!sourceSession) {
      return json({ error: "Session not found" }, 404);
    }

    const allMessages = messages.listBySession(sourceSessionId);

    let messagesToCopy: Message[] = [];
    if (fromMessageId) {
      const messageIndex = allMessages.findIndex(m => m.id === fromMessageId);
      if (messageIndex >= 0) {
        messagesToCopy = allMessages.slice(0, messageIndex + 1);
      }
    } else {
      messagesToCopy = allMessages;
    }

    const newSessionId = crypto.randomUUID();
    const now = Date.now();
    const title = body.title || `Fork of ${sourceSession.title}`;

    // Copy backend from source session
    sessions.create(newSessionId, sourceSession.project_id, title, now, now, sourceSession.backend);

    // Set parent relationship for forked session (makes it a child of source session)
    sessionHierarchy.setForkParent(newSessionId, sourceSessionId);

    // Copy model from source session if it exists
    if (sourceSession.model) {
      sessions.updateModel(sourceSession.model, newSessionId);
    }

    for (const msg of messagesToCopy) {
      messages.create(
        crypto.randomUUID(),
        newSessionId,
        msg.role,
        msg.content,
        msg.timestamp,
        msg.parent_tool_use_id ?? null,
        msg.is_synthetic ?? 0
      );
    }

    let newClaudeSessionId: string | null = null;

    // Copy the Claude SDK session file if the source session has one
    if (sourceSession.claude_session_id) {
      try {
        const { homedir } = await import("os");
        const { join } = await import("path");
        const fs = await import("fs/promises");

        const project = projects.get(sourceSession.project_id);
        if (project) {
          const projectDirName = project.path.replace(/\//g, "-");
          const claudeProjectDir = join(homedir(), ".claude", "projects", projectDirName);
          const sourceFile = join(claudeProjectDir, `${sourceSession.claude_session_id}.jsonl`);

          try {
            const content = await fs.readFile(sourceFile, "utf-8");
            const lines = content.trim().split("\n");

            const forkMsg = messagesToCopy.length > 0 ? messagesToCopy[messagesToCopy.length - 1] : null;
            const forkTimestamp = forkMsg?.timestamp;

            let linesToKeep: string[] = [];
            let foundForkPoint = !forkTimestamp;

            for (const line of lines) {
              if (foundForkPoint) {
                break;
              }
              try {
                const entry = JSON.parse(line);
                linesToKeep.push(line);

                if (forkTimestamp && entry.timestamp && entry.timestamp >= forkTimestamp) {
                  if (entry.type === "assistant") {
                    foundForkPoint = true;
                  }
                }
              } catch {
                linesToKeep.push(line);
              }
            }

            if (linesToKeep.length > 0) {
              newClaudeSessionId = newSessionId;
              const newSessionFile = join(claudeProjectDir, `${newClaudeSessionId}.jsonl`);

              const updatedLines = linesToKeep.map(line => {
                try {
                  const entry = JSON.parse(line);
                  if (entry.sessionId === sourceSession.claude_session_id) {
                    entry.sessionId = newClaudeSessionId;
                  }
                  return JSON.stringify(entry);
                } catch {
                  return line;
                }
              });

              await fs.writeFile(newSessionFile, updatedLines.join("\n") + "\n");
              sessions.updateClaudeSession(newClaudeSessionId, sourceSession.model, 0, 0, 0, 0, now, newSessionId);
              console.log(`[Fork] Copied SDK session file for ${newSessionId}, claude_session_id: ${newClaudeSessionId}`);
            } else {
              console.warn(`[Fork] No lines to keep from source session file for ${sourceSessionId}, will use historyContext fallback`);
            }
          } catch (e) {
            // SDK file copy failed - historyContext fallback will be used
            console.error(`[Fork] Failed to copy Claude session file for ${sourceSessionId} (will use historyContext fallback):`, e);
          }
        } else {
          console.warn(`[Fork] Project not found for source session ${sourceSessionId}`);
        }
      } catch (e) {
        console.error(`[Fork] Failed to fork Claude internal session for ${sourceSessionId}:`, e);
      }
    } else {
      // Source session has no claude_session_id - this means it was never used with the SDK
      // The messages will be copied to the new session, but we need to synthesize context
      // when the user sends their first message in the forked session
      console.log(`[Fork] Source session ${sourceSessionId} has no claude_session_id, copied ${messagesToCopy.length} messages to display only`);
    }

    const newSession = sessions.get(newSessionId);
    console.log(`[Fork] Created forked session ${newSessionId} from ${sourceSessionId}, claude_session_id: ${newSession?.claude_session_id || 'none'}`);

    // If no SDK session was copied, synthesize historyContext from the copied messages
    // so Claude has context when the user sends their first message
    let historyContext: string | undefined;
    if (!newSession?.claude_session_id && messagesToCopy.length > 0) {
      // Extract text content from messages to build history context
      const extractText = (content: string): string => {
        try {
          const parsed = JSON.parse(content);
          if (typeof parsed === "string") return parsed;
          if (Array.isArray(parsed)) {
            return parsed
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("\n");
          }
          return "";
        } catch {
          return content;
        }
      };

      // Build context from message history (limit to prevent token overflow)
      const contextParts: string[] = [
        "# Previous Conversation Context",
        "",
        "This is a continuation of a previous conversation. Here's what was discussed:",
        ""
      ];

      // Include last N messages (keep it reasonable)
      const recentMessages = messagesToCopy.slice(-20);
      for (const msg of recentMessages) {
        const text = extractText(msg.content).slice(0, 2000); // Truncate long messages
        if (text.trim()) {
          const role = msg.role === "user" ? "User" : "Assistant";
          contextParts.push(`## ${role}:`);
          contextParts.push(text);
          contextParts.push("");
        }
      }

      contextParts.push("---");
      contextParts.push("");
      contextParts.push("Continue the conversation from here. The user will now send a new message.");

      historyContext = contextParts.join("\n");
      console.log(`[Fork] Generated historyContext for session ${newSessionId} (${historyContext.length} chars)`);
    }

    return json({ ...newSession, historyContext }, 201);
  }

  const resetTokensMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/reset-tokens$/);
  if (resetTokensMatch && method === "POST") {
    const sessionId = resetTokensMatch[1];
    try {
      sessions.resetTokenCounts(sessionId, 0, 0);
      return json({ success: true });
    } catch (error) {
      return json({ error: "Failed to reset tokens" }, 500);
    }
  }

  // Clear worktree data from session (converts it back to a normal main-branch session)
  const clearWorktreeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/clear-worktree$/);
  if (clearWorktreeMatch && method === "POST") {
    const sessionId = clearWorktreeMatch[1];
    const session = sessions.get(sessionId);
    if (!session) {
      return json({ error: "Session not found" }, 404);
    }
    sessions.clearWorktree(sessionId);
    return json(sessions.get(sessionId));
  }

  // Inspect endpoint for lazy-loading chat references
  // Returns metadata by default, or full content based on scope parameter
  const inspectMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/inspect$/);
  if (inspectMatch && method === "GET") {
    const sessionId = inspectMatch[1];
    const session = sessions.get(sessionId);
    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    const scope = url.searchParams.get("scope") || "metadata";
    const lastN = parseInt(url.searchParams.get("last") || "5", 10);
    const searchQuery = url.searchParams.get("search");

    const project = projects.get(session.project_id);
    const allMessages = messages.listBySession(sessionId);

    // Base metadata always included
    const metadata = {
      id: session.id,
      title: session.title,
      projectId: session.project_id,
      projectName: project?.name || null,
      projectPath: project?.path || null,
      messageCount: allMessages.length,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      model: session.model,
      totalCostUsd: session.total_cost_usd,
    };

    if (scope === "metadata") {
      return json({ metadata });
    }

    // Helper to extract text from message content
    const extractText = (content: string): string => {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === "string") return parsed;
        if (Array.isArray(parsed)) {
          return parsed
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n");
        }
        return "";
      } catch {
        return content;
      }
    };

    if (scope === "summary") {
      // Return first user message + last assistant message as summary
      const firstUser = allMessages.find(m => m.role === "user");
      const lastAssistant = [...allMessages].reverse().find(m => m.role === "assistant");

      return json({
        metadata,
        summary: {
          firstUserMessage: firstUser ? extractText(firstUser.content).slice(0, 500) : null,
          lastAssistantMessage: lastAssistant ? extractText(lastAssistant.content).slice(0, 500) : null,
        },
      });
    }

    if (scope === "last") {
      // Return last N messages
      const recentMessages = allMessages.slice(-lastN).map(m => ({
        id: m.id,
        role: m.role,
        text: extractText(m.content),
        timestamp: m.timestamp,
      }));

      return json({
        metadata,
        messages: recentMessages,
      });
    }

    if (scope === "search" && searchQuery) {
      // Search within this chat's messages
      const query = searchQuery.toLowerCase();
      const matches = allMessages
        .filter(m => extractText(m.content).toLowerCase().includes(query))
        .slice(0, 10)
        .map(m => ({
          id: m.id,
          role: m.role,
          text: extractText(m.content).slice(0, 300),
          timestamp: m.timestamp,
        }));

      return json({
        metadata,
        searchQuery,
        matches,
      });
    }

    if (scope === "full") {
      // Return full transcript
      const fullMessages = allMessages.map(m => ({
        id: m.id,
        role: m.role,
        text: extractText(m.content),
        timestamp: m.timestamp,
      }));

      return json({
        metadata,
        messages: fullMessages,
      });
    }

    return json({ error: "Invalid scope. Use: metadata, summary, last, search, full" }, 400);
  }

  const exportMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/export$/);
  if (exportMatch && method === "GET") {
    const sessionId = exportMatch[1];
    const session = sessions.get(sessionId);
    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    const project = projects.get(session.project_id);
    const msgs = messages.listBySession(sessionId);

    let markdown = `# ${session.title}\n\n`;
    markdown += `**Project:** ${project?.name || "Unknown"}\n`;
    markdown += `**Path:** ${project?.path || "Unknown"}\n`;
    markdown += `**Date:** ${new Date(session.created_at).toLocaleString()}\n`;
    markdown += `**Cost:** $${session.total_cost_usd.toFixed(4)}\n\n`;
    markdown += `---\n\n`;

    for (const msg of msgs) {
      const content = JSON.parse(msg.content);
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      markdown += `## ${role}\n\n`;

      if (typeof content === "string") {
        markdown += `${content}\n\n`;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            markdown += `${block.text}\n\n`;
          } else if (block.type === "tool_use") {
            markdown += `**Tool: ${block.name}**\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\`\n\n`;
          }
        }
      }
    }

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="${session.title.replace(/[^a-z0-9]/gi, "_")}.md"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Pending questions for ask_user_question tool
  const pendingQuestionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/pending-question$/);
  if (pendingQuestionMatch) {
    const sessionId = pendingQuestionMatch[1];

    if (method === "GET") {
      const pending = pendingQuestions.getBySession(sessionId);
      if (pending) {
        return json({
          ...pending,
          questions: JSON.parse(pending.questions),
        });
      }
      return json(null);
    }

    if (method === "DELETE") {
      pendingQuestions.deleteBySession(sessionId);
      return json({ success: true });
    }
  }

  // Prune tool results in SDK session file
  const pruneMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/prune-tool-results$/);
  if (pruneMatch && method === "POST") {
    const sessionId = pruneMatch[1];
    const session = sessions.get(sessionId);
    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.claude_session_id) {
      return json({ error: "No Claude session to prune", prunedCount: 0 }, 400);
    }

    const project = projects.get(session.project_id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      // Read and parse body for options
      const body = await req.json().catch(() => ({}));
      const preserveRecentCount = body.preserveRecentCount ?? 5;
      const maxPrunedLength = body.maxPrunedLength ?? 200;

      const { sessionFile, toolResultsDirs } = await resolveClaudeSessionArtifacts(
        session.claude_session_id,
        [session.worktree_path, project.path]
      );

      if (!sessionFile && toolResultsDirs.length === 0) {
        return json({ error: "Claude session file not found", prunedCount: 0 }, 404);
      }

      const counters: PruneCounters = {
        prunedCount: 0,
        charsSaved: 0,
        prunedToolUseIds: new Set<string>(),
      };

      if (sessionFile) {
        const rawContent = await readFile(sessionFile, "utf-8");
        const trimmedContent = rawContent.trim();
        const lines = trimmedContent.length > 0 ? trimmedContent.split("\n") : [];

        // Find which messages to preserve (from the end) by counting top-level user turns.
        const userMessageIndices: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          try {
            const entry = JSON.parse(lines[i]);
            if (entry.type === "user") {
              userMessageIndices.push(i);
            }
          } catch {}
        }

        // Preserve messages from the Nth-to-last user message onwards.
        const preserveFromIndex = userMessageIndices.length > preserveRecentCount
          ? userMessageIndices[userMessageIndices.length - preserveRecentCount]
          : 0;

        // Process each line, pruning tool results in older messages.
        const prunedLines = lines.map((line, index) => {
          if (index >= preserveFromIndex) {
            return line;
          }

          try {
            const entry = JSON.parse(line) as any;
            let modified = false;

            // Top-level message content (standard Claude transcript line).
            if (Array.isArray(entry?.message?.content)) {
              const result = pruneToolResultBlocks(entry.message.content, maxPrunedLength, counters);
              if (result.modified) {
                entry.message.content = result.blocks;
                modified = true;
              }
            }

            // Nested progress payload format.
            if (Array.isArray(entry?.data?.message?.message?.content)) {
              const result = pruneToolResultBlocks(entry.data.message.message.content, maxPrunedLength, counters);
              if (result.modified) {
                entry.data.message.message.content = result.blocks;
                modified = true;
              }
            }
            if (Array.isArray(entry?.data?.message?.content)) {
              const result = pruneToolResultBlocks(entry.data.message.content, maxPrunedLength, counters);
              if (result.modified) {
                entry.data.message.content = result.blocks;
                modified = true;
              }
            }

            // Large edit payloads frequently live outside message.content.
            if (Object.prototype.hasOwnProperty.call(entry, "toolUseResult")) {
              const result = pruneToolUseResultPayload(entry.toolUseResult, maxPrunedLength, counters);
              if (result.changed) {
                entry.toolUseResult = result.value;
                modified = true;
              }
            }
            if (Object.prototype.hasOwnProperty.call(entry?.data?.message ?? {}, "toolUseResult")) {
              const result = pruneToolUseResultPayload(entry.data.message.toolUseResult, maxPrunedLength, counters);
              if (result.changed) {
                entry.data.message.toolUseResult = result.value;
                modified = true;
              }
            }
            if (Object.prototype.hasOwnProperty.call(entry?.data?.message?.message ?? {}, "toolUseResult")) {
              const result = pruneToolUseResultPayload(entry.data.message.message.toolUseResult, maxPrunedLength, counters);
              if (result.changed) {
                entry.data.message.message.toolUseResult = result.value;
                modified = true;
              }
            }

            return modified ? JSON.stringify(entry) : line;
          } catch {
            return line;
          }
        });

        await writeFile(sessionFile, prunedLines.length > 0 ? prunedLines.join("\n") + "\n" : "");
      }

      // Prune external tool result files when present (newer Claude layouts).
      const toolResultFilePrune = await pruneToolResultFiles(
        toolResultsDirs,
        counters.prunedToolUseIds,
        preserveRecentCount,
        maxPrunedLength
      );

      const totalPrunedCount = counters.prunedCount + toolResultFilePrune.prunedCount;
      const totalCharsSaved = counters.charsSaved + toolResultFilePrune.charsSaved;
      const tokensSaved = Math.round(totalCharsSaved / 4);

      return json({
        success: true,
        prunedCount: totalPrunedCount,
        tokensSaved,
        prunedToolUseIds: Array.from(counters.prunedToolUseIds),
      });
    } catch (e) {
      console.error("Failed to prune tool results:", e);
      return json({ error: "Failed to prune tool results", details: String(e) }, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // WAIT/PAUSE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  // Get active waits for a session
  const activeWaitsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/waits$/);
  if (activeWaitsMatch && method === "GET") {
    const sessionId = activeWaitsMatch[1];
    const waits = getActiveWaits(sessionId);
    return json({ waits });
  }

  // Skip a specific wait
  const skipWaitMatch = url.pathname.match(/^\/api\/sessions\/waits\/([^/]+)\/skip$/);
  if (skipWaitMatch && method === "POST") {
    const requestId = skipWaitMatch[1];
    const success = skipSessionWait(requestId);
    if (success) {
      return json({ success: true });
    }
    return json({ error: "Wait not found or already completed" }, 404);
  }

  // ═══════════════════════════════════════════════════════════════
  // UNTIL DONE MODE
  // ═══════════════════════════════════════════════════════════════

  // Enable until done mode for a session
  const untilDoneEnableMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/until-done$/);
  if (untilDoneEnableMatch && method === "POST") {
    const sessionId = untilDoneEnableMatch[1];
    const session = sessions.get(sessionId);
    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    const body = await req.json();
    const maxIterations = body.maxIterations || 10;

    enableUntilDone(
      sessionId,
      body.originalPrompt || "",
      session.project_id,
      session.model || undefined,
      maxIterations
    );

    return json({
      success: true,
      sessionId,
      untilDoneEnabled: true,
      maxIterations,
    });
  }

  // Disable until done mode for a session
  if (untilDoneEnableMatch && method === "DELETE") {
    const sessionId = untilDoneEnableMatch[1];
    disableUntilDone(sessionId);
    return json({ success: true, sessionId, untilDoneEnabled: false });
  }

  // Get until done status for a session
  if (untilDoneEnableMatch && method === "GET") {
    const sessionId = untilDoneEnableMatch[1];
    const state = getUntilDoneSessions().get(sessionId);
    if (!state) {
      return json({ enabled: false, sessionId });
    }
    return json({
      enabled: state.enabled,
      sessionId,
      iteration: state.iteration,
      maxIterations: state.maxIterations,
      totalCost: state.totalCost,
    });
  }

  // Generate a summary of a session's conversation
  const generateSummaryMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/generate-summary$/);
  if (generateSummaryMatch && method === "POST") {
    const sessionId = generateSummaryMatch[1];
    const session = sessions.get(sessionId);
    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    const project = projects.get(session.project_id);
    const allMessages = messages.listBySession(sessionId);

    if (allMessages.length === 0) {
      return json({ error: "No messages to summarize" }, 400);
    }

    // Extract text from message content
    const extractText = (content: string): string => {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === "string") return parsed;
        if (Array.isArray(parsed)) {
          return parsed
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n");
        }
        return "";
      } catch {
        return content;
      }
    };

    // Build conversation transcript (limit to avoid token overflow)
    const transcript = allMessages
      .slice(-50) // Last 50 messages max
      .map(m => {
        const text = extractText(m.content).slice(0, 2000); // Truncate long messages
        return `${m.role.toUpperCase()}: ${text}`;
      })
      .join("\n\n---\n\n");

    // Call ephemeral chat to generate summary
    const summaryPrompt = `Summarize the following conversation between a user and an AI assistant. Focus on:
1. The main goals/tasks the user was trying to accomplish
2. Key decisions made or approaches taken
3. Important context that would be useful for continuing this work
4. Any unfinished tasks or next steps mentioned

Keep the summary concise but comprehensive (2-4 paragraphs). Write it as context that could be provided to start a fresh conversation.

CONVERSATION:
${transcript}`;

    try {
      const ephemeralResponse = await fetch("http://localhost:3001/api/ephemeral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: summaryPrompt,
          systemPrompt: "You are a helpful assistant that creates clear, actionable summaries of technical conversations. Your summaries should help someone quickly understand the context and continue the work.",
          model: "claude-sonnet-4-20250514",
          maxTokens: 1024,
        }),
      });

      if (!ephemeralResponse.ok) {
        const err = await ephemeralResponse.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate summary");
      }

      const data = await ephemeralResponse.json();

      return json({
        summary: data.result,
        sessionTitle: session.title,
        projectName: project?.name || null,
        messageCount: allMessages.length,
        costUsd: data.costUsd,
      });
    } catch (e) {
      console.error("Failed to generate session summary:", e);
      return json({ error: e instanceof Error ? e.message : "Failed to generate summary" }, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SESSION FOLDERS - Group sessions within a project
  // ═══════════════════════════════════════════════════════════════

  // List session folders for a project
  const sessionFoldersListMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/session-folders$/);
  if (sessionFoldersListMatch) {
    const projectId = sessionFoldersListMatch[1];
    if (method === "GET") {
      return json(sessionFolders.listByProject(projectId));
    }
    if (method === "POST") {
      const body = await req.json();
      const id = crypto.randomUUID();
      const folders = sessionFolders.listByProject(projectId);
      const maxOrder = folders.length > 0 ? Math.max(...folders.map(f => f.sort_order)) + 1 : 0;
      sessionFolders.create(id, projectId, body.name, maxOrder);
      return json(sessionFolders.get(id), 201);
    }
  }

  // Single session folder operations
  const sessionFolderMatch = url.pathname.match(/^\/api\/session-folders\/([^/]+)$/);
  if (sessionFolderMatch) {
    const id = sessionFolderMatch[1];
    if (method === "GET") {
      const folder = sessionFolders.get(id);
      return folder ? json(folder) : json({ error: "Not found" }, 404);
    }
    if (method === "PUT") {
      const body = await req.json();
      sessionFolders.update(id, body.name);
      return json(sessionFolders.get(id));
    }
    if (method === "DELETE") {
      sessionFolders.delete(id);
      return json({ success: true });
    }
  }

  // Toggle collapse
  const sessionFolderCollapseMatch = url.pathname.match(/^\/api\/session-folders\/([^/]+)\/collapse$/);
  if (sessionFolderCollapseMatch && method === "POST") {
    const id = sessionFolderCollapseMatch[1];
    const body = await req.json();
    sessionFolders.toggleCollapsed(id, body.collapsed);
    return json(sessionFolders.get(id));
  }

  // Toggle pin
  const sessionFolderPinMatch = url.pathname.match(/^\/api\/session-folders\/([^/]+)\/pin$/);
  if (sessionFolderPinMatch && method === "POST") {
    const id = sessionFolderPinMatch[1];
    const body = await req.json();
    sessionFolders.togglePin(id, body.pinned);
    return json(sessionFolders.get(id));
  }

  // Reorder folders
  const sessionFoldersReorderMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/session-folders\/reorder$/);
  if (sessionFoldersReorderMatch && method === "POST") {
    const body = await req.json();
    for (let i = 0; i < body.order.length; i++) {
      sessionFolders.updateOrder(body.order[i], i);
    }
    return json({ success: true });
  }

  // Set session folder
  const sessionSetFolderMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/folder$/);
  if (sessionSetFolderMatch && method === "POST") {
    const sessionId = sessionSetFolderMatch[1];
    const body = await req.json();
    sessions.setFolder(sessionId, body.folderId);
    return json(sessions.get(sessionId));
  }

  return null;
}
