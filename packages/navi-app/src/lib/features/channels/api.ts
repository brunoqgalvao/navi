import { getServerUrl } from "../../config";
import type {
  Channel,
  ChannelThread,
  ChannelMessage,
  CreateChannelDTO,
  UpdateChannelDTO,
  CreateThreadDTO,
  UpdateThreadDTO,
  CreateMessageDTO,
} from "./types";

const API_BASE = () => getServerUrl();

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

// ============================================================================
// Channels
// ============================================================================

export const channelsApi = {
  list: (): Promise<Channel[]> => request("/api/channels"),

  get: (id: string): Promise<Channel> => request(`/api/channels/${encodeURIComponent(id)}`),

  create: (data: CreateChannelDTO): Promise<Channel> =>
    request("/api/channels", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateChannelDTO): Promise<Channel> =>
    request(`/api/channels/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string): Promise<{ success: boolean }> =>
    request(`/api/channels/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

// ============================================================================
// Threads
// ============================================================================

export const threadsApi = {
  list: (channelId: string): Promise<ChannelThread[]> =>
    request(`/api/channels/${encodeURIComponent(channelId)}/threads`),

  get: (channelId: string, threadId: string): Promise<ChannelThread> =>
    request(`/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}`),

  create: (channelId: string, data: CreateThreadDTO): Promise<ChannelThread> =>
    request(`/api/channels/${encodeURIComponent(channelId)}/threads`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (channelId: string, threadId: string, data: UpdateThreadDTO): Promise<ChannelThread> =>
    request(`/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (channelId: string, threadId: string): Promise<{ success: boolean }> =>
    request(`/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}`, {
      method: "DELETE",
    }),
};

// ============================================================================
// Messages
// ============================================================================

export const messagesApi = {
  list: (channelId: string, threadId: string, limit = 100, offset = 0): Promise<ChannelMessage[]> =>
    request(
      `/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}/messages?limit=${limit}&offset=${offset}`
    ),

  create: (channelId: string, threadId: string, data: CreateMessageDTO): Promise<ChannelMessage> =>
    request(`/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (channelId: string, threadId: string, messageId: string): Promise<{ success: boolean }> =>
    request(
      `/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" }
    ),
};
