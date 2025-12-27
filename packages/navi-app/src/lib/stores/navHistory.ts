import { writable, get } from "svelte/store";

export interface NavHistoryEntry {
  chatId: string;
  chatTitle: string;
  projectId: string;
  projectName: string;
  visitedAt: number;
}

interface NavHistoryState {
  entries: NavHistoryEntry[];
  currentIndex: number;
  maxEntries: number;
}

const STORAGE_KEY = "navi-nav-history";
const MAX_ENTRIES = 50;

function loadFromStorage(): NavHistoryState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        entries: parsed.entries || [],
        currentIndex: parsed.currentIndex ?? -1,
        maxEntries: MAX_ENTRIES,
      };
    }
  } catch (e) {
    console.error("Failed to load nav history from storage:", e);
  }
  return { entries: [], currentIndex: -1, maxEntries: MAX_ENTRIES };
}

function saveToStorage(state: NavHistoryState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: state.entries,
        currentIndex: state.currentIndex,
      })
    );
  } catch (e) {
    console.error("Failed to save nav history to storage:", e);
  }
}

function createNavHistoryStore() {
  const { subscribe, set, update } = writable<NavHistoryState>(loadFromStorage());

  return {
    subscribe,

    /**
     * Push a new navigation entry. This clears forward history if we navigated back.
     */
    push(entry: Omit<NavHistoryEntry, "visitedAt">) {
      update((state) => {
        // Don't add duplicate consecutive entries
        const currentEntry = state.entries[state.currentIndex];
        if (
          currentEntry &&
          currentEntry.chatId === entry.chatId &&
          currentEntry.projectId === entry.projectId
        ) {
          // Just update the timestamp
          const newEntries = [...state.entries];
          newEntries[state.currentIndex] = {
            ...currentEntry,
            visitedAt: Date.now(),
            chatTitle: entry.chatTitle || currentEntry.chatTitle,
            projectName: entry.projectName || currentEntry.projectName,
          };
          const newState = { ...state, entries: newEntries };
          saveToStorage(newState);
          return newState;
        }

        // Clear forward history when pushing new entry
        const newEntries = state.entries.slice(0, state.currentIndex + 1);

        // Add new entry
        newEntries.push({
          ...entry,
          visitedAt: Date.now(),
        });

        // Trim to max entries
        while (newEntries.length > state.maxEntries) {
          newEntries.shift();
        }

        const newState = {
          ...state,
          entries: newEntries,
          currentIndex: newEntries.length - 1,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    /**
     * Go back in history. Returns the entry to navigate to, or null if can't go back.
     */
    goBack(): NavHistoryEntry | null {
      const state = get({ subscribe });
      if (state.currentIndex <= 0) {
        return null;
      }
      const targetIndex = state.currentIndex - 1;
      const targetEntry = state.entries[targetIndex];
      update((s) => {
        const newState = { ...s, currentIndex: targetIndex };
        saveToStorage(newState);
        return newState;
      });
      return targetEntry;
    },

    /**
     * Go forward in history. Returns the entry to navigate to, or null if can't go forward.
     */
    goForward(): NavHistoryEntry | null {
      const state = get({ subscribe });
      if (state.currentIndex >= state.entries.length - 1) {
        return null;
      }
      const targetIndex = state.currentIndex + 1;
      const targetEntry = state.entries[targetIndex];
      update((s) => {
        const newState = { ...s, currentIndex: targetIndex };
        saveToStorage(newState);
        return newState;
      });
      return targetEntry;
    },

    /**
     * Navigate to a specific entry by index
     */
    goToIndex(index: number): NavHistoryEntry | null {
      const state = get({ subscribe });
      if (index < 0 || index >= state.entries.length) {
        return null;
      }
      const targetEntry = state.entries[index];
      update((s) => {
        const newState = { ...s, currentIndex: index };
        saveToStorage(newState);
        return newState;
      });
      return targetEntry;
    },

    /**
     * Check if we can go back
     */
    canGoBack(): boolean {
      const state = get({ subscribe });
      return state.currentIndex > 0;
    },

    /**
     * Check if we can go forward
     */
    canGoForward(): boolean {
      const state = get({ subscribe });
      return state.currentIndex < state.entries.length - 1;
    },

    /**
     * Get recent entries for dropdown (excludes current)
     */
    getRecentEntries(limit = 10): { entries: NavHistoryEntry[]; currentIndex: number } {
      const state = get({ subscribe });
      return {
        entries: state.entries.slice(-limit),
        currentIndex: state.currentIndex - Math.max(0, state.entries.length - limit),
      };
    },

    /**
     * Clear all history
     */
    clear() {
      const newState = { entries: [], currentIndex: -1, maxEntries: MAX_ENTRIES };
      set(newState);
      saveToStorage(newState);
    },

    /**
     * Update the title of a chat in history (useful when title changes)
     */
    updateChatTitle(chatId: string, newTitle: string) {
      update((state) => {
        const newEntries = state.entries.map((entry) =>
          entry.chatId === chatId ? { ...entry, chatTitle: newTitle } : entry
        );
        const newState = { ...state, entries: newEntries };
        saveToStorage(newState);
        return newState;
      });
    },
  };
}

export const navHistory = createNavHistoryStore();
