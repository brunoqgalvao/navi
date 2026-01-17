// Message Comments store - Google Docs-style inline annotations
// @experimental

import { writable, derived, get } from "svelte/store";
import type { CommentThread, MessageComment, CreateCommentRequest } from "./types";
import { commentsApi } from "./api";

// Storage key for comments visibility
const COMMENTS_ENABLED_KEY = "claude-code-ui-comments-enabled";

// Global visibility toggle for comments (experimental - default on)
function createShowCommentsStore() {
  const stored = typeof window !== "undefined" ? localStorage.getItem(COMMENTS_ENABLED_KEY) : null;
  // Default to true for experimental testing
  const { subscribe, set } = writable(stored !== "false");

  return {
    subscribe,
    toggle: () => {
      let current = true;
      subscribe(v => current = v)();
      const newValue = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem(COMMENTS_ENABLED_KEY, String(newValue));
      }
      set(newValue);
    },
    set: (value: boolean) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(COMMENTS_ENABLED_KEY, String(value));
      }
      set(value);
    },
  };
}

export const showComments = createShowCommentsStore();

// Store structure: Map<sessionId, CommentThread[]>
const threadsStore = writable<Map<string, CommentThread[]>>(new Map());

// Active thread being composed (for new comment input)
export const activeCommentInput = writable<{
  messageId: string;
  selectionText: string;
  selectionStart?: number;
  selectionEnd?: number;
  anchorElement?: HTMLElement;
} | null>(null);

// Loading states per thread
const threadLoadingStates = writable<Map<string, boolean>>(new Map());

function createCommentsStore() {
  const { subscribe, update, set } = threadsStore;

  return {
    subscribe,

    // Load threads for a session
    loadForSession: async (sessionId: string) => {
      try {
        const threads = await commentsApi.getThreadsForSession(sessionId);
        update((map) => {
          map.set(sessionId, threads);
          return new Map(map);
        });
      } catch (e) {
        console.error("Failed to load comments:", e);
      }
    },

    // Get threads for a specific message
    getThreadsForMessage: (sessionId: string, messageId: string): CommentThread[] => {
      const map = get(threadsStore);
      const threads = map.get(sessionId) || [];
      return threads.filter((t) => t.message_id === messageId);
    },

    // Create a new comment thread
    createThread: async (req: CreateCommentRequest): Promise<CommentThread | null> => {
      try {
        const { comment, thread_id } = await commentsApi.createComment(req);

        const newThread: CommentThread = {
          thread_id,
          message_id: req.message_id,
          session_id: req.session_id,
          selection_text: req.selection_text || null,
          selection_start: req.selection_start ?? null,
          selection_end: req.selection_end ?? null,
          resolved: 0,
          comments: [comment],
          isExpanded: true,
        };

        update((map) => {
          const threads = map.get(req.session_id) || [];
          threads.push(newThread);
          map.set(req.session_id, threads);
          return new Map(map);
        });

        return newThread;
      } catch (e) {
        console.error("Failed to create comment:", e);
        return null;
      }
    },

    // Add a reply to a thread
    addReply: async (
      sessionId: string,
      threadId: string,
      content: string,
      author: 'user' | 'assistant' = 'user'
    ): Promise<MessageComment | null> => {
      try {
        const comment = await commentsApi.replyToThread(threadId, { content, author });

        update((map) => {
          const threads = map.get(sessionId) || [];
          const thread = threads.find((t) => t.thread_id === threadId);
          if (thread) {
            thread.comments.push(comment);
          }
          return new Map(map);
        });

        return comment;
      } catch (e) {
        console.error("Failed to add reply:", e);
        return null;
      }
    },

    // Set thread loading state (for AI response)
    setThreadLoading: (sessionId: string, threadId: string, loading: boolean) => {
      update((map) => {
        const threads = map.get(sessionId) || [];
        const thread = threads.find((t) => t.thread_id === threadId);
        if (thread) {
          thread.isLoading = loading;
        }
        return new Map(map);
      });
    },

    // Ask AI to respond to a comment thread
    askAI: async (
      sessionId: string,
      threadId: string,
      question: string,
      messageContext: string
    ): Promise<MessageComment | null> => {
      // Set loading state
      update((map) => {
        const threads = map.get(sessionId) || [];
        const thread = threads.find((t) => t.thread_id === threadId);
        if (thread) {
          thread.isLoading = true;
        }
        return new Map(map);
      });

      try {
        const comment = await commentsApi.askAI(threadId, question, messageContext);

        // Add the AI response to the thread and clear loading
        update((map) => {
          const threads = map.get(sessionId) || [];
          const thread = threads.find((t) => t.thread_id === threadId);
          if (thread) {
            thread.comments.push(comment);
            thread.isLoading = false;
          }
          return new Map(map);
        });

        return comment;
      } catch (e) {
        console.error("Failed to get AI response:", e);
        // Clear loading state on error
        update((map) => {
          const threads = map.get(sessionId) || [];
          const thread = threads.find((t) => t.thread_id === threadId);
          if (thread) {
            thread.isLoading = false;
          }
          return new Map(map);
        });
        return null;
      }
    },

    // Toggle thread expanded state
    toggleExpanded: (sessionId: string, threadId: string) => {
      update((map) => {
        const threads = map.get(sessionId) || [];
        const thread = threads.find((t) => t.thread_id === threadId);
        if (thread) {
          thread.isExpanded = !thread.isExpanded;
        }
        return new Map(map);
      });
    },

    // Resolve/unresolve a thread
    setResolved: async (sessionId: string, threadId: string, resolved: boolean) => {
      try {
        await commentsApi.setResolved(threadId, resolved);

        update((map) => {
          const threads = map.get(sessionId) || [];
          const thread = threads.find((t) => t.thread_id === threadId);
          if (thread) {
            thread.resolved = resolved ? 1 : 0;
          }
          return new Map(map);
        });
      } catch (e) {
        console.error("Failed to resolve thread:", e);
      }
    },

    // Delete a thread
    deleteThread: async (sessionId: string, threadId: string) => {
      try {
        await commentsApi.deleteThread(threadId);

        update((map) => {
          const threads = map.get(sessionId) || [];
          const filtered = threads.filter((t) => t.thread_id !== threadId);
          map.set(sessionId, filtered);
          return new Map(map);
        });
      } catch (e) {
        console.error("Failed to delete thread:", e);
      }
    },

    // Clear all threads for a session
    clearSession: (sessionId: string) => {
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      });
    },

    // Get unresolved count
    getUnresolvedCount: (sessionId: string): number => {
      const map = get(threadsStore);
      const threads = map.get(sessionId) || [];
      return threads.filter((t) => t.resolved === 0).length;
    },
  };
}

export const commentsStore = createCommentsStore();

// Derived store: threads for a specific message
export function createMessageThreadsStore(sessionId: string, messageId: string) {
  return derived(threadsStore, ($threads) => {
    const sessionThreads = $threads.get(sessionId) || [];
    return sessionThreads.filter((t) => t.message_id === messageId);
  });
}

// Derived store: unresolved count for current session
export function createUnresolvedCountStore(sessionId: string) {
  return derived(threadsStore, ($threads) => {
    const sessionThreads = $threads.get(sessionId) || [];
    return sessionThreads.filter((t) => t.resolved === 0).length;
  });
}
