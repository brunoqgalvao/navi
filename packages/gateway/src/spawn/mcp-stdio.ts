#!/usr/bin/env bun
/**
 * mcp-stdio.ts — MCP stdio proxy that forwards tool calls to the spawn
 * control server started by startSpawnControlServer().
 *
 * Environment variables:
 *   NAVI_SPAWN_URL   - base URL of the control server (e.g. http://127.0.0.1:34567)
 *   NAVI_SPAWN_TOKEN - bearer token for authentication
 *
 * This script is invoked as a child process by the gateway's session when the
 * spawn MCP server config is injected (via spawnServerConfigFor()).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const spawnUrl = process.env.NAVI_SPAWN_URL;
const spawnToken = process.env.NAVI_SPAWN_TOKEN;

if (!spawnUrl || !spawnToken) {
  process.stderr.write(
    "[navi-spawn-stdio] NAVI_SPAWN_URL and NAVI_SPAWN_TOKEN must be set\n"
  );
  process.exit(1);
}

async function callControl(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${spawnUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${spawnToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `HTTP ${res.status}`
    );
  }
  return data;
}

const server = new McpServer({
  name: "navi-spawn",
  version: "0.1.0",
});

server.tool(
  "spawn_agent",
  "Spawn a new AI agent on the specified backend to complete a task. Returns the agent ID.",
  {
    backend: z.enum(["claude", "codex", "gemini"]),
    task: z.string(),
    model: z.string().optional(),
    cwd: z.string().optional(),
    permissionMode: z
      .enum(["prompt", "acceptEdits", "acceptAll", "readOnly"])
      .optional(),
    parentId: z.string().optional(),
  },
  async (args) => {
    try {
      const result = await callControl("/spawn", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_agents",
  "List all agents in the tree with their current status.",
  {},
  async () => {
    try {
      const result = await callControl("/list", {});
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_agent_result",
  "Get the result of a spawned agent.",
  { id: z.string() },
  async (args) => {
    try {
      const result = await callControl("/result", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "send_to_agent",
  "Send a follow-up message to a running agent.",
  { id: z.string(), message: z.string() },
  async (args) => {
    try {
      const result = await callControl("/send", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "respond_to_permission",
  "Respond to a bubbled permission-request from a child agent.",
  {
    requestId: z.string(),
    decision: z.enum(["allow", "allow-session", "deny"]),
  },
  async (args) => {
    try {
      const result = await callControl("/respond", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
