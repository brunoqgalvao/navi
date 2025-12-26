import { writable } from "svelte/store";
import { setHash } from "../router";
import type { ChatMessage, TodoItem, SessionDebugInfo, SessionStatus, SessionStatusType, ModelInfo, SDKEvent } from "./types";
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
export const messageQueue = writable<string[]>([]);
export const sessionHistoryContext = writable<Map<string, string>>(new Map());
export const todos = writable<TodoItem[]>([]);

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
