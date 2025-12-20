import { writable, derived } from "svelte/store";
import type { ClaudeMessage, ContentBlock } from "./claude";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: ContentBlock[] | string;
  timestamp: Date;
}

export interface Session {
  id: string;
  projectPath: string;
  messages: ChatMessage[];
  costUsd: number;
  createdAt: Date;
}

function createChatStore() {
  const { subscribe, set, update } = writable<ChatMessage[]>([]);

  return {
    subscribe,
    addMessage: (msg: ChatMessage) => update((msgs) => [...msgs, msg]),
    updateLastAssistant: (content: ContentBlock[]) =>
      update((msgs) => {
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant") {
          return [...msgs.slice(0, -1), { ...last, content }];
        }
        return msgs;
      }),
    clear: () => set([]),
  };
}

function createSessionStore() {
  const { subscribe, set, update } = writable<{
    id: string | null;
    projectPath: string;
    isLoading: boolean;
    costUsd: number;
    model: string | null;
  }>({
    id: null,
    projectPath: "",
    isLoading: false,
    costUsd: 0,
    model: null,
  });

  return {
    subscribe,
    setSessionId: (id: string) => update((s) => ({ ...s, id })),
    setProjectPath: (path: string) => update((s) => ({ ...s, projectPath: path })),
    setLoading: (isLoading: boolean) => update((s) => ({ ...s, isLoading })),
    setCost: (costUsd: number) => update((s) => ({ ...s, costUsd })),
    setModel: (model: string) => update((s) => ({ ...s, model })),
    reset: () =>
      set({
        id: null,
        projectPath: "/",
        isLoading: false,
        costUsd: 0,
        model: null,
      }),
  };
}

export const messages = createChatStore();
export const session = createSessionStore();
export const isConnected = writable(false);
