import { channels, channelThreads, channelMessages, type Channel, type ChannelThread, type ChannelMessage } from "../db";
import { json, error } from "../utils/response";
import crypto from "crypto";

export async function handleChannelRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const path = url.pathname;

  // List all channels
  // GET /api/channels
  if (path === "/api/channels" && method === "GET") {
    const channelList = channels.list();
    return json(channelList);
  }

  // Get a single channel
  // GET /api/channels/:id
  const getChannelMatch = path.match(/^\/api\/channels\/([^/]+)$/);
  if (getChannelMatch && method === "GET") {
    const id = decodeURIComponent(getChannelMatch[1]);
    const channel = channels.get(id);
    if (!channel) {
      return error("Channel not found", 404);
    }
    return json(channel);
  }

  // Create a channel
  // POST /api/channels
  if (path === "/api/channels" && method === "POST") {
    try {
      const body = await req.json();
      const { name, description, workspaceAccess, workspaceIds } = body;

      if (!name) {
        return error("Name is required", 400);
      }

      const id = crypto.randomUUID();
      const now = Date.now();

      channels.create(
        id,
        name,
        description || null,
        workspaceAccess || 'selected',
        workspaceIds || [],
        now
      );

      const channel = channels.get(id);
      return json(channel, 201);
    } catch (e: any) {
      return error(e.message || "Failed to create channel", 500);
    }
  }

  // Update a channel
  // PUT /api/channels/:id
  const updateChannelMatch = path.match(/^\/api\/channels\/([^/]+)$/);
  if (updateChannelMatch && method === "PUT") {
    const id = decodeURIComponent(updateChannelMatch[1]);
    try {
      const body = await req.json();
      const { name, description, workspaceAccess, workspaceIds } = body;

      const existing = channels.get(id);
      if (!existing) {
        return error("Channel not found", 404);
      }

      channels.update(
        id,
        name || existing.name,
        description !== undefined ? description : existing.description,
        workspaceAccess || existing.workspace_access,
        workspaceIds || existing.workspace_ids || [],
        Date.now()
      );

      const updated = channels.get(id);
      return json(updated);
    } catch (e: any) {
      return error(e.message || "Failed to update channel", 500);
    }
  }

  // Delete a channel
  // DELETE /api/channels/:id
  const deleteChannelMatch = path.match(/^\/api\/channels\/([^/]+)$/);
  if (deleteChannelMatch && method === "DELETE") {
    const id = decodeURIComponent(deleteChannelMatch[1]);
    const channel = channels.get(id);
    if (!channel) {
      return error("Channel not found", 404);
    }
    channels.delete(id);
    return json({ success: true });
  }

  // ============================================================================
  // Threads
  // ============================================================================

  // List threads in a channel
  // GET /api/channels/:channelId/threads
  const listThreadsMatch = path.match(/^\/api\/channels\/([^/]+)\/threads$/);
  if (listThreadsMatch && method === "GET") {
    const channelId = decodeURIComponent(listThreadsMatch[1]);
    const channel = channels.get(channelId);
    if (!channel) {
      return error("Channel not found", 404);
    }
    const threads = channelThreads.listByChannel(channelId);
    return json(threads);
  }

  // Get a single thread
  // GET /api/channels/:channelId/threads/:threadId
  const getThreadMatch = path.match(/^\/api\/channels\/([^/]+)\/threads\/([^/]+)$/);
  if (getThreadMatch && method === "GET") {
    const threadId = decodeURIComponent(getThreadMatch[2]);
    const thread = channelThreads.get(threadId);
    if (!thread) {
      return error("Thread not found", 404);
    }
    return json(thread);
  }

  // Create a thread
  // POST /api/channels/:channelId/threads
  const createThreadMatch = path.match(/^\/api\/channels\/([^/]+)\/threads$/);
  if (createThreadMatch && method === "POST") {
    const channelId = decodeURIComponent(createThreadMatch[1]);
    try {
      const channel = channels.get(channelId);
      if (!channel) {
        return error("Channel not found", 404);
      }

      const body = await req.json();
      const { title, workspaceId } = body;

      const id = crypto.randomUUID();
      const now = Date.now();

      channelThreads.create(id, channelId, title || null, workspaceId || null, now);

      const thread = channelThreads.get(id);
      return json(thread, 201);
    } catch (e: any) {
      return error(e.message || "Failed to create thread", 500);
    }
  }

  // Update a thread
  // PUT /api/channels/:channelId/threads/:threadId
  const updateThreadMatch = path.match(/^\/api\/channels\/([^/]+)\/threads\/([^/]+)$/);
  if (updateThreadMatch && method === "PUT") {
    const threadId = decodeURIComponent(updateThreadMatch[2]);
    try {
      const existing = channelThreads.get(threadId);
      if (!existing) {
        return error("Thread not found", 404);
      }

      const body = await req.json();
      const { title, status, branchName } = body;

      if (branchName !== undefined) {
        channelThreads.setBranch(threadId, branchName, Date.now());
      }
      if (title !== undefined || status !== undefined) {
        channelThreads.update(
          threadId,
          title !== undefined ? title : existing.title,
          status || existing.status,
          Date.now()
        );
      }

      const updated = channelThreads.get(threadId);
      return json(updated);
    } catch (e: any) {
      return error(e.message || "Failed to update thread", 500);
    }
  }

  // Delete a thread
  // DELETE /api/channels/:channelId/threads/:threadId
  const deleteThreadMatch = path.match(/^\/api\/channels\/([^/]+)\/threads\/([^/]+)$/);
  if (deleteThreadMatch && method === "DELETE") {
    const threadId = decodeURIComponent(deleteThreadMatch[2]);
    const thread = channelThreads.get(threadId);
    if (!thread) {
      return error("Thread not found", 404);
    }
    channelThreads.delete(threadId);
    return json({ success: true });
  }

  // ============================================================================
  // Messages
  // ============================================================================

  // List messages in a thread
  // GET /api/channels/:channelId/threads/:threadId/messages
  const listMessagesMatch = path.match(/^\/api\/channels\/([^/]+)\/threads\/([^/]+)\/messages$/);
  if (listMessagesMatch && method === "GET") {
    const threadId = decodeURIComponent(listMessagesMatch[2]);
    const thread = channelThreads.get(threadId);
    if (!thread) {
      return error("Thread not found", 404);
    }

    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const messages = channelMessages.listByThread(threadId, limit, offset);
    return json(messages);
  }

  // Create a message
  // POST /api/channels/:channelId/threads/:threadId/messages
  const createMessageMatch = path.match(/^\/api\/channels\/([^/]+)\/threads\/([^/]+)\/messages$/);
  if (createMessageMatch && method === "POST") {
    const threadId = decodeURIComponent(createMessageMatch[2]);
    try {
      const thread = channelThreads.get(threadId);
      if (!thread) {
        return error("Thread not found", 404);
      }

      const body = await req.json();
      const { senderType, senderId, senderName, content, mentions, agentAction } = body;

      if (!senderType || !senderId || !senderName || !content) {
        return error("senderType, senderId, senderName, and content are required", 400);
      }

      const id = crypto.randomUUID();
      const now = Date.now();

      channelMessages.create(
        id,
        threadId,
        senderType,
        senderId,
        senderName,
        content,
        mentions || [],
        agentAction || null,
        now
      );

      const message = channelMessages.get(id);
      return json(message, 201);
    } catch (e: any) {
      return error(e.message || "Failed to create message", 500);
    }
  }

  // Delete a message
  // DELETE /api/channels/:channelId/threads/:threadId/messages/:messageId
  const deleteMessageMatch = path.match(/^\/api\/channels\/([^/]+)\/threads\/([^/]+)\/messages\/([^/]+)$/);
  if (deleteMessageMatch && method === "DELETE") {
    const messageId = decodeURIComponent(deleteMessageMatch[3]);
    const message = channelMessages.get(messageId);
    if (!message) {
      return error("Message not found", 404);
    }
    channelMessages.delete(messageId);
    return json({ success: true });
  }

  // No match
  return null;
}
