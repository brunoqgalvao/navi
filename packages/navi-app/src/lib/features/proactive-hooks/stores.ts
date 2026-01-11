/**
 * Proactive Hooks - Stores
 *
 * Svelte stores for managing hook state, suggestions, and user preferences.
 */

import { writable, derived, get } from "svelte/store";
import type {
  ProactiveHook,
  Suggestion,
  HookSessionState,
  ErrorPattern,
  HookRegistryState,
} from "./types";

// =============================================================================
// STORAGE KEYS
// =============================================================================

const HOOKS_ENABLED_KEY = "navi-proactive-hooks-enabled";
const HOOKS_CONFIG_KEY = "navi-proactive-hooks-config";

// =============================================================================
// CORE STORES
// =============================================================================

/**
 * Whether proactive hooks are globally enabled
 */
function createEnabledStore() {
  const stored = typeof window !== "undefined"
    ? localStorage.getItem(HOOKS_ENABLED_KEY)
    : null;
  // Default DISABLED - experimental feature
  const { subscribe, set } = writable(stored === "true");

  return {
    subscribe,
    enable: () => {
      if (typeof window !== "undefined") {
        localStorage.setItem(HOOKS_ENABLED_KEY, "true");
      }
      set(true);
    },
    disable: () => {
      if (typeof window !== "undefined") {
        localStorage.setItem(HOOKS_ENABLED_KEY, "false");
      }
      set(false);
    },
    toggle: () => {
      let current = true;
      subscribe(v => current = v)();
      const next = !current;
      if (typeof window !== "undefined") {
        localStorage.setItem(HOOKS_ENABLED_KEY, String(next));
      }
      set(next);
    },
  };
}

/**
 * Per-hook enabled state
 */
function createHookConfigStore() {
  const loadConfig = (): Record<string, boolean> => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(HOOKS_CONFIG_KEY) || "{}");
    } catch {
      return {};
    }
  };

  const { subscribe, set, update } = writable<Record<string, boolean>>(loadConfig());

  const save = (config: Record<string, boolean>) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(HOOKS_CONFIG_KEY, JSON.stringify(config));
    }
  };

  return {
    subscribe,
    isEnabled: (hookId: string, defaultValue: boolean = true): boolean => {
      const config = loadConfig();
      return config[hookId] ?? defaultValue;
    },
    setEnabled: (hookId: string, enabled: boolean) => {
      update(config => {
        const next = { ...config, [hookId]: enabled };
        save(next);
        return next;
      });
    },
    reset: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem(HOOKS_CONFIG_KEY);
      }
      set({});
    },
  };
}

// =============================================================================
// REGISTRY STORE
// =============================================================================

/**
 * Main hook registry - holds all registered hooks and their state
 */
function createHookRegistry() {
  const { subscribe, update } = writable<HookRegistryState>({
    hooks: new Map(),
    sessionState: new Map(),
    pendingSuggestions: [],
    enabled: true,
    sessionErrors: new Map(),
  });

  return {
    subscribe,

    /**
     * Register a new hook
     */
    register: (hook: ProactiveHook) => {
      update(state => {
        state.hooks.set(hook.id, hook);
        return { ...state };
      });
    },

    /**
     * Unregister a hook
     */
    unregister: (hookId: string) => {
      update(state => {
        state.hooks.delete(hookId);
        return { ...state };
      });
    },

    /**
     * Get a hook by ID
     */
    get: (hookId: string): ProactiveHook | undefined => {
      let hook: ProactiveHook | undefined;
      subscribe(state => {
        hook = state.hooks.get(hookId);
      })();
      return hook;
    },

    /**
     * Get all hooks for a specific trigger
     */
    getByTrigger: (trigger: string): ProactiveHook[] => {
      let hooks: ProactiveHook[] = [];
      subscribe(state => {
        hooks = Array.from(state.hooks.values()).filter(h => h.trigger === trigger);
      })();
      return hooks;
    },

    /**
     * Get/initialize session state for a hook
     */
    getSessionState: (sessionId: string, hookId: string): HookSessionState => {
      let state: HookSessionState = { lastPromptTime: 0, acceptCount: 0, dismissCount: 0 };
      subscribe(s => {
        const sessionMap = s.sessionState.get(sessionId);
        if (sessionMap) {
          const hookState = sessionMap.get(hookId);
          if (hookState) state = hookState;
        }
      })();
      return state;
    },

    /**
     * Update session state for a hook
     */
    updateSessionState: (sessionId: string, hookId: string, updates: Partial<HookSessionState>) => {
      update(state => {
        if (!state.sessionState.has(sessionId)) {
          state.sessionState.set(sessionId, new Map());
        }
        const sessionMap = state.sessionState.get(sessionId)!;
        const current = sessionMap.get(hookId) || { lastPromptTime: 0, acceptCount: 0, dismissCount: 0 };
        sessionMap.set(hookId, { ...current, ...updates });
        return { ...state };
      });
    },

    /**
     * Add a pending suggestion
     */
    addSuggestion: (suggestion: Suggestion) => {
      update(state => ({
        ...state,
        pendingSuggestions: [...state.pendingSuggestions, suggestion],
      }));
    },

    /**
     * Remove a suggestion
     */
    removeSuggestion: (suggestionId: string) => {
      update(state => ({
        ...state,
        pendingSuggestions: state.pendingSuggestions.filter(s => s.id !== suggestionId),
      }));
    },

    /**
     * Clear all suggestions for a session
     */
    clearSessionSuggestions: (sessionId: string) => {
      update(state => ({
        ...state,
        pendingSuggestions: state.pendingSuggestions.filter(s => s.sessionId !== sessionId),
      }));
    },

    /**
     * Track an error in a session
     */
    trackError: (sessionId: string, error: Omit<ErrorPattern, "count" | "firstSeen" | "lastSeen">) => {
      update(state => {
        const errors = state.sessionErrors.get(sessionId) || [];
        const existing = errors.find(e => e.message === error.message && e.file === error.file);

        if (existing) {
          existing.count++;
          existing.lastSeen = Date.now();
        } else {
          errors.push({
            ...error,
            count: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
          });
        }

        state.sessionErrors.set(sessionId, errors);
        return { ...state };
      });
    },

    /**
     * Get errors for a session
     */
    getSessionErrors: (sessionId: string): ErrorPattern[] => {
      let errors: ErrorPattern[] = [];
      subscribe(state => {
        errors = state.sessionErrors.get(sessionId) || [];
      })();
      return errors;
    },

    /**
     * Clear session state (e.g., when session is deleted)
     */
    clearSession: (sessionId: string) => {
      update(state => {
        state.sessionState.delete(sessionId);
        state.sessionErrors.delete(sessionId);
        state.pendingSuggestions = state.pendingSuggestions.filter(s => s.sessionId !== sessionId);
        return { ...state };
      });
    },
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const hooksEnabled = createEnabledStore();
export const hookConfig = createHookConfigStore();
export const hookRegistry = createHookRegistry();

/**
 * Derived store: pending suggestions for current session
 */
export function createSessionSuggestions(sessionId: string) {
  return derived(hookRegistry, $registry =>
    $registry.pendingSuggestions.filter(s => s.sessionId === sessionId)
  );
}

/**
 * Derived store: count of pending suggestions
 */
export const pendingSuggestionCount = derived(
  hookRegistry,
  $registry => $registry.pendingSuggestions.length
);
