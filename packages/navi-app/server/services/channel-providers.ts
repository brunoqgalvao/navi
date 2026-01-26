/**
 * Channel Providers Service
 *
 * Manages external messaging channel integrations (WhatsApp, Telegram, Email, etc.)
 * Each provider connects to an MCP server that handles the actual protocol.
 *
 * Architecture inspired by Clawbot's channel abstraction.
 */

import { EventEmitter } from "events";

// ============================================================================
// Types
// ============================================================================

export type ChannelProviderType = "whatsapp" | "telegram" | "email" | "slack" | "discord";

export interface ChannelProviderConfig {
  type: ChannelProviderType;
  name: string;
  icon: string;
  color: string;
  description: string;
  mcpServerName: string; // Name in .mcp.json
  capabilities: ChannelCapability[];
}

export type ChannelCapability =
  | "send_text"
  | "send_media"
  | "read_messages"
  | "list_chats"
  | "search_contacts"
  | "groups"
  | "reactions"
  | "typing_indicator";

export interface ChannelConnection {
  id: string;
  provider: ChannelProviderType;
  status: "disconnected" | "connecting" | "connected" | "error";
  accountName?: string;
  accountId?: string;
  lastSyncAt?: number;
  error?: string;
}

export interface ExternalChat {
  id: string;
  provider: ChannelProviderType;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: {
    content: string;
    timestamp: number;
    fromMe: boolean;
  };
  avatarUrl?: string;
}

export interface ExternalMessage {
  id: string;
  chatId: string;
  provider: ChannelProviderType;
  content: string;
  fromMe: boolean;
  senderName: string;
  senderId: string;
  timestamp: number;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker";
  mediaUrl?: string;
}

// ============================================================================
// Provider Registry
// ============================================================================

export const CHANNEL_PROVIDERS: Record<ChannelProviderType, ChannelProviderConfig> = {
  whatsapp: {
    type: "whatsapp",
    name: "WhatsApp",
    icon: "💬",
    color: "#25D366",
    description: "Connect via WhatsApp Web QR code",
    mcpServerName: "navi-whatsapp",
    capabilities: [
      "send_text",
      "send_media",
      "read_messages",
      "list_chats",
      "search_contacts",
      "groups",
    ],
  },
  telegram: {
    type: "telegram",
    name: "Telegram",
    icon: "✈️",
    color: "#0088cc",
    description: "Connect via Telegram Bot API",
    mcpServerName: "navi-telegram",
    capabilities: [
      "send_text",
      "send_media",
      "read_messages",
      "list_chats",
      "groups",
      "reactions",
    ],
  },
  email: {
    type: "email",
    name: "Email",
    icon: "📧",
    color: "#EA4335",
    description: "AgentMail inbox for autonomous agents",
    mcpServerName: "navi-email",
    capabilities: ["send_text", "read_messages", "list_chats"],
  },
  slack: {
    type: "slack",
    name: "Slack",
    icon: "💼",
    color: "#4A154B",
    description: "Connect to Slack workspace",
    mcpServerName: "navi-slack",
    capabilities: [
      "send_text",
      "send_media",
      "read_messages",
      "list_chats",
      "groups",
      "reactions",
      "typing_indicator",
    ],
  },
  discord: {
    type: "discord",
    name: "Discord",
    icon: "🎮",
    color: "#5865F2",
    description: "Connect Discord bot",
    mcpServerName: "navi-discord",
    capabilities: [
      "send_text",
      "send_media",
      "read_messages",
      "list_chats",
      "groups",
      "reactions",
    ],
  },
};

// ============================================================================
// Channel Manager
// ============================================================================

class ChannelManager extends EventEmitter {
  private connections: Map<string, ChannelConnection> = new Map();
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
  }

  /**
   * Get all registered provider configs
   */
  getProviders(): ChannelProviderConfig[] {
    return Object.values(CHANNEL_PROVIDERS);
  }

  /**
   * Get provider config by type
   */
  getProvider(type: ChannelProviderType): ChannelProviderConfig | undefined {
    return CHANNEL_PROVIDERS[type];
  }

  /**
   * Register a channel connection
   */
  registerConnection(connection: ChannelConnection): void {
    this.connections.set(connection.id, connection);
    this.emit("connection:added", connection);
  }

  /**
   * Update connection status
   */
  updateConnectionStatus(
    id: string,
    status: ChannelConnection["status"],
    details?: Partial<ChannelConnection>
  ): void {
    const connection = this.connections.get(id);
    if (connection) {
      const updated = { ...connection, status, ...details };
      this.connections.set(id, updated);
      this.emit("connection:updated", updated);
    }
  }

  /**
   * Get all connections
   */
  getConnections(): ChannelConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection by ID
   */
  getConnection(id: string): ChannelConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Get connections by provider type
   */
  getConnectionsByProvider(provider: ChannelProviderType): ChannelConnection[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.provider === provider
    );
  }

  /**
   * Remove a connection
   */
  removeConnection(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      this.connections.delete(id);
      this.stopPolling(id);
      this.emit("connection:removed", connection);
    }
  }

  /**
   * Start polling for new messages
   */
  startPolling(connectionId: string, intervalMs: number = 30000): void {
    if (this.pollIntervals.has(connectionId)) {
      return; // Already polling
    }

    const interval = setInterval(() => {
      this.emit("poll:tick", connectionId);
    }, intervalMs);

    this.pollIntervals.set(connectionId, interval);
  }

  /**
   * Stop polling for a connection
   */
  stopPolling(connectionId: string): void {
    const interval = this.pollIntervals.get(connectionId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(connectionId);
    }
  }

  /**
   * Emit a new message event
   */
  notifyNewMessage(message: ExternalMessage): void {
    this.emit("message:received", message);
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    for (const [id] of this.pollIntervals) {
      this.stopPolling(id);
    }
    this.connections.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const channelManager = new ChannelManager();

// ============================================================================
// Database Schema Extension
// ============================================================================

/**
 * SQL to add channel provider tracking tables.
 * Run this in db.ts initialization.
 */
export const CHANNEL_PROVIDER_SCHEMA = `
  -- Channel provider connections (WhatsApp, Telegram, etc.)
  CREATE TABLE IF NOT EXISTS channel_providers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'disconnected',
    account_name TEXT,
    account_id TEXT,
    config TEXT DEFAULT '{}',
    last_sync_at INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_channel_providers_type ON channel_providers(type);
  CREATE INDEX IF NOT EXISTS idx_channel_providers_status ON channel_providers(status);

  -- External chats synced from providers
  CREATE TABLE IF NOT EXISTS external_chats (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_group INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    last_message_content TEXT,
    last_message_at INTEGER,
    avatar_url TEXT,
    linked_session_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES channel_providers(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_session_id) REFERENCES sessions(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_external_chats_provider ON external_chats(provider_id);
  CREATE INDEX IF NOT EXISTS idx_external_chats_external ON external_chats(external_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_external_chats_unique ON external_chats(provider_id, external_id);

  -- External messages synced from providers
  CREATE TABLE IF NOT EXISTS external_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    content TEXT NOT NULL,
    from_me INTEGER DEFAULT 0,
    sender_name TEXT,
    sender_id TEXT,
    message_type TEXT DEFAULT 'text',
    media_url TEXT,
    timestamp INTEGER NOT NULL,
    synced_to_session INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES external_chats(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_external_messages_chat ON external_messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_external_messages_timestamp ON external_messages(timestamp);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_external_messages_unique ON external_messages(chat_id, external_id);
`;
