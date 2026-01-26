/**
 * Channel Inbox Feature
 *
 * External messaging integrations (WhatsApp, Telegram, Email, etc.)
 */

// Types
export * from "./types";

// API
export { channelInboxApi } from "./api";

// Stores
export {
  providers,
  connections,
  inbox,
  messages,
  selectedChatId,
  selectedChat,
  selectedChatMessages,
  totalUnreadCount,
} from "./stores";
