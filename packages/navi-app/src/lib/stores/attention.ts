/**
 * Attention Store
 *
 * Centralizes the logic for tracking items that need user attention across the app.
 * This includes:
 * - Pending actions (running sessions, permission requests)
 * - Review queue (marked for review, unread results)
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
  | "unread"
  | "marked_for_review";

/**
 * Derived store that computes attention items from recent chats + session status
 */
export const attentionItems = derived(
  [recentChatsStore, sessionStatus],
  ([$recentChats, $sessionStatus]) => {
    const pendingActions: AttentionItem[] = [];
    const needsReview: AttentionItem[] = [];

    for (const chat of $recentChats) {
      const status = $sessionStatus.get(chat.id);
      const reasons: AttentionReason[] = [];

      // Check for pending action states (running or permission)
      const isRunning = status?.status === "running";
      const needsPermission = status?.status === "permission";

      if (isRunning) reasons.push("running");
      if (needsPermission) reasons.push("permission");

      if (isRunning || needsPermission) {
        pendingActions.push({ session: chat, reasons });
        continue; // Don't double-count in review queue
      }

      // Check for review queue states (unread or marked)
      const isUnread = status?.status === "unread";
      const isMarkedForReview = !!chat.marked_for_review;

      if (isUnread) reasons.push("unread");
      if (isMarkedForReview) reasons.push("marked_for_review");

      if (isUnread || isMarkedForReview) {
        needsReview.push({ session: chat, reasons });
      }
    }

    return {
      pendingActions: pendingActions.slice(0, 5),
      needsReview: needsReview.slice(0, 5),
      totalPending: pendingActions.length,
      totalReview: needsReview.length,
      totalAttention: pendingActions.length + needsReview.length,
    };
  }
);

/**
 * Convenience derived stores for specific attention types
 */
export const pendingActionCount = derived(
  attentionItems,
  ($items) => $items.totalPending
);

export const reviewQueueCount = derived(
  attentionItems,
  ($items) => $items.totalReview
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
