#!/usr/bin/env bun
/**
 * Navi Email MCP Server
 *
 * Provides email capabilities via AgentMail API.
 * Tools: list_inboxes, create_inbox, list_emails, read_email, send_email, wait_for_email
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

const AGENTMAIL_API = "https://api.agentmail.to/v0";
const API_KEY = process.env.AGENTMAIL_API_KEY;

if (!API_KEY) {
  console.error("AGENTMAIL_API_KEY environment variable is required");
  process.exit(1);
}

// API helper
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AGENTMAIL_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`AgentMail API error: ${res.status} - ${error}`);
  }

  return res.json();
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "email_list_inboxes",
    description: "List all email inboxes available to Navi",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "email_create_inbox",
    description: "Create a new email inbox with a custom username (e.g., 'navi-support' becomes 'navi-support@agentmail.to')",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "The username part of the email address (before @agentmail.to)",
        },
      },
      required: ["username"],
    },
  },
  {
    name: "email_list_messages",
    description: "List recent emails in an inbox",
    inputSchema: {
      type: "object",
      properties: {
        inbox: {
          type: "string",
          description: "The inbox address (e.g., 'navi@agentmail.to')",
        },
        limit: {
          type: "number",
          description: "Number of emails to fetch (default: 20, max: 100)",
        },
      },
      required: ["inbox"],
    },
  },
  {
    name: "email_read_message",
    description: "Read the full content of an email message",
    inputSchema: {
      type: "object",
      properties: {
        inbox: {
          type: "string",
          description: "The inbox address",
        },
        messageId: {
          type: "string",
          description: "The message ID to read",
        },
      },
      required: ["inbox", "messageId"],
    },
  },
  {
    name: "email_send",
    description: "Send an email from Navi",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Sender inbox address (must be an inbox you own)",
        },
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        body: {
          type: "string",
          description: "Email body (plain text or HTML)",
        },
        html: {
          type: "boolean",
          description: "Whether the body is HTML (default: false)",
        },
      },
      required: ["from", "to", "subject", "body"],
    },
  },
  {
    name: "email_wait_for_message",
    description: "Wait for a new email to arrive in an inbox (useful for verification flows). Polls every 5 seconds for up to the specified timeout.",
    inputSchema: {
      type: "object",
      properties: {
        inbox: {
          type: "string",
          description: "The inbox address to monitor",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 60, max: 300)",
        },
        fromFilter: {
          type: "string",
          description: "Optional: only return emails from this sender",
        },
        subjectFilter: {
          type: "string",
          description: "Optional: only return emails with subject containing this text",
        },
      },
      required: ["inbox"],
    },
  },
  {
    name: "email_extract_link",
    description: "Extract the first meaningful link from an email (filters out unsubscribe/privacy/social links). Useful for verification emails.",
    inputSchema: {
      type: "object",
      properties: {
        inbox: {
          type: "string",
          description: "The inbox address",
        },
        messageId: {
          type: "string",
          description: "The message ID",
        },
      },
      required: ["inbox", "messageId"],
    },
  },
];

// Tool handlers
async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "email_list_inboxes": {
      const result = await api<{ inboxes: Array<{ address: string; created_at: string }> }>("/inboxes");
      return JSON.stringify(result.inboxes, null, 2);
    }

    case "email_create_inbox": {
      const { username } = args as { username: string };
      const result = await api<{ inbox: { address: string } }>("/inboxes", {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      return `Created inbox: ${result.inbox.address}`;
    }

    case "email_list_messages": {
      const { inbox, limit = 20 } = args as { inbox: string; limit?: number };
      const result = await api<{ messages: Array<{ id: string; from: string; subject: string; snippet: string; date: string }> }>(
        `/inboxes/${encodeURIComponent(inbox)}/messages?limit=${Math.min(limit, 100)}`
      );

      if (result.messages.length === 0) {
        return "No messages in inbox.";
      }

      return result.messages.map(m =>
        `ID: ${m.id}\nFrom: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\nPreview: ${m.snippet}\n---`
      ).join("\n");
    }

    case "email_read_message": {
      const { inbox, messageId } = args as { inbox: string; messageId: string };
      const result = await api<{ message: { id: string; from: string; to: string; subject: string; body: string; html?: string; date: string } }>(
        `/inboxes/${encodeURIComponent(inbox)}/messages/${messageId}`
      );

      const m = result.message;
      return `From: ${m.from}\nTo: ${m.to}\nSubject: ${m.subject}\nDate: ${m.date}\n\n${m.body || m.html || "(empty body)"}`;
    }

    case "email_send": {
      const { from, to, subject, body, html = false } = args as {
        from: string; to: string; subject: string; body: string; html?: boolean
      };

      await api("/messages", {
        method: "POST",
        body: JSON.stringify({
          from,
          to,
          subject,
          [html ? "html" : "text"]: body,
        }),
      });

      return `Email sent successfully from ${from} to ${to}`;
    }

    case "email_wait_for_message": {
      const { inbox, timeout = 60, fromFilter, subjectFilter } = args as {
        inbox: string; timeout?: number; fromFilter?: string; subjectFilter?: string;
      };

      const maxTimeout = Math.min(timeout, 300);
      const startTime = Date.now();
      const pollInterval = 5000;

      // Get initial message count
      const initial = await api<{ messages: Array<{ id: string }> }>(
        `/inboxes/${encodeURIComponent(inbox)}/messages?limit=1`
      );
      const initialId = initial.messages[0]?.id;

      while ((Date.now() - startTime) < maxTimeout * 1000) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const current = await api<{ messages: Array<{ id: string; from: string; subject: string; snippet: string; date: string }> }>(
          `/inboxes/${encodeURIComponent(inbox)}/messages?limit=10`
        );

        // Find new messages
        for (const msg of current.messages) {
          if (msg.id === initialId) break;

          // Apply filters
          if (fromFilter && !msg.from.toLowerCase().includes(fromFilter.toLowerCase())) continue;
          if (subjectFilter && !msg.subject.toLowerCase().includes(subjectFilter.toLowerCase())) continue;

          return `New email received!\nID: ${msg.id}\nFrom: ${msg.from}\nSubject: ${msg.subject}\nPreview: ${msg.snippet}`;
        }
      }

      return `Timeout: No matching email received within ${maxTimeout} seconds`;
    }

    case "email_extract_link": {
      const { inbox, messageId } = args as { inbox: string; messageId: string };
      const result = await api<{ message: { body: string; html?: string } }>(
        `/inboxes/${encodeURIComponent(inbox)}/messages/${messageId}`
      );

      const content = result.message.html || result.message.body || "";

      // Extract URLs
      const urlRegex = /https?:\/\/[^\s<>"']+/g;
      const urls = content.match(urlRegex) || [];

      // Filter out common noise
      const filtered = urls.filter(url => {
        const lower = url.toLowerCase();
        return !lower.includes("unsubscribe") &&
               !lower.includes("privacy") &&
               !lower.includes("terms") &&
               !lower.includes("facebook.com") &&
               !lower.includes("twitter.com") &&
               !lower.includes("linkedin.com") &&
               !lower.includes("instagram.com");
      });

      if (filtered.length === 0) {
        return "No meaningful links found in the email.";
      }

      return `First link: ${filtered[0]}\n\nAll links found:\n${filtered.join("\n")}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run server
const server = new Server(
  { name: "navi-email", version: "1.0.0" },
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
console.error("Navi Email MCP server running...");
