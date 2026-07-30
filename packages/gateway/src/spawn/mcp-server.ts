/**
 * mcp-server.ts — exposes AgentTree as MCP tools.
 *
 * Two modes:
 *
 * 1. In-process: createSpawnMcpServer(tree) returns a McpServer with tools
 *    registered. Connect via InMemoryTransport for testing or direct SDK use.
 *
 * 2. HTTP control plane: startSpawnControlServer(tree, port?) starts a tiny
 *    loopback-only Bun.serve JSON API with bearer-token auth. The companion
 *    stdio entry script (src/spawn/mcp-stdio.ts) proxies MCP tool calls to
 *    this control server via NAVI_SPAWN_URL + NAVI_SPAWN_TOKEN env vars.
 *    Use spawnServerConfigFor(url, token) to get the McpServerConfig to inject
 *    into SessionOptions.mcpServers.
 *
 * NOTE: The gateway injects MCP server configs as {command, args} (separate
 * processes), which can't share in-process tree state. The control-server +
 * stdio-proxy pattern bridges that gap.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentTree } from "./tree.js";
import type { McpServerConfig, BackendId, SessionOptions } from "../types.js";

/**
 * Cast a Zod 4 schema shape to the Zod 3 shape expected by @modelcontextprotocol/sdk.
 * The SDK ships with its own bundled Zod 3 types; we use Zod 4 in this package.
 * The runtime shapes are compatible — only the TypeScript types diverge.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mcpSchema<T extends Record<string, z.ZodTypeAny>>(shape: T): any {
  return shape;
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

const SpawnAgentSchema = {
  backend: z.enum(["claude", "codex", "gemini"]),
  task: z.string().describe("The task to assign to the spawned agent"),
  model: z.string().optional().describe("Model ID override"),
  cwd: z.string().optional().describe("Working directory for the child agent"),
  permissionMode: z
    .enum(["prompt", "acceptEdits", "acceptAll", "readOnly"])
    .optional()
    .describe("Permission mode for the child agent"),
  parentId: z
    .string()
    .optional()
    .describe("ID of the parent agent (omit for root-level spawn)"),
};

const GetAgentResultSchema = {
  id: z.string().describe("Agent ID returned by spawn_agent"),
};

const SendToAgentSchema = {
  id: z.string().describe("Agent ID"),
  message: z.string().describe("Follow-up message to send"),
};

const RespondToPermissionSchema = {
  requestId: z.string().describe("Permission request ID from permission-request event"),
  decision: z.enum(["allow", "allow-session", "deny"]).describe("Permission decision"),
};

// ── createSpawnMcpServer ──────────────────────────────────────────────────────

/**
 * Creates an in-process McpServer that exposes the given AgentTree as MCP tools.
 * Connect via `await server.connect(transport)`.
 */
export function createSpawnMcpServer(tree: AgentTree): McpServer {
  const server = new McpServer({
    name: "navi-spawn",
    version: "0.1.0",
  });

  server.tool(
    "spawn_agent",
    "Spawn a new AI agent on the specified backend to complete a task. Returns the agent ID.",
    mcpSchema(SpawnAgentSchema),
    async (args: Record<string, unknown>) => {
      try {
        const result = tree.spawnAgent({
          backend: args["backend"] as BackendId,
          task: args["task"] as string,
          model: args["model"] as string | undefined,
          cwd: args["cwd"] as string | undefined,
          permissionMode: args["permissionMode"] as
            | "prompt"
            | "acceptEdits"
            | "acceptAll"
            | "readOnly"
            | undefined,
          parentId: args["parentId"] as string | undefined,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ childId: result.childId }),
            },
          ],
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
    "List all agents in the tree with their current status and cost.",
    {},
    async () => {
      const agents = tree.listAgents();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ agents }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_agent_result",
    "Get the result of a spawned agent. Returns {status, text, error}. If still running, status is 'running'.",
    mcpSchema(GetAgentResultSchema),
    async (args: Record<string, unknown>) => {
      const result = tree.getAgentResult(args["id"] as string);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  server.tool(
    "send_to_agent",
    "Send a follow-up message to a running agent.",
    mcpSchema(SendToAgentSchema),
    async (args: Record<string, unknown>) => {
      try {
        tree.sendToAgent(args["id"] as string, args["message"] as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true }),
            },
          ],
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
    mcpSchema(RespondToPermissionSchema),
    async (args: Record<string, unknown>) => {
      tree.respondToPermission(
        args["requestId"] as string,
        args["decision"] as "allow" | "allow-session" | "deny"
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true }),
          },
        ],
      };
    }
  );

  return server;
}

// ── HTTP control plane ────────────────────────────────────────────────────────

export interface ControlServer {
  port: number;
  stop: () => void;
  token: string;
}

/**
 * Starts a loopback-only HTTP JSON control server for the tree.
 * Endpoints: POST /spawn, POST /list, POST /result, POST /send
 * All requests require: Authorization: Bearer <token>
 */
export function startSpawnControlServer(tree: AgentTree, port?: number): ControlServer {
  const token = randomToken();
  const listenPort = port ?? 0; // 0 = random OS-assigned

  let resolvedPort = listenPort;

  const server = Bun.serve({
    port: listenPort,
    hostname: "127.0.0.1",
    async fetch(req) {
      // Bearer auth
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${token}`) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }

      // Only POST is supported
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "method not allowed" }), {
          status: 405,
          headers: { "content-type": "application/json", allow: "POST" },
        });
      }

      const url = new URL(req.url);
      let body: unknown = {};
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "invalid JSON" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      try {
        if (url.pathname === "/spawn") {
          const b = body as {
            backend: BackendId;
            task: string;
            model?: string;
            cwd?: string;
            permissionMode?: SessionOptions["permissionMode"];
            parentId?: string;
          };
          const result = tree.spawnAgent(b);
          return json(result);
        }

        if (url.pathname === "/list") {
          return json({ agents: tree.listAgents() });
        }

        if (url.pathname === "/result") {
          const b = body as { id: string };
          return json(tree.getAgentResult(b.id));
        }

        if (url.pathname === "/send") {
          const b = body as { id: string; message: string };
          tree.sendToAgent(b.id, b.message);
          return json({ ok: true });
        }

        if (url.pathname === "/respond") {
          const b = body as {
            requestId: string;
            decision: "allow" | "allow-session" | "deny";
          };
          tree.respondToPermission(b.requestId, b.decision);
          return json({ ok: true });
        }

        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
    },
  });

  resolvedPort = server.port ?? listenPort;

  return {
    port: resolvedPort,
    stop: () => server.stop(true),
    token,
  };
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
}

// ── spawnServerConfigFor ──────────────────────────────────────────────────────

/**
 * Returns a McpServerConfig that sessions can inject to get access to the
 * spawn tools via the stdio proxy (src/spawn/mcp-stdio.ts).
 *
 * The proxy reads NAVI_SPAWN_URL and NAVI_SPAWN_TOKEN from its env and
 * forwards MCP tool calls to the control server.
 */
export function spawnServerConfigFor(controlUrl: string, token: string): McpServerConfig {
  return {
    name: "navi-spawn",
    command: "bun",
    args: [
      "--experimental-vm-modules",
      new URL("./mcp-stdio.ts", import.meta.url).pathname,
    ],
    env: {
      NAVI_SPAWN_URL: controlUrl,
      NAVI_SPAWN_TOKEN: token,
    },
  };
}

