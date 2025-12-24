import { writable, derived } from "svelte/store";
import type { ContentBlock, ClaudeMessage, StreamEvent } from "./claude";
import type { Project, Session, Skill } from "./api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: ContentBlock[] | string;
  contentHistory?: (ContentBlock[] | string)[];
  timestamp: Date;
  parentToolUseId?: string | null;
}

function createProjectsStore() {
  const { subscribe, set, update } = writable<Project[]>([]);

  return {
    subscribe,
    set,
    add: (project: Project) => update((p) => [project, ...p]),
    remove: (id: string) => update((p) => p.filter((x) => x.id !== id)),
    update: (project: Project) =>
      update((p) => p.map((x) => (x.id === project.id ? project : x))),
  };
}

function createSessionsStore() {
  const { subscribe, set, update } = writable<Session[]>([]);

  return {
    subscribe,
    set,
    add: (session: Session) => update((s) => [session, ...s]),
    remove: (id: string) => update((s) => s.filter((x) => x.id !== id)),
    update: (session: Session) =>
      update((s) => s.map((x) => (x.id === session.id ? session : x))),
  };
}

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
            const prevContent = msg.content;
            const history = msg.contentHistory || [];
            const hasToolUse = Array.isArray(prevContent) && prevContent.some(b => b.type === "tool_use");
            const newHistory = hasToolUse ? [...history, prevContent] : history;
            const updated = [...msgs.slice(0, i), { ...msg, content, contentHistory: newHistory }, ...msgs.slice(i + 1)];
            map.set(sessionId, updated);
            return new Map(map);
          }
        }
        return map;
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
  };
}

export type ModelInfo = {
  value: string;
  displayName: string;
  description: string;
};

export const availableModels = writable<ModelInfo[]>([]);

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

  return {
    subscribe,
    setProject: (projectId: string | null) =>
      update((s) => ({ ...s, projectId, sessionId: null, claudeSessionId: null, inputTokens: 0, outputTokens: 0 })),
    setSession: (sessionId: string | null, claudeSessionId?: string | null) =>
      update((s) => ({ ...s, sessionId, claudeSessionId: claudeSessionId ?? null })),
    setClaudeSession: (claudeSessionId: string) =>
      update((s) => ({ ...s, claudeSessionId })),
    setLoading: (isLoading: boolean) => update((s) => ({ ...s, isLoading })),
    setCost: (costUsd: number) => update((s) => ({ ...s, costUsd })),
    setModel: (model: string) => update((s) => ({ ...s, model })),
    setSelectedModel: (selectedModel: string) => update((s) => ({ ...s, selectedModel })),
    setUsage: (inputTokens: number, outputTokens: number) => 
      update((s) => ({ ...s, inputTokens, outputTokens })),
    reset: () =>
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
      }),
  };
}

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

export const projects = createProjectsStore();
export const sessions = createSessionsStore();
export const sessionMessages = createSessionMessagesStore();
export const sessionDrafts = createSessionDraftsStore();
export const currentSession = createCurrentSessionStore();
export const isConnected = writable(false);

export const currentProject = derived(
  [projects, currentSession],
  ([$projects, $current]) =>
    $current.projectId ? $projects.find((p) => p.id === $current.projectId) : null
);

const ONBOARDING_KEY = "claude-code-ui-onboarding-complete";

function createOnboardingStore() {
  const stored = typeof window !== "undefined" ? localStorage.getItem(ONBOARDING_KEY) : null;
  const { subscribe, set } = writable(stored === "true");

  return {
    subscribe,
    complete: () => {
      if (typeof window !== "undefined") {
        localStorage.setItem(ONBOARDING_KEY, "true");
      }
      set(true);
    },
    reset: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem(ONBOARDING_KEY);
      }
      set(false);
    },
  };
}

export const onboardingComplete = createOnboardingStore();

export const messageQueue = writable<string[]>([]);

export const loadingSessions = writable<Set<string>>(new Set());

const ADVANCED_MODE_KEY = "claude-code-ui-advanced-mode";

function createAdvancedModeStore() {
  const stored = typeof window !== "undefined" ? localStorage.getItem(ADVANCED_MODE_KEY) : null;
  const { subscribe, set } = writable(stored === "true");

  return {
    subscribe,
    toggle: () => {
      let current = false;
      subscribe(v => current = v)();
      const newValue = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem(ADVANCED_MODE_KEY, String(newValue));
      }
      set(newValue);
    },
    set: (value: boolean) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(ADVANCED_MODE_KEY, String(value));
      }
      set(value);
    },
  };
}

export const advancedMode = createAdvancedModeStore();

const DEBUG_MODE_KEY = "claude-code-ui-debug-mode";

function createDebugModeStore() {
  const stored = typeof window !== "undefined" ? localStorage.getItem(DEBUG_MODE_KEY) : null;
  const { subscribe, set } = writable(stored === "true");

  return {
    subscribe,
    toggle: () => {
      let current = false;
      subscribe(v => current = v)();
      const newValue = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem(DEBUG_MODE_KEY, String(newValue));
      }
      set(newValue);
    },
    set: (value: boolean) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(DEBUG_MODE_KEY, String(value));
      }
      set(value);
    },
  };
}

export const debugMode = createDebugModeStore();

const NEW_CHAT_VIEW_KEY = "claude-code-ui-new-chat-view";

function createNewChatViewStore() {
  const stored = typeof window !== "undefined" ? localStorage.getItem(NEW_CHAT_VIEW_KEY) : null;
  const { subscribe, set } = writable(stored !== "false");

  return {
    subscribe,
    toggle: () => {
      let current = true;
      subscribe(v => current = v)();
      const newValue = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem(NEW_CHAT_VIEW_KEY, String(newValue));
      }
      set(newValue);
    },
    set: (value: boolean) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(NEW_CHAT_VIEW_KEY, String(value));
      }
      set(value);
    },
  };
}

export const newChatView = createNewChatViewStore();

const SHOW_ARCHIVED_KEY = "claude-code-ui-show-archived";

function createShowArchivedStore() {
  const stored = typeof window !== "undefined" ? localStorage.getItem(SHOW_ARCHIVED_KEY) : null;
  const { subscribe, set } = writable(stored === "true");

  return {
    subscribe,
    toggle: () => {
      let current = false;
      subscribe(v => current = v)();
      const newValue = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem(SHOW_ARCHIVED_KEY, String(newValue));
      }
      set(newValue);
    },
    set: (value: boolean) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(SHOW_ARCHIVED_KEY, String(value));
      }
      set(value);
    },
  };
}

export const showArchivedWorkspaces = createShowArchivedStore();

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

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

export const sessionTodos = createSessionTodosStore();

export const todos = writable<TodoItem[]>([]);

export const sessionHistoryContext = writable<Map<string, string>>(new Map());

export type NotificationType = "info" | "success" | "warning" | "error" | "permission_request";

export interface NotificationAction {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  handler: () => void;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: Date;
  read: boolean;
  dismissed: boolean;
  persistent: boolean;
  sessionId?: string;
  projectId?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
}

interface NotificationOptions {
  type?: NotificationType;
  title: string;
  message?: string;
  persistent?: boolean;
  sessionId?: string;
  projectId?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
  browserNotification?: boolean;
  sound?: boolean;
}

function createNotificationsStore() {
  const { subscribe, set, update } = writable<Notification[]>([]);
  
  let browserPermission: NotificationPermission = "default";
  if (typeof window !== "undefined" && "Notification" in window) {
    browserPermission = Notification.permission;
  }

  const requestBrowserPermission = async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    if (Notification.permission === "granted") {
      browserPermission = "granted";
      return true;
    }
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      browserPermission = permission;
      return permission === "granted";
    }
    return false;
  };

  const showBrowserNotification = (title: string, options?: { body?: string; tag?: string; requireInteraction?: boolean }) => {
    if (browserPermission === "granted" && typeof window !== "undefined" && "Notification" in window) {
      try {
        const notification = new Notification(title, {
          body: options?.body,
          tag: options?.tag,
          icon: "/favicon.ico",
          requireInteraction: options?.requireInteraction ?? false,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        return notification;
      } catch (e) {
        console.error("Browser notification failed:", e);
      }
    }
    return null;
  };

  const add = (options: NotificationOptions): string => {
    const id = crypto.randomUUID();
    const notification: Notification = {
      id,
      type: options.type || "info",
      title: options.title,
      message: options.message,
      timestamp: new Date(),
      read: false,
      dismissed: false,
      persistent: options.persistent ?? (options.type === "permission_request"),
      sessionId: options.sessionId,
      projectId: options.projectId,
      data: options.data,
      actions: options.actions,
    };

    update(n => [notification, ...n]);

    if (options.browserNotification !== false && options.type === "permission_request") {
      showBrowserNotification(options.title, {
        body: options.message,
        tag: id,
        requireInteraction: true,
      });
    }

    if (!options.persistent && options.type !== "permission_request") {
      setTimeout(() => {
        dismiss(id);
      }, 5000);
    }

    return id;
  };

  const dismiss = (id: string) => {
    update(n => n.map(x => x.id === id ? { ...x, dismissed: true } : x));
  };

  const remove = (id: string) => {
    update(n => n.filter(x => x.id !== id));
  };

  const markRead = (id: string) => {
    update(n => n.map(x => x.id === id ? { ...x, read: true } : x));
  };

  const markAllRead = () => {
    update(n => n.map(x => ({ ...x, read: true })));
  };

  const clearDismissed = () => {
    update(n => n.filter(x => !x.dismissed));
  };

  const clearAll = () => {
    set([]);
  };

  return {
    subscribe,
    add,
    dismiss,
    remove,
    markRead,
    markAllRead,
    clearDismissed,
    clearAll,
    requestBrowserPermission,
    showBrowserNotification,
  };
}

export const notifications = createNotificationsStore();

export const unreadNotificationCount = derived(
  notifications,
  ($notifications) => $notifications.filter(n => !n.read && !n.dismissed).length
);

export const activeNotifications = derived(
  notifications,
  ($notifications) => $notifications.filter(n => !n.dismissed)
);

export const pendingPermissionRequests = derived(
  notifications,
  ($notifications) => $notifications.filter(n => n.type === "permission_request" && !n.dismissed)
);

export type SessionStatusType = "idle" | "running" | "permission" | "unread";

export interface SessionStatus {
  sessionId: string;
  projectId: string;
  status: SessionStatusType;
  lastActivity: Date;
  hasUnreadResults: boolean;
}

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

  const setRunning = (sessionId: string, projectId: string) => {
    setStatus(sessionId, projectId, "running");
  };

  const setPermissionRequired = (sessionId: string, projectId: string) => {
    setStatus(sessionId, projectId, "permission");
  };

  const setUnread = (sessionId: string, projectId: string) => {
    setStatus(sessionId, projectId, "unread");
  };

  const markSeen = (sessionId: string) => {
    update(map => {
      const existing = map.get(sessionId);
      if (existing) {
        map.set(sessionId, {
          ...existing,
          status: "idle",
          hasUnreadResults: false,
        });
      }
      return new Map(map);
    });
  };

  const setIdle = (sessionId: string, projectId: string) => {
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
  };

  const remove = (sessionId: string) => {
    update(map => {
      map.delete(sessionId);
      return new Map(map);
    });
  };

  const getForProject = (projectId: string, statuses: Map<string, SessionStatus>): SessionStatus[] => {
    return Array.from(statuses.values()).filter(s => s.projectId === projectId);
  };

  return {
    subscribe,
    setRunning,
    setPermissionRequired,
    setUnread,
    setIdle,
    markSeen,
    remove,
    getForProject,
    reset: () => set(new Map()),
  };
}

export const sessionStatus = createSessionStatusStore();

export type ProjectStatusType = "idle" | "active" | "attention";

export const projectStatus = derived(
  sessionStatus,
  ($sessionStatus) => {
    const projectMap = new Map<string, ProjectStatusType>();
    
    $sessionStatus.forEach(status => {
      const current = projectMap.get(status.projectId) || "idle";
      
      if (status.status === "permission" || status.status === "unread") {
        projectMap.set(status.projectId, "attention");
      } else if (status.status === "running" && current !== "attention") {
        projectMap.set(status.projectId, "active");
      }
    });
    
    return projectMap;
  }
);

export interface TourStep {
  id: string;
  target: string;
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_COMPLETE_KEY = "claude-code-ui-tours-complete";

function createTourStore() {
  const getCompletedTours = (): string[] => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(TOUR_COMPLETE_KEY) || "[]");
    } catch {
      return [];
    }
  };

  const { subscribe, set, update } = writable<{
    active: boolean;
    currentStep: number;
    tourId: string | null;
    completedTours: string[];
  }>({
    active: false,
    currentStep: 0,
    tourId: null,
    completedTours: getCompletedTours(),
  });

  const saveTours = (tours: string[]) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_COMPLETE_KEY, JSON.stringify(tours));
    }
  };

  return {
    subscribe,
    start: (tourId: string = "main") => update(s => ({ ...s, active: true, currentStep: 0, tourId })),
    next: () => update(s => ({ ...s, currentStep: s.currentStep + 1 })),
    prev: () => update(s => ({ ...s, currentStep: Math.max(0, s.currentStep - 1) })),
    goTo: (step: number) => update(s => ({ ...s, currentStep: step })),
    complete: () => update(s => {
      const newCompleted = s.tourId && !s.completedTours.includes(s.tourId) 
        ? [...s.completedTours, s.tourId] 
        : s.completedTours;
      saveTours(newCompleted);
      return { active: false, currentStep: 0, tourId: null, completedTours: newCompleted };
    }),
    skip: () => update(s => {
      const newCompleted = s.tourId && !s.completedTours.includes(s.tourId) 
        ? [...s.completedTours, s.tourId] 
        : s.completedTours;
      saveTours(newCompleted);
      return { active: false, currentStep: 0, tourId: null, completedTours: newCompleted };
    }),
    isCompleted: (tourId: string, state: { completedTours: string[] }) => state.completedTours.includes(tourId),
    reset: (tourId?: string) => {
      if (typeof window !== "undefined") {
        if (tourId) {
          update(s => {
            const newCompleted = s.completedTours.filter(t => t !== tourId);
            saveTours(newCompleted);
            return { ...s, completedTours: newCompleted };
          });
        } else {
          localStorage.removeItem(TOUR_COMPLETE_KEY);
          set({ active: false, currentStep: 0, tourId: null, completedTours: [] });
        }
      }
    },
  };
}

export const tour = createTourStore();

export interface AttachedFile {
  path: string;
  name: string;
  type: "file" | "directory";
}

function createAttachedFilesStore() {
  const { subscribe, set, update } = writable<AttachedFile[]>([]);

  return {
    subscribe,
    add: (file: AttachedFile) => update(files => {
      if (files.some(f => f.path === file.path)) return files;
      return [...files, file];
    }),
    remove: (path: string) => update(files => files.filter(f => f.path !== path)),
    clear: () => set([]),
    set,
  };
}

export const attachedFiles = createAttachedFilesStore();

export interface SessionDebugInfo {
  cwd: string;
  model: string;
  tools: string[];
  skills: string[];
  timestamp: Date;
}

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

export const sessionDebugInfo = createSessionDebugStore();

function createSkillsStore() {
  const { subscribe, set, update } = writable<Skill[]>([]);

  return {
    subscribe,
    set,
    add: (skill: Skill) => update((s) => [skill, ...s]),
    remove: (id: string) => update((s) => s.filter((x) => x.id !== id)),
    update: (skill: Skill) =>
      update((s) => s.map((x) => (x.id === skill.id ? skill : x))),
    updateEnableStatus: (id: string, globally: boolean, projectIds: string[]) =>
      update((s) =>
        s.map((x) =>
          x.id === id
            ? { ...x, enabled_globally: globally, enabled_projects: projectIds }
            : x
        )
      ),
  };
}

export const skillLibrary = createSkillsStore();

export type CostViewMode = "ever" | "today";

export interface CostState {
  viewMode: CostViewMode;
  totalEver: number;
  totalToday: number;
  projectCosts: Map<string, { ever: number; today: number }>;
  sessionCosts: Map<string, number>;
}

function createCostStore() {
  const { subscribe, set, update } = writable<CostState>({
    viewMode: "ever",
    totalEver: 0,
    totalToday: 0,
    projectCosts: new Map(),
    sessionCosts: new Map(),
  });

  return {
    subscribe,
    setViewMode: (mode: CostViewMode) => update((s) => ({ ...s, viewMode: mode })),
    setTotals: (ever: number, today: number) => update((s) => ({ ...s, totalEver: ever, totalToday: today })),
    setProjectCost: (projectId: string, ever: number, today: number) =>
      update((s) => {
        const costs = new Map(s.projectCosts);
        costs.set(projectId, { ever, today });
        return { ...s, projectCosts: costs };
      }),
    setSessionCost: (sessionId: string, cost: number) =>
      update((s) => {
        const costs = new Map(s.sessionCosts);
        costs.set(sessionId, cost);
        return { ...s, sessionCosts: costs };
      }),
    addSessionCost: (sessionId: string, additionalCost: number) =>
      update((s) => {
        const costs = new Map(s.sessionCosts);
        const current = costs.get(sessionId) || 0;
        costs.set(sessionId, current + additionalCost);
        return { ...s, sessionCosts: costs };
      }),
    reset: () =>
      set({
        viewMode: "ever",
        totalEver: 0,
        totalToday: 0,
        projectCosts: new Map(),
        sessionCosts: new Map(),
      }),
  };
}

export const costStore = createCostStore();

export type SDKEventType = 
  | "system_init"
  | "system_status"
  | "system_compact"
  | "system_hook"
  | "assistant"
  | "assistant_streaming"
  | "user"
  | "tool_progress"
  | "tool_use"
  | "tool_result"
  | "result"
  | "error"
  | "permission_request"
  | "auth_status"
  | "unknown";

export interface SDKEvent {
  id: string;
  type: SDKEventType;
  timestamp: number;
  sessionId: string;
  parentToolUseId?: string | null;
  data: ClaudeMessage | StreamEvent | Record<string, unknown>;
  expanded?: boolean;
}

export interface StreamingState {
  isStreaming: boolean;
  currentText: string;
  currentThinking: string;
  contentBlocks: ContentBlock[];
  toolUseInProgress?: {
    id: string;
    name: string;
    partialJson: string;
  };
}

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

function createStreamingStateStore() {
  const { subscribe, set, update } = writable<Map<string, StreamingState>>(new Map());

  return {
    subscribe,
    getState: (sessionId: string, map: Map<string, StreamingState>): StreamingState => 
      map.get(sessionId) || { 
        isStreaming: false, 
        currentText: "", 
        currentThinking: "",
        contentBlocks: [] 
      },
    startStreaming: (sessionId: string) =>
      update((map) => {
        map.set(sessionId, { 
          isStreaming: true, 
          currentText: "", 
          currentThinking: "",
          contentBlocks: [] 
        });
        return new Map(map);
      }),
    appendText: (sessionId: string, text: string) =>
      update((map) => {
        const state = map.get(sessionId) || { isStreaming: true, currentText: "", currentThinking: "", contentBlocks: [] };
        map.set(sessionId, { ...state, currentText: state.currentText + text });
        return new Map(map);
      }),
    appendThinking: (sessionId: string, thinking: string) =>
      update((map) => {
        const state = map.get(sessionId) || { isStreaming: true, currentText: "", currentThinking: "", contentBlocks: [] };
        map.set(sessionId, { ...state, currentThinking: state.currentThinking + thinking });
        return new Map(map);
      }),
    setContentBlock: (sessionId: string, index: number, block: ContentBlock) =>
      update((map) => {
        const state = map.get(sessionId) || { isStreaming: true, currentText: "", currentThinking: "", contentBlocks: [] };
        const blocks = [...state.contentBlocks];
        blocks[index] = block;
        map.set(sessionId, { ...state, contentBlocks: blocks });
        return new Map(map);
      }),
    setToolUseInProgress: (sessionId: string, toolUse: { id: string; name: string; partialJson: string } | undefined) =>
      update((map) => {
        const state = map.get(sessionId) || { isStreaming: true, currentText: "", currentThinking: "", contentBlocks: [] };
        map.set(sessionId, { ...state, toolUseInProgress: toolUse });
        return new Map(map);
      }),
    stopStreaming: (sessionId: string) =>
      update((map) => {
        const state = map.get(sessionId);
        if (state) {
          map.set(sessionId, { ...state, isStreaming: false });
        }
        return new Map(map);
      }),
    clear: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
  };
}

export const streamingState = createStreamingStateStore();

export type ChatViewMode = "conversation" | "timeline";

const CHAT_VIEW_MODE_KEY = "claude-code-ui-chat-view-mode";

function createChatViewModeStore() {
  const stored = typeof window !== "undefined" ? localStorage.getItem(CHAT_VIEW_MODE_KEY) : null;
  const initial: ChatViewMode = stored === "timeline" ? "timeline" : "conversation";
  const { subscribe, set } = writable<ChatViewMode>(initial);

  return {
    subscribe,
    set: (mode: ChatViewMode) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(CHAT_VIEW_MODE_KEY, mode);
      }
      set(mode);
    },
    toggle: () => {
      let current: ChatViewMode = "conversation";
      subscribe(v => current = v)();
      const newMode: ChatViewMode = current === "conversation" ? "timeline" : "conversation";
      if (typeof window !== "undefined") {
        localStorage.setItem(CHAT_VIEW_MODE_KEY, newMode);
      }
      set(newMode);
    },
  };
}

export const chatViewMode = createChatViewModeStore();

export type StepType = "thinking" | "text" | "tool_use" | "tool_result";

export interface AssistantStep {
  id: string;
  type: StepType;
  content: ContentBlock;
  isStreaming?: boolean;
  streamingText?: string;
  timestamp: number;
}

export interface AssistantTurn {
  id: string;
  steps: AssistantStep[];
  currentStepId: string | null;
  userExpandedSteps: Set<string>;
  isComplete: boolean;
}

function createAssistantTurnsStore() {
  const { subscribe, set, update } = writable<Map<string, AssistantTurn[]>>(new Map());

  return {
    subscribe,
    startTurn: (sessionId: string, turnId: string) =>
      update((map) => {
        const turns = map.get(sessionId) || [];
        turns.push({
          id: turnId,
          steps: [],
          currentStepId: null,
          userExpandedSteps: new Set(),
          isComplete: false,
        });
        map.set(sessionId, turns);
        return new Map(map);
      }),
    addStep: (sessionId: string, turnId: string, step: AssistantStep) =>
      update((map) => {
        const turns = map.get(sessionId) || [];
        const turn = turns.find(t => t.id === turnId);
        if (turn) {
          turn.steps.push(step);
          turn.currentStepId = step.id;
        }
        map.set(sessionId, [...turns]);
        return new Map(map);
      }),
    updateStep: (sessionId: string, turnId: string, stepId: string, updates: Partial<AssistantStep>) =>
      update((map) => {
        const turns = map.get(sessionId) || [];
        const turn = turns.find(t => t.id === turnId);
        if (turn) {
          const step = turn.steps.find(s => s.id === stepId);
          if (step) {
            Object.assign(step, updates);
          }
        }
        map.set(sessionId, [...turns]);
        return new Map(map);
      }),
    finishStep: (sessionId: string, turnId: string, stepId: string) =>
      update((map) => {
        const turns = map.get(sessionId) || [];
        const turn = turns.find(t => t.id === turnId);
        if (turn) {
          const step = turn.steps.find(s => s.id === stepId);
          if (step) {
            step.isStreaming = false;
          }
        }
        map.set(sessionId, [...turns]);
        return new Map(map);
      }),
    completeTurn: (sessionId: string, turnId: string) =>
      update((map) => {
        const turns = map.get(sessionId) || [];
        const turn = turns.find(t => t.id === turnId);
        if (turn) {
          turn.isComplete = true;
          turn.currentStepId = null;
          turn.steps.forEach(s => s.isStreaming = false);
        }
        map.set(sessionId, [...turns]);
        return new Map(map);
      }),
    toggleUserExpanded: (sessionId: string, turnId: string, stepId: string, expanded: boolean) =>
      update((map) => {
        const turns = map.get(sessionId) || [];
        const turn = turns.find(t => t.id === turnId);
        if (turn) {
          if (expanded) {
            turn.userExpandedSteps.add(stepId);
          } else {
            turn.userExpandedSteps.delete(stepId);
          }
        }
        map.set(sessionId, [...turns]);
        return new Map(map);
      }),
    clearSession: (sessionId: string) =>
      update((map) => {
        map.delete(sessionId);
        return new Map(map);
      }),
    getTurns: (sessionId: string, map: Map<string, AssistantTurn[]>) => map.get(sessionId) || [],
    getLatestTurn: (sessionId: string, map: Map<string, AssistantTurn[]>) => {
      const turns = map.get(sessionId) || [];
      return turns[turns.length - 1] || null;
    },
  };
}

export const assistantTurns = createAssistantTurnsStore();
