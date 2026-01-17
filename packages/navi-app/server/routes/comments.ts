// Message Comments API routes - Google Docs-style inline annotations
// @experimental

import { json, error } from "../utils/response";
import { messageComments, type MessageComment, type CommentThread } from "../db";
import { generateCommentResponse } from "../services/comment-responder";

export async function handleCommentRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // GET /api/sessions/:sessionId/comments - List all comment threads for a session
  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/comments$/);
  if (sessionMatch && method === "GET") {
    const sessionId = sessionMatch[1];
    const threads = messageComments.getThreadsForSession(sessionId);
    return json({ threads });
  }

  // GET /api/messages/:messageId/comments - List comment threads for a message
  const messageMatch = pathname.match(/^\/api\/messages\/([^/]+)\/comments$/);
  if (messageMatch && method === "GET") {
    const messageId = messageMatch[1];
    const threads = messageComments.getThreadsForMessage(messageId);
    return json({ threads });
  }

  // POST /api/comments - Create a new comment (starts a thread)
  if (pathname === "/api/comments" && method === "POST") {
    try {
      const body = await req.json();

      if (!body.message_id || !body.session_id || !body.content) {
        return error("message_id, session_id, and content are required", 400);
      }

      const id = crypto.randomUUID();
      const threadId = body.thread_id || crypto.randomUUID();

      const comment = messageComments.create({
        id,
        message_id: body.message_id,
        session_id: body.session_id,
        thread_id: threadId,
        parent_comment_id: body.parent_comment_id || null,
        author: body.author || 'user',
        content: body.content,
        selection_text: body.selection_text || null,
        selection_start: body.selection_start ?? null,
        selection_end: body.selection_end ?? null,
        resolved: 0,
      });

      return json({ comment, thread_id: threadId });
    } catch (e: any) {
      return error(e.message || "Failed to create comment", 500);
    }
  }

  // GET /api/comments/:threadId - Get a specific thread
  const threadMatch = pathname.match(/^\/api\/comments\/([^/]+)$/);
  if (threadMatch && method === "GET") {
    const threadId = threadMatch[1];
    const comments = messageComments.getThread(threadId);

    if (comments.length === 0) {
      return error("Thread not found", 404);
    }

    const first = comments[0];
    const thread: CommentThread = {
      thread_id: threadId,
      message_id: first.message_id,
      session_id: first.session_id,
      selection_text: first.selection_text,
      selection_start: first.selection_start,
      selection_end: first.selection_end,
      resolved: first.resolved,
      comments,
    };

    return json({ thread });
  }

  // POST /api/comments/:threadId/reply - Reply to a thread
  const replyMatch = pathname.match(/^\/api\/comments\/([^/]+)\/reply$/);
  if (replyMatch && method === "POST") {
    const threadId = replyMatch[1];
    try {
      const body = await req.json();

      if (!body.content) {
        return error("content is required", 400);
      }

      const id = crypto.randomUUID();
      const comment = messageComments.reply(
        id,
        threadId,
        body.author || 'user',
        body.content
      );

      if (!comment) {
        return error("Thread not found", 404);
      }

      return json({ comment });
    } catch (e: any) {
      return error(e.message || "Failed to reply to thread", 500);
    }
  }

  // PATCH /api/comments/:threadId/resolve - Toggle resolved state
  const resolveMatch = pathname.match(/^\/api\/comments\/([^/]+)\/resolve$/);
  if (resolveMatch && method === "PATCH") {
    const threadId = resolveMatch[1];
    try {
      const body = await req.json();
      const resolved = body.resolved ?? true;

      messageComments.setResolved(threadId, resolved);

      return json({ success: true, resolved });
    } catch (e: any) {
      return error(e.message || "Failed to update thread", 500);
    }
  }

  // DELETE /api/comments/:threadId - Delete entire thread
  if (threadMatch && method === "DELETE") {
    const threadId = threadMatch[1];
    try {
      const comments = messageComments.getThread(threadId);
      if (comments.length === 0) {
        return error("Thread not found", 404);
      }

      messageComments.deleteThread(threadId);
      return json({ success: true });
    } catch (e: any) {
      return error(e.message || "Failed to delete thread", 500);
    }
  }

  // GET /api/sessions/:sessionId/comments/count - Get unresolved count
  const countMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/comments\/count$/);
  if (countMatch && method === "GET") {
    const sessionId = countMatch[1];
    const count = messageComments.countUnresolvedThreads(sessionId);
    return json({ count });
  }

  // POST /api/comments/:threadId/ask-ai - Generate AI response for a comment thread
  const askAiMatch = pathname.match(/^\/api\/comments\/([^/]+)\/ask-ai$/);
  if (askAiMatch && method === "POST") {
    const threadId = askAiMatch[1];
    try {
      const body = await req.json();

      if (!body.question) {
        return error("question is required", 400);
      }

      // Get thread info for context
      const thread = messageComments.getThread(threadId);
      if (thread.length === 0) {
        return error("Thread not found", 404);
      }

      const firstComment = thread[0];

      const result = await generateCommentResponse({
        threadId,
        sessionId: firstComment.session_id,
        question: body.question,
        selectionText: firstComment.selection_text || "",
        messageContext: body.messageContext || "",
      });

      if (!result.success) {
        return error(result.error || "Failed to generate AI response", 500);
      }

      return json({ comment: result.comment });
    } catch (e: any) {
      return error(e.message || "Failed to generate AI response", 500);
    }
  }

  return null;
}
