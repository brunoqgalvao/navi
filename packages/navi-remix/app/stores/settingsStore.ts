import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  advancedMode: boolean;
  debugMode: boolean;
  onboardingComplete: boolean;

  // Actions
  toggleAdvancedMode: () => void;
  setAdvancedMode: (value: boolean) => void;
  toggleDebugMode: () => void;
  setDebugMode: (value: boolean) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      advancedMode: false,
      debugMode: false,
      onboardingComplete: false,

      toggleAdvancedMode: () =>
        set((state) => ({ advancedMode: !state.advancedMode })),

      setAdvancedMode: (value) => set({ advancedMode: value }),

      toggleDebugMode: () =>
        set((state) => ({ debugMode: !state.debugMode })),

      setDebugMode: (value) => set({ debugMode: value }),

      completeOnboarding: () => set({ onboardingComplete: true }),

      resetOnboarding: () => set({ onboardingComplete: false }),
    }),
    {
      name: "navi-settings",
    }
  )
);

// Connection state (not persisted)
interface ConnectionState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  setConnected: (isConnected) => set({ isConnected }),
}));

// UI state (not persisted)
interface UIState {
  showArchivedWorkspaces: boolean;
  loadingSessions: Set<string>;

  setShowArchivedWorkspaces: (show: boolean) => void;
  addLoadingSession: (sessionId: string) => void;
  removeLoadingSession: (sessionId: string) => void;
  isSessionLoading: (sessionId: string) => boolean;
}

export const useUIStore = create<UIState>((set, get) => ({
  showArchivedWorkspaces: false,
  loadingSessions: new Set(),

  setShowArchivedWorkspaces: (show) => set({ showArchivedWorkspaces: show }),

  addLoadingSession: (sessionId) =>
    set((state) => {
      const newSet = new Set(state.loadingSessions);
      newSet.add(sessionId);
      return { loadingSessions: newSet };
    }),

  removeLoadingSession: (sessionId) =>
    set((state) => {
      const newSet = new Set(state.loadingSessions);
      newSet.delete(sessionId);
      return { loadingSessions: newSet };
    }),

  isSessionLoading: (sessionId) => get().loadingSessions.has(sessionId),
}));
