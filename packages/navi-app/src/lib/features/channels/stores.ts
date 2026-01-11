import { writable, derived } from "svelte/store";
import { channelsApi, threadsApi, messagesApi } from "./api";
import type { Channel, ChannelThread, ChannelMessage } from "./types";

// ============================================================================
// Channels Store
// ============================================================================

function createChannelsStore() {
  const { subscribe, set, update } = writable<Channel[]>([]);
  let loaded = false;

  return {
    subscribe,

    async load() {
      if (loaded) return;
      try {
        const channels = await channelsApi.list();
        set(channels);
        loaded = true;
      } catch (e) {
        console.error("Failed to load channels:", e);
      }
    },

    async refresh() {
      loaded = false;
      await this.load();
    },

    async create(name: string, description?: string, workspaceIds?: string[]) {
      const channel = await channelsApi.create({ name, description, workspaceIds });
      update((channels) => [channel, ...channels]);
      return channel;
    },

    async update(id: string, data: { name?: string; description?: string; workspaceIds?: string[] }) {
      const channel = await channelsApi.update(id, data);
      update((channels) => channels.map((c) => (c.id === id ? channel : c)));
      return channel;
    },

    async delete(id: string) {
      await channelsApi.delete(id);
      update((channels) => channels.filter((c) => c.id !== id));
    },
  };
}

export const channels = createChannelsStore();

// ============================================================================
// Current Channel Store
// ============================================================================

export const currentChannelId = writable<string | null>(null);
export const currentThreadId = writable<string | null>(null);

export const currentChannel = derived(
  [channels, currentChannelId],
  ([$channels, $currentChannelId]) =>
    $currentChannelId ? $channels.find((c) => c.id === $currentChannelId) || null : null
);

// ============================================================================
// Threads Store (for current channel)
// ============================================================================

function createThreadsStore() {
  const { subscribe, set, update } = writable<Map<string, ChannelThread[]>>(new Map());

  return {
    subscribe,

    async loadForChannel(channelId: string) {
      try {
        const threads = await threadsApi.list(channelId);
        update((map) => {
          map.set(channelId, threads);
          return new Map(map);
        });
      } catch (e) {
        console.error("Failed to load threads:", e);
      }
    },

    async create(channelId: string, title?: string, workspaceId?: string) {
      const thread = await threadsApi.create(channelId, { title, workspaceId });
      update((map) => {
        const existing = map.get(channelId) || [];
        map.set(channelId, [thread, ...existing]);
        return new Map(map);
      });
      return thread;
    },

    async update(channelId: string, threadId: string, data: { title?: string; status?: 'active' | 'resolved' | 'archived' }) {
      const thread = await threadsApi.update(channelId, threadId, data);
      update((map) => {
        const existing = map.get(channelId) || [];
        map.set(
          channelId,
          existing.map((t) => (t.id === threadId ? thread : t))
        );
        return new Map(map);
      });
      return thread;
    },

    async delete(channelId: string, threadId: string) {
      await threadsApi.delete(channelId, threadId);
      update((map) => {
        const existing = map.get(channelId) || [];
        map.set(
          channelId,
          existing.filter((t) => t.id !== threadId)
        );
        return new Map(map);
      });
    },

    getForChannel(channelId: string): ChannelThread[] {
      let result: ChannelThread[] = [];
      subscribe((map) => {
        result = map.get(channelId) || [];
      })();
      return result;
    },
  };
}

export const threads = createThreadsStore();

export const currentThreads = derived([threads, currentChannelId], ([$threads, $currentChannelId]) =>
  $currentChannelId ? $threads.get($currentChannelId) || [] : []
);

export const currentThread = derived(
  [currentThreads, currentThreadId],
  ([$currentThreads, $currentThreadId]) =>
    $currentThreadId ? $currentThreads.find((t) => t.id === $currentThreadId) || null : null
);

// ============================================================================
// Messages Store (for current thread)
// ============================================================================

function createMessagesStore() {
  const { subscribe, set, update } = writable<Map<string, ChannelMessage[]>>(new Map());

  return {
    subscribe,

    async loadForThread(channelId: string, threadId: string) {
      try {
        const messages = await messagesApi.list(channelId, threadId);
        update((map) => {
          map.set(threadId, messages);
          return new Map(map);
        });
      } catch (e) {
        console.error("Failed to load messages:", e);
      }
    },

    async create(
      channelId: string,
      threadId: string,
      senderType: "user" | "agent",
      senderId: string,
      senderName: string,
      content: string,
      mentions: string[] = []
    ) {
      const message = await messagesApi.create(channelId, threadId, {
        senderType,
        senderId,
        senderName,
        content,
        mentions,
      });
      update((map) => {
        const existing = map.get(threadId) || [];
        map.set(threadId, [...existing, message]);
        return new Map(map);
      });
      return message;
    },

    addLocal(threadId: string, message: ChannelMessage) {
      update((map) => {
        const existing = map.get(threadId) || [];
        map.set(threadId, [...existing, message]);
        return new Map(map);
      });
    },

    async delete(channelId: string, threadId: string, messageId: string) {
      await messagesApi.delete(channelId, threadId, messageId);
      update((map) => {
        const existing = map.get(threadId) || [];
        map.set(
          threadId,
          existing.filter((m) => m.id !== messageId)
        );
        return new Map(map);
      });
    },

    getForThread(threadId: string): ChannelMessage[] {
      let result: ChannelMessage[] = [];
      subscribe((map) => {
        result = map.get(threadId) || [];
      })();
      return result;
    },
  };
}

export const channelMessages = createMessagesStore();

export const currentMessages = derived(
  [channelMessages, currentThreadId],
  ([$channelMessages, $currentThreadId]) =>
    $currentThreadId ? $channelMessages.get($currentThreadId) || [] : []
);
