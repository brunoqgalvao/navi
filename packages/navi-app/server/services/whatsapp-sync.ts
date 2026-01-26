/**
 * WhatsApp Sync Service
 *
 * Syncs WhatsApp chats and messages to the channel inbox system.
 * Uses the navi-whatsapp MCP server tools.
 *
 * Note: This service runs on the Navi backend and communicates with the
 * WhatsApp MCP server that Claude uses. The MCP tools are called via
 * the active Claude session when available.
 */

import { channelManager, type ExternalChat, type ExternalMessage } from "./channel-providers";

// Store the last sync timestamp per connection
const lastSyncTimes: Map<string, number> = new Map();

// Poll interval in milliseconds (30 seconds)
const POLL_INTERVAL = 30000;

// Active polling intervals
const pollIntervals: Map<string, NodeJS.Timeout> = new Map();

/**
 * Parse WhatsApp chat list from MCP tool response
 */
export function parseWhatsAppChats(responseJson: string): ExternalChat[] {
  try {
    const chats = JSON.parse(responseJson);
    return chats.map((chat: any) => ({
      id: chat.id,
      provider: "whatsapp" as const,
      name: chat.name || "Unknown",
      isGroup: chat.isGroup || false,
      unreadCount: chat.unreadCount || 0,
      lastMessage: chat.lastMessage
        ? {
            content: chat.lastMessage,
            timestamp: chat.timestamp ? new Date(chat.timestamp).getTime() : Date.now(),
            fromMe: false,
          }
        : undefined,
    }));
  } catch (e) {
    console.error("[whatsapp-sync] Failed to parse chats:", e);
    return [];
  }
}

/**
 * Parse WhatsApp messages from MCP tool response
 */
export function parseWhatsAppMessages(chatId: string, responseJson: string): ExternalMessage[] {
  try {
    const messages = JSON.parse(responseJson);
    return messages.map((msg: any) => ({
      id: msg.id,
      chatId,
      provider: "whatsapp" as const,
      content: msg.body || "",
      fromMe: msg.fromMe || false,
      senderName: msg.from || "Unknown",
      senderId: msg.from || "",
      timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
      type: msg.type === "chat" ? "text" : msg.type,
      mediaUrl: msg.mediaUrl,
    }));
  } catch (e) {
    console.error("[whatsapp-sync] Failed to parse messages:", e);
    return [];
  }
}

/**
 * Parse WhatsApp status from MCP tool response
 */
export function parseWhatsAppStatus(response: string): {
  connected: boolean;
  accountName?: string;
  accountId?: string;
  needsAuth: boolean;
} {
  const connected = response.includes("WhatsApp is connected");
  const needsAuth = response.includes("QR code") || response.includes("needs authentication");

  // Extract account info if connected
  let accountName: string | undefined;
  let accountId: string | undefined;

  if (connected) {
    const accountMatch = response.match(/Account: (.+)/);
    const numberMatch = response.match(/Number: (\d+)/);
    accountName = accountMatch?.[1];
    accountId = numberMatch?.[1];
  }

  return { connected, accountName, accountId, needsAuth };
}

/**
 * Start polling for new messages on a connection
 */
export function startPolling(connectionId: string): void {
  if (pollIntervals.has(connectionId)) {
    return; // Already polling
  }

  console.log(`[whatsapp-sync] Starting polling for connection ${connectionId}`);

  const interval = setInterval(() => {
    channelManager.emit("poll:tick", connectionId);
  }, POLL_INTERVAL);

  pollIntervals.set(connectionId, interval);
}

/**
 * Stop polling for a connection
 */
export function stopPolling(connectionId: string): void {
  const interval = pollIntervals.get(connectionId);
  if (interval) {
    clearInterval(interval);
    pollIntervals.delete(connectionId);
    console.log(`[whatsapp-sync] Stopped polling for connection ${connectionId}`);
  }
}

/**
 * Update the last sync time for a connection
 */
export function updateLastSyncTime(connectionId: string): void {
  lastSyncTimes.set(connectionId, Date.now());
}

/**
 * Get the last sync time for a connection
 */
export function getLastSyncTime(connectionId: string): number | undefined {
  return lastSyncTimes.get(connectionId);
}

/**
 * Create MCP tool call format for Claude to execute
 * This returns the tool call that Claude should make to sync WhatsApp
 */
export function createWhatsAppSyncPrompt(connectionId: string): string {
  return `Please check my WhatsApp connection status and list recent chats using the whatsapp_status and whatsapp_list_chats tools. This is for syncing my channel inbox.`;
}

/**
 * WhatsApp message listener setup
 *
 * Call this when setting up a new WhatsApp connection to listen for incoming messages.
 * The actual listening happens in the MCP server, but we set up the handler here.
 */
export function setupMessageListener(connectionId: string): void {
  // Listen for poll ticks
  channelManager.on("poll:tick", (tickConnectionId: string) => {
    if (tickConnectionId === connectionId) {
      // In a real implementation, this would trigger a sync via Claude
      // For now, we just emit an event that the UI can handle
      channelManager.emit("sync:needed", connectionId);
    }
  });
}
