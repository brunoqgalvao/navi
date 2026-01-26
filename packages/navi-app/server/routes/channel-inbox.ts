/**
 * Channel Inbox Routes
 *
 * API endpoints for managing external messaging channels (WhatsApp, Telegram, etc.)
 * This integrates with MCP servers that handle the actual protocol communication.
 */

import { json, error } from "../utils/response";
import {
  channelManager,
  CHANNEL_PROVIDERS,
  type ChannelProviderType,
  type ChannelConnection,
  type ExternalChat,
  type ExternalMessage,
} from "../services/channel-providers";
import crypto from "crypto";

// In-memory storage for now (will migrate to DB later)
const connections: Map<string, ChannelConnection> = new Map();
const chats: Map<string, ExternalChat[]> = new Map(); // providerId -> chats
const messages: Map<string, ExternalMessage[]> = new Map(); // chatId -> messages

export async function handleChannelInboxRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const path = url.pathname;

  // ============================================================================
  // Providers
  // ============================================================================

  // GET /api/channels/providers - List available providers
  if (path === "/api/channels/providers" && method === "GET") {
    const providers = Object.values(CHANNEL_PROVIDERS).map((p) => ({
      type: p.type,
      name: p.name,
      icon: p.icon,
      color: p.color,
      description: p.description,
      capabilities: p.capabilities,
    }));
    return json(providers);
  }

  // ============================================================================
  // Connections
  // ============================================================================

  // GET /api/channels/connections - List all connections
  if (path === "/api/channels/connections" && method === "GET") {
    return json(Array.from(connections.values()));
  }

  // POST /api/channels/connections - Create a new connection
  if (path === "/api/channels/connections" && method === "POST") {
    try {
      const body = await req.json();
      const { provider } = body as { provider: ChannelProviderType };

      if (!provider || !CHANNEL_PROVIDERS[provider]) {
        return error("Invalid provider type", 400);
      }

      const id = crypto.randomUUID();
      const connection: ChannelConnection = {
        id,
        provider,
        status: "disconnected",
      };

      connections.set(id, connection);
      channelManager.registerConnection(connection);

      return json(connection, 201);
    } catch (e: any) {
      return error(e.message || "Failed to create connection", 500);
    }
  }

  // GET /api/channels/connections/:id - Get connection details
  const getConnectionMatch = path.match(/^\/api\/channels\/connections\/([^/]+)$/);
  if (getConnectionMatch && method === "GET") {
    const id = decodeURIComponent(getConnectionMatch[1]);
    const connection = connections.get(id);
    if (!connection) {
      return error("Connection not found", 404);
    }
    return json(connection);
  }

  // PUT /api/channels/connections/:id/status - Update connection status
  const updateStatusMatch = path.match(
    /^\/api\/channels\/connections\/([^/]+)\/status$/
  );
  if (updateStatusMatch && method === "PUT") {
    const id = decodeURIComponent(updateStatusMatch[1]);
    const connection = connections.get(id);
    if (!connection) {
      return error("Connection not found", 404);
    }

    try {
      const body = await req.json();
      const { status, accountName, accountId, error: errorMsg } = body;

      const updated: ChannelConnection = {
        ...connection,
        status: status || connection.status,
        accountName: accountName || connection.accountName,
        accountId: accountId || connection.accountId,
        error: errorMsg,
        lastSyncAt: Date.now(),
      };

      connections.set(id, updated);
      channelManager.updateConnectionStatus(id, updated.status, updated);

      return json(updated);
    } catch (e: any) {
      return error(e.message || "Failed to update connection", 500);
    }
  }

  // DELETE /api/channels/connections/:id - Delete a connection
  const deleteConnectionMatch = path.match(
    /^\/api\/channels\/connections\/([^/]+)$/
  );
  if (deleteConnectionMatch && method === "DELETE") {
    const id = decodeURIComponent(deleteConnectionMatch[1]);
    const connection = connections.get(id);
    if (!connection) {
      return error("Connection not found", 404);
    }

    connections.delete(id);
    chats.delete(id);
    channelManager.removeConnection(id);

    return json({ success: true });
  }

  // ============================================================================
  // Chats (Inbox)
  // ============================================================================

  // GET /api/channels/connections/:id/chats - List chats for a connection
  const listChatsMatch = path.match(
    /^\/api\/channels\/connections\/([^/]+)\/chats$/
  );
  if (listChatsMatch && method === "GET") {
    const connectionId = decodeURIComponent(listChatsMatch[1]);
    const connection = connections.get(connectionId);
    if (!connection) {
      return error("Connection not found", 404);
    }

    const connectionChats = chats.get(connectionId) || [];
    return json(connectionChats);
  }

  // POST /api/channels/connections/:id/chats/sync - Sync chats from provider
  const syncChatsMatch = path.match(
    /^\/api\/channels\/connections\/([^/]+)\/chats\/sync$/
  );
  if (syncChatsMatch && method === "POST") {
    const connectionId = decodeURIComponent(syncChatsMatch[1]);
    const connection = connections.get(connectionId);
    if (!connection) {
      return error("Connection not found", 404);
    }

    try {
      const body = await req.json();
      const { chats: syncedChats } = body as { chats: ExternalChat[] };

      if (!Array.isArray(syncedChats)) {
        return error("chats must be an array", 400);
      }

      // Update chats for this connection
      chats.set(connectionId, syncedChats);

      // Update connection sync time
      const updated: ChannelConnection = {
        ...connection,
        lastSyncAt: Date.now(),
      };
      connections.set(connectionId, updated);

      return json({ synced: syncedChats.length });
    } catch (e: any) {
      return error(e.message || "Failed to sync chats", 500);
    }
  }

  // ============================================================================
  // Messages
  // ============================================================================

  // GET /api/channels/chats/:chatId/messages - Get messages for a chat
  const listMessagesMatch = path.match(/^\/api\/channels\/chats\/([^/]+)\/messages$/);
  if (listMessagesMatch && method === "GET") {
    const chatId = decodeURIComponent(listMessagesMatch[1]);
    const chatMessages = messages.get(chatId) || [];

    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    return json(chatMessages.slice(offset, offset + limit));
  }

  // POST /api/channels/chats/:chatId/messages/sync - Sync messages from provider
  const syncMessagesMatch = path.match(
    /^\/api\/channels\/chats\/([^/]+)\/messages\/sync$/
  );
  if (syncMessagesMatch && method === "POST") {
    const chatId = decodeURIComponent(syncMessagesMatch[1]);

    try {
      const body = await req.json();
      const { messages: syncedMessages } = body as { messages: ExternalMessage[] };

      if (!Array.isArray(syncedMessages)) {
        return error("messages must be an array", 400);
      }

      // Merge with existing messages (dedup by id)
      const existing = messages.get(chatId) || [];
      const existingIds = new Set(existing.map((m) => m.id));
      const newMessages = syncedMessages.filter((m) => !existingIds.has(m.id));

      const merged = [...existing, ...newMessages].sort(
        (a, b) => a.timestamp - b.timestamp
      );
      messages.set(chatId, merged);

      // Notify about new messages
      for (const msg of newMessages) {
        channelManager.notifyNewMessage(msg);
      }

      return json({ synced: newMessages.length, total: merged.length });
    } catch (e: any) {
      return error(e.message || "Failed to sync messages", 500);
    }
  }

  // POST /api/channels/chats/:chatId/messages - Send a new message
  const sendMessageMatch = path.match(
    /^\/api\/channels\/chats\/([^/]+)\/messages$/
  );
  if (sendMessageMatch && method === "POST") {
    const chatId = decodeURIComponent(sendMessageMatch[1]);

    try {
      const body = await req.json();
      const { content, provider } = body as {
        content: string;
        provider: ChannelProviderType;
      };

      if (!content) {
        return error("content is required", 400);
      }

      // Create the outbound message record
      const message: ExternalMessage = {
        id: crypto.randomUUID(),
        chatId,
        provider,
        content,
        fromMe: true,
        senderName: "Navi",
        senderId: "navi",
        timestamp: Date.now(),
        type: "text",
      };

      // Add to local storage
      const chatMessages = messages.get(chatId) || [];
      chatMessages.push(message);
      messages.set(chatId, chatMessages);

      // The actual sending happens via MCP tools called by Claude
      // This just records the intent
      return json(message, 201);
    } catch (e: any) {
      return error(e.message || "Failed to send message", 500);
    }
  }

  // ============================================================================
  // Unified Inbox
  // ============================================================================

  // GET /api/channels/inbox - Get unified inbox across all providers
  if (path === "/api/channels/inbox" && method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const unreadOnly = url.searchParams.get("unread") === "true";

    // Collect all chats from all connections
    const allChats: (ExternalChat & { connectionId: string })[] = [];

    for (const [connectionId, connectionChats] of chats.entries()) {
      for (const chat of connectionChats) {
        if (!unreadOnly || chat.unreadCount > 0) {
          allChats.push({ ...chat, connectionId });
        }
      }
    }

    // Sort by last message time (most recent first)
    allChats.sort((a, b) => {
      const aTime = a.lastMessage?.timestamp || 0;
      const bTime = b.lastMessage?.timestamp || 0;
      return bTime - aTime;
    });

    return json(allChats.slice(0, limit));
  }

  // GET /api/channels/inbox/unread-count - Get total unread count
  if (path === "/api/channels/inbox/unread-count" && method === "GET") {
    let total = 0;
    for (const connectionChats of chats.values()) {
      for (const chat of connectionChats) {
        total += chat.unreadCount;
      }
    }
    return json({ count: total });
  }

  // ============================================================================
  // WhatsApp-specific endpoints
  // ============================================================================

  // POST /api/channels/whatsapp/sync-status - Sync WhatsApp status from MCP response
  if (path === "/api/channels/whatsapp/sync-status" && method === "POST") {
    try {
      const body = await req.json();
      const { connectionId, status, accountName, accountId, needsAuth, error: errorMsg } = body;

      const connection = connections.get(connectionId);
      if (!connection || connection.provider !== "whatsapp") {
        return error("WhatsApp connection not found", 404);
      }

      const updated: ChannelConnection = {
        ...connection,
        status: needsAuth ? "connecting" : status ? "connected" : "error",
        accountName,
        accountId,
        error: errorMsg,
        lastSyncAt: Date.now(),
      };

      connections.set(connectionId, updated);
      channelManager.updateConnectionStatus(connectionId, updated.status, updated);

      return json(updated);
    } catch (e: any) {
      return error(e.message || "Failed to sync WhatsApp status", 500);
    }
  }

  // POST /api/channels/whatsapp/sync-chats - Sync WhatsApp chats from MCP response
  if (path === "/api/channels/whatsapp/sync-chats" && method === "POST") {
    try {
      const body = await req.json();
      const { connectionId, rawResponse } = body;

      const connection = connections.get(connectionId);
      if (!connection || connection.provider !== "whatsapp") {
        return error("WhatsApp connection not found", 404);
      }

      // Parse the raw MCP response
      let parsedChats: ExternalChat[] = [];
      try {
        const rawChats = JSON.parse(rawResponse);
        parsedChats = rawChats.map((chat: any) => ({
          id: chat.id,
          provider: "whatsapp" as const,
          name: chat.name || "Unknown",
          isGroup: chat.isGroup || false,
          unreadCount: chat.unreadCount || 0,
          lastMessage: chat.lastMessage
            ? {
                content: typeof chat.lastMessage === "string" ? chat.lastMessage : chat.lastMessage,
                timestamp: chat.timestamp ? new Date(chat.timestamp).getTime() : Date.now(),
                fromMe: false,
              }
            : undefined,
        }));
      } catch (parseError) {
        console.error("[channel-inbox] Failed to parse WhatsApp chats:", parseError);
        return error("Failed to parse WhatsApp response", 400);
      }

      // Update chats
      chats.set(connectionId, parsedChats);

      // Update connection status
      const updated: ChannelConnection = {
        ...connection,
        status: "connected",
        lastSyncAt: Date.now(),
      };
      connections.set(connectionId, updated);

      return json({ synced: parsedChats.length, chats: parsedChats });
    } catch (e: any) {
      return error(e.message || "Failed to sync WhatsApp chats", 500);
    }
  }

  // GET /api/channels/whatsapp/mcp-prompt - Get prompt for Claude to sync WhatsApp
  if (path === "/api/channels/whatsapp/mcp-prompt" && method === "GET") {
    const connectionId = url.searchParams.get("connectionId");
    const action = url.searchParams.get("action") || "status";

    let prompt: string;
    switch (action) {
      case "list_chats":
        prompt = "Use the whatsapp_list_chats tool to get my recent WhatsApp conversations.";
        break;
      case "read_chat":
        const chatId = url.searchParams.get("chatId");
        prompt = chatId
          ? `Use the whatsapp_read_chat tool to read messages from chat "${chatId}".`
          : "Use the whatsapp_list_chats tool first to find the chat you want to read.";
        break;
      case "send":
        const to = url.searchParams.get("to");
        const message = url.searchParams.get("message");
        prompt = to && message
          ? `Use the whatsapp_send tool to send "${message}" to "${to}".`
          : "Please specify both 'to' and 'message' parameters to send a WhatsApp message.";
        break;
      default:
        prompt = "Use the whatsapp_status tool to check if WhatsApp is connected.";
    }

    return json({ prompt, connectionId, action });
  }

  // No match
  return null;
}
