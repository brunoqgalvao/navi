#!/usr/bin/env bun
/**
 * Navi WhatsApp MCP Server
 *
 * Provides WhatsApp messaging via whatsapp-web.js (unofficial API).
 * On first run, displays QR code in terminal for authentication.
 * Session is persisted to ~/.claude-code-ui/whatsapp-session/
 *
 * Tools: whatsapp_status, whatsapp_send, whatsapp_list_chats, whatsapp_read_chat, whatsapp_search_contacts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { homedir } from "os";
import { join } from "path";

const SESSION_PATH = join(homedir(), ".claude-code-ui", "whatsapp-session");

// WhatsApp client setup
let client: InstanceType<typeof Client>;
let isReady = false;
let qrCode: string | null = null;

function initClient() {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH,
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    qrCode = qr;
    console.error("\n=== WhatsApp QR Code ===");
    console.error("Scan this QR code with WhatsApp on your phone:\n");
    qrcode.generate(qr, { small: true });
    console.error("\nWaiting for authentication...\n");
  });

  client.on("ready", () => {
    isReady = true;
    qrCode = null;
    console.error("WhatsApp client is ready!");
  });

  client.on("authenticated", () => {
    console.error("WhatsApp authenticated successfully!");
  });

  client.on("auth_failure", (msg) => {
    console.error("WhatsApp authentication failed:", msg);
    isReady = false;
  });

  client.on("disconnected", (reason) => {
    console.error("WhatsApp disconnected:", reason);
    isReady = false;
  });

  client.initialize().catch((err) => {
    console.error("Failed to initialize WhatsApp client:", err);
  });
}

// Initialize client on startup
initClient();

// Tool definitions
const tools: Tool[] = [
  {
    name: "whatsapp_status",
    description: "Check WhatsApp connection status. If not authenticated, provides QR code instructions.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "whatsapp_send",
    description: "Send a WhatsApp message to a phone number or contact name",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Phone number with country code (e.g., '5511999999999') or contact name",
        },
        message: {
          type: "string",
          description: "Message text to send",
        },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "whatsapp_list_chats",
    description: "List recent WhatsApp chats",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of chats to return (default: 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "whatsapp_read_chat",
    description: "Read messages from a specific chat",
    inputSchema: {
      type: "object",
      properties: {
        chatId: {
          type: "string",
          description: "Chat ID (from whatsapp_list_chats) or phone number with country code",
        },
        limit: {
          type: "number",
          description: "Number of messages to fetch (default: 20)",
        },
      },
      required: ["chatId"],
    },
  },
  {
    name: "whatsapp_search_contacts",
    description: "Search for contacts by name or phone number",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (name or phone number)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "whatsapp_get_contact_info",
    description: "Get detailed info about a contact",
    inputSchema: {
      type: "object",
      properties: {
        contactId: {
          type: "string",
          description: "Contact ID or phone number with country code",
        },
      },
      required: ["contactId"],
    },
  },
  {
    name: "whatsapp_mark_read",
    description: "Mark all messages in a chat as read",
    inputSchema: {
      type: "object",
      properties: {
        chatId: {
          type: "string",
          description: "Chat ID to mark as read",
        },
      },
      required: ["chatId"],
    },
  },
];

// Helper to format phone number to WhatsApp ID
function formatPhoneToId(phone: string): string {
  // Remove any non-digit characters
  const cleaned = phone.replace(/\D/g, "");
  // Add WhatsApp suffix
  return `${cleaned}@c.us`;
}

// Tool handlers
async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  // Status check doesn't require client to be ready
  if (name === "whatsapp_status") {
    if (isReady) {
      const info = client.info;
      return `WhatsApp is connected!\nAccount: ${info?.pushname || "Unknown"}\nNumber: ${info?.wid?.user || "Unknown"}`;
    } else if (qrCode) {
      return `WhatsApp needs authentication.\n\nA QR code has been displayed in the terminal where the MCP server is running.\nPlease scan it with WhatsApp on your phone (Settings > Linked Devices > Link a Device).\n\nAfter scanning, try this tool again to verify connection.`;
    } else {
      return "WhatsApp is initializing... Please wait a moment and try again.";
    }
  }

  // All other tools require ready client
  if (!isReady) {
    return "WhatsApp is not connected. Use whatsapp_status to check authentication status and scan QR code if needed.";
  }

  switch (name) {
    case "whatsapp_send": {
      const { to, message } = args as { to: string; message: string };

      // Try to find contact by name first
      let chatId = to;
      if (!/^\d+$/.test(to.replace(/\D/g, ""))) {
        // It's a name, search for contact
        const contacts = await client.getContacts();
        const found = contacts.find(
          (c) => c.name?.toLowerCase().includes(to.toLowerCase()) ||
                 c.pushname?.toLowerCase().includes(to.toLowerCase())
        );
        if (found) {
          chatId = found.id._serialized;
        } else {
          return `Contact "${to}" not found. Please use a phone number with country code instead.`;
        }
      } else {
        chatId = formatPhoneToId(to);
      }

      await client.sendMessage(chatId, message);
      return `Message sent successfully to ${to}`;
    }

    case "whatsapp_list_chats": {
      const { limit = 20 } = args as { limit?: number };
      const chats = await client.getChats();

      const result = chats.slice(0, limit).map((chat) => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage?.body?.substring(0, 50) || "(no message)",
        timestamp: chat.lastMessage?.timestamp
          ? new Date(chat.lastMessage.timestamp * 1000).toISOString()
          : null,
      }));

      return JSON.stringify(result, null, 2);
    }

    case "whatsapp_read_chat": {
      const { chatId, limit = 20 } = args as { chatId: string; limit?: number };

      // Format phone number if needed
      const id = chatId.includes("@") ? chatId : formatPhoneToId(chatId);

      const chat = await client.getChatById(id);
      const messages = await chat.fetchMessages({ limit });

      const result = messages.map((msg) => ({
        id: msg.id._serialized,
        from: msg.from,
        fromMe: msg.fromMe,
        body: msg.body,
        timestamp: new Date(msg.timestamp * 1000).toISOString(),
        type: msg.type,
      }));

      return JSON.stringify(result.reverse(), null, 2);
    }

    case "whatsapp_search_contacts": {
      const { query } = args as { query: string };
      const contacts = await client.getContacts();

      const matches = contacts.filter(
        (c) =>
          c.name?.toLowerCase().includes(query.toLowerCase()) ||
          c.pushname?.toLowerCase().includes(query.toLowerCase()) ||
          c.number?.includes(query)
      );

      const result = matches.slice(0, 20).map((c) => ({
        id: c.id._serialized,
        name: c.name || c.pushname || "Unknown",
        number: c.number,
        isMyContact: c.isMyContact,
        isGroup: c.isGroup,
      }));

      return result.length > 0
        ? JSON.stringify(result, null, 2)
        : `No contacts found matching "${query}"`;
    }

    case "whatsapp_get_contact_info": {
      const { contactId } = args as { contactId: string };
      const id = contactId.includes("@") ? contactId : formatPhoneToId(contactId);

      const contact = await client.getContactById(id);

      return JSON.stringify(
        {
          id: contact.id._serialized,
          name: contact.name,
          pushname: contact.pushname,
          number: contact.number,
          isMyContact: contact.isMyContact,
          isGroup: contact.isGroup,
          isBlocked: contact.isBlocked,
        },
        null,
        2
      );
    }

    case "whatsapp_mark_read": {
      const { chatId } = args as { chatId: string };
      const id = chatId.includes("@") ? chatId : formatPhoneToId(chatId);

      const chat = await client.getChatById(id);
      await chat.sendSeen();

      return `Marked chat as read: ${chat.name || chatId}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run server
const server = new Server(
  { name: "navi-whatsapp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await handleTool(request.params.name, request.params.arguments ?? {});
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Navi WhatsApp MCP server running...");
