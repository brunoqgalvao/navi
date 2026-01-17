// Message Comments API client
// @experimental

import type { CommentThread, MessageComment, CreateCommentRequest, ReplyCommentRequest } from "./types";
import { getApiBase } from "../../config";

const getCommentsApiBase = () => `${getApiBase()}`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getCommentsApiBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const commentsApi = {
  // Get all comment threads for a session
  getThreadsForSession: async (sessionId: string): Promise<CommentThread[]> => {
    const data = await request<{ threads: CommentThread[] }>(
      `/api/sessions/${sessionId}/comments`
    );
    return data.threads;
  },

  // Get comment threads for a specific message
  getThreadsForMessage: async (messageId: string): Promise<CommentThread[]> => {
    const data = await request<{ threads: CommentThread[] }>(
      `/api/messages/${messageId}/comments`
    );
    return data.threads;
  },

  // Get a specific thread
  getThread: async (threadId: string): Promise<CommentThread> => {
    const data = await request<{ thread: CommentThread }>(
      `/api/comments/${threadId}`
    );
    return data.thread;
  },

  // Create a new comment (starts a thread if no thread_id)
  createComment: async (req: CreateCommentRequest): Promise<{ comment: MessageComment; thread_id: string }> => {
    return request<{ comment: MessageComment; thread_id: string }>(
      "/api/comments",
      {
        method: "POST",
        body: JSON.stringify(req),
      }
    );
  },

  // Reply to a thread
  replyToThread: async (threadId: string, req: ReplyCommentRequest): Promise<MessageComment> => {
    const data = await request<{ comment: MessageComment }>(
      `/api/comments/${threadId}/reply`,
      {
        method: "POST",
        body: JSON.stringify(req),
      }
    );
    return data.comment;
  },

  // Toggle resolved state
  setResolved: async (threadId: string, resolved: boolean): Promise<void> => {
    await request<{ success: boolean }>(
      `/api/comments/${threadId}/resolve`,
      {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
      }
    );
  },

  // Delete a thread
  deleteThread: async (threadId: string): Promise<void> => {
    await request<{ success: boolean }>(
      `/api/comments/${threadId}`,
      { method: "DELETE" }
    );
  },

  // Get unresolved count for a session
  getUnresolvedCount: async (sessionId: string): Promise<number> => {
    const data = await request<{ count: number }>(
      `/api/sessions/${sessionId}/comments/count`
    );
    return data.count;
  },

  // Ask AI to respond to a comment thread
  askAI: async (
    threadId: string,
    question: string,
    messageContext?: string
  ): Promise<MessageComment> => {
    const data = await request<{ comment: MessageComment }>(
      `/api/comments/${threadId}/ask-ai`,
      {
        method: "POST",
        body: JSON.stringify({ question, messageContext }),
      }
    );
    return data.comment;
  },
};
