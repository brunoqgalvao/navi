import { writable, derived, get } from "svelte/store";
import { setHash } from "../router";
import type { ChatMessage, TodoItem, SessionDebugInfo, SessionStatus, SessionStatusType, ModelInfo, SDKEvent, QueuedMessage, SessionWorkspace, TerminalTab, BrowserState, ActiveWait } from "./types";
import type { ContentBlock } from "../claude";

// Pagination metadata per session
export interface SessionPaginationState {
  total: number;
  loadedCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}

// LRU Cache configuration for memory management
const MAX_SESSIONS_IN_MEMORY = 10; // Keep only last 10 sessions' messages in memory
const recentlyAccessedSessions: string[] = []; // Track access order for LRU eviction

function trackSessionAccess(sessionId: string) {
  const idx = recentlyAccessedSessions.indexOf(sessionId);
  if (idx !== -1) {
    recentlyAccessedSessions.splice(idx, 1);
  }
  recentlyAccessedSessions.push(sessionId);
}

function evictOldSessions(map: Map<string, ChatMessage[]>, paginationMap: Map<string, SessionPaginationState>, currentSessionId?: string) {
  // Only evict if we're over the limit
  if (recentlyAccessedSessions.length <= MAX_SESSIONS_IN_MEMORY) return;

  // Find sessions to evict (oldest first, but never the current session)
  const toEvict: string[] = [];
  for (const sessionId of recentlyAccessedSessions) {
    if (sessionId !== currentSessionId && toEvict.length < recentlyAccessedSessions.length - MAX_SESSIONS_IN_MEMORY) {
      toEvict.push(sessionId);
    }
  }

  // Evict old sessions
  for (const sessionId of toEvict) {
    map.delete(sessionId);
    paginationMap.delete(sessionId);
    const idx = recentlyAccessedSessions.indexOf(sessionId);
    if (idx !== -1) {
      recentlyAccessedSessions.splice(idx, 1);
    }
  }
}

// Session messages store with pagination support and LRU eviction
function createSessionMessagesStore() {
  const { subscribe, set, update } = writable<Map<string, ChatMessage[]>>(new Map());
  const paginationStore = writable<Map<string, SessionPaginationState>>(new Map());

  return {
    subscribe,
    set,
    update,
    paginationStore,
    // Get current cache stats for debugging
    getCacheStats: () => ({
      sessionsInMemory: recentlyAccessedSessions.length,
      maxSessions: MAX_SESSIONS_IN_MEMORY,
      sessionIds: [...recentlyAccessedSessions],
    }),
    addMessage: (sessionId: string, msg: ChatMessage) =>
      update((map) => {
        trackSessionAccess(sessionId);
        const msgs = map.get(sessionId) || [];
        map.set(sessionId, [...msgs, msg]);
        return new Map(map);
      }),
    updateLastAssistant: (sessionId: string, content: ContentBlock[], parentToolUseId?: string | null) =>
      update((map) => {
        const msgs = map.get(sessionId) || [];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i];
          if (msg.role === "assistant" && msg.parentToolUseId === parentToolUseId) {
            const updated = [...msgs.slice(0, i), { ...msg, content }, ...msgs.slice(i + 1)];
            map.set(sessionId, updated);
            return new Map(map);
          }
        }
        const newMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          timestamp: new Date(),
          parentToolUseId: parentToolUseId ?? undefined,
        };
        map.set(sessionId, [...msgs, newMsg]);
        return new Map(map);
      }),
    setMessages: (sessionId: string, msgs: ChatMessage[]) =>
      update((map) => {
        trackSessionAccess(sessionId);
        map.set(sessionId, msgs);
        // Evict old sessions after adding new one
        paginationStore.update((pMap) => {
          evictOldSessions(map, pMap, sessionId);
          return pMap;
        });
        return new Map(map);
      }),
    // Set messages with pagination metadata
    setMessagesPaginated: (sessionId: string, msgs: ChatMessage[], total: number, hasMore: boolean) => {
      trackSessionAccess(sessionId);
      update((map) => {
        map.set(sessionId, msgs);
        return new Map(map);
      });
      paginationStore.update((pMap) => {
        pMap.set(sessionId, { total, loadedCount: msgs.length, hasMore, isLoadingMore: false });
        // Evict old sessions after setting new pagination data
        // Need to get the messages map for eviction
        let messagesMap: Map<string, ChatMessage[]> = new Map();
        subscribe((m) => { messagesMap = m; })();
        evictOldSessions(messagesMap, pMap, sessionId);
        return new Map(pMap);
      });
    },
    // Prepend older messages (for "load more")
    prependMessages: (sessionId: string, olderMsgs: ChatMessage[], hasMore: boolean) => {
      update((map) => {
        const existing = map.get(sessionId) || [];
        // Filter out any duplicates by ID
        const existingIds = new Set(existing.map(m => m.id));
        const newMsgs = olderMsgs.filter(m => !existingIds.has(m.id));
        map.set(sessionId, [...newMsgs, ...existing]);
        return new Map(map);
      });
      paginationStore.update((map) => {
        const existing = map.get(sessionId);
        if (existing) {
          map.set(sessionId, {
            ...existing,
            loadedCount: existing.loadedCount + olderMsgs.length,
            hasMore,
            isLoadingMore: false,
          });
        }
        return new Map(map);
      });
    },
    setLoadingMore: (sessionId: string, isLoading: boolean) => {
      paginationStore.update((map) => {
        const existing = map.get(sessionId);
        if (existing) {
          map.set(sessionId, { ...existing, isLoadingMore: isLoading });
        }
        return new Map(map);
      });
    },
    getPagination: (sessionId: string): SessionPaginationState | undefined => {
      let result: SessionPaginationState | undefined;
      paginationStore.subscribe(map => { result = map.get(sessionId); })();
      return result;
    },
    clearSession: (sessionId: string) => {
      // Remove from LRU tracking
      const idx = recentlyAccessedSessions.indexOf(sessionId);
      if (idx !== -1) {
        recentlyAccessedSessions.splice(idx, 1);
      }
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      });
      paginationStore.update((map) => {
        map.delete(sessionId);
        return new Map(map);
      });
    },
    getMessages: (sessionId: string, map: Map<string, ChatMessage[]>) => map.get(sessionId) || [],
    markFinal: (sessionId: string, messageId: string) =>
      update((map) => {
        const msgs = map.get(sessionId) || [];
        const updated = msgs.map(m => m.id === messageId ? { ...m, isFinal: true } : m);
        map.set(sessionId, updated);
        return new Map(map);
      }),
  };
}

// Session drafts store
function createSessionDraftsStore() {
  const { subscribe, update } = writable<Map<string, string>>(new Map());

  return {
    subscribe,
    setDraft: (sessionId: string, draft: string) =>
      update((map) => {
        if (draft.trim()) {
          map.set(sessionId, draft);
        } else {
          map.delete(sessionId);
        }
        return new Map(map);
      }),
    getDraft: (sessionId: string, map: Map<string, string>) => map.get(sessionId) || "",
    clearDraft: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
  };
}

// Current session store
function createCurrentSessionStore() {
  const { subscribe, set, update } = writable<{
    projectId: string | null;
    sessionId: string | null;
    claudeSessionId: string | null;
    isLoading: boolean;
    costUsd: number;
    model: string | null;
    selectedModel: string;
    inputTokens: number;
    outputTokens: number;
    isPending: boolean; // True when in "new chat" state before first message sent
  }>({
    projectId: null,
    sessionId: null,
    claudeSessionId: null,
    isLoading: false,
    costUsd: 0,
    model: null,
    selectedModel: "",
    inputTokens: 0,
    outputTokens: 0,
    isPending: false,
  });

  const syncUrl = (projectId: string | null, sessionId: string | null) => {
    setHash({ projectId, sessionId });
  };

  return {
    subscribe,
    setProject: (projectId: string | null) =>
      update((s) => {
        syncUrl(projectId, null);
        return { ...s, projectId, sessionId: null, claudeSessionId: null, inputTokens: 0, outputTokens: 0, isPending: false };
      }),
    setSession: (sessionId: string | null, claudeSessionId?: string | null) =>
      update((s) => {
        syncUrl(s.projectId, sessionId);
        return { ...s, sessionId, claudeSessionId: claudeSessionId ?? null, isPending: false };
      }),
    // Set pending state for new chat (no DB session yet)
    setPending: (isPending: boolean) =>
      update((s) => {
        if (isPending) {
          // Clear session but keep project, don't sync URL (no session to link)
          return { ...s, sessionId: null, claudeSessionId: null, isPending: true, inputTokens: 0, outputTokens: 0, costUsd: 0 };
        }
        return { ...s, isPending: false };
      }),
    setClaudeSession: (claudeSessionId: string) =>
      update((s) => ({ ...s, claudeSessionId })),
    clearClaudeSession: () =>
      update((s) => ({ ...s, claudeSessionId: null })),
    setLoading: (isLoading: boolean) => update((s) => ({ ...s, isLoading })),
    setCost: (costUsd: number) => update((s) => ({ ...s, costUsd })),
    setModel: (model: string) => update((s) => ({ ...s, model })),
    setSelectedModel: (selectedModel: string) => update((s) => ({ ...s, selectedModel })),
    setUsage: (inputTokens: number, outputTokens: number) =>
      update((s) => ({ ...s, inputTokens, outputTokens })),
    addUsage: (inputTokens: number, outputTokens: number) =>
      update((s) => ({
        ...s,
        inputTokens: s.inputTokens + inputTokens,
        outputTokens: s.outputTokens + outputTokens
      })),
    reset: () => {
      syncUrl(null, null);
      set({
        projectId: null,
        sessionId: null,
        claudeSessionId: null,
        isLoading: false,
        costUsd: 0,
        model: null,
        selectedModel: "",
        inputTokens: 0,
        outputTokens: 0,
        isPending: false,
      });
    },
    restoreFromUrl: (projectId: string | null, sessionId: string | null) =>
      update((s) => ({ ...s, projectId, sessionId, claudeSessionId: null, inputTokens: 0, outputTokens: 0, isPending: false })),
  };
}

// Session todos store
function createSessionTodosStore() {
  const { subscribe, set, update } = writable<Map<string, TodoItem[]>>(new Map());

  return {
    subscribe,
    setForSession: (sessionId: string, items: TodoItem[]) =>
      update((map) => {
        map.set(sessionId, items);
        return new Map(map);
      }),
    getForSession: (sessionId: string, map: Map<string, TodoItem[]>) => map.get(sessionId) || [],
    clearSession: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
    clear: () => set(new Map()),
  };
}

// Session debug info store
function createSessionDebugStore() {
  const { subscribe, set, update } = writable<Map<string, SessionDebugInfo>>(new Map());

  return {
    subscribe,
    setForSession: (sessionId: string, info: SessionDebugInfo) =>
      update((map) => {
        map.set(sessionId, info);
        return new Map(map);
      }),
    getForSession: (sessionId: string, map: Map<string, SessionDebugInfo>) => map.get(sessionId),
    clear: () => set(new Map()),
  };
}

// Session status store
function createSessionStatusStore() {
  const { subscribe, set, update } = writable<Map<string, SessionStatus>>(new Map());

  const setStatus = (sessionId: string, projectId: string, status: SessionStatusType) => {
    update(map => {
      const existing = map.get(sessionId);
      map.set(sessionId, {
        sessionId,
        projectId,
        status,
        lastActivity: new Date(),
        hasUnreadResults: status === "unread" || (existing?.hasUnreadResults === true && status === "running"),
      });
      return new Map(map);
    });
  };

  return {
    subscribe,
    setRunning: (sessionId: string, projectId: string) => setStatus(sessionId, projectId, "running"),
    setPermissionRequired: (sessionId: string, projectId: string) => setStatus(sessionId, projectId, "permission"),
    setAwaitingInput: (sessionId: string, projectId: string) => setStatus(sessionId, projectId, "awaiting_input"),
    setUnread: (sessionId: string, projectId: string) => setStatus(sessionId, projectId, "unread"),
    markSeen: (sessionId: string) => {
      update(map => {
        const existing = map.get(sessionId);
        if (existing) {
          map.set(sessionId, { ...existing, status: "idle", hasUnreadResults: false });
        }
        return new Map(map);
      });
    },
    setIdle: (sessionId: string, projectId: string) => {
      update(map => {
        const existing = map.get(sessionId);
        if (existing?.hasUnreadResults) {
          map.set(sessionId, { ...existing, status: "unread" });
        } else {
          map.set(sessionId, {
            sessionId,
            projectId,
            status: "idle",
            lastActivity: new Date(),
            hasUnreadResults: false,
          });
        }
        return new Map(map);
      });
    },
    remove: (sessionId: string) => {
      update(map => {
        map.delete(sessionId);
        return new Map(map);
      });
    },
    getForProject: (projectId: string, statuses: Map<string, SessionStatus>): SessionStatus[] => {
      return Array.from(statuses.values()).filter(s => s.projectId === projectId);
    },
    reset: () => set(new Map()),
  };
}

// Cloud execution mode store - tracks execution mode per session
export type ExecutionMode = "local" | "cloud";

export interface CloudExecutionSettings {
  mode: ExecutionMode;
  repoUrl?: string;
  branch?: string;
}

function createExecutionModeStore() {
  const { subscribe, update } = writable<Map<string, CloudExecutionSettings>>(new Map());

  return {
    subscribe,
    // Get settings for a session (defaults to local)
    get: (sessionId: string, map: Map<string, CloudExecutionSettings>): CloudExecutionSettings => {
      return map.get(sessionId) || { mode: "local" };
    },
    // Set mode for a session
    setMode: (sessionId: string, mode: ExecutionMode, repoUrl?: string, branch?: string) =>
      update((map) => {
        map.set(sessionId, { mode, repoUrl, branch });
        return new Map(map);
      }),
    // Update just the branch for a session
    setBranch: (sessionId: string, branch: string) =>
      update((map) => {
        const current = map.get(sessionId) || { mode: "local" as ExecutionMode };
        map.set(sessionId, { ...current, branch });
        return new Map(map);
      }),
    // Clear settings for a session
    clear: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
    // Reset all
    reset: () => update(() => new Map()),
  };
}

// Global execution mode (default for new chats)
export const defaultExecutionMode = writable<ExecutionMode>("local");

// Cloud execution status store - tracks active cloud executions per session
export type CloudExecutionStage = "starting" | "cloning" | "checkout" | "executing" | "syncing" | "completed" | "failed";

export interface CloudExecutionState {
  executionId: string;
  stage: CloudExecutionStage;
  stageMessage?: string;
  repoUrl?: string;
  branch?: string;
  outputLines: string[];
  duration?: number;
  estimatedCostUsd?: number;
  success?: boolean;
  error?: string;
}

function createCloudExecutionStore() {
  const { subscribe, update } = writable<Map<string, CloudExecutionState>>(new Map());

  return {
    subscribe,
    // Start a new cloud execution
    start: (sessionId: string, executionId: string, repoUrl?: string, branch?: string) =>
      update((map) => {
        map.set(sessionId, {
          executionId,
          stage: "starting",
          repoUrl,
          branch,
          outputLines: [],
        });
        return new Map(map);
      }),
    // Update stage
    setStage: (sessionId: string, stage: CloudExecutionStage, message?: string) =>
      update((map) => {
        const current = map.get(sessionId);
        if (current) {
          map.set(sessionId, { ...current, stage, stageMessage: message });
        }
        return new Map(map);
      }),
    // Add output line
    addOutput: (sessionId: string, line: string) =>
      update((map) => {
        const current = map.get(sessionId);
        if (current) {
          // Keep last 50 lines
          const lines = [...current.outputLines, line].slice(-50);
          map.set(sessionId, { ...current, outputLines: lines });
        }
        return new Map(map);
      }),
    // Complete execution
    complete: (sessionId: string, success: boolean, duration: number, costUsd?: number, error?: string) =>
      update((map) => {
        const current = map.get(sessionId);
        if (current) {
          map.set(sessionId, {
            ...current,
            stage: success ? "completed" : "failed",
            success,
            duration,
            estimatedCostUsd: costUsd,
            error,
          });
        }
        return new Map(map);
      }),
    // Clear execution state
    clear: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
    // Get state for session
    get: (sessionId: string, map: Map<string, CloudExecutionState>): CloudExecutionState | undefined => {
      return map.get(sessionId);
    },
  };
}

export const cloudExecutionStore = createCloudExecutionStore();

// Export store instances
export const sessionMessages = createSessionMessagesStore();
export const sessionDrafts = createSessionDraftsStore();
export const currentSession = createCurrentSessionStore();
export const sessionTodos = createSessionTodosStore();
export const sessionDebugInfo = createSessionDebugStore();
export const sessionStatus = createSessionStatusStore();
export const executionModeStore = createExecutionModeStore();
export const loadingSessions = writable<Set<string>>(new Set());
// Track sessions that are loading initial messages from DB (different from streaming)
export const loadingMessagesSessions = writable<Set<string>>(new Set());
export const availableModels = writable<ModelInfo[]>([]);

// Backend selection store (claude, codex, gemini)
export type BackendId = "claude" | "codex" | "gemini";
function createBackendStore() {
  const { subscribe, update } = writable<Map<string, BackendId>>(new Map());

  return {
    subscribe,
    // Get backend for a session (defaults to claude)
    get: (sessionId: string, map: Map<string, BackendId>): BackendId => {
      return map.get(sessionId) || "claude";
    },
    // Set backend for a session
    set: (sessionId: string, backend: BackendId) =>
      update((map) => {
        map.set(sessionId, backend);
        return new Map(map);
      }),
    // Clear backend for a session (use default)
    clear: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
  };
}
export const sessionBackendStore = createBackendStore();
// Default backend for new sessions
export const defaultBackend = writable<BackendId>("claude");

// Models for each backend (populated from API)
export const backendModels = writable<Record<BackendId, ModelInfo[]>>({
  claude: [],
  codex: [],
  gemini: [],
});

// Helper to get models formatted for a specific backend
export function getBackendModelsFormatted(backend: BackendId, models: Record<BackendId, ModelInfo[]>): ModelInfo[] {
  return models[backend] || [];
}
// Message queue store with helper methods
function createMessageQueueStore() {
  const { subscribe, set, update } = writable<QueuedMessage[]>([]);

  return {
    subscribe,
    set,
    update,
    add: (message: QueuedMessage) =>
      update((queue) => [...queue, { ...message, id: crypto.randomUUID() }]),
    remove: (id: string) =>
      update((queue) => queue.filter((m) => m.id !== id)),
    updateText: (id: string, text: string) =>
      update((queue) =>
        queue.map((m) => (m.id === id ? { ...m, text } : m))
      ),
    reorder: (sessionId: string, fromIndex: number, toIndex: number) =>
      update((queue) => {
        const sessionMessages = queue.filter((m) => m.sessionId === sessionId);
        const otherMessages = queue.filter((m) => m.sessionId !== sessionId);
        const [moved] = sessionMessages.splice(fromIndex, 1);
        sessionMessages.splice(toIndex, 0, moved);
        return [...otherMessages, ...sessionMessages];
      }),
    clearSession: (sessionId: string) =>
      update((queue) => queue.filter((m) => m.sessionId !== sessionId)),
    getForSession: (queue: QueuedMessage[], sessionId: string) =>
      queue.filter((m) => m.sessionId === sessionId),
  };
}

export const messageQueue = createMessageQueueStore();
export const sessionHistoryContext = writable<Map<string, string>>(new Map());
export const todos = writable<TodoItem[]>([]);

// Compacting state store - tracks which sessions are currently compacting
export const compactingSessionsStore = writable<Set<string>>(new Set());

// Session events store (for debug/timeline view)
function createSessionEventsStore() {
  const { subscribe, set, update } = writable<Map<string, SDKEvent[]>>(new Map());

  return {
    subscribe,
    set,
    addEvent: (sessionId: string, event: SDKEvent) =>
      update((map) => {
        const events = map.get(sessionId) || [];
        map.set(sessionId, [...events, event]);
        return new Map(map);
      }),
    updateEvent: (sessionId: string, eventId: string, updates: Partial<SDKEvent>) =>
      update((map) => {
        const events = map.get(sessionId) || [];
        const idx = events.findIndex(e => e.id === eventId);
        if (idx >= 0) {
          events[idx] = { ...events[idx], ...updates };
          map.set(sessionId, [...events]);
        }
        return new Map(map);
      }),
    setEvents: (sessionId: string, events: SDKEvent[]) =>
      update((map) => {
        map.set(sessionId, events);
        return new Map(map);
      }),
    clearSession: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
    getEvents: (sessionId: string, map: Map<string, SDKEvent[]>) => map.get(sessionId) || [],
  };
}

export const sessionEvents = createSessionEventsStore();

// Session workspaces store (terminals + browser per session)
function createSessionWorkspacesStore() {
  const { subscribe, set, update } = writable<Map<string, SessionWorkspace>>(new Map());

  const getDefaultWorkspace = (sessionId: string): SessionWorkspace => ({
    sessionId,
    terminalTabs: [{ id: "term-1", name: "Terminal 1" }],
    activeTerminalId: "term-1",
    terminalCounter: 1,
    browser: {
      url: "",
      history: [],
      historyIndex: -1,
    },
  });

  return {
    subscribe,
    set,

    // Get or create workspace for a session
    getOrCreate: (sessionId: string): SessionWorkspace => {
      const map = get({ subscribe });
      if (map.has(sessionId)) {
        return map.get(sessionId)!;
      }
      const workspace = getDefaultWorkspace(sessionId);
      update((m) => {
        m.set(sessionId, workspace);
        return new Map(m);
      });
      return workspace;
    },

    // Get workspace (without creating)
    get: (sessionId: string): SessionWorkspace | undefined => {
      const map = get({ subscribe });
      return map.get(sessionId);
    },

    // Update workspace
    updateWorkspace: (sessionId: string, updates: Partial<SessionWorkspace>) =>
      update((map) => {
        const existing = map.get(sessionId) || getDefaultWorkspace(sessionId);
        map.set(sessionId, { ...existing, ...updates });
        return new Map(map);
      }),

    // Terminal tab operations
    addTerminalTab: (sessionId: string, tab?: Partial<TerminalTab>) =>
      update((map) => {
        const workspace = map.get(sessionId) || getDefaultWorkspace(sessionId);
        const newCounter = workspace.terminalCounter + 1;
        const newTab: TerminalTab = {
          id: tab?.id || `term-${newCounter}`,
          name: tab?.name || `Terminal ${newCounter}`,
          terminalId: tab?.terminalId,
          initialCommand: tab?.initialCommand,
          cwd: tab?.cwd,
        };
        map.set(sessionId, {
          ...workspace,
          terminalTabs: [...workspace.terminalTabs, newTab],
          activeTerminalId: newTab.id,
          terminalCounter: newCounter,
        });
        return new Map(map);
      }),

    removeTerminalTab: (sessionId: string, tabId: string) =>
      update((map) => {
        const workspace = map.get(sessionId);
        if (!workspace || workspace.terminalTabs.length <= 1) return map;

        const idx = workspace.terminalTabs.findIndex((t) => t.id === tabId);
        const newTabs = workspace.terminalTabs.filter((t) => t.id !== tabId);
        const newActiveId =
          workspace.activeTerminalId === tabId
            ? newTabs[Math.max(0, idx - 1)]?.id || newTabs[0]?.id
            : workspace.activeTerminalId;

        map.set(sessionId, {
          ...workspace,
          terminalTabs: newTabs,
          activeTerminalId: newActiveId,
        });
        return new Map(map);
      }),

    setActiveTerminal: (sessionId: string, tabId: string) =>
      update((map) => {
        const workspace = map.get(sessionId);
        if (!workspace) return map;
        map.set(sessionId, { ...workspace, activeTerminalId: tabId });
        return new Map(map);
      }),

    updateTerminalTab: (sessionId: string, tabId: string, updates: Partial<TerminalTab>) =>
      update((map) => {
        const workspace = map.get(sessionId);
        if (!workspace) return map;
        const newTabs = workspace.terminalTabs.map((t) =>
          t.id === tabId ? { ...t, ...updates } : t
        );
        map.set(sessionId, { ...workspace, terminalTabs: newTabs });
        return new Map(map);
      }),

    // Browser operations
    updateBrowser: (sessionId: string, updates: Partial<BrowserState>) =>
      update((map) => {
        const workspace = map.get(sessionId) || getDefaultWorkspace(sessionId);
        map.set(sessionId, {
          ...workspace,
          browser: { ...workspace.browser, ...updates },
        });
        return new Map(map);
      }),

    navigateBrowser: (sessionId: string, url: string) =>
      update((map) => {
        const workspace = map.get(sessionId) || getDefaultWorkspace(sessionId);
        const { browser } = workspace;
        const newHistory = [...browser.history.slice(0, browser.historyIndex + 1), url];
        map.set(sessionId, {
          ...workspace,
          browser: {
            url,
            history: newHistory,
            historyIndex: newHistory.length - 1,
          },
        });
        return new Map(map);
      }),

    browserBack: (sessionId: string) =>
      update((map) => {
        const workspace = map.get(sessionId);
        if (!workspace || workspace.browser.historyIndex <= 0) return map;
        const newIndex = workspace.browser.historyIndex - 1;
        map.set(sessionId, {
          ...workspace,
          browser: {
            ...workspace.browser,
            url: workspace.browser.history[newIndex],
            historyIndex: newIndex,
          },
        });
        return new Map(map);
      }),

    browserForward: (sessionId: string) =>
      update((map) => {
        const workspace = map.get(sessionId);
        if (!workspace || workspace.browser.historyIndex >= workspace.browser.history.length - 1)
          return map;
        const newIndex = workspace.browser.historyIndex + 1;
        map.set(sessionId, {
          ...workspace,
          browser: {
            ...workspace.browser,
            url: workspace.browser.history[newIndex],
            historyIndex: newIndex,
          },
        });
        return new Map(map);
      }),

    browserGoToIndex: (sessionId: string, index: number) =>
      update((map) => {
        const workspace = map.get(sessionId);
        if (!workspace || index < 0 || index >= workspace.browser.history.length) return map;
        map.set(sessionId, {
          ...workspace,
          browser: {
            ...workspace.browser,
            url: workspace.browser.history[index],
            historyIndex: index,
          },
        });
        return new Map(map);
      }),

    // Clear session workspace
    clearSession: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),

    // Reset all
    reset: () => set(new Map()),
  };
}

export const sessionWorkspaces = createSessionWorkspacesStore();

// Project workspaces store (terminals per project - persisted across sessions)
export interface ProjectWorkspace {
  projectId: string;
  terminalTabs: TerminalTab[];
  activeTerminalId: string;
  terminalCounter: number;
  browser: BrowserState;
  lastLoadedFromServer: number;
}

function createProjectWorkspacesStore() {
  const { subscribe, set, update } = writable<Map<string, ProjectWorkspace>>(new Map());

  const getDefaultWorkspace = (projectId: string): ProjectWorkspace => ({
    projectId,
    terminalTabs: [],
    activeTerminalId: "",
    terminalCounter: 0,
    browser: {
      url: "",
      history: [],
      historyIndex: -1,
    },
    lastLoadedFromServer: 0,
  });

  return {
    subscribe,
    set,

    getOrCreate: (projectId: string): ProjectWorkspace => {
      const map = get({ subscribe });
      if (map.has(projectId)) {
        return map.get(projectId)!;
      }
      const workspace = getDefaultWorkspace(projectId);
      update((m) => {
        m.set(projectId, workspace);
        return new Map(m);
      });
      return workspace;
    },

    get: (projectId: string): ProjectWorkspace | undefined => {
      const map = get({ subscribe });
      return map.get(projectId);
    },

    setTerminals: (projectId: string, terminals: Array<{ terminalId: string; name?: string; cwd?: string }>) =>
      update((map) => {
        const workspace = map.get(projectId) || getDefaultWorkspace(projectId);
        const terminalTabs: TerminalTab[] = terminals.map((t, i) => ({
          id: `tab-${t.terminalId}`,
          name: t.name || `Terminal ${i + 1}`,
          terminalId: t.terminalId,
          cwd: t.cwd,
        }));
        map.set(projectId, {
          ...workspace,
          terminalTabs,
          activeTerminalId: terminalTabs[0]?.id || "",
          terminalCounter: terminalTabs.length,
          lastLoadedFromServer: Date.now(),
        });
        return new Map(map);
      }),

    addTerminalTab: (projectId: string, tab?: Partial<TerminalTab>) =>
      update((map) => {
        const workspace = map.get(projectId) || getDefaultWorkspace(projectId);
        const newCounter = workspace.terminalCounter + 1;
        const newTab: TerminalTab = {
          id: tab?.id || `term-${newCounter}`,
          name: tab?.name || `Terminal ${newCounter}`,
          terminalId: tab?.terminalId,
          initialCommand: tab?.initialCommand,
          cwd: tab?.cwd,
        };
        map.set(projectId, {
          ...workspace,
          terminalTabs: [...workspace.terminalTabs, newTab],
          activeTerminalId: newTab.id,
          terminalCounter: newCounter,
        });
        return new Map(map);
      }),

    removeTerminalTab: (projectId: string, tabId: string) =>
      update((map) => {
        const workspace = map.get(projectId);
        if (!workspace || workspace.terminalTabs.length <= 1) return map;

        const idx = workspace.terminalTabs.findIndex((t) => t.id === tabId);
        const newTabs = workspace.terminalTabs.filter((t) => t.id !== tabId);
        const newActiveId =
          workspace.activeTerminalId === tabId
            ? newTabs[Math.max(0, idx - 1)]?.id || newTabs[0]?.id
            : workspace.activeTerminalId;

        map.set(projectId, {
          ...workspace,
          terminalTabs: newTabs,
          activeTerminalId: newActiveId,
        });
        return new Map(map);
      }),

    setActiveTerminal: (projectId: string, tabId: string) =>
      update((map) => {
        const workspace = map.get(projectId);
        if (!workspace) return map;
        map.set(projectId, { ...workspace, activeTerminalId: tabId });
        return new Map(map);
      }),

    updateTerminalTab: (projectId: string, tabId: string, updates: Partial<TerminalTab>) =>
      update((map) => {
        const workspace = map.get(projectId);
        if (!workspace) return map;
        const newTabs = workspace.terminalTabs.map((t) =>
          t.id === tabId ? { ...t, ...updates } : t
        );
        map.set(projectId, { ...workspace, terminalTabs: newTabs });
        return new Map(map);
      }),

    updateBrowser: (projectId: string, updates: Partial<BrowserState>) =>
      update((map) => {
        const workspace = map.get(projectId) || getDefaultWorkspace(projectId);
        map.set(projectId, {
          ...workspace,
          browser: { ...workspace.browser, ...updates },
        });
        return new Map(map);
      }),

    navigateBrowser: (projectId: string, url: string) =>
      update((map) => {
        const workspace = map.get(projectId) || getDefaultWorkspace(projectId);
        const { browser } = workspace;
        const newHistory = [...browser.history.slice(0, browser.historyIndex + 1), url];
        map.set(projectId, {
          ...workspace,
          browser: {
            url,
            history: newHistory,
            historyIndex: newHistory.length - 1,
          },
        });
        return new Map(map);
      }),

    browserBack: (projectId: string) =>
      update((map) => {
        const workspace = map.get(projectId);
        if (!workspace || workspace.browser.historyIndex <= 0) return map;
        const newIndex = workspace.browser.historyIndex - 1;
        map.set(projectId, {
          ...workspace,
          browser: {
            ...workspace.browser,
            url: workspace.browser.history[newIndex],
            historyIndex: newIndex,
          },
        });
        return new Map(map);
      }),

    browserForward: (projectId: string) =>
      update((map) => {
        const workspace = map.get(projectId);
        if (!workspace || workspace.browser.historyIndex >= workspace.browser.history.length - 1)
          return map;
        const newIndex = workspace.browser.historyIndex + 1;
        map.set(projectId, {
          ...workspace,
          browser: {
            ...workspace.browser,
            url: workspace.browser.history[newIndex],
            historyIndex: newIndex,
          },
        });
        return new Map(map);
      }),

    browserGoToIndex: (projectId: string, index: number) =>
      update((map) => {
        const workspace = map.get(projectId);
        if (!workspace || index < 0 || index >= workspace.browser.history.length) return map;
        map.set(projectId, {
          ...workspace,
          browser: {
            ...workspace.browser,
            url: workspace.browser.history[index],
            historyIndex: index,
          },
        });
        return new Map(map);
      }),

    clearProject: (projectId: string) =>
      update((map) => {
        map.delete(projectId);
        return new Map(map);
      }),

    reset: () => set(new Map()),
  };
}

export const projectWorkspaces = createProjectWorkspacesStore();

// Session models store (per-session model selection)
function createSessionModelsStore() {
  const { subscribe, set, update } = writable<Map<string, string>>(new Map());

  return {
    subscribe,
    set,
    setModel: (sessionId: string, model: string) =>
      update((map) => {
        map.set(sessionId, model);
        return new Map(map);
      }),
    getModel: (sessionId: string, map: Map<string, string>) => map.get(sessionId) || null,
    clearSession: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
    reset: () => set(new Map()),
  };
}

export const sessionModels = createSessionModelsStore();

// Derived store for current session's workspace
export const currentWorkspace = derived(
  [currentSession, sessionWorkspaces],
  ([$currentSession, $sessionWorkspaces]) => {
    if (!$currentSession.sessionId) return null;
    return $sessionWorkspaces.get($currentSession.sessionId) || null;
  }
);

// ============================================================================
// MEMORY MANAGEMENT: Auxiliary store cleanup
// ============================================================================

// Track which auxiliary sessions have been accessed (for LRU eviction)
const auxiliarySessionsAccessed: string[] = [];
const MAX_AUXILIARY_SESSIONS = 10;

/**
 * Clean up auxiliary data (todos, debug, events, workspaces) for old sessions.
 * Called automatically when switching sessions to prevent memory bloat.
 * Keeps data for the last N sessions accessed.
 */
export function cleanupAuxiliaryStores(currentSessionId: string) {
  // Track the current session access
  const idx = auxiliarySessionsAccessed.indexOf(currentSessionId);
  if (idx !== -1) {
    auxiliarySessionsAccessed.splice(idx, 1);
  }
  auxiliarySessionsAccessed.push(currentSessionId);

  // If under limit, no cleanup needed
  if (auxiliarySessionsAccessed.length <= MAX_AUXILIARY_SESSIONS) {
    return;
  }

  // Find sessions to evict (oldest first, but never current)
  const toEvict: string[] = [];
  for (const sessionId of auxiliarySessionsAccessed) {
    if (sessionId !== currentSessionId && toEvict.length < auxiliarySessionsAccessed.length - MAX_AUXILIARY_SESSIONS) {
      toEvict.push(sessionId);
    }
  }

  // Evict old sessions from auxiliary stores
  for (const sessionId of toEvict) {
    sessionTodos.clearSession(sessionId);
    sessionEvents.clearSession(sessionId);
    sessionWorkspaces.clearSession(sessionId);
    // Don't clear sessionStatus - it's used for sidebar indicators
    // Don't clear sessionModels - small data, needed for model dropdown
    // Don't clear sessionDrafts - user might want to return to draft

    // Remove from tracking
    const evictIdx = auxiliarySessionsAccessed.indexOf(sessionId);
    if (evictIdx !== -1) {
      auxiliarySessionsAccessed.splice(evictIdx, 1);
    }
  }
}

/**
 * Get current memory stats for debugging (frontend)
 */
export function getClientMemoryStats() {
  let messagesCount = 0;
  let todosCount = 0;
  let eventsCount = 0;

  sessionMessages.subscribe((map) => {
    messagesCount = map.size;
  })();

  sessionTodos.subscribe((map) => {
    todosCount = map.size;
  })();

  sessionEvents.subscribe((map) => {
    eventsCount = map.size;
  })();

  return {
    messagesCache: sessionMessages.getCacheStats(),
    auxiliarySessions: auxiliarySessionsAccessed.length,
    todosStored: todosCount,
    eventsStored: eventsCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// Active Waits Store - tracks native wait/pause for each session
// ═══════════════════════════════════════════════════════════════

function createActiveWaitsStore() {
  const { subscribe, update } = writable<Map<string, ActiveWait>>(new Map());

  return {
    subscribe,

    /**
     * Start tracking a wait
     */
    start: (wait: ActiveWait) => {
      update((map) => {
        map.set(wait.requestId, wait);
        return new Map(map);
      });
    },

    /**
     * Stop tracking a wait (completed or skipped)
     */
    end: (requestId: string) => {
      update((map) => {
        map.delete(requestId);
        return new Map(map);
      });
    },

    /**
     * Get active waits for a specific session
     */
    getForSession: (sessionId: string): ActiveWait[] => {
      let result: ActiveWait[] = [];
      const unsubscribe = subscribe((map) => {
        result = Array.from(map.values()).filter((w) => w.sessionId === sessionId);
      });
      unsubscribe();
      return result;
    },

    /**
     * Clear all waits (e.g., on disconnect)
     */
    clear: () => {
      update(() => new Map());
    },
  };
}

export const activeWaits = createActiveWaitsStore();

/**
 * Get the current active wait for a session (if any)
 * Returns the first active wait (usually there's only one at a time)
 */
export const currentSessionWait = derived(
  [activeWaits, currentSession],
  ([$waits, $session]) => {
    if (!$session?.sessionId) return null;
    const sessionWaits = Array.from($waits.values()).filter(
      (w) => w.sessionId === $session.sessionId
    );
    return sessionWaits[0] || null;
  }
);
