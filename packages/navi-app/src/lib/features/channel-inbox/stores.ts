/**
 * Channel Inbox Stores
 *
 * Svelte stores for managing channel inbox state.
 */

import { writable, derived } from "svelte/store";
import type {
  ChannelProvider,
  ChannelConnection,
  ExternalChat,
  ExternalMessage,
  ChannelProviderType,
} from "./types";
import { channelInboxApi } from "./api";

// ============================================================================
// Providers Store
// ============================================================================

function createProvidersStore() {
  const { subscribe, set } = writable<ChannelProvider[]>([]);

  return {
    subscribe,
    load: async () => {
      try {
        const providers = await channelInboxApi.getProviders();
        set(providers);
        return providers;
      } catch (e) {
        console.error("[channels] Failed to load providers:", e);
        return [];
      }
    },
  };
}

export const providers = createProvidersStore();

// ============================================================================
// Connections Store
// ============================================================================

function createConnectionsStore() {
  const { subscribe, set, update } = writable<ChannelConnection[]>([]);

  return {
    subscribe,
    load: async () => {
      try {
        const connections = await channelInboxApi.getConnections();
        set(connections);
        return connections;
      } catch (e) {
        console.error("[channels] Failed to load connections:", e);
        return [];
      }
    },
    add: async (provider: ChannelProviderType) => {
      const connection = await channelInboxApi.createConnection(provider);
      update((conns) => [...conns, connection]);
      return connection;
    },
    updateStatus: async (
      id: string,
      data: {
        status?: ChannelConnection["status"];
        accountName?: string;
        accountId?: string;
        error?: string;
      }
    ) => {
      const updated = await channelInboxApi.updateConnectionStatus(id, data);
      update((conns) => conns.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    remove: async (id: string) => {
      await channelInboxApi.deleteConnection(id);
      update((conns) => conns.filter((c) => c.id !== id));
    },
  };
}

export const connections = createConnectionsStore();

// ============================================================================
// Inbox Store (Unified across all providers)
// ============================================================================

function createInboxStore() {
  const { subscribe, set, update } = writable<(ExternalChat & { connectionId: string })[]>([]);
  let loading = false;

  return {
    subscribe,
    load: async (limit = 50, unreadOnly = false) => {
      if (loading) return;
      loading = true;
      try {
        const chats = await channelInboxApi.getInbox(limit, unreadOnly);
        set(chats);
        return chats;
      } catch (e) {
        console.error("[channels] Failed to load inbox:", e);
        return [];
      } finally {
        loading = false;
      }
    },
    refresh: async () => {
      const chats = await channelInboxApi.getInbox(50, false);
      set(chats);
    },
    updateChat: (chatId: string, updates: Partial<ExternalChat>) => {
      update((chats) =>
        chats.map((c) => (c.id === chatId ? { ...c, ...updates } : c))
      );
    },
  };
}

export const inbox = createInboxStore();

// ============================================================================
// Messages Store (Per-chat)
// ============================================================================

function createMessagesStore() {
  const { subscribe, set, update } = writable<Map<string, ExternalMessage[]>>(new Map());

  return {
    subscribe,
    loadForChat: async (chatId: string, limit = 50) => {
      try {
        const messages = await channelInboxApi.getMessages(chatId, limit);
        update((map) => {
          const newMap = new Map(map);
          newMap.set(chatId, messages);
          return newMap;
        });
        return messages;
      } catch (e) {
        console.error("[channels] Failed to load messages:", e);
        return [];
      }
    },
    addMessage: (chatId: string, message: ExternalMessage) => {
      update((map) => {
        const newMap = new Map(map);
        const existing = newMap.get(chatId) || [];
        newMap.set(chatId, [...existing, message]);
        return newMap;
      });
    },
    clear: (chatId: string) => {
      update((map) => {
        const newMap = new Map(map);
        newMap.delete(chatId);
        return newMap;
      });
    },
  };
}

export const messages = createMessagesStore();

// ============================================================================
// Current Selection
// ============================================================================

export const selectedChatId = writable<string | null>(null);

export const selectedChat = derived(
  [inbox, selectedChatId],
  ([$inbox, $selectedChatId]) => {
    if (!$selectedChatId) return null;
    return $inbox.find((c) => c.id === $selectedChatId) || null;
  }
);

export const selectedChatMessages = derived(
  [messages, selectedChatId],
  ([$messages, $selectedChatId]) => {
    if (!$selectedChatId) return [];
    return $messages.get($selectedChatId) || [];
  }
);

// ============================================================================
// Unread Count
// ============================================================================

export const totalUnreadCount = derived(inbox, ($inbox) => {
  return $inbox.reduce((sum, chat) => sum + chat.unreadCount, 0);
});
