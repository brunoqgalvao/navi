import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Model {
  id: string;
  name: string;
  description?: string;
}

interface SettingsState {
  advancedMode: boolean;
  debugMode: boolean;
  onboardingComplete: boolean;
  showArchivedItems: boolean;

  // Models
  availableModels: Model[];
  selectedModel: string;

  // Actions
  toggleAdvancedMode: () => void;
  setAdvancedMode: (value: boolean) => void;
  toggleDebugMode: () => void;
  setDebugMode: (value: boolean) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setShowArchivedItems: (show: boolean) => void;
  setAvailableModels: (models: Model[]) => void;
  setSelectedModel: (model: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      advancedMode: false,
      debugMode: false,
      onboardingComplete: false,
      showArchivedItems: false,
      availableModels: [],
      selectedModel: "claude-sonnet-4-20250514",

      toggleAdvancedMode: () =>
        set((state) => ({ advancedMode: !state.advancedMode })),

      setAdvancedMode: (value) => set({ advancedMode: value }),

      toggleDebugMode: () =>
        set((state) => ({ debugMode: !state.debugMode })),

      setDebugMode: (value) => set({ debugMode: value }),

      completeOnboarding: () => set({ onboardingComplete: true }),

      resetOnboarding: () => set({ onboardingComplete: false }),

      setShowArchivedItems: (show) => set({ showArchivedItems: show }),

      setAvailableModels: (models) => set({ availableModels: models }),

      setSelectedModel: (model) => set({ selectedModel: model }),
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
