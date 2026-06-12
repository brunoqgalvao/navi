/**
 * spawn-mcp.test.ts
 *
 * Tests for createSpawnMcpServer (in-process MCP client via InMemoryTransport)
 * and startSpawnControlServer (fetch-based).
 */

import { expect, test, describe } from "bun:test";
import { randomUUID } from "node:crypto";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { AgentTree } from "../src/spawn/tree.js";
import { createSpawnMcpServer, startSpawnControlServer } from "../src/spawn/mcp-server.js";
import { BackendRegistry } from "../src/registry.js";
import type {
  AgentBackend,
  AgentSession,
  Capabilities,
  DetectResult,
  SessionOptions,
  UserInput,
} from "../src/types.js";
import type { GatewayEvent } from "../src/events.js";

// ── FakeBackend (same pattern as tree tests) ──────────────────────────────────

function makeSuccessSession(id: string, text = "task done"): AgentSession {
  return {
    id,
    backendSessionId: undefined,
    respondToPermission() {},
    async cancel() {},
    async *send(_input: UserInput): AsyncIterable<GatewayEvent> {
      yield { type: "text-delta", sessionId: id, text };
      yield {
        type: "usage",
        sessionId: id,
        usage: { inputTokens: 10, outputTokens: 5, model: "fake", raw: {}, costUsd: 0.001 },
      };
      yield { type: "done", sessionId: id, reason: "complete" };
    },
  };
}

function makeFakeBackend(backendId: "claude" | "codex" | "gemini" = "claude"): AgentBackend {
  return {
    id: backendId,
    capabilities(): Capabilities {
      return {
        streaming: true,
        thinkingStream: false,
        permissions: "callback",
        resume: false,
        mcp: false,
        skills: "injected",
        models: [],
      };
    },
    async detect(): Promise<DetectResult> {
      return { installed: true, authed: true, version: "fake-1.0" };
    },
    createSession(_opts: SessionOptions): AgentSession {
      return makeSuccessSession(randomUUID());
    },
    resumeSession() { throw new Error("no resume"); },
  };
}

function makeTreeWithFakeBackend(): { tree: AgentTree; registry: BackendRegistry } {
  const registry = new BackendRegistry();
  registry.register(makeFakeBackend("claude"));
  const tree = new AgentTree(registry, {
    defaultPermissionMode: "acceptAll",
    cwd: "/tmp",
  });
  return { tree, registry };
}

// Wait for an agent to finish
async function waitFor(
  fn: () => boolean,
  timeoutMs = 2000,
  intervalMs = 20
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("waitFor timed out");
}

// ── In-process MCP tests ──────────────────────────────────────────────────────

async function makeInProcessClient(
  tree: AgentTree
): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const mcpServer = createSpawnMcpServer(tree);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await mcpServer.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await mcpServer.server.close();
    },
  };
}

describe("createSpawnMcpServer (in-process)", () => {
  test("spawn_agent tool spawns an agent and returns childId", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const { client, cleanup } = await makeInProcessClient(tree);

    try {
      const result = await client.callTool({
        name: "spawn_agent",
        arguments: { backend: "claude", task: "do something" },
      });

      expect(result.isError).toBeFalsy();
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      expect(content?.type).toBe("text");
      const parsed = JSON.parse(content!.text);
      expect(typeof parsed.childId).toBe("string");
    } finally {
      await cleanup();
    }
  });

  test("list_agents tool returns agent list", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const { client, cleanup } = await makeInProcessClient(tree);

    try {
      // Spawn one agent first
      await client.callTool({
        name: "spawn_agent",
        arguments: { backend: "claude", task: "task 1" },
      });

      const result = await client.callTool({ name: "list_agents", arguments: {} });
      expect(result.isError).toBeFalsy();
      const content = (result.content as Array<{ type: string; text: string }>)[0];
      const parsed = JSON.parse(content!.text);
      expect(Array.isArray(parsed.agents)).toBe(true);
      expect(parsed.agents.length).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });

  test("get_agent_result tool returns result after completion", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const { client, cleanup } = await makeInProcessClient(tree);

    try {
      // Spawn an agent
      const spawnResult = await client.callTool({
        name: "spawn_agent",
        arguments: { backend: "claude", task: "do something" },
      });
      const spawnContent = (spawnResult.content as Array<{ type: string; text: string }>)[0];
      const { childId } = JSON.parse(spawnContent!.text);

      // Wait for the agent to finish
      await waitFor(() => {
        const r = tree.getAgentResult(childId);
        return r.status !== "running";
      });

      // Get result via MCP tool
      const resultResp = await client.callTool({
        name: "get_agent_result",
        arguments: { id: childId },
      });
      expect(resultResp.isError).toBeFalsy();
      const content = (resultResp.content as Array<{ type: string; text: string }>)[0];
      const parsed = JSON.parse(content!.text);
      expect(parsed.status).toBe("done");
      expect(parsed.text).toContain("task done");
    } finally {
      await cleanup();
    }
  });

  test("spawn_agent with invalid backend returns isError", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const { client, cleanup } = await makeInProcessClient(tree);

    try {
      // zod will reject invalid enum value at the MCP layer
      // (or the tree will throw if it bypasses zod)
      let threw = false;
      try {
        const result = await client.callTool({
          name: "spawn_agent",
          arguments: { backend: "invalid-backend", task: "task" },
        });
        // If it doesn't throw, it should return isError
        if (result.isError) threw = true;
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test("tools list includes all expected tools", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const mcpServer = createSpawnMcpServer(tree);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toContain("spawn_agent");
      expect(toolNames).toContain("list_agents");
      expect(toolNames).toContain("get_agent_result");
      expect(toolNames).toContain("send_to_agent");
    } finally {
      await client.close();
      await mcpServer.server.close();
    }
  });
});

// ── HTTP control server tests ─────────────────────────────────────────────────

describe("startSpawnControlServer", () => {
  test("starts a server on a random port", () => {
    const { tree } = makeTreeWithFakeBackend();
    const ctrl = startSpawnControlServer(tree);
    expect(typeof ctrl.port).toBe("number");
    expect(ctrl.port).toBeGreaterThan(0);
    ctrl.stop();
  });

  test("rejects requests without token", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const ctrl = startSpawnControlServer(tree);
    try {
      const res = await fetch(`http://127.0.0.1:${ctrl.port}/list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(401);
    } finally {
      ctrl.stop();
    }
  });

  test("POST /list returns agent list with valid token", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const ctrl = startSpawnControlServer(tree) as ReturnType<typeof startSpawnControlServer> & { _token: string };
    try {
      const res = await fetch(`http://127.0.0.1:${ctrl.port}/list`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ctrl._token}`,
        },
        body: "{}",
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { agents: unknown[] };
      expect(Array.isArray(data.agents)).toBe(true);
    } finally {
      ctrl.stop();
    }
  });

  test("POST /spawn creates an agent", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const ctrl = startSpawnControlServer(tree) as ReturnType<typeof startSpawnControlServer> & { _token: string };
    try {
      const res = await fetch(`http://127.0.0.1:${ctrl.port}/spawn`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ctrl._token}`,
        },
        body: JSON.stringify({ backend: "claude", task: "control server task" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { childId: string };
      expect(typeof data.childId).toBe("string");
    } finally {
      ctrl.stop();
    }
  });

  test("POST /result returns agent result", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const ctrl = startSpawnControlServer(tree) as ReturnType<typeof startSpawnControlServer> & { _token: string };
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${ctrl._token}`,
    };

    try {
      // Spawn
      const spawnRes = await fetch(`http://127.0.0.1:${ctrl.port}/spawn`, {
        method: "POST",
        headers,
        body: JSON.stringify({ backend: "claude", task: "fetch result task" }),
      });
      const { childId } = await spawnRes.json() as { childId: string };

      // Wait for agent to finish
      await waitFor(() => tree.getAgentResult(childId).status !== "running");

      // Get result
      const resultRes = await fetch(`http://127.0.0.1:${ctrl.port}/result`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: childId }),
      });
      expect(resultRes.status).toBe(200);
      const data = await resultRes.json() as { status: string };
      expect(data.status).toBe("done");
    } finally {
      ctrl.stop();
    }
  });

  test("unknown route returns 404", async () => {
    const { tree } = makeTreeWithFakeBackend();
    const ctrl = startSpawnControlServer(tree) as ReturnType<typeof startSpawnControlServer> & { _token: string };
    try {
      const res = await fetch(`http://127.0.0.1:${ctrl.port}/nonexistent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ctrl._token}`,
        },
        body: "{}",
      });
      expect(res.status).toBe(404);
    } finally {
      ctrl.stop();
    }
  });
});
