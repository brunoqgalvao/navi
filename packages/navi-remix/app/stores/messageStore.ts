import { create } from "zustand";
import type { ChatMessage, ContentBlock } from "~/lib/types";

interface MessageState {
  // Map of sessionId -> messages
  messages: Map<string, ChatMessage[]>;

  // Actions
  setMessages: (sessionId: string, messages: ChatMessage[]) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateLastAssistant: (
    sessionId: string,
    content: ContentBlock[],
    parentToolUseId?: string | null
  ) => void;
  clearSession: (sessionId: string) => void;
  markFinal: (sessionId: string, messageId: string) => void;
  getMessages: (sessionId: string) => ChatMessage[];
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: new Map(),

  setMessages: (sessionId, messages) =>
    set((state) => {
      const newMap = new Map(state.messages);
      newMap.set(sessionId, messages);
      return { messages: newMap };
    }),

  addMessage: (sessionId, message) =>
    set((state) => {
      const newMap = new Map(state.messages);
      const existing = newMap.get(sessionId) || [];
      newMap.set(sessionId, [...existing, message]);
      return { messages: newMap };
    }),

  updateLastAssistant: (sessionId, content, parentToolUseId) =>
    set((state) => {
      const newMap = new Map(state.messages);
      const msgs = newMap.get(sessionId) || [];

      // Find last assistant message with matching parentToolUseId
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        if (msg.role === "assistant" && msg.parentToolUseId === parentToolUseId) {
          const updated = [
            ...msgs.slice(0, i),
            { ...msg, content },
            ...msgs.slice(i + 1),
          ];
          newMap.set(sessionId, updated);
          return { messages: newMap };
        }
      }

      // If not found, create new assistant message
      const newMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        timestamp: new Date(),
        parentToolUseId: parentToolUseId ?? undefined,
      };
      newMap.set(sessionId, [...msgs, newMsg]);
      return { messages: newMap };
    }),

  clearSession: (sessionId) =>
    set((state) => {
      const newMap = new Map(state.messages);
      newMap.delete(sessionId);
      return { messages: newMap };
    }),

  markFinal: (sessionId, messageId) =>
    set((state) => {
      const newMap = new Map(state.messages);
      const msgs = newMap.get(sessionId) || [];
      const updated = msgs.map((m) =>
        m.id === messageId ? { ...m, isFinal: true } : m
      );
      newMap.set(sessionId, updated);
      return { messages: newMap };
    }),

  getMessages: (sessionId) => get().messages.get(sessionId) || [],
}));

// Session drafts store (input text saved per session)
interface DraftState {
  drafts: Map<string, string>;
  setDraft: (sessionId: string, draft: string) => void;
  getDraft: (sessionId: string) => string;
  clearDraft: (sessionId: string) => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: new Map(),

  setDraft: (sessionId, draft) =>
    set((state) => {
      const newMap = new Map(state.drafts);
      if (draft.trim()) {
        newMap.set(sessionId, draft);
      } else {
        newMap.delete(sessionId);
      }
      return { drafts: newMap };
    }),

  getDraft: (sessionId) => get().drafts.get(sessionId) || "",

  clearDraft: (sessionId) =>
    set((state) => {
      const newMap = new Map(state.drafts);
      newMap.delete(sessionId);
      return { drafts: newMap };
    }),
}));
