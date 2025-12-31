import { writable, derived, get } from "svelte/store";
import { setHash } from "../router";
import type { ChatMessage, TodoItem, SessionDebugInfo, SessionStatus, SessionStatusType, ModelInfo, SDKEvent, QueuedMessage, SessionWorkspace, TerminalTab, BrowserState } from "./types";
import type { ContentBlock } from "../claude";

// Session messages store
function createSessionMessagesStore() {
  const { subscribe, set, update } = writable<Map<string, ChatMessage[]>>(new Map());

  return {
    subscribe,
    set,
    addMessage: (sessionId: string, msg: ChatMessage) =>
      update((map) => {
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
        map.set(sessionId, msgs);
        return new Map(map);
      }),
    clearSession: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
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
  });

  const syncUrl = (projectId: string | null, sessionId: string | null) => {
    setHash({ projectId, sessionId });
  };

  return {
    subscribe,
    setProject: (projectId: string | null) =>
      update((s) => {
        syncUrl(projectId, null);
        return { ...s, projectId, sessionId: null, claudeSessionId: null, inputTokens: 0, outputTokens: 0 };
      }),
    setSession: (sessionId: string | null, claudeSessionId?: string | null) =>
      update((s) => {
        syncUrl(s.projectId, sessionId);
        return { ...s, sessionId, claudeSessionId: claudeSessionId ?? null };
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
      });
    },
    restoreFromUrl: (projectId: string | null, sessionId: string | null) =>
      update((s) => ({ ...s, projectId, sessionId, claudeSessionId: null, inputTokens: 0, outputTokens: 0 })),
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

// Export store instances
export const sessionMessages = createSessionMessagesStore();
export const sessionDrafts = createSessionDraftsStore();
export const currentSession = createCurrentSessionStore();
export const sessionTodos = createSessionTodosStore();
export const sessionDebugInfo = createSessionDebugStore();
export const sessionStatus = createSessionStatusStore();
export const loadingSessions = writable<Set<string>>(new Set());
export const availableModels = writable<ModelInfo[]>([]);
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
