/**
 * Context management actions
 * Handles pruning strategies and context reduction
 */

import { get } from "svelte/store";
import { sessionMessages, sessionHistoryContext, notifications, currentSession } from "../stores";
import type { ChatMessage } from "../stores/types";
import type { ContentBlock, ToolUseBlock, ToolResultBlock } from "../claude";

const PRUNED_TOOL_MARKER = "[content pruned]";

// Track which sessions have been pruned (for UI indicator)
const prunedSessions = new Set<string>();

/**
 * Check if a session has pruned context active
 */
export function hasPrunedContext(sessionId: string): boolean {
  return prunedSessions.has(sessionId);
}

/**
 * Clear pruned state for a session (call when session ends or resets)
 */
export function clearPrunedState(sessionId: string): void {
  prunedSessions.delete(sessionId);
}

/**
 * Format a single message for history context
 * Prunes tool result content but keeps tool names for context
 */
function formatMessageForHistory(msg: ChatMessage, pruneToolResults: boolean): string {
  const content = msg.content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];

  for (const block of content as ContentBlock[]) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "tool_use") {
      const toolBlock = block as ToolUseBlock;
      if (pruneToolResults) {
        // Just note which tool was used, skip the full input
        parts.push(`[Used tool: ${toolBlock.name}]`);
      } else {
        parts.push(`[Tool: ${toolBlock.name}]\n${JSON.stringify(toolBlock.input, null, 2)}`);
      }
    } else if (block.type === "tool_result") {
      const resultBlock = block as ToolResultBlock;
      if (pruneToolResults) {
        parts.push(PRUNED_TOOL_MARKER);
      } else {
        const preview = resultBlock.content.length > 500
          ? resultBlock.content.slice(0, 500) + "..."
          : resultBlock.content;
        parts.push(`[Tool result]: ${preview}`);
      }
    } else if (block.type === "thinking") {
      // Skip thinking blocks in history - they're verbose
    }
  }

  return parts.filter(Boolean).join("\n");
}

/**
 * Format messages into history context string
 * Uses XML format matching server-side format
 */
function formatHistoryContext(messages: ChatMessage[], pruneToolResults: boolean): string {
  if (messages.length === 0) return "";

  let history = "<conversation_history>\n";

  for (const msg of messages) {
    if (msg.role === "system") continue; // Skip system messages

    const text = formatMessageForHistory(msg, pruneToolResults);
    if (text.trim()) {
      history += `<${msg.role}>${text}</${msg.role}>\n`;
    }
  }

  history += "</conversation_history>\n\n";
  history += "Continue from this conversation context. The previous messages above are your conversation history.";
  history += pruneToolResults
    ? " Note: Some tool results have been pruned to reduce context size."
    : "";

  return history;
}

/**
 * Estimate token savings from pruning
 */
function estimateTokenSavings(messages: ChatMessage[]): { originalTokens: number; prunedTokens: number } {
  let originalTokens = 0;
  let prunedTokens = 0;

  for (const msg of messages) {
    const originalText = formatMessageForHistory(msg, false);
    const prunedText = formatMessageForHistory(msg, true);

    // Rough estimate: 1 token ≈ 4 characters
    originalTokens += Math.ceil(originalText.length / 4);
    prunedTokens += Math.ceil(prunedText.length / 4);
  }

  return { originalTokens, prunedTokens };
}

/**
 * Prune tool results and prepare for context reset
 * - Generates pruned history context
 * - Clears claudeSessionId to force fresh SDK session
 * - Sets historyContext for next query
 */
export function pruneToolResults(sessionId: string): { success: boolean; prunedCount: number; tokensSaved: number } {
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

  // Count how many tool results we'll prune
  let toolResultCount = 0;
  for (const msg of currentMsgs) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "tool_result") {
          const resultBlock = block as ToolResultBlock;
          if (resultBlock.content !== PRUNED_TOOL_MARKER) {
            toolResultCount++;
          }
        }
      }
    }
  }

  if (toolResultCount === 0) {
    notifications.add({
      type: "info",
      title: "Nothing to prune",
      message: "No tool results found to prune",
    });
    return { success: false, prunedCount: 0, tokensSaved: 0 };
  }

  // Estimate savings
  const { originalTokens, prunedTokens } = estimateTokenSavings(currentMsgs);
  const tokensSaved = originalTokens - prunedTokens;

  // Generate pruned history context
  const prunedHistory = formatHistoryContext(currentMsgs, true);

  // Set history context for next query
  sessionHistoryContext.update(map => {
    map.set(sessionId, prunedHistory);
    return new Map(map);
  });

  // Clear claudeSessionId to force fresh SDK session
  currentSession.clearClaudeSession();

  // Mark session as pruned
  prunedSessions.add(sessionId);

  notifications.add({
    type: "success",
    title: "Context pruned",
    message: `Pruned ${toolResultCount} tool results (~${Math.round(tokensSaved / 1000)}k tokens saved). Next message will use compressed history.`,
  });

  return { success: true, prunedCount: toolResultCount, tokensSaved };
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

// Legacy exports for compatibility - can be removed later
export function getMessagesForApi(sessionId: string): ChatMessage[] {
  return get(sessionMessages).get(sessionId) || [];
}

export function clearPrunedCache(sessionId: string): void {
  clearPrunedState(sessionId);
}
