/**
 * Channel Inbox API Client
 *
 * Frontend API for interacting with the channel inbox backend.
 */

import { getServerUrl } from "$lib/api";
import type {
  ChannelProvider,
  ChannelConnection,
  ExternalChat,
  ExternalMessage,
  ChannelProviderType,
} from "./types";

const API_BASE = () => `${getServerUrl()}/api/channels`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const channelInboxApi = {
  // Providers
  getProviders: () => request<ChannelProvider[]>("/providers"),

  // Connections
  getConnections: () => request<ChannelConnection[]>("/connections"),

  createConnection: (provider: ChannelProviderType) =>
    request<ChannelConnection>("/connections", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),

  getConnection: (id: string) =>
    request<ChannelConnection>(`/connections/${encodeURIComponent(id)}`),

  updateConnectionStatus: (
    id: string,
    data: {
      status?: ChannelConnection["status"];
      accountName?: string;
      accountId?: string;
      error?: string;
    }
  ) =>
    request<ChannelConnection>(`/connections/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteConnection: (id: string) =>
    request<{ success: boolean }>(`/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Chats
  getChats: (connectionId: string) =>
    request<ExternalChat[]>(`/connections/${encodeURIComponent(connectionId)}/chats`),

  syncChats: (connectionId: string, chats: ExternalChat[]) =>
    request<{ synced: number }>(`/connections/${encodeURIComponent(connectionId)}/chats/sync`, {
      method: "POST",
      body: JSON.stringify({ chats }),
    }),

  // Messages
  getMessages: (chatId: string, limit = 50, offset = 0) =>
    request<ExternalMessage[]>(
      `/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&offset=${offset}`
    ),

  syncMessages: (chatId: string, messages: ExternalMessage[]) =>
    request<{ synced: number; total: number }>(
      `/chats/${encodeURIComponent(chatId)}/messages/sync`,
      {
        method: "POST",
        body: JSON.stringify({ messages }),
      }
    ),

  sendMessage: (chatId: string, content: string, provider: ChannelProviderType) =>
    request<ExternalMessage>(`/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, provider }),
    }),

  // Unified Inbox
  getInbox: (limit = 50, unreadOnly = false) =>
    request<(ExternalChat & { connectionId: string })[]>(
      `/inbox?limit=${limit}&unread=${unreadOnly}`
    ),

  getUnreadCount: () => request<{ count: number }>("/inbox/unread-count"),

  // WhatsApp-specific
  whatsapp: {
    getMcpPrompt: (action: "status" | "list_chats" | "read_chat" | "send", params?: Record<string, string>) => {
      const searchParams = new URLSearchParams({ action, ...params });
      return request<{ prompt: string; connectionId?: string; action: string }>(
        `/whatsapp/mcp-prompt?${searchParams}`
      );
    },

    syncStatus: (connectionId: string, data: {
      status?: boolean;
      accountName?: string;
      accountId?: string;
      needsAuth?: boolean;
      error?: string;
    }) =>
      request<ChannelConnection>("/whatsapp/sync-status", {
        method: "POST",
        body: JSON.stringify({ connectionId, ...data }),
      }),

    syncChats: (connectionId: string, rawResponse: string) =>
      request<{ synced: number; chats: ExternalChat[] }>("/whatsapp/sync-chats", {
        method: "POST",
        body: JSON.stringify({ connectionId, rawResponse }),
      }),
  },
};
