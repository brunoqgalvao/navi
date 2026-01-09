/**
 * Attention Store
 *
 * Centralizes the logic for tracking items that need user attention across the app.
 * This includes:
 * - Running sessions (actively processing)
 * - Needs input (permission requests, awaiting input, unread, marked for review)
 *
 * The store combines ephemeral session status with persistent user curation
 * (marked_for_review) to bubble up important items in the dashboard.
 */

import { writable, derived } from "svelte/store";
import { sessionStatus } from "./session";
import type { Session } from "../api";

// Writable store for recent chats - set from data loaders
const recentChatsStore = writable<Session[]>([]);

/**
 * Attention item with enriched status info
 */
export interface AttentionItem {
  session: Session;
  reasons: AttentionReason[];
}

export type AttentionReason =
  | "running"
  | "permission"
  | "awaiting_input"
  | "unread"
  | "marked_for_review"
  | "idle";

/**
 * Derived store that computes attention items from recent chats + session status
 */
export const attentionItems = derived(
  [recentChatsStore, sessionStatus],
  ([$recentChats, $sessionStatus]) => {
    const runningSessions: AttentionItem[] = [];
    const needsApproval: AttentionItem[] = [];
    const needsReviewSessions: AttentionItem[] = [];
    const needsInput: AttentionItem[] = [];
    const idleSessions: AttentionItem[] = [];

    // 8 hours ago in milliseconds
    const eightHoursAgo = Date.now() - (8 * 60 * 60 * 1000);

    for (const chat of $recentChats) {
      // Skip archived sessions
      if (chat.archived) continue;

      const status = $sessionStatus.get(chat.id);
      const reasons: AttentionReason[] = [];

      const isRunning = status?.status === "running";
      const needsPermission = status?.status === "permission";
      const isAwaitingInput = status?.status === "awaiting_input";
      const isUnread = status?.status === "unread";
      const isMarkedForReview = !!chat.marked_for_review;

      // Running sessions go to their own section
      if (isRunning) {
        runningSessions.push({ session: chat, reasons: ["running"] });
        continue;
      }

      // Permission requests get their own section (needs approval)
      if (needsPermission) {
        needsApproval.push({ session: chat, reasons: ["permission"] });
        continue;
      }

      // Marked for review sessions get their own section
      if (isMarkedForReview) {
        needsReviewSessions.push({ session: chat, reasons: ["marked_for_review"] });
        continue;
      }

      // Everything else that needs user attention
      if (isAwaitingInput) reasons.push("awaiting_input");
      if (isUnread) reasons.push("unread");

      if (reasons.length > 0) {
        needsInput.push({ session: chat, reasons });
      } else if (chat.updated_at >= eightHoursAgo) {
        // Idle sessions: updated in last 8 hours, not archived, no active status
        idleSessions.push({ session: chat, reasons: ["idle"] });
      }
    }

    return {
      runningSessions: runningSessions.slice(0, 5),
      needsApproval: needsApproval.slice(0, 5),
      needsReviewSessions: needsReviewSessions.slice(0, 5),
      needsInput: needsInput.slice(0, 5),
      idleSessions: idleSessions.slice(0, 10), // Max 10 idle sessions
      totalRunning: runningSessions.length,
      totalNeedsApproval: needsApproval.length,
      totalNeedsReview: needsReviewSessions.length,
      totalNeedsInput: needsInput.length,
      totalIdle: idleSessions.length,
      totalAttention: runningSessions.length + needsApproval.length + needsReviewSessions.length + needsInput.length,
      // Legacy aliases for backwards compatibility
      pendingActions: runningSessions.slice(0, 5),
      needsReview: needsInput.slice(0, 5),
      totalPending: runningSessions.length,
      totalReview: needsInput.length,
    };
  }
);

/**
 * Convenience derived stores for specific attention types
 */
export const runningSessionCount = derived(
  attentionItems,
  ($items) => $items.totalRunning
);

export const needsInputCount = derived(
  attentionItems,
  ($items) => $items.totalNeedsInput
);

export const idleSessionCount = derived(
  attentionItems,
  ($items) => $items.totalIdle
);

// Legacy aliases
export const pendingActionCount = derived(
  attentionItems,
  ($items) => $items.totalRunning
);

export const reviewQueueCount = derived(
  attentionItems,
  ($items) => $items.totalNeedsInput
);

export const totalAttentionCount = derived(
  attentionItems,
  ($items) => $items.totalAttention
);

/**
 * Check if a specific session needs attention
 */
export const sessionNeedsAttention = derived(
  [recentChatsStore, sessionStatus],
  ([$recentChats, $sessionStatus]) => {
    return (sessionId: string): AttentionReason[] => {
      const chat = $recentChats.find(c => c.id === sessionId);
      if (!chat) return [];

      const status = $sessionStatus.get(sessionId);
      const reasons: AttentionReason[] = [];

      if (status?.status === "running") reasons.push("running");
      if (status?.status === "permission") reasons.push("permission");
      if (status?.status === "awaiting_input") reasons.push("awaiting_input");
      if (status?.status === "unread") reasons.push("unread");
      if (chat.marked_for_review) reasons.push("marked_for_review");

      return reasons;
    };
  }
);

/**
 * Attention store with methods to update recent chats
 */
export const attention = {
  subscribe: attentionItems.subscribe,

  /**
   * Update the recent chats list (called from data loaders)
   */
  setRecentChats: (chats: Session[]) => {
    recentChatsStore.set(chats);
  },

  /**
   * Get current recent chats (for components that need the raw list)
   */
  recentChats: recentChatsStore,
};
