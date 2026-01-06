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
  | "marked_for_review";

/**
 * Derived store that computes attention items from recent chats + session status
 */
export const attentionItems = derived(
  [recentChatsStore, sessionStatus],
  ([$recentChats, $sessionStatus]) => {
    const runningSessions: AttentionItem[] = [];
    const needsInput: AttentionItem[] = [];

    for (const chat of $recentChats) {
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

      // Everything else that needs user attention
      if (needsPermission) reasons.push("permission");
      if (isAwaitingInput) reasons.push("awaiting_input");
      if (isUnread) reasons.push("unread");
      if (isMarkedForReview) reasons.push("marked_for_review");

      if (reasons.length > 0) {
        needsInput.push({ session: chat, reasons });
      }
    }

    return {
      runningSessions: runningSessions.slice(0, 5),
      needsInput: needsInput.slice(0, 5),
      totalRunning: runningSessions.length,
      totalNeedsInput: needsInput.length,
      totalAttention: runningSessions.length + needsInput.length,
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
