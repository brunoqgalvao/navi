import { create } from "zustand";
import type { Session } from "~/lib/api";
import { setHash } from "~/lib/router";
import type { CurrentSessionState } from "~/lib/types";

interface SessionState {
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSession: (session: Session) => void;
  getSession: (id: string) => Session | undefined;
  getProjectSessions: (projectId: string) => Session[];
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
    })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    })),

  updateSession: (session) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === session.id ? session : s
      ),
    })),

  getSession: (id) => get().sessions.find((s) => s.id === id),

  getProjectSessions: (projectId) =>
    get().sessions.filter((s) => s.project_id === projectId),
}));

// Current session state (which project/session is active)
interface CurrentSessionStore extends CurrentSessionState {
  setProject: (projectId: string | null) => void;
  setSession: (sessionId: string | null, claudeSessionId?: string | null) => void;
  setClaudeSession: (claudeSessionId: string) => void;
  setLoading: (isLoading: boolean) => void;
  setCost: (costUsd: number) => void;
  setModel: (model: string) => void;
  setSelectedModel: (selectedModel: string) => void;
  setUsage: (inputTokens: number, outputTokens: number) => void;
  reset: () => void;
  restoreFromUrl: (projectId: string | null, sessionId: string | null) => void;
}

const initialCurrentSession: CurrentSessionState = {
  projectId: null,
  sessionId: null,
  claudeSessionId: null,
  isLoading: false,
  costUsd: 0,
  model: null,
  selectedModel: "",
  inputTokens: 0,
  outputTokens: 0,
};

export const useCurrentSessionStore = create<CurrentSessionStore>((set, get) => ({
  ...initialCurrentSession,

  setProject: (projectId) => {
    setHash({ projectId, sessionId: null });
    set({
      projectId,
      sessionId: null,
      claudeSessionId: null,
      inputTokens: 0,
      outputTokens: 0,
    });
  },

  setSession: (sessionId, claudeSessionId) => {
    const { projectId } = get();
    setHash({ projectId, sessionId });
    set({
      sessionId,
      claudeSessionId: claudeSessionId ?? null,
    });
  },

  setClaudeSession: (claudeSessionId) => set({ claudeSessionId }),

  setLoading: (isLoading) => set({ isLoading }),

  setCost: (costUsd) => set({ costUsd }),

  setModel: (model) => set({ model }),

  setSelectedModel: (selectedModel) => set({ selectedModel }),

  setUsage: (inputTokens, outputTokens) => set({ inputTokens, outputTokens }),

  reset: () => {
    setHash({ projectId: null, sessionId: null });
    set(initialCurrentSession);
  },

  restoreFromUrl: (projectId, sessionId) =>
    set({
      projectId,
      sessionId,
      claudeSessionId: null,
      inputTokens: 0,
      outputTokens: 0,
    }),
}));
