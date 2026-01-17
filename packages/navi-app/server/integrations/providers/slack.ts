/**
 * Slack Integration
 *
 * Provides tools for messaging, channels, and user lookup.
 * Uses Navi's OAuth - users connect once, tools auto-authenticate.
 */

import { z } from "zod";
import { defineIntegration, defineTool } from "../define";

export const slackIntegration = defineIntegration({
  id: "slack",
  name: "Slack",
  description: "Messages, Channels, Users",
  icon: "💬",
  apiBase: "https://slack.com/api",

  oauth: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    revokeUrl: "https://slack.com/api/auth.revoke",
    scopes: [
      "channels:read",
      "channels:history",
      "chat:write",
      "users:read",
      "users:read.email",
      "groups:read",
      "groups:history",
      "im:read",
      "im:history",
      "mpim:read",
      "mpim:history",
      "search:read",
    ],
    userInfoUrl: "https://slack.com/api/auth.test",
    userInfoParser: (data) => ({
      id: data.user_id || data.user || "unknown",
      label: data.team || "Slack Workspace",
    }),
  },

  tools: [
    // =========================================================================
    // Channels
    // =========================================================================
    defineTool(
      "slack_list_channels",
      `List Slack channels the bot has access to.`,
      {
        types: z.string().optional().default("public_channel,private_channel").describe("Channel types (public_channel, private_channel, mpim, im)"),
        limit: z.number().min(1).max(1000).optional().default(100).describe("Max channels (1-1000, default: 100)"),
        excludeArchived: z.boolean().optional().default(true).describe("Exclude archived channels"),
      },
      async (args, ctx) => {
        const params = new URLSearchParams({
          types: args.types || "public_channel,private_channel",
          limit: String(args.limit || 100),
          exclude_archived: String(args.excludeArchived ?? true),
        });

        const result = await ctx.fetch(`/conversations.list?${params}`);

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        if (!result.data?.ok) {
          return { content: [{ type: "text" as const, text: `Slack error: ${result.data?.error || "Unknown"}` }] };
        }

        const channels = result.data.channels || [];
        if (channels.length === 0) {
          return { content: [{ type: "text" as const, text: "No channels found." }] };
        }

        const channelList = channels.map((ch: any) => {
          const type = ch.is_private ? "🔒 private" : "📢 public";
          const members = ch.num_members || "?";
          return `- **#${ch.name}** (${type}, ${members} members)\n  ID: \`${ch.id}\`\n  ${ch.purpose?.value || "No description"}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Slack Channels (${channels.length})\n\n${channelList.join("\n\n")}`,
          }],
        };
      }
    ),

    defineTool(
      "slack_get_channel_history",
      `Get recent messages from a Slack channel.`,
      {
        channel: z.string().describe("Channel ID (e.g., C1234567890)"),
        limit: z.number().min(1).max(1000).optional().default(20).describe("Max messages (1-1000, default: 20)"),
        oldest: z.string().optional().describe("Start of time range (Unix timestamp)"),
        latest: z.string().optional().describe("End of time range (Unix timestamp)"),
      },
      async (args, ctx) => {
        const params = new URLSearchParams({
          channel: args.channel,
          limit: String(args.limit || 20),
        });
        if (args.oldest) params.set("oldest", args.oldest);
        if (args.latest) params.set("latest", args.latest);

        const result = await ctx.fetch(`/conversations.history?${params}`);

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        if (!result.data?.ok) {
          return { content: [{ type: "text" as const, text: `Slack error: ${result.data?.error || "Unknown"}` }] };
        }

        const messages = result.data.messages || [];
        if (messages.length === 0) {
          return { content: [{ type: "text" as const, text: "No messages found in the specified range." }] };
        }

        const messageList = messages.map((msg: any) => {
          const time = msg.ts ? new Date(parseFloat(msg.ts) * 1000).toLocaleString() : "";
          const user = msg.user || msg.bot_id || "unknown";
          const text = msg.text?.slice(0, 500) || "(no text)";
          return `**[${time}]** <@${user}>\n${text}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Channel History (${messages.length} messages)\n\n${messageList.join("\n\n---\n\n")}`,
          }],
        };
      }
    ),

    // =========================================================================
    // Messages
    // =========================================================================
    defineTool(
      "slack_send_message",
      `Send a message to a Slack channel. IMPORTANT: Confirm with user before sending.`,
      {
        channel: z.string().describe("Channel ID or name (e.g., C1234567890 or #general)"),
        text: z.string().describe("Message text (supports Slack markdown)"),
        thread_ts: z.string().optional().describe("Thread timestamp to reply in a thread"),
      },
      async (args, ctx) => {
        const result = await ctx.fetch("/chat.postMessage", {
          method: "POST",
          body: JSON.stringify({
            channel: args.channel,
            text: args.text,
            ...(args.thread_ts && { thread_ts: args.thread_ts }),
          }),
        });

        if (result.error) {
          return { content: [{ type: "text" as const, text: `Failed to send: ${result.error}` }] };
        }

        if (!result.data?.ok) {
          return { content: [{ type: "text" as const, text: `Slack error: ${result.data?.error || "Unknown"}` }] };
        }

        return {
          content: [{
            type: "text" as const,
            text: `✅ Message sent to ${args.channel}\n\nTimestamp: ${result.data.ts}`,
          }],
        };
      }
    ),

    defineTool(
      "slack_search_messages",
      `Search for messages across Slack.`,
      {
        query: z.string().describe("Search query (supports Slack search syntax: from:@user, in:#channel, etc.)"),
        count: z.number().min(1).max(100).optional().default(20).describe("Max results (1-100, default: 20)"),
        sort: z.enum(["score", "timestamp"]).optional().default("score").describe("Sort by relevance or time"),
        sortDir: z.enum(["asc", "desc"]).optional().default("desc").describe("Sort direction"),
      },
      async (args, ctx) => {
        const params = new URLSearchParams({
          query: args.query,
          count: String(args.count || 20),
          sort: args.sort || "score",
          sort_dir: args.sortDir || "desc",
        });

        const result = await ctx.fetch(`/search.messages?${params}`);

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        if (!result.data?.ok) {
          return { content: [{ type: "text" as const, text: `Slack error: ${result.data?.error || "Unknown"}` }] };
        }

        const matches = result.data.messages?.matches || [];
        if (matches.length === 0) {
          return { content: [{ type: "text" as const, text: `No messages found for: "${args.query}"` }] };
        }

        const results = matches.map((m: any) => {
          const time = m.ts ? new Date(parseFloat(m.ts) * 1000).toLocaleString() : "";
          const channel = m.channel?.name || m.channel?.id || "unknown";
          return `**[${time}]** in #${channel}\n${m.text?.slice(0, 300) || "(no text)"}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Search Results for: "${args.query}" (${result.data.messages?.total || matches.length} total)\n\n${results.join("\n\n---\n\n")}`,
          }],
        };
      }
    ),

    // =========================================================================
    // Users
    // =========================================================================
    defineTool(
      "slack_list_users",
      `List users in the Slack workspace.`,
      {
        limit: z.number().min(1).max(1000).optional().default(100).describe("Max users (1-1000, default: 100)"),
        includeDeleted: z.boolean().optional().default(false).describe("Include deactivated users"),
      },
      async (args, ctx) => {
        const params = new URLSearchParams({
          limit: String(args.limit || 100),
        });

        const result = await ctx.fetch(`/users.list?${params}`);

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        if (!result.data?.ok) {
          return { content: [{ type: "text" as const, text: `Slack error: ${result.data?.error || "Unknown"}` }] };
        }

        let users = result.data.members || [];

        // Filter out deleted users unless requested
        if (!args.includeDeleted) {
          users = users.filter((u: any) => !u.deleted);
        }

        // Filter out bots
        users = users.filter((u: any) => !u.is_bot && u.id !== "USLACKBOT");

        if (users.length === 0) {
          return { content: [{ type: "text" as const, text: "No users found." }] };
        }

        const userList = users.slice(0, args.limit || 100).map((u: any) => {
          const status = u.profile?.status_emoji ? `${u.profile.status_emoji} ${u.profile.status_text || ""}` : "";
          const email = u.profile?.email || "";
          return `- **@${u.name}** (${u.real_name || u.profile?.real_name || ""})\n  ID: \`${u.id}\`\n  ${email ? `Email: ${email}` : ""}\n  ${status ? `Status: ${status}` : ""}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `## Slack Users (${users.length})\n\n${userList.join("\n\n")}`,
          }],
        };
      }
    ),

    defineTool(
      "slack_get_user_info",
      `Get detailed information about a Slack user.`,
      {
        user: z.string().describe("User ID (e.g., U1234567890)"),
      },
      async (args, ctx) => {
        const result = await ctx.fetch(`/users.info?user=${args.user}`);

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        if (!result.data?.ok) {
          return { content: [{ type: "text" as const, text: `Slack error: ${result.data?.error || "Unknown"}` }] };
        }

        const u = result.data.user;
        const profile = u.profile || {};

        return {
          content: [{
            type: "text" as const,
            text: `## @${u.name}

**Name:** ${u.real_name || profile.real_name || "Unknown"}
**ID:** ${u.id}
**Email:** ${profile.email || "Not available"}
**Title:** ${profile.title || "None"}
**Phone:** ${profile.phone || "None"}
**Timezone:** ${u.tz_label || u.tz || "Unknown"}
**Status:** ${profile.status_emoji || ""} ${profile.status_text || "No status"}
**Admin:** ${u.is_admin ? "Yes" : "No"}
**Bot:** ${u.is_bot ? "Yes" : "No"}`,
          }],
        };
      }
    ),

    // =========================================================================
    // Direct Messages
    // =========================================================================
    defineTool(
      "slack_open_dm",
      `Open a direct message conversation with a user.`,
      {
        users: z.string().describe("Comma-separated user IDs (e.g., U1234567890 or U1234,U5678 for group DM)"),
      },
      async (args, ctx) => {
        const result = await ctx.fetch("/conversations.open", {
          method: "POST",
          body: JSON.stringify({
            users: args.users,
          }),
        });

        if (result.error) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }

        if (!result.data?.ok) {
          return { content: [{ type: "text" as const, text: `Slack error: ${result.data?.error || "Unknown"}` }] };
        }

        const channel = result.data.channel;
        return {
          content: [{
            type: "text" as const,
            text: `✅ DM conversation opened\n\nChannel ID: \`${channel.id}\`\n\nUse this ID with slack_send_message to send messages.`,
          }],
        };
      }
    ),
  ],
});
