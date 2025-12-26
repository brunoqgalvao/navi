import { writable, derived } from "svelte/store";
import type { Notification, NotificationOptions, TourStep, AttachedFile, ChatViewMode, ProjectStatusType } from "./types";
import { sessionStatus } from "./session";

// Storage keys
const ONBOARDING_KEY = "claude-code-ui-onboarding-complete";
const ADVANCED_MODE_KEY = "claude-code-ui-advanced-mode";
const DEBUG_MODE_KEY = "claude-code-ui-debug-mode";
const NEW_CHAT_VIEW_KEY = "claude-code-ui-new-chat-view";
const SHOW_ARCHIVED_KEY = "claude-code-ui-show-archived";
const TOUR_COMPLETE_KEY = "claude-code-ui-tours-complete";
const CHAT_VIEW_MODE_KEY = "claude-code-ui-chat-view-mode";

// Onboarding store
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

// Advanced mode store
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

// Debug mode store
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

// New chat view store
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

// Show archived workspaces store
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

// Tour store
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
    shouldShowStepAfterResponse?: boolean;
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
    showPostResponseStep: () => update(s => ({ ...s, shouldShowStepAfterResponse: false })),
    get shouldShowStepAfterResponse() {
      let value = false;
      subscribe(s => value = s.shouldShowStepAfterResponse ?? false)();
      return value;
    },
  };
}

// Notifications store
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

// Attached files store
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

// Chat view mode store
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

// Export store instances
export const onboardingComplete = createOnboardingStore();
export const advancedMode = createAdvancedModeStore();
export const debugMode = createDebugModeStore();
export const newChatView = createNewChatViewStore();
export const showArchivedWorkspaces = createShowArchivedStore();
export const tour = createTourStore();
export const notifications = createNotificationsStore();
export const attachedFiles = createAttachedFilesStore();
export const chatViewMode = createChatViewModeStore();
export const isConnected = writable(false);

// Derived stores
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
