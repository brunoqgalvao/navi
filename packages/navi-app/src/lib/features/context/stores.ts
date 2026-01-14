/**
 * Context Sidebar Stores
 *
 * Reactive stores for context tracking state.
 */

import { writable, derived } from "svelte/store";
import type {
  ContextSummary,
  ContextFilter,
  FileAccessEntry,
  ToolCallEntry,
  WebFetchEntry,
  SearchEntry,
} from "./types";

// Context summaries per session
function createContextStore() {
  const { subscribe, update } = writable<Map<string, ContextSummary>>(new Map());

  return {
    subscribe,

    /**
     * Set the full context summary for a session
     */
    set: (sessionId: string, summary: ContextSummary) =>
      update((map) => {
        map.set(sessionId, summary);
        return new Map(map);
      }),

    /**
     * Add a file access entry
     */
    addFileAccess: (sessionId: string, entry: FileAccessEntry) =>
      update((map) => {
        const existing = map.get(sessionId) || createEmptySummary(sessionId);
        if (entry.accessType === "read") {
          // Dedupe by path, keep most recent
          const filtered = existing.filesRead.filter((f) => f.path !== entry.path);
          existing.filesRead = [...filtered, entry];
        } else {
          const filtered = existing.filesModified.filter((f) => f.path !== entry.path);
          existing.filesModified = [...filtered, entry];
        }
        existing.stats.totalFilesAccessed =
          existing.filesRead.length + existing.filesModified.length;
        map.set(sessionId, existing);
        return new Map(map);
      }),

    /**
     * Add a tool call entry
     */
    addToolCall: (sessionId: string, entry: ToolCallEntry) =>
      update((map) => {
        const existing = map.get(sessionId) || createEmptySummary(sessionId);
        existing.toolCalls.push(entry);
        existing.stats.totalToolCalls = existing.toolCalls.length;
        map.set(sessionId, existing);
        return new Map(map);
      }),

    /**
     * Add a web fetch entry
     */
    addWebFetch: (sessionId: string, entry: WebFetchEntry) =>
      update((map) => {
        const existing = map.get(sessionId) || createEmptySummary(sessionId);
        existing.webFetches.push(entry);
        existing.stats.totalWebFetches = existing.webFetches.length;
        map.set(sessionId, existing);
        return new Map(map);
      }),

    /**
     * Add a search entry
     */
    addSearch: (sessionId: string, entry: SearchEntry) =>
      update((map) => {
        const existing = map.get(sessionId) || createEmptySummary(sessionId);
        existing.searches.push(entry);
        existing.stats.totalSearches = existing.searches.length;
        map.set(sessionId, existing);
        return new Map(map);
      }),

    /**
     * Update stats
     */
    updateStats: (
      sessionId: string,
      stats: Partial<ContextSummary["stats"]>
    ) =>
      update((map) => {
        const existing = map.get(sessionId) || createEmptySummary(sessionId);
        existing.stats = { ...existing.stats, ...stats };
        map.set(sessionId, existing);
        return new Map(map);
      }),

    /**
     * Get context for a session
     */
    get: (sessionId: string): ContextSummary | undefined => {
      let result: ContextSummary | undefined;
      subscribe((map) => {
        result = map.get(sessionId);
      })();
      return result;
    },

    /**
     * Clear context for a session
     */
    clear: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),

    /**
     * Reset all
     */
    reset: () => update(() => new Map()),
  };
}

function createEmptySummary(sessionId: string): ContextSummary {
  return {
    sessionId,
    filesRead: [],
    filesModified: [],
    toolCalls: [],
    webFetches: [],
    searches: [],
    stats: {
      totalToolCalls: 0,
      totalFilesAccessed: 0,
      totalWebFetches: 0,
      totalSearches: 0,
      messageCount: 0,
    },
  };
}

export const contextStore = createContextStore();

// Filter state for the UI
export const contextFilter = writable<ContextFilter>({});

// Expanded/collapsed sections
export const expandedSections = writable<Set<string>>(
  new Set(["files", "tools", "web", "search"])
);
