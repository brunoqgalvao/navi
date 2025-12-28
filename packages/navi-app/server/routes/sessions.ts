import { json } from "../utils/response";
import { projects, sessions, messages, searchIndex, type Message } from "../db";

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
    return json(sessions.listRecent(limit, includeArchived));
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
      return json(sessions.listByProject(projectId, includeArchived));
    }
    if (method === "POST") {
      const body = await req.json();
      const id = crypto.randomUUID();
      const now = Date.now();
      sessions.create(id, projectId, body.title || "New conversation", now, now);
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
      return json(sessions.get(id));
    }
    if (method === "DELETE") {
      searchIndex.removeSession(id);
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

    sessions.create(newSessionId, sourceSession.project_id, title, now, now);

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
              console.log(`Forked Claude session: ${sourceSession.claude_session_id} -> ${newClaudeSessionId} (${linesToKeep.length} lines)`);
            }
          } catch (e) {
            console.error("Failed to copy Claude session file:", e);
          }
        }
      } catch (e) {
        console.error("Failed to fork Claude internal session:", e);
      }
    }

    return json(sessions.get(newSessionId), 201);
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

  return null;
}
