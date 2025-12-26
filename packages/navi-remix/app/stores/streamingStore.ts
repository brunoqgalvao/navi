import { create } from "zustand";
import type { ContentBlock, StreamingState } from "~/lib/types";

interface StreamingStoreState {
  // Map of sessionId -> streaming state
  sessions: Map<string, StreamingState>;

  // Actions
  start: (sessionId: string) => void;
  addBlock: (sessionId: string, block: ContentBlock) => void;
  appendDelta: (
    sessionId: string,
    delta: { text?: string; thinking?: string; partial_json?: string }
  ) => void;
  updateBlock: (sessionId: string, index: number, block: ContentBlock) => void;
  finishBlock: (sessionId: string) => void;
  stop: (sessionId: string) => void;
  isStreaming: (sessionId: string) => boolean;
  getState: (sessionId: string) => StreamingState | undefined;
}

const createInitialState = (): StreamingState => ({
  isStreaming: true,
  currentBlocks: [],
  partialText: "",
  partialThinking: "",
  partialJson: "",
});

export const useStreamingStore = create<StreamingStoreState>((set, get) => ({
  sessions: new Map(),

  start: (sessionId) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      newMap.set(sessionId, createInitialState());
      return { sessions: newMap };
    }),

  addBlock: (sessionId, block) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      const session = newMap.get(sessionId);
      if (session) {
        newMap.set(sessionId, {
          ...session,
          currentBlocks: [...session.currentBlocks, block],
        });
      }
      return { sessions: newMap };
    }),

  appendDelta: (sessionId, delta) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      const session = newMap.get(sessionId);
      if (session) {
        newMap.set(sessionId, {
          ...session,
          partialText: delta.text
            ? session.partialText + delta.text
            : session.partialText,
          partialThinking: delta.thinking
            ? session.partialThinking + delta.thinking
            : session.partialThinking,
          partialJson: delta.partial_json
            ? session.partialJson + delta.partial_json
            : session.partialJson,
        });
      }
      return { sessions: newMap };
    }),

  updateBlock: (sessionId, index, block) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      const session = newMap.get(sessionId);
      if (session && index < session.currentBlocks.length) {
        const newBlocks = [...session.currentBlocks];
        newBlocks[index] = block;
        newMap.set(sessionId, {
          ...session,
          currentBlocks: newBlocks,
        });
      }
      return { sessions: newMap };
    }),

  finishBlock: (sessionId) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      const session = newMap.get(sessionId);
      if (session) {
        newMap.set(sessionId, {
          ...session,
          partialText: "",
          partialThinking: "",
          partialJson: "",
        });
      }
      return { sessions: newMap };
    }),

  stop: (sessionId) =>
    set((state) => {
      const newMap = new Map(state.sessions);
      newMap.delete(sessionId);
      return { sessions: newMap };
    }),

  isStreaming: (sessionId) => get().sessions.has(sessionId),

  getState: (sessionId) => get().sessions.get(sessionId),
}));
