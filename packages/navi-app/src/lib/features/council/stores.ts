/**
 * Council Store - Manages conversation state for multi-LLM council
 */

import { writable, derived, get } from "svelte/store";
import type { CouncilMember, CouncilResponse } from "./types";
import { councilApi } from "./api";

// Storage key for persistence
const COUNCIL_HISTORY_KEY = "navi-council-history";
const COUNCIL_MEMBERS_KEY = "navi-council-selected-members";

export interface CouncilMessage {
  id: string;
  role: "user" | "council";
  content: string; // For user messages
  responses?: CouncilResponse[]; // For council responses
  timestamp: Date;
  isLoading?: boolean;
}

export interface CouncilConversation {
  id: string;
  title: string;
  messages: CouncilMessage[];
  selectedMembers: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface CouncilState {
  conversations: CouncilConversation[];
  activeConversationId: string | null;
  availableMembers: CouncilMember[];
  selectedMemberIds: Set<string>;
  isLoading: boolean;
  isPanelOpen: boolean;
}

function createCouncilStore() {
  // Load persisted state
  const loadPersistedState = (): Partial<CouncilState> => {
    if (typeof window === "undefined") return {};

    try {
      const historyStr = localStorage.getItem(COUNCIL_HISTORY_KEY);
      const membersStr = localStorage.getItem(COUNCIL_MEMBERS_KEY);

      const conversations = historyStr ? JSON.parse(historyStr) : [];
      const selectedMemberIds: Set<string> = membersStr ? new Set(JSON.parse(membersStr) as string[]) : new Set<string>();

      // Rehydrate dates
      for (const conv of conversations) {
        conv.createdAt = new Date(conv.createdAt);
        conv.updatedAt = new Date(conv.updatedAt);
        for (const msg of conv.messages) {
          msg.timestamp = new Date(msg.timestamp);
        }
      }

      return { conversations, selectedMemberIds };
    } catch {
      return {};
    }
  };

  const persisted = loadPersistedState();

  const initialState: CouncilState = {
    conversations: persisted.conversations || [],
    activeConversationId: null,
    availableMembers: [],
    selectedMemberIds: persisted.selectedMemberIds || new Set(),
    isLoading: false,
    isPanelOpen: false,
  };

  const { subscribe, set, update } = writable<CouncilState>(initialState);

  // Persist to localStorage
  const persist = (state: CouncilState) => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(COUNCIL_HISTORY_KEY, JSON.stringify(state.conversations));
      localStorage.setItem(COUNCIL_MEMBERS_KEY, JSON.stringify(Array.from(state.selectedMemberIds)));
    } catch (e) {
      console.error("Failed to persist council state:", e);
    }
  };

  return {
    subscribe,

    // Initialize members from API
    async loadMembers() {
      try {
        const { members, defaultCouncil } = await councilApi.getMembers();
        update(state => {
          // If no members selected yet, use defaults
          const selectedMemberIds = state.selectedMemberIds.size > 0
            ? state.selectedMemberIds
            : new Set(defaultCouncil.filter(id => members.find(m => m.id === id && m.available)));

          return {
            ...state,
            availableMembers: members,
            selectedMemberIds,
          };
        });
      } catch (e) {
        console.error("Failed to load council members:", e);
      }
    },

    // Toggle panel visibility
    togglePanel() {
      update(state => ({ ...state, isPanelOpen: !state.isPanelOpen }));
    },

    openPanel() {
      update(state => ({ ...state, isPanelOpen: true }));
    },

    closePanel() {
      update(state => ({ ...state, isPanelOpen: false }));
    },

    // Create a new conversation
    newConversation(initialPrompt?: string): string {
      const id = crypto.randomUUID();
      const now = new Date();

      update(state => {
        const conversation: CouncilConversation = {
          id,
          title: initialPrompt?.slice(0, 50) || "New Council Session",
          messages: [],
          selectedMembers: Array.from(state.selectedMemberIds),
          createdAt: now,
          updatedAt: now,
        };

        const newState = {
          ...state,
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
          isPanelOpen: true,
        };

        persist(newState);
        return newState;
      });

      return id;
    },

    // Select a conversation
    selectConversation(id: string) {
      update(state => ({ ...state, activeConversationId: id }));
    },

    // Delete a conversation
    deleteConversation(id: string) {
      update(state => {
        const newState = {
          ...state,
          conversations: state.conversations.filter(c => c.id !== id),
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        };
        persist(newState);
        return newState;
      });
    },

    // Toggle member selection
    toggleMember(memberId: string) {
      update(state => {
        const newSelected = new Set(state.selectedMemberIds);
        if (newSelected.has(memberId)) {
          newSelected.delete(memberId);
        } else {
          newSelected.add(memberId);
        }
        const newState = { ...state, selectedMemberIds: newSelected };
        persist(newState);
        return newState;
      });
    },

    // Send a message to the council
    async sendMessage(prompt: string) {
      const state = get({ subscribe });

      // Ensure we have an active conversation
      let conversationId = state.activeConversationId;
      if (!conversationId) {
        conversationId = this.newConversation(prompt);
      }

      const messageId = crypto.randomUUID();
      const now = new Date();

      // Add user message and loading placeholder
      update(state => {
        const convIndex = state.conversations.findIndex(c => c.id === conversationId);
        if (convIndex === -1) return state;

        const conv = { ...state.conversations[convIndex] };
        conv.messages = [
          ...conv.messages,
          { id: messageId, role: "user" as const, content: prompt, timestamp: now },
          { id: `${messageId}-response`, role: "council" as const, content: "", timestamp: now, isLoading: true },
        ];
        conv.updatedAt = now;

        // Update title if first message
        if (conv.messages.length === 2) {
          conv.title = prompt.slice(0, 50) + (prompt.length > 50 ? "..." : "");
        }

        const conversations = [...state.conversations];
        conversations[convIndex] = conv;

        return { ...state, conversations, isLoading: true };
      });

      try {
        // Build context from previous messages for each model
        const currentState = get({ subscribe });
        const conv = currentState.conversations.find(c => c.id === conversationId);

        // For now, we send just the current prompt
        // TODO: Build conversation history context per model
        const result = await councilApi.convene(
          prompt,
          Array.from(currentState.selectedMemberIds)
        );

        // Update with responses
        update(state => {
          const convIndex = state.conversations.findIndex(c => c.id === conversationId);
          if (convIndex === -1) return state;

          const conv = { ...state.conversations[convIndex] };
          const msgIndex = conv.messages.findIndex(m => m.id === `${messageId}-response`);

          if (msgIndex !== -1) {
            conv.messages = [...conv.messages];
            conv.messages[msgIndex] = {
              ...conv.messages[msgIndex],
              responses: result.responses,
              isLoading: false,
            };
          }

          const conversations = [...state.conversations];
          conversations[convIndex] = conv;

          const newState = { ...state, conversations, isLoading: false };
          persist(newState);
          return newState;
        });
      } catch (e: any) {
        // Update with error
        update(state => {
          const convIndex = state.conversations.findIndex(c => c.id === conversationId);
          if (convIndex === -1) return state;

          const conv = { ...state.conversations[convIndex] };
          const msgIndex = conv.messages.findIndex(m => m.id === `${messageId}-response`);

          if (msgIndex !== -1) {
            conv.messages = [...conv.messages];
            conv.messages[msgIndex] = {
              ...conv.messages[msgIndex],
              responses: [{
                memberId: "error",
                memberName: "Error",
                response: "",
                latencyMs: 0,
                error: e.message || "Failed to get council response",
              }],
              isLoading: false,
            };
          }

          const conversations = [...state.conversations];
          conversations[convIndex] = conv;

          return { ...state, conversations, isLoading: false };
        });
      }
    },

    // Clear all history
    clearHistory() {
      update(state => {
        const newState = {
          ...state,
          conversations: [],
          activeConversationId: null,
        };
        persist(newState);
        return newState;
      });
    },
  };
}

export const councilStore = createCouncilStore();

// Derived stores for convenience
export const activeConversation = derived(
  councilStore,
  $store => $store.conversations.find(c => c.id === $store.activeConversationId) || null
);

export const councilPanelOpen = derived(
  councilStore,
  $store => $store.isPanelOpen
);

export const selectedMembers = derived(
  councilStore,
  $store => $store.availableMembers.filter(m => $store.selectedMemberIds.has(m.id))
);
