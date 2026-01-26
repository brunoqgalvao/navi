/**
 * Channel Inbox Types
 *
 * Frontend types for the messaging channel integration (WhatsApp, Telegram, etc.)
 */

export type ChannelProviderType = "whatsapp" | "telegram" | "email" | "slack" | "discord";

export interface ChannelProvider {
  type: ChannelProviderType;
  name: string;
  icon: string;
  color: string;
  description: string;
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
  connectionId: string;
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

// Provider icons and colors (matching backend)
export const PROVIDER_CONFIGS: Record<ChannelProviderType, { icon: string; color: string; bg: string }> = {
  whatsapp: { icon: "💬", color: "#25D366", bg: "bg-green-500" },
  telegram: { icon: "✈️", color: "#0088cc", bg: "bg-blue-500" },
  email: { icon: "📧", color: "#EA4335", bg: "bg-red-500" },
  slack: { icon: "💼", color: "#4A154B", bg: "bg-purple-700" },
  discord: { icon: "🎮", color: "#5865F2", bg: "bg-indigo-500" },
};
