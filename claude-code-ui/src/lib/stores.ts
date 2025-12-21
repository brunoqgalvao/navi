import { writable, derived } from "svelte/store";
import type { ContentBlock } from "./claude";
import type { Project, Session } from "./api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: ContentBlock[] | string;
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

function createChatStore() {
  const { subscribe, set, update } = writable<ChatMessage[]>([]);

  return {
    subscribe,
    set,
    addMessage: (msg: ChatMessage) => update((msgs) => [...msgs, msg]),
    updateLastAssistant: (content: ContentBlock[], parentToolUseId?: string | null) =>
      update((msgs) => {
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i];
          if (msg.role === "assistant" && msg.parentToolUseId === parentToolUseId) {
            return [...msgs.slice(0, i), { ...msg, content }, ...msgs.slice(i + 1)];
          }
        }
        return msgs;
      }),
    clear: () => set([]),
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

export const projects = createProjectsStore();
export const sessions = createSessionsStore();
export const messages = createChatStore();
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
