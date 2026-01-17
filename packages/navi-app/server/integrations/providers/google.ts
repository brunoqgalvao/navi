/**
 * Google Workspace Integration
 *
 * Provides Gmail, Calendar, Drive, and Sheets tools.
 * Uses Navi's OAuth - users connect once, tools auto-authenticate.
 */

import { z } from "zod";
import { defineIntegration, defineTool } from "../define";

export const googleIntegration = defineIntegration({
  id: "google-workspace",
  name: "Google Workspace",
  description: "Gmail, Calendar, Drive, Sheets",
  icon: "🔷",
  apiBase: "https://www.googleapis.com",

  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    serviceScopes: {
      gmail: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      calendar: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      drive: ["https://www.googleapis.com/auth/drive.readonly"],
      sheets: ["https://www.googleapis.com/auth/spreadsheets"],
    },
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    userInfoParser: (data) => ({
      id: data.email || data.id,
      label: data.email || data.name || "Google Account",
    }),
  },

  tools: [
    // =========================================================================
    // Gmail
    // =========================================================================
    defineTool(
      "gmail_list_messages",
      `List or search Gmail messages. Returns message IDs and snippets.
Use this to find emails, then use gmail_get_message for full content.

Common query operators:
- from:email@example.com, to:email@example.com
- subject:keyword
- is:unread, is:starred, is:important
- after:2024/01/01, before:2024/12/31
- has:attachment`,
      {
        query: z.string().optional().describe("Gmail search query (e.g., 'is:unread from:boss@company.com')"),
        maxResults: z.number().min(1).max(100).optional().default(20).describe("Max messages (1-100, default: 20)"),
        labelIds: z.array(z.string()).optional().describe("Only return messages with these label IDs"),
      },
      async (args, ctx) => {
        const params = new URLSearchParams();
        if (args.query) params.set("q", args.query);
        if (args.maxResults) params.set("maxResults", String(args.maxResults));
        if (args.labelIds) params.set("labelIds", args.labelIds.join(","));

        const result = await ctx.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        const messages = result.data?.messages || [];
        if (messages.length === 0) {
          return { content: [{ type: "text" as const, text: "No messages found matching your query." }] };
        }

        // Fetch snippets in parallel
        const summaries = await Promise.all(
          messages.slice(0, args.maxResults || 20).map(async (msg: { id: string }) => {
            const detail = await ctx.fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
            );
            if (detail.error) return `- ID: ${msg.id} (failed to fetch details)`;

            const headers = detail.data?.payload?.headers || [];
            const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
            const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
            const date = headers.find((h: any) => h.name === "Date")?.value || "";
            const snippet = detail.data?.snippet || "";

            return `**${subject}**
  From: ${from}
  Date: ${date}
  ID: ${msg.id}
  ${snippet.slice(0, 100)}${snippet.length > 100 ? "..." : ""}`;
          })
        );

        return {
          content: [{
            type: "text" as const,
            text: `## Gmail Messages (${messages.length} found)\n\n${summaries.join("\n\n---\n\n")}`,
          }],
        };
      }
    ),

    defineTool(
      "gmail_get_message",
      `Read the full content of a specific Gmail message by its ID.
Use gmail_list_messages first to find message IDs.`,
      {
        messageId: z.string().describe("The ID of the message to retrieve"),
        format: z.enum(["minimal", "metadata", "full"]).optional().default("full").describe("Format of the message"),
      },
      async (args, ctx) => {
        const result = await ctx.fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.messageId}?format=${args.format}`
        );

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        const msg = result.data;
        const headers = msg.payload?.headers || [];
        const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
        const to = headers.find((h: any) => h.name === "To")?.value || "Unknown";
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
        const date = headers.find((h: any) => h.name === "Date")?.value || "";

        // Extract body
        let body = "";
        const extractBody = (part: any): string => {
          if (part.body?.data) {
            return Buffer.from(part.body.data, "base64").toString("utf-8");
          }
          if (part.parts) {
            const textPart = part.parts.find((p: any) => p.mimeType === "text/plain");
            if (textPart) return extractBody(textPart);
            const htmlPart = part.parts.find((p: any) => p.mimeType === "text/html");
            if (htmlPart) {
              const html = extractBody(htmlPart);
              return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
            }
            for (const p of part.parts) {
              const result = extractBody(p);
              if (result) return result;
            }
          }
          return "";
        };

        body = extractBody(msg.payload);

        return {
          content: [{
            type: "text" as const,
            text: `## Email: ${subject}

**From:** ${from}
**To:** ${to}
**Date:** ${date}
**Labels:** ${msg.labelIds?.join(", ") || "none"}

---

${body || msg.snippet || "(no content)"}`,
          }],
        };
      }
    ),

    defineTool(
      "gmail_send_message",
      `Send an email via Gmail. IMPORTANT: Confirm with user before sending.`,
      {
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text)"),
        cc: z.string().optional().describe("CC recipients (comma-separated)"),
        bcc: z.string().optional().describe("BCC recipients (comma-separated)"),
      },
      async (args, ctx) => {
        const headers = [
          `To: ${args.to}`,
          `Subject: ${args.subject}`,
          `Content-Type: text/plain; charset=utf-8`,
        ];
        if (args.cc) headers.push(`Cc: ${args.cc}`);
        if (args.bcc) headers.push(`Bcc: ${args.bcc}`);

        const email = headers.join("\r\n") + "\r\n\r\n" + args.body;
        const encodedEmail = Buffer.from(email).toString("base64url");

        const result = await ctx.fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            body: JSON.stringify({ raw: encodedEmail }),
          }
        );

        if (result.error) {
          return { content: [{ type: "text" as const, text: `Failed to send email: ${result.error}` }] };
        }

        return {
          content: [{
            type: "text" as const,
            text: `✅ Email sent successfully!\n\n**To:** ${args.to}\n**Subject:** ${args.subject}\n**Message ID:** ${result.data.id}`,
          }],
        };
      }
    ),

    // =========================================================================
    // Calendar
    // =========================================================================
    defineTool(
      "calendar_list_events",
      `List upcoming calendar events from Google Calendar.`,
      {
        calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
        timeMin: z.string().optional().describe("Start time (ISO 8601). Defaults to now."),
        timeMax: z.string().optional().describe("End time (ISO 8601). Defaults to 7 days from now."),
        maxResults: z.number().min(1).max(250).optional().default(50).describe("Max events (1-250, default: 50)"),
        query: z.string().optional().describe("Free text search"),
      },
      async (args, ctx) => {
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const params = new URLSearchParams();
        params.set("timeMin", args.timeMin || now.toISOString());
        params.set("timeMax", args.timeMax || weekFromNow.toISOString());
        params.set("maxResults", String(args.maxResults || 50));
        params.set("singleEvents", "true");
        params.set("orderBy", "startTime");
        if (args.query) params.set("q", args.query);

        const calendarId = encodeURIComponent(args.calendarId || "primary");
        const result = await ctx.fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`
        );

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        const events = result.data?.items || [];
        if (events.length === 0) {
          return { content: [{ type: "text" as const, text: "No events found in the specified time range." }] };
        }

        const eventList = events.map((event: any) => {
          const start = event.start?.dateTime || event.start?.date || "Unknown";
          const end = event.end?.dateTime || event.end?.date || "";
          const attendees = event.attendees?.map((a: any) => a.email).join(", ") || "none";

          return `**${event.summary || "(no title)"}**
  📅 ${start}${end ? ` → ${end}` : ""}
  📍 ${event.location || "No location"}
  👥 Attendees: ${attendees}
  🆔 ${event.id}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Calendar Events (${events.length})\n\n${eventList.join("\n\n---\n\n")}`,
          }],
        };
      }
    ),

    defineTool(
      "calendar_create_event",
      `Create a new calendar event. IMPORTANT: Confirm details with user first.`,
      {
        summary: z.string().describe("Event title"),
        start: z.string().describe("Start time (ISO 8601)"),
        end: z.string().describe("End time (ISO 8601)"),
        description: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location"),
        attendees: z.array(z.string()).optional().describe("Attendee emails"),
        calendarId: z.string().optional().default("primary").describe("Calendar ID"),
      },
      async (args, ctx) => {
        const event: any = {
          summary: args.summary,
          start: { dateTime: args.start },
          end: { dateTime: args.end },
        };
        if (args.description) event.description = args.description;
        if (args.location) event.location = args.location;
        if (args.attendees) event.attendees = args.attendees.map((email) => ({ email }));

        const calendarId = encodeURIComponent(args.calendarId || "primary");
        const result = await ctx.fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
          {
            method: "POST",
            body: JSON.stringify(event),
          }
        );

        if (result.error) {
          return { content: [{ type: "text" as const, text: `Failed to create event: ${result.error}` }] };
        }

        return {
          content: [{
            type: "text" as const,
            text: `✅ Event created!\n\n**${args.summary}**\n📅 ${args.start} → ${args.end}\n${args.location ? `📍 ${args.location}` : ""}\n🆔 ${result.data.id}\n🔗 ${result.data.htmlLink || ""}`,
          }],
        };
      }
    ),

    // =========================================================================
    // Drive
    // =========================================================================
    defineTool(
      "drive_list_files",
      `List files in Google Drive. Returns files matching optional search criteria.`,
      {
        query: z.string().optional().describe("Search query (e.g., \"name contains 'report'\", \"mimeType='application/pdf'\")"),
        maxResults: z.number().min(1).max(100).optional().default(20).describe("Max files (1-100, default: 20)"),
        folderId: z.string().optional().describe("Only list files in this folder"),
        orderBy: z.string().optional().default("modifiedTime desc").describe("Sort order"),
      },
      async (args, ctx) => {
        const params = new URLSearchParams();
        params.set("pageSize", String(args.maxResults || 20));
        params.set("orderBy", args.orderBy || "modifiedTime desc");
        params.set("fields", "files(id,name,mimeType,modifiedTime,size,webViewLink,owners)");

        let q = "";
        if (args.query) q = args.query;
        if (args.folderId) {
          q = q ? `${q} and '${args.folderId}' in parents` : `'${args.folderId}' in parents`;
        }
        if (q) params.set("q", q);

        const result = await ctx.fetch(`https://www.googleapis.com/drive/v3/files?${params}`);

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        const files = result.data?.files || [];
        if (files.length === 0) {
          return { content: [{ type: "text" as const, text: "No files found matching your criteria." }] };
        }

        const fileList = files.map((file: any) => {
          const modified = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "Unknown";
          const size = file.size ? `${Math.round(file.size / 1024)} KB` : "N/A";
          const owner = file.owners?.[0]?.displayName || "Unknown";

          return `**${file.name}**
  Type: ${file.mimeType}
  Modified: ${modified}
  Size: ${size}
  Owner: ${owner}
  ID: ${file.id}
  ${file.webViewLink ? `Link: ${file.webViewLink}` : ""}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Google Drive Files (${files.length})\n\n${fileList.join("\n\n---\n\n")}`,
          }],
        };
      }
    ),

    defineTool(
      "drive_search",
      `Search Google Drive with natural language. Finds files by name, content, type.`,
      {
        query: z.string().describe("Search query - can be natural language"),
        maxResults: z.number().min(1).max(50).optional().default(10).describe("Max results (default: 10)"),
      },
      async (args, ctx) => {
        const searchTerms = args.query.toLowerCase();
        let q = `fullText contains '${args.query.replace(/'/g, "\\'")}'`;

        // Enhance query based on keywords
        if (searchTerms.includes("spreadsheet") || searchTerms.includes("sheet")) {
          q += " or mimeType='application/vnd.google-apps.spreadsheet'";
        }
        if (searchTerms.includes("document") || searchTerms.includes("doc")) {
          q += " or mimeType='application/vnd.google-apps.document'";
        }
        if (searchTerms.includes("presentation") || searchTerms.includes("slides")) {
          q += " or mimeType='application/vnd.google-apps.presentation'";
        }
        if (searchTerms.includes("pdf")) {
          q += " or mimeType='application/pdf'";
        }

        const params = new URLSearchParams();
        params.set("q", q);
        params.set("pageSize", String(args.maxResults || 10));
        params.set("orderBy", "modifiedTime desc");
        params.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)");

        const result = await ctx.fetch(`https://www.googleapis.com/drive/v3/files?${params}`);

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        const files = result.data?.files || [];
        if (files.length === 0) {
          return { content: [{ type: "text" as const, text: `No files found matching: "${args.query}"` }] };
        }

        const fileList = files.map((file: any) => {
          const modified = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "";
          return `- **${file.name}** (${file.mimeType.split(".").pop()}) - ${modified}\n  ID: ${file.id}${file.webViewLink ? `\n  ${file.webViewLink}` : ""}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Search Results for: "${args.query}"\n\n${fileList.join("\n\n")}`,
          }],
        };
      }
    ),

    defineTool(
      "drive_get_file",
      `Get details about a specific file in Google Drive. Optionally fetch content for Google Docs/Sheets.`,
      {
        fileId: z.string().describe("The file ID"),
        includeContent: z.boolean().optional().default(false).describe("Fetch content for Google Docs"),
      },
      async (args, ctx) => {
        const result = await ctx.fetch(
          `https://www.googleapis.com/drive/v3/files/${args.fileId}?fields=id,name,mimeType,modifiedTime,size,webViewLink,owners,description`
        );

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        const file = result.data;
        let content = "";

        if (args.includeContent) {
          if (file.mimeType === "application/vnd.google-apps.document") {
            const exportResult = await ctx.fetch(
              `https://www.googleapis.com/drive/v3/files/${args.fileId}/export?mimeType=text/plain`
            );
            if (!exportResult.error) {
              content = `\n\n## Document Content:\n\n${exportResult.data}`;
            }
          } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
            content = "\n\n(Use sheets_get_values to read spreadsheet content)";
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: `## File: ${file.name}

**Type:** ${file.mimeType}
**ID:** ${file.id}
**Modified:** ${file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "Unknown"}
**Size:** ${file.size ? `${Math.round(file.size / 1024)} KB` : "N/A"}
**Owner:** ${file.owners?.[0]?.displayName || "Unknown"}
**Description:** ${file.description || "None"}
${file.webViewLink ? `**Link:** ${file.webViewLink}` : ""}${content}`,
          }],
        };
      }
    ),

    // =========================================================================
    // Sheets
    // =========================================================================
    defineTool(
      "sheets_get_values",
      `Read values from a Google Sheets spreadsheet.`,
      {
        spreadsheetId: z.string().describe("Spreadsheet ID (from URL or drive_list_files)"),
        range: z.string().describe("A1 notation range (e.g., 'Sheet1!A1:D10')"),
      },
      async (args, ctx) => {
        const result = await ctx.fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values/${encodeURIComponent(args.range)}`
        );

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        const values = result.data?.values || [];
        if (values.length === 0) {
          return { content: [{ type: "text" as const, text: "No data found in the specified range." }] };
        }

        // Format as markdown table
        const header = values[0];
        const rows = values.slice(1);

        let table = `| ${header.join(" | ")} |\n`;
        table += `| ${header.map(() => "---").join(" | ")} |\n`;
        for (const row of rows) {
          table += `| ${row.map((c: any) => String(c ?? "")).join(" | ")} |\n`;
        }

        return {
          content: [{
            type: "text" as const,
            text: `## Spreadsheet: ${args.range}\n\n${table}\n\n*${values.length} rows*`,
          }],
        };
      }
    ),

    defineTool(
      "sheets_update_values",
      `Write values to a Google Sheets spreadsheet. IMPORTANT: Confirm before writing.`,
      {
        spreadsheetId: z.string().describe("Spreadsheet ID"),
        range: z.string().describe("A1 notation for where to write"),
        values: z.array(z.array(z.string())).describe("2D array of values (rows × columns)"),
      },
      async (args, ctx) => {
        const result = await ctx.fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values/${encodeURIComponent(args.range)}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            body: JSON.stringify({ values: args.values }),
          }
        );

        if (result.error) {
          return { content: [{ type: "text" as const, text: `Failed to update: ${result.error}` }] };
        }

        return {
          content: [{
            type: "text" as const,
            text: `✅ Updated ${result.data.updatedCells} cells in ${result.data.updatedRange}`,
          }],
        };
      }
    ),
  ],
});
