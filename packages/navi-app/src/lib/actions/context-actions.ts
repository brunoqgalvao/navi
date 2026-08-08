/**
 * Context management actions
 * Handles two pruning strategies:
 * 1. Tool result pruning (Option B): Prunes tool results in SDK JSONL + marks in UI
 * 2. SDK compact (Option A): Triggers the SDK's built-in /compact command
 */

import { get } from "svelte/store";
import { sessionMessages, sessionHistoryContext, notifications, currentSession } from "../stores";
import type { ChatMessage } from "../stores/types";
import type { ContentBlock, ToolResultBlock } from "../claude";
import { api } from "../api";
import {
  TOOL_RESULT_PRESERVE_RECENT_COUNT,
  TOOL_RESULT_PRUNED_MAX_LENGTH,
} from "../constants";

const PRUNED_CONTEXT_PREFIX = "<pruned_context>\n";

export function makePrunedHistoryContext(historyContext: string): string {
  return `${PRUNED_CONTEXT_PREFIX}${historyContext}`;
}

export function extractHistoryContextForQuery(
  storedContext: string | null | undefined
): string | undefined {
  if (!storedContext || storedContext === "pruned") {
    return undefined;
  }

  if (storedContext.startsWith(PRUNED_CONTEXT_PREFIX)) {
    return storedContext.slice(PRUNED_CONTEXT_PREFIX.length);
  }

  return storedContext;
}

/**
 * Check if a session has pruned context active (not rollback)
 * Uses sessionHistoryContext as source of truth
 * Only returns true for actual pruning, not rollback
 */
export function hasPrunedContext(sessionId: string): boolean {
  if (!sessionId) return false;
  const historyCtx = get(sessionHistoryContext);
  const ctx = historyCtx.get(sessionId);
  // Only consider it "pruned" if we explicitly set it to "pruned"
  // Rollback context starts with "<conversation_history>"
  return ctx === "pruned" || !!ctx?.startsWith(PRUNED_CONTEXT_PREFIX);
}

/**
 * Check if a session has rollback context active
 */
export function hasRollbackContext(sessionId: string): boolean {
  if (!sessionId) return false;
  const historyCtx = get(sessionHistoryContext);
  const ctx = historyCtx.get(sessionId);
  // Rollback context starts with "<conversation_history>"
  return !!ctx && ctx !== "pruned" && !ctx.startsWith(PRUNED_CONTEXT_PREFIX) && ctx.startsWith("<conversation_history>");
}

/**
 * Clear pruned state for a session
 */
export function clearPrunedState(sessionId: string): void {
  sessionHistoryContext.update(map => {
    map.delete(sessionId);
    return new Map(map);
  });
}

/**
 * Mark specific tool results as pruned in the UI store
 * This doesn't modify the content, just adds a visual indicator
 */
function markToolResultsAsPruned(sessionId: string, prunedToolUseIds: string[]): void {
  if (prunedToolUseIds.length === 0) return;

  const prunedSet = new Set(prunedToolUseIds);
  const currentMsgs = get(sessionMessages).get(sessionId) || [];

  const updatedMessages = currentMsgs.map(msg => {
    if (!Array.isArray(msg.content)) return msg;

    const content = msg.content as ContentBlock[];
    let hasPrunedResult = false;

    // Check if any tool_result in this message was pruned
    for (const block of content) {
      if (block.type === "tool_result") {
        const toolResult = block as ToolResultBlock;
        if (prunedSet.has(toolResult.tool_use_id)) {
          hasPrunedResult = true;
          break;
        }
      }
    }

    if (hasPrunedResult) {
      return { ...msg, pruned: true };
    }

    return msg;
  });

  sessionMessages.setMessages(sessionId, updatedMessages);
}

/**
 * Prune tool results in the SDK's JSONL session file
 *
 * This function:
 * - Calls the server to prune tool results in ~/.claude/projects/PROJECT/SESSION.jsonl
 * - Keeps recent messages (last N turns) with full tool results intact
 * - Prunes tool results to short summaries
 * - Marks affected messages in the UI as pruned (for visual indicator)
 */
export async function pruneToolResults(sessionId: string): Promise<{ success: boolean; prunedCount: number; tokensSaved: number; sessionReset: boolean }> {
  if (!sessionId) {
    return { success: false, prunedCount: 0, tokensSaved: 0, sessionReset: false };
  }

  try {
    // Call server to prune the SDK session file
    const result = await api.sessions.pruneToolResults(sessionId, {
      preserveRecentCount: TOOL_RESULT_PRESERVE_RECENT_COUNT,
      maxPrunedLength: TOOL_RESULT_PRUNED_MAX_LENGTH,
    });

    if (!result.success || result.prunedCount <= 0) {
      notifications.add({
        type: "warning",
        title: "Nothing to prune",
        message: "No large tool outputs found in the current Claude session",
      });
      return { success: false, prunedCount: 0, tokensSaved: 0, sessionReset: false };
    }

    // Reset the Claude SDK session so the next run starts with fresh context.
    // This makes prune behavior deterministic for context recovery.
    let sessionReset = false;
    let historyContext = result.historyContext;
    try {
      const resetResult = await api.sessions.resetContext(sessionId);
      sessionReset = !!resetResult.sessionReset;
      historyContext = historyContext || resetResult.historyContext;

      const activeSession = get(currentSession);
      if (sessionReset && activeSession.sessionId === sessionId) {
        currentSession.clearClaudeSession();
        currentSession.setUsage(resetResult.estimatedInputTokens ?? 0, 0);
      }
    } catch (resetError) {
      console.error("Prune succeeded but reset-context failed:", resetError);
    }

    // Mark the affected messages in the UI
    if (result.prunedToolUseIds && result.prunedToolUseIds.length > 0) {
      markToolResultsAsPruned(sessionId, result.prunedToolUseIds);
    }

    // Mark session as having pruned context (for UI indicator)
    sessionHistoryContext.update(map => {
      map.set(
        sessionId,
        historyContext ? makePrunedHistoryContext(historyContext) : "pruned"
      );
      return new Map(map);
    });

    notifications.add({
      type: "success",
      title: "Tool results pruned",
      message: sessionReset
        ? `Pruned ${result.prunedCount} tool outputs, saved ~${Math.round(result.tokensSaved / 1000)}k tokens, and reset Claude context`
        : `Pruned ${result.prunedCount} tool outputs, saved ~${Math.round(result.tokensSaved / 1000)}k tokens`,
    });

    return {
      success: true,
      prunedCount: result.prunedCount,
      tokensSaved: result.tokensSaved,
      sessionReset,
    };
  } catch (e) {
    console.error("Failed to prune tool results:", e);
    const errorMsg = e instanceof Error ? e.message : "Unknown error";

    // Provide more helpful error messages
    let userMessage = errorMsg;
    if (errorMsg.includes("Not found") || errorMsg.includes("404")) {
      userMessage = "Server may need restart, or no Claude session exists yet";
    } else if (errorMsg.includes("No Claude session")) {
      userMessage = "No conversation with Claude yet - nothing to prune";
    }

    notifications.add({
      type: "error",
      title: "Prune failed",
      message: userMessage,
    });
    return { success: false, prunedCount: 0, tokensSaved: 0, sessionReset: false };
  }
}

/**
 * Trigger SDK's built-in /compact command
 *
 * This sends a special message that triggers the SDK's intelligent
 * context compaction. The SDK will use Claude to summarize the conversation.
 */
export async function triggerSDKCompact(
  sendMessage: (text: string) => void
): Promise<void> {
  // The SDK recognizes /compact as a special command
  sendMessage("/compact");

  notifications.add({
    type: "info",
    title: "Compacting context",
    message: "SDK is intelligently summarizing the conversation...",
  });
}

/**
 * Start a new chat with a summary of the current conversation
 * Generates an LLM summary of the conversation and creates a new chat with it as context
 */
export async function startNewChatWithSummary(
  sessionId: string,
  callbacks: {
    createNewChat: () => Promise<string | null>;
    setInputText: (text: string) => void;
  }
): Promise<void> {
  if (!sessionId) {
    notifications.add({
      type: "error",
      title: "No session",
      message: "No active session to summarize",
    });
    return;
  }

  notifications.add({
    type: "info",
    title: "Generating summary",
    message: "Creating a summary of your conversation...",
  });

  try {
    // Generate the summary
    const result = await api.sessions.generateSummary(sessionId);

    // Create a new chat
    const newSessionId = await callbacks.createNewChat();
    if (!newSessionId) {
      throw new Error("Failed to create new chat");
    }

    // Build the context message to pre-fill
    const contextMessage = `# Previous Conversation Summary

**From:** ${result.sessionTitle}${result.projectName ? ` (${result.projectName})` : ""}
**Messages:** ${result.messageCount}

---

${result.summary}

---

*Continue from where we left off, or start a new related task.*`;

    // Pre-fill the input with the context
    callbacks.setInputText(contextMessage);

    notifications.add({
      type: "success",
      title: "Summary ready",
      message: "New chat created with conversation summary. Edit and send to continue!",
    });
  } catch (e) {
    console.error("Failed to start new chat with summary:", e);
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    notifications.add({
      type: "error",
      title: "Summary failed",
      message: errorMsg,
    });
  }
}

// Legacy exports for compatibility
export function getMessagesForApi(sessionId: string): ChatMessage[] {
  return get(sessionMessages).get(sessionId) || [];
}

export function clearPrunedCache(sessionId: string): void {
  clearPrunedState(sessionId);
}

// Re-export constants for backward compatibility
export { TOOL_RESULT_PRESERVE_RECENT_COUNT as RECENT_EXCHANGES_TO_KEEP } from "../constants";
