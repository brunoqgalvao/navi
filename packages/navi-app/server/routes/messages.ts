import { json } from "../utils/response";
import { sessions, messages, searchIndex, projects } from "../db";
import { triggerQuery } from "../websocket/handler";

export async function handleMessageRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  const messagesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (messagesMatch) {
    const sessionId = messagesMatch[1];
    if (method === "GET") {
      // Support pagination via query params: ?limit=50&offset=0
      const limit = parseInt(url.searchParams.get("limit") || "0", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      if (limit > 0) {
        // Paginated request - returns newest messages first (reversed for display)
        const total = messages.countBySession(sessionId);
        const paginatedMsgs = messages.listBySessionPaginated(sessionId, limit, offset);
        // Reverse to get chronological order for display
        const chronologicalMsgs = paginatedMsgs.reverse();
        return json({
          messages: chronologicalMsgs.map(m => ({ ...m, content: JSON.parse(m.content) })),
          total,
          limit,
          offset,
          hasMore: offset + paginatedMsgs.length < total,
        });
      }

      // No pagination - return all messages (backwards compatible)
      const msgs = messages.listBySession(sessionId);
      return json(msgs.map(m => ({ ...m, content: JSON.parse(m.content) })));
    }
    if (method === "POST") {
      try {
        const body = await req.json();
        const { message } = body;
        if (!message || typeof message !== "string") {
          return json({ error: "Message is required and must be a string" }, 400);
        }

        const session = sessions.get(sessionId);
        if (!session) {
          return json({ error: "Session not found" }, 404);
        }

        const project = projects.get(session.project_id);
        if (!project) {
          return json({ error: "Project not found" }, 404);
        }

        const triggered = triggerQuery(sessionId, session.project_id, message, session.model);
        if (!triggered) {
          return json({ error: "No active connection available to process the query" }, 503);
        }

        return json({
          success: true,
          message: "Query sent successfully. Claude is processing the message.",
          sessionId
        });
      } catch (e) {
        console.error("Failed to inject message:", e);
        return json({ error: e instanceof Error ? e.message : "Failed to inject message" }, 500);
      }
    }
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch) {
    const messageId = messageMatch[1];
    if (method === "GET") {
      const msg = messages.get(messageId);
      if (!msg) return json({ error: "Message not found" }, 404);
      return json({ ...msg, content: JSON.parse(msg.content) });
    }
    if (method === "PUT") {
      try {
        const body = await req.json();
        const msg = messages.get(messageId);
        if (!msg) return json({ error: "Message not found - it may not be saved yet" }, 404);
        messages.update(messageId, JSON.stringify(body.content));

        const sess = sessions.get(msg.session_id);
        if (sess) {
          sessions.updateClaudeSession(null, sess.model, 0, 0, 0, 0, Date.now(), msg.session_id);
        }

        const allMsgs = messages.listBySession(msg.session_id);
        let historyContext = "";
        if (allMsgs.length > 0) {
          historyContext = "<conversation_history>\n";
          for (const m of allMsgs) {
            const content = JSON.parse(m.content);
            const text = typeof content === "string" ? content :
              (Array.isArray(content) ? content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : "");
            historyContext += `<${m.role}>${text}</${m.role}>\n`;
          }
          historyContext += "</conversation_history>\n\nContinue from this conversation context. The previous messages above are your conversation history.";
        }

        return json({ success: true, sessionReset: true, historyContext });
      } catch (e) {
        console.error("Failed to update message:", e);
        return json({ error: e instanceof Error ? e.message : "Update failed" }, 500);
      }
    }
    if (method === "DELETE") {
      messages.delete(messageId);
      searchIndex.removeMessage(messageId);
      return json({ success: true });
    }
  }

  const rollbackMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/rollback$/);
  if (rollbackMatch && method === "POST") {
    const sessionId = rollbackMatch[1];
    const body = await req.json();
    const messageId = body.messageId;

    const session = sessions.get(sessionId);
    if (!session) return json({ error: "Session not found" }, 404);

    const msg = messages.get(messageId);
    if (!msg) return json({ error: "Message not found" }, 404);

    messages.deleteAfter(sessionId, msg.timestamp);

    sessions.resetTokenCounts(sessionId, 0, 0);

    sessions.updateClaudeSession(
      null,
      session.model,
      0,
      0,
      0,
      0,
      Date.now(),
      sessionId
    );

    const remainingMsgs = messages.listBySession(sessionId);

    let historyContext = "";
    if (remainingMsgs.length > 0) {
      historyContext = "<conversation_history>\n";
      for (const m of remainingMsgs) {
        const content = JSON.parse(m.content);
        const text = typeof content === "string" ? content :
          (Array.isArray(content) ? content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : "");
        historyContext += `<${m.role}>${text}</${m.role}>\n`;
      }
      historyContext += "</conversation_history>\n\nContinue from this conversation context. The previous messages above are your conversation history.";
    }

    return json({
      success: true,
      messages: remainingMsgs.map(m => ({ ...m, content: JSON.parse(m.content) })),
      sessionReset: true,
      historyContext
    });
  }

  return null;
}
