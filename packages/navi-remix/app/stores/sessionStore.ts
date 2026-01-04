import { create } from "zustand";
import type { Session } from "~/lib/api";
import { setHash } from "~/lib/router";
import type { CurrentSessionState } from "~/lib/types";

interface SessionState {
  sessions: Map<string, Session[]>; // Map<projectId, sessions[]>
  setSessions: (projectId: string, sessions: Session[]) => void;
  addSession: (projectId: string, session: Session) => void;
  removeSession: (projectId: string, sessionId: string) => void;
  updateSession: (projectId: string, session: Session) => void;
  getSession: (projectId: string, sessionId: string) => Session | undefined;
  getProjectSessions: (projectId: string) => Session[];
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: new Map(),

  setSessions: (projectId, sessions) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      newMap.set(projectId, sessions);
      return { sessions: newMap };
    }),

  addSession: (projectId, session) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      const projectSessions = newMap.get(projectId) || [];
      newMap.set(projectId, [session, ...projectSessions]);
      return { sessions: newMap };
    }),

  removeSession: (projectId, sessionId) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      const projectSessions = newMap.get(projectId) || [];
      newMap.set(
        projectId,
        projectSessions.filter((s) => s.id !== sessionId)
      );
      return { sessions: newMap };
    }),

  updateSession: (projectId, session) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      const projectSessions = newMap.get(projectId) || [];
      newMap.set(
        projectId,
        projectSessions.map((s) => (s.id === session.id ? session : s))
      );
      return { sessions: newMap };
    }),

  getSession: (projectId, sessionId) => {
    const projectSessions = get().sessions.get(projectId) || [];
    return projectSessions.find((s) => s.id === sessionId);
  },

  getProjectSessions: (projectId) => get().sessions.get(projectId) || [],
}));

// Current session state (which project/session is active)
interface CurrentSessionStore extends CurrentSessionState {
  setProjectId: (projectId: string | null) => void;
  setSessionId: (sessionId: string | null) => void;
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

  setProjectId: (projectId) => set({ projectId }),

  setSessionId: (sessionId) => set({ sessionId }),

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
