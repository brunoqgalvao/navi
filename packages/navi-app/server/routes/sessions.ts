import { json } from "../utils/response";
import { projects, sessions, messages, searchIndex, pendingQuestions, type Message } from "../db";
import { enableUntilDone, disableUntilDone, getUntilDoneSessions, cleanupSessionState } from "../websocket/handler";
import { nativePreviewService } from "../services/native-preview";
import { sessionManager } from "../services/session-manager";

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
      // Clean up server-side state (WebSocket maps, active processes, etc.) before deleting
      cleanupSessionState(id);
      // Stop any running preview for this session
      await nativePreviewService.stopForSession(id);
      // Clean up session manager runtime state
      sessionManager.cleanup(id);
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
    // Clear claude_session_id so next query starts fresh
    sessions.updateClaudeSession(null, session.model, 0, 0, 0, 0, Date.now(), id);
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
      const { homedir } = await import("os");
      const { join } = await import("path");
      const fs = await import("fs/promises");

      const projectDirName = project.path.replace(/\//g, "-");
      const claudeProjectDir = join(homedir(), ".claude", "projects", projectDirName);
      const sessionFile = join(claudeProjectDir, `${session.claude_session_id}.jsonl`);

      // Read and parse body for options
      const body = await req.json().catch(() => ({}));
      const preserveRecentCount = body.preserveRecentCount ?? 5;
      const maxPrunedLength = body.maxPrunedLength ?? 200;

      // Read the JSONL file
      let content: string;
      try {
        content = await fs.readFile(sessionFile, "utf-8");
      } catch (e) {
        return json({ error: "Claude session file not found", prunedCount: 0 }, 404);
      }

      const lines = content.trim().split("\n");
      let prunedCount = 0;
      let charsSaved = 0;
      const prunedToolUseIds: string[] = [];

      // Find which messages to preserve (from the end)
      // Count user messages to determine how many "turns" to preserve
      let userMessageCount = 0;
      const userMessageIndices: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.type === "user") {
            userMessageCount++;
            userMessageIndices.push(i);
          }
        } catch {}
      }

      // Preserve messages from the Nth-to-last user message onwards
      const preserveFromIndex = userMessageIndices.length > preserveRecentCount
        ? userMessageIndices[userMessageIndices.length - preserveRecentCount]
        : 0;

      // Process each line, pruning tool results in older messages
      const prunedLines = lines.map((line, index) => {
        // Don't prune recent messages
        if (index >= preserveFromIndex) {
          return line;
        }

        try {
          const entry = JSON.parse(line);

          // Only process user messages (which contain tool_result blocks)
          if (entry.type !== "user" || !entry.message?.content) {
            return line;
          }

          const content = entry.message.content;
          if (!Array.isArray(content)) {
            return line;
          }

          let modified = false;
          const prunedContent = content.map((block: any) => {
            if (block.type !== "tool_result") {
              return block;
            }

            const originalContent = typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content);

            // Skip if already small
            if (originalContent.length <= maxPrunedLength) {
              return block;
            }

            modified = true;
            prunedCount++;
            charsSaved += originalContent.length - maxPrunedLength;
            prunedToolUseIds.push(block.tool_use_id);

            // Create pruned summary
            const lines = originalContent.split("\n");
            const lineCount = lines.length;
            let summary: string;

            if (lineCount > 3) {
              summary = lines.slice(0, 2).join("\n") + `\n... [${lineCount - 2} lines, ${originalContent.length} chars pruned]`;
            } else {
              summary = originalContent.slice(0, maxPrunedLength - 30) + `... [${originalContent.length} chars pruned]`;
            }

            return {
              ...block,
              content: summary,
            };
          });

          if (modified) {
            entry.message.content = prunedContent;
            return JSON.stringify(entry);
          }

          return line;
        } catch {
          return line;
        }
      });

      // Write back the pruned file
      await fs.writeFile(sessionFile, prunedLines.join("\n") + "\n");

      const tokensSaved = Math.round(charsSaved / 4);

      console.log(`Pruned ${prunedCount} tool results in session ${sessionId}, saved ~${tokensSaved} tokens`);

      return json({
        success: true,
        prunedCount,
        tokensSaved,
        prunedToolUseIds,
      });
    } catch (e) {
      console.error("Failed to prune tool results:", e);
      return json({ error: "Failed to prune tool results", details: String(e) }, 500);
    }
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

  return null;
}
