/**
 * Context management actions
 * Handles pruning strategies and context reduction
 */

import { get } from "svelte/store";
import { sessionMessages, sessionHistoryContext, notifications, currentSession } from "../stores";
import { api } from "../api";
import type { ChatMessage } from "../stores/types";
import type { ContentBlock, ToolUseBlock, ToolResultBlock } from "../claude";

// How many recent user/assistant exchanges to keep
const RECENT_EXCHANGES_TO_KEEP = 3;

// Max chars for user message in recent context
const MAX_USER_MSG_LENGTH = 500;

// Max chars for assistant text in recent context
const MAX_ASSISTANT_TEXT_LENGTH = 1000;

/**
 * Check if a session has pruned context active
 * Uses sessionHistoryContext as source of truth (not a separate Set)
 */
export function hasPrunedContext(sessionId: string): boolean {
  if (!sessionId) return false;
  const historyCtx = get(sessionHistoryContext);
  return historyCtx.has(sessionId);
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
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Extract just text content from a message
 */
function extractText(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";

  return (msg.content as ContentBlock[])
    .filter(b => b.type === "text")
    .map(b => (b as { text: string }).text)
    .join("\n");
}

/**
 * Get a minimal summary of what tools were used
 */
function getToolSummary(msg: ChatMessage): string {
  if (!Array.isArray(msg.content)) return "";

  const tools = (msg.content as ContentBlock[])
    .filter(b => b.type === "tool_use")
    .map(b => (b as ToolUseBlock).name);

  if (tools.length === 0) return "";

  // Dedupe and limit
  const uniqueTools = [...new Set(tools)];
  if (uniqueTools.length <= 3) {
    return `[Tools: ${uniqueTools.join(", ")}]`;
  }
  return `[Tools: ${uniqueTools.slice(0, 3).join(", ")} +${uniqueTools.length - 3} more]`;
}

/**
 * Format minimal history - VERY aggressive compression
 * Only keeps last few exchanges, heavily truncated
 */
function formatMinimalHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) return "";

  // Filter to main thread only (no subagent messages)
  const mainMessages = messages.filter(m => !m.parentToolUseId && m.role !== "system");

  // Find user/assistant pairs from the end
  const exchanges: { user: ChatMessage; assistant: ChatMessage }[] = [];

  for (let i = mainMessages.length - 1; i >= 0 && exchanges.length < RECENT_EXCHANGES_TO_KEEP; i--) {
    const msg = mainMessages[i];
    if (msg.role === "assistant") {
      // Look for preceding user message
      for (let j = i - 1; j >= 0; j--) {
        if (mainMessages[j].role === "user") {
          exchanges.unshift({ user: mainMessages[j], assistant: msg });
          i = j; // Skip to before this user message
          break;
        }
      }
    }
  }

  if (exchanges.length === 0) {
    // Fallback: just get last message
    const lastMsg = mainMessages[mainMessages.length - 1];
    if (lastMsg) {
      const text = truncate(extractText(lastMsg), MAX_USER_MSG_LENGTH);
      return `<context>\nLast message (${lastMsg.role}): ${text}\n</context>\n\nContinue the conversation.`;
    }
    return "";
  }

  // Build minimal context
  let history = "<recent_context>\n";

  for (const { user, assistant } of exchanges) {
    // User message - truncated
    const userText = truncate(extractText(user), MAX_USER_MSG_LENGTH);
    if (userText) {
      history += `User: ${userText}\n`;
    }

    // Assistant - just text summary + tool list, no details
    const assistantText = truncate(extractText(assistant), MAX_ASSISTANT_TEXT_LENGTH);
    const toolSummary = getToolSummary(assistant);

    if (assistantText || toolSummary) {
      history += `Assistant: ${assistantText}`;
      if (toolSummary) {
        history += ` ${toolSummary}`;
      }
      history += "\n";
    }

    history += "\n";
  }

  history += "</recent_context>\n\n";
  history += "Continue from this context. Earlier conversation history has been compressed.";

  return history;
}

/**
 * Estimate original context size
 */
function estimateOriginalSize(messages: ChatMessage[]): number {
  let size = 0;
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "tool_result") {
          size += (block as ToolResultBlock).content.length;
        } else if (block.type === "text") {
          size += (block as { text: string }).text.length;
        } else if (block.type === "tool_use") {
          size += JSON.stringify((block as ToolUseBlock).input).length;
        }
      }
    } else if (typeof msg.content === "string") {
      size += msg.content.length;
    }
  }
  return size;
}

/**
 * Prune context aggressively
 * - Generates minimal history (only last few exchanges, heavily truncated)
 * - Clears claudeSessionId in BOTH client store AND server database
 * - Sets historyContext for next query
 */
export async function pruneToolResults(sessionId: string): Promise<{ success: boolean; prunedCount: number; tokensSaved: number }> {
  if (!sessionId) {
    return { success: false, prunedCount: 0, tokensSaved: 0 };
  }

  const currentMsgs = get(sessionMessages).get(sessionId) || [];

  if (currentMsgs.length === 0) {
    notifications.add({
      type: "info",
      title: "Nothing to prune",
      message: "No messages in this conversation",
    });
    return { success: false, prunedCount: 0, tokensSaved: 0 };
  }

  const originalSize = estimateOriginalSize(currentMsgs);

  // Generate minimal history
  const minimalHistory = formatMinimalHistory(currentMsgs);
  const newSize = minimalHistory.length;

  // Set history context for next query
  sessionHistoryContext.update(map => {
    map.set(sessionId, minimalHistory);
    return new Map(map);
  });

  // Clear claudeSessionId in client store
  currentSession.clearClaudeSession();

  // CRITICAL: Also reset in the database so server doesn't try to resume old session
  try {
    await api.sessions.resetContext(sessionId);
  } catch (e) {
    console.error("Failed to reset context on server:", e);
    // Continue anyway - client-side historyContext will still work
  }

  const reduction = originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0;
  const tokensSaved = Math.round((originalSize - newSize) / 4);

  notifications.add({
    type: "success",
    title: "Context compressed",
    message: `Reduced by ~${reduction}% (~${Math.round(tokensSaved / 1000)}k tokens). Kept last ${RECENT_EXCHANGES_TO_KEEP} exchanges.`,
  });

  return { success: true, prunedCount: currentMsgs.length, tokensSaved };
}

/**
 * Start a new chat with a summary of the current conversation
 * TODO: Implement with LLM summarization
 */
export function startNewChatWithSummary(_sessionId: string): void {
  notifications.add({
    type: "info",
    title: "Coming soon",
    message: "Start new chat with summary is not yet implemented",
  });
}

// Legacy exports for compatibility
export function getMessagesForApi(sessionId: string): ChatMessage[] {
  return get(sessionMessages).get(sessionId) || [];
}

export function clearPrunedCache(sessionId: string): void {
  clearPrunedState(sessionId);
}
