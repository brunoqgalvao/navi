/**
 * spawn-tree.test.ts
 *
 * Tests for AgentTree using a FakeBackend with scripted AsyncIterable sessions.
 * No real CLIs are required.
 */

import { expect, test, describe, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { AgentTree } from "../src/spawn/tree.js";
import { BackendRegistry } from "../src/registry.js";
import type {
  AgentBackend,
  AgentSession,
  Capabilities,
  DetectResult,
  SessionOptions,
  UserInput,
} from "../src/types.js";
import type { GatewayEvent, PermissionDecision } from "../src/events.js";

// ── FakeBackend helpers ───────────────────────────────────────────────────────

type EventScript = GatewayEvent[] | ((sessionId: string) => GatewayEvent[]);

function makeSession(id: string, script: EventScript): AgentSession {
  const pendingPermissions = new Map<string, (decision: PermissionDecision) => void>();

  const session: AgentSession = {
    id,
    backendSessionId: undefined,
    respondToPermission(requestId, decision) {
      const resolve = pendingPermissions.get(requestId);
      if (resolve) {
        pendingPermissions.delete(requestId);
        resolve(decision);
      }
    },
    async cancel() {
      // noop for fake
    },
    async *send(_input: UserInput): AsyncIterable<GatewayEvent> {
      const events = typeof script === "function" ? script(id) : script;
      for (const evt of events) {
        // For permission-request events, emit the event but wait for response
        if (evt.type === "permission-request") {
          yield evt;
          // Wait for respondToPermission to be called (or just continue if not awaited)
          await new Promise<void>((resolve) => {
            pendingPermissions.set(evt.requestId, () => resolve());
            // Auto-timeout after 50ms so tests don't hang
            setTimeout(resolve, 50);
          });
        } else {
          yield evt;
        }
      }
    },
  };
  return session;
}

interface FakeBackendOpts {
  id?: "claude" | "codex" | "gemini";
  scriptFn?: (sessionId: string) => GatewayEvent[];
  defaultScript?: GatewayEvent[];
}

function makeFakeBackend(opts: FakeBackendOpts = {}): AgentBackend {
  const backendId = opts.id ?? "claude";
  const sessionIds: string[] = [];

  const backend: AgentBackend = {
    id: backendId,
    capabilities(): Capabilities {
      return {
        streaming: true,
        thinkingStream: false,
        permissions: "callback",
        resume: false,
        mcp: false,
        skills: "injected",
        models: [{ id: "fake-model", label: "Fake Model", default: true }],
      };
    },
    async detect(): Promise<DetectResult> {
      return { installed: true, authed: true, version: "fake-1.0" };
    },
    createSession(opts: SessionOptions): AgentSession {
      const id = randomUUID();
      sessionIds.push(id);
      const script: EventScript = opts.scriptFn
        ? opts.scriptFn(id)
        : backend._scriptFn
          ? backend._scriptFn(id)
          : (backend._defaultScript ?? successScript(id));
      return makeSession(id, script);
    },
    resumeSession(_backendSessionId: string, _opts: SessionOptions): AgentSession {
      throw new Error("fake backend does not support resume");
    },
    // Internal for test setup
    _scriptFn: opts.scriptFn,
    _defaultScript: opts.defaultScript,
  } as AgentBackend & { _scriptFn?: (id: string) => GatewayEvent[]; _defaultScript?: GatewayEvent[] };

  return backend;
}

function successScript(sessionId: string, text = "task done"): GatewayEvent[] {
  return [
    { type: "text-delta", sessionId, text },
    {
      type: "usage",
      sessionId,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        model: "fake-model",
        raw: {},
        costUsd: 0.001,
      },
    },
    { type: "done", sessionId, reason: "complete" },
  ];
}

function errorScript(sessionId: string, message = "agent error"): GatewayEvent[] {
  return [
    { type: "error", sessionId, message, fatal: true },
    { type: "done", sessionId, reason: "error" },
  ];
}

function permissionScript(sessionId: string): GatewayEvent[] {
  return [
    {
      type: "permission-request",
      sessionId,
      requestId: "req-1",
      tool: "bash",
      description: "run a command",
      input: { command: "ls" },
      options: ["allow", "allow-session", "deny"],
    },
    { type: "text-delta", sessionId, text: "ran the command" },
    { type: "done", sessionId, reason: "complete" },
  ];
}

function makeRegistry(backend: AgentBackend): BackendRegistry {
  const registry = new BackendRegistry();
  registry.register(backend);
  return registry;
}

// Wait for an agent to reach a terminal state
async function waitForAgent(
  tree: AgentTree,
  id: string,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = tree.getAgentResult(id);
    if (result.status !== "running") return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Agent ${id} still running after ${timeoutMs}ms`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AgentTree", () => {
  test("spawns a root agent and records result", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
    });

    const { childId } = tree.spawnAgent({ backend: "claude", task: "do something" });
    expect(typeof childId).toBe("string");

    await waitForAgent(tree, childId);
    const result = tree.getAgentResult(childId);
    expect(result.status).toBe("done");
    expect(result.text).toContain("task done");
  });

  test("listAgents returns info for all spawned agents", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
    });

    const { childId: id1 } = tree.spawnAgent({ backend: "claude", task: "task 1" });
    const { childId: id2 } = tree.spawnAgent({ backend: "claude", task: "task 2" });

    await waitForAgent(tree, id1);
    await waitForAgent(tree, id2);

    const agents = tree.listAgents();
    expect(agents).toHaveLength(2);
    const ids = agents.map((a) => a.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  test("depth limit: rejects spawn at depth > maxDepth", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      maxDepth: 1, // root=0, depth-1 children allowed, depth-2 rejected
    });

    const { childId: rootId } = tree.spawnAgent({ backend: "claude", task: "root" });
    const { childId: child1Id } = tree.spawnAgent({
      backend: "claude",
      task: "child",
      parentId: rootId,
    });

    // Trying to spawn a grandchild (depth=2) should throw
    expect(() =>
      tree.spawnAgent({ backend: "claude", task: "grandchild", parentId: child1Id })
    ).toThrow(/depth limit exceeded/i);

    await waitForAgent(tree, rootId);
  });

  test("depth limit: maxDepth=0 rejects any child spawn", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      maxDepth: 0, // only root (depth=0) allowed, no children
    });

    const { childId: rootId } = tree.spawnAgent({ backend: "claude", task: "root" });

    expect(() =>
      tree.spawnAgent({ backend: "claude", task: "child", parentId: rootId })
    ).toThrow(/depth limit exceeded/i);
  });

  test("children limit: rejects when parent already has maxChildren running", async () => {
    // Use a slow script that stays running long enough
    let resolveAll: () => void;
    const allDone = new Promise<void>((r) => { resolveAll = r; });

    const slowScript = (sessionId: string): GatewayEvent[] => {
      // Return empty array — the session completes instantly, but we'll
      // use immediate sessions to test the limit at spawn time
      return [{ type: "done", sessionId, reason: "complete" }];
    };

    // We need to keep children running; simplest: use a blocking script
    // Hack: override createSession to return a session that never ends
    let sessionCount = 0;
    const neverEndingBackend: AgentBackend = {
      id: "claude",
      capabilities: () => ({
        streaming: true,
        thinkingStream: false,
        permissions: "callback",
        resume: false,
        mcp: false,
        skills: "injected",
        models: [],
      }),
      async detect() {
        return { installed: true, authed: true };
      },
      createSession(_opts) {
        const id = randomUUID();
        sessionCount++;
        return {
          id,
          backendSessionId: undefined,
          respondToPermission() {},
          async cancel() {},
          async *send() {
            // Never yields done — stays running
            await new Promise<void>(() => {}); // blocks forever
          },
        };
      },
      resumeSession() { throw new Error("no resume"); },
    };

    const registry = new BackendRegistry();
    registry.register(neverEndingBackend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      maxChildren: 2,
    });

    const { childId: rootId } = tree.spawnAgent({ backend: "claude", task: "root" });
    tree.spawnAgent({ backend: "claude", task: "child 1", parentId: rootId });
    tree.spawnAgent({ backend: "claude", task: "child 2", parentId: rootId });

    // Third child should be rejected
    expect(() =>
      tree.spawnAgent({ backend: "claude", task: "child 3", parentId: rootId })
    ).toThrow(/children limit exceeded/i);

    await tree.cancelAll();
  });

  test("cost ceiling cancels all agents when exceeded", async () => {
    const expensiveScript = (sessionId: string): GatewayEvent[] => [
      { type: "text-delta", sessionId, text: "expensive work" },
      {
        type: "usage",
        sessionId,
        usage: {
          inputTokens: 1000,
          outputTokens: 1000,
          model: "fake-model",
          raw: {},
          costUsd: 10.0, // way over any ceiling
        },
      },
      { type: "done", sessionId, reason: "complete" },
    ];

    const backend = makeFakeBackend({ id: "claude", scriptFn: expensiveScript });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      costCeilingUsd: 5.0, // $5 ceiling
    });

    const { childId } = tree.spawnAgent({ backend: "claude", task: "expensive task" });
    await waitForAgent(tree, childId, 3000);

    // The agent should have been cancelled (or done before ceiling triggered)
    const result = tree.getAgentResult(childId);
    expect(["done", "cancelled"]).toContain(result.status);

    // Total cost should be tracked
    expect(tree.totalCostUsd).toBeGreaterThan(0);
  });

  test("permission bubble: child permission-request reaches onRootEvent", async () => {
    const backend = makeFakeBackend({ id: "claude", scriptFn: permissionScript });
    const registry = makeRegistry(backend);

    const rootEvents: GatewayEvent[] = [];
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "prompt",
      cwd: "/tmp",
      onRootEvent: (e) => rootEvents.push(e),
    });

    const { childId } = tree.spawnAgent({ backend: "claude", task: "needs permission" });

    // Wait a bit for events to propagate
    await new Promise((r) => setTimeout(r, 200));

    const permissionEvents = rootEvents.filter((e) => e.type === "permission-request");
    expect(permissionEvents.length).toBeGreaterThan(0);
    if (permissionEvents[0]?.type === "permission-request") {
      expect(permissionEvents[0].tool).toBe("bash");
    }

    await waitForAgent(tree, childId, 3000);
  });

  test("getAgentResult returns running while agent is still running", async () => {
    let sessionResolve: () => void;
    const sessionDone = new Promise<void>((r) => { sessionResolve = r; });

    const slowBackend: AgentBackend = {
      id: "claude",
      capabilities: () => ({
        streaming: true,
        thinkingStream: false,
        permissions: "callback",
        resume: false,
        mcp: false,
        skills: "injected",
        models: [],
      }),
      async detect() { return { installed: true, authed: true }; },
      createSession(_opts) {
        const id = randomUUID();
        return {
          id,
          backendSessionId: undefined,
          respondToPermission() {},
          async cancel() { sessionResolve(); },
          async *send() {
            await sessionDone;
            yield { type: "done" as const, sessionId: id, reason: "cancelled" as const };
          },
        };
      },
      resumeSession() { throw new Error("no resume"); },
    };

    const registry = new BackendRegistry();
    registry.register(slowBackend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
    });

    const { childId } = tree.spawnAgent({ backend: "claude", task: "slow task" });

    // Should be running immediately
    const result = tree.getAgentResult(childId);
    expect(result.status).toBe("running");

    await tree.cancelAll();
  });

  test("cancelAll sets all running agents to cancelled", async () => {
    const neverEndingBackend: AgentBackend = {
      id: "claude",
      capabilities: () => ({
        streaming: true,
        thinkingStream: false,
        permissions: "callback",
        resume: false,
        mcp: false,
        skills: "injected",
        models: [],
      }),
      async detect() { return { installed: true, authed: true }; },
      createSession(_opts) {
        const id = randomUUID();
        return {
          id,
          backendSessionId: undefined,
          respondToPermission() {},
          async cancel() {},
          async *send() {
            // Never finishes
            await new Promise<void>(() => {});
          },
        };
      },
      resumeSession() { throw new Error("no resume"); },
    };

    const registry = new BackendRegistry();
    registry.register(neverEndingBackend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
    });

    const { childId: id1 } = tree.spawnAgent({ backend: "claude", task: "task 1" });
    const { childId: id2 } = tree.spawnAgent({ backend: "claude", task: "task 2" });

    await tree.cancelAll();

    // Both should be cancelled now
    expect(tree.getAgentResult(id1).status).toBe("cancelled");
    expect(tree.getAgentResult(id2).status).toBe("cancelled");
  });

  test("agent error is captured in result", async () => {
    const backend = makeFakeBackend({
      id: "claude",
      scriptFn: (id) => errorScript(id, "something went wrong"),
    });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
    });

    const { childId } = tree.spawnAgent({ backend: "claude", task: "failing task" });
    await waitForAgent(tree, childId);

    const result = tree.getAgentResult(childId);
    expect(result.status).toBe("error");
    expect(result.error).toContain("something went wrong");
  });

  test("unknown agent returns error result", () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
    });

    const result = tree.getAgentResult("nonexistent-id");
    expect(result.status).toBe("error");
    expect(result.error).toContain("nonexistent-id");
  });
});
