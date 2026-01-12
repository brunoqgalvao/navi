/**
 * Background Process Events Store
 *
 * A pub/sub store for real-time background process events from WebSocket.
 * Components can subscribe to receive process updates (output, status changes, etc.)
 */
import { writable, type Readable } from "svelte/store";
import type { BackgroundProcessEvent } from "../api";

// Internal writable store for the latest event
const { subscribe, set } = writable<BackgroundProcessEvent | null>(null);

// List of callback listeners
const listeners: ((event: BackgroundProcessEvent) => void)[] = [];

/**
 * Subscribe to all background process events
 * Returns an unsubscribe function
 */
function addListener(callback: (event: BackgroundProcessEvent) => void): () => void {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Emit a new background process event
 * Called by App.svelte when receiving WebSocket messages
 */
function emit(event: BackgroundProcessEvent): void {
  set(event);
  listeners.forEach((callback) => {
    try {
      callback(event);
    } catch (e) {
      console.error("[backgroundProcessEvents] Listener error:", e);
    }
  });
}

/**
 * The background process events store
 */
export const backgroundProcessEvents = {
  subscribe,
  addListener,
  emit,
};
