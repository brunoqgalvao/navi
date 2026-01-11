/**
 * Email API Routes (AgentMail integration)
 *
 * Provides email capabilities for Navi
 */

import { json, error } from "../utils/response";

const AGENTMAIL_API_BASE = "https://api.agentmail.to/v0";

// Get API key from environment
function getApiKey(): string | null {
  return process.env.AGENTMAIL_API_KEY || null;
}

async function agentmailRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("AGENTMAIL_API_KEY not configured");
  }

  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${AGENTMAIL_API_BASE}${path}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AgentMail API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function handleEmailRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/email/inboxes - List all inboxes
  if (url.pathname === "/api/email/inboxes" && method === "GET") {
    try {
      const result = await agentmailRequest("GET", "/inboxes");
      return json(result);
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to fetch inboxes", 500);
    }
  }

  // POST /api/email/inboxes - Create new inbox
  if (url.pathname === "/api/email/inboxes" && method === "POST") {
    try {
      const body = await req.json() as { username: string; domain?: string; display_name?: string };
      const result = await agentmailRequest("POST", "/inboxes", body);
      return json(result);
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to create inbox", 500);
    }
  }

  // GET /api/email/inbox/:inbox/messages - List messages in inbox
  const messagesMatch = url.pathname.match(/^\/api\/email\/inbox\/([^/]+)\/messages$/);
  if (messagesMatch && method === "GET") {
    const inboxId = decodeURIComponent(messagesMatch[1]);
    const limit = url.searchParams.get("limit") || "20";

    try {
      const result = await agentmailRequest("GET", `/inboxes/${encodeURIComponent(inboxId)}/messages?limit=${limit}`);
      return json(result);
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to fetch messages", 500);
    }
  }

  // GET /api/email/message/:inbox/:messageId - Get specific message
  const messageMatch = url.pathname.match(/^\/api\/email\/message\/([^/]+)\/([^/]+)$/);
  if (messageMatch && method === "GET") {
    const inboxId = decodeURIComponent(messageMatch[1]);
    const messageId = decodeURIComponent(messageMatch[2]);

    try {
      const result = await agentmailRequest("GET", `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`);
      return json(result);
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to fetch message", 500);
    }
  }

  // POST /api/email/send - Send email
  if (url.pathname === "/api/email/send" && method === "POST") {
    try {
      const body = await req.json() as { from: string; to: string; subject: string; text: string; html?: string };
      const result = await agentmailRequest("POST", `/inboxes/${encodeURIComponent(body.from)}/messages/send`, {
        to: body.to,
        subject: body.subject,
        text: body.text,
        html: body.html,
      });
      return json(result);
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to send email", 500);
    }
  }

  // POST /api/email/extract-link - Extract first link from message
  if (url.pathname === "/api/email/extract-link" && method === "POST") {
    try {
      const body = await req.json() as { inbox: string; messageId: string };
      const message = await agentmailRequest("GET", `/inboxes/${encodeURIComponent(body.inbox)}/messages/${encodeURIComponent(body.messageId)}`) as {
        text?: string;
        body_text?: string;
        html?: string;
        body_html?: string;
      };

      // Get text content
      const content = message.text || message.body_text || message.html || message.body_html || "";

      // Find URLs
      const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
      const links = content.match(urlRegex) || [];

      // Filter out common non-verification links
      const filteredLinks = links.filter(link =>
        !link.includes("unsubscribe") &&
        !link.includes("privacy") &&
        !link.includes("terms") &&
        !link.includes("facebook.com") &&
        !link.includes("twitter.com") &&
        !link.includes("linkedin.com")
      );

      if (filteredLinks.length === 0) {
        return error("No links found in email", 404);
      }

      return json({ link: filteredLinks[0] });
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to extract link", 500);
    }
  }

  // Not handled by this router
  return null;
}
