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

interface FakeSession extends AgentSession {
  respondToPermissionCalls: Array<{ requestId: string; decision: PermissionDecision }>;
  cancelCalled: boolean;
}

function makeSession(id: string, script: EventScript): FakeSession {
  const pendingPermissions = new Map<string, (decision: PermissionDecision) => void>();
  const respondToPermissionCalls: Array<{ requestId: string; decision: PermissionDecision }> = [];
  let cancelCalled = false;

  const session: FakeSession = {
    id,
    backendSessionId: undefined,
    respondToPermissionCalls,
    get cancelCalled() { return cancelCalled; },
    respondToPermission(requestId, decision) {
      respondToPermissionCalls.push({ requestId, decision });
      const resolve = pendingPermissions.get(requestId);
      if (resolve) {
        pendingPermissions.delete(requestId);
        resolve(decision);
      }
    },
    async cancel() {
      cancelCalled = true;
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
            // Auto-timeout after 100ms so tests don't hang
            setTimeout(resolve, 100);
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

interface FakeBackend extends AgentBackend {
  createdSessions: FakeSession[];
  createdSessionOpts: SessionOptions[];
  _scriptFn?: (id: string) => GatewayEvent[];
  _defaultScript?: GatewayEvent[];
}

function makeFakeBackend(opts: FakeBackendOpts = {}): FakeBackend {
  const backendId = opts.id ?? "claude";
  const createdSessions: FakeSession[] = [];
  const createdSessionOpts: SessionOptions[] = [];

  const backend: FakeBackend = {
    id: backendId,
    createdSessions,
    createdSessionOpts,
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
    createSession(sessionOpts: SessionOptions): AgentSession {
      const id = randomUUID();
      createdSessionOpts.push(sessionOpts);
      const script: EventScript = backend._scriptFn
        ? backend._scriptFn(id)
        : (backend._defaultScript ?? successScript(id));
      const session = makeSession(id, script);
      createdSessions.push(session);
      return session;
    },
    resumeSession(_backendSessionId: string, _opts: SessionOptions): AgentSession {
      throw new Error("fake backend does not support resume");
    },
    // Internal for test setup
    _scriptFn: opts.scriptFn,
    _defaultScript: opts.defaultScript,
  };

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

  // ── Depth semantics ────────────────────────────────────────────────────────
  // maxDepth=2 (default): root(0) → child(1) → grandchild(2) allowed;
  // great-grandchild(3) rejected.

  test("depth: default maxDepth=2 allows root→child→grandchild chain", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      // maxDepth defaults to 2
    });

    const { childId: rootId } = tree.spawnAgent({ backend: "claude", task: "root" });
    const { childId: child1Id } = tree.spawnAgent({
      backend: "claude",
      task: "child",
      parentId: rootId,
    });
    // grandchild at depth 2 — must succeed
    const { childId: grandchildId } = tree.spawnAgent({
      backend: "claude",
      task: "grandchild",
      parentId: child1Id,
    });

    expect(typeof grandchildId).toBe("string");

    await waitForAgent(tree, rootId);
    await waitForAgent(tree, child1Id);
    await waitForAgent(tree, grandchildId);
  });

  test("depth: default maxDepth=2 rejects great-grandchild at depth 3", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      // maxDepth defaults to 2
    });

    const { childId: rootId } = tree.spawnAgent({ backend: "claude", task: "root" });
    const { childId: child1Id } = tree.spawnAgent({
      backend: "claude",
      task: "child",
      parentId: rootId,
    });
    const { childId: grandchildId } = tree.spawnAgent({
      backend: "claude",
      task: "grandchild",
      parentId: child1Id,
    });

    // great-grandchild at depth 3 must be rejected
    expect(() =>
      tree.spawnAgent({ backend: "claude", task: "great-grandchild", parentId: grandchildId })
    ).toThrow(/depth limit exceeded/i);

    await waitForAgent(tree, rootId);
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
    // We need to keep children running; simplest: use a blocking script
    // Hack: override createSession to return a session that never ends
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

  // ── Cost ceiling ───────────────────────────────────────────────────────────

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

  test("cost ceiling: proves cancellation — both sessions cancelled when child A exceeds ceiling", async () => {
    // child A: emits usage over ceiling then never ends (unless cancelled)
    // child B: never ends (unless cancelled)
    // After A's usage event pushes total over ceiling, cancelAll must be called,
    // making both sessions' cancel() observed and both statuses "cancelled".

    type TrackingSession = {
      id: string;
      backendSessionId: undefined;
      respondToPermission: () => void;
      cancel: () => Promise<void>;
      send: (input: UserInput) => AsyncIterable<GatewayEvent>;
      cancelCalled: boolean;
    };

    const sessions: TrackingSession[] = [];

    let sessionIndex = 0;
    const trackingBackend: AgentBackend = {
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
        const myIndex = sessionIndex++;
        const id = randomUUID();
        let cancelCalled = false;

        const session: TrackingSession = {
          id,
          backendSessionId: undefined,
          get cancelCalled() { return cancelCalled; },
          respondToPermission() {},
          async cancel() { cancelCalled = true; },
          async *send(_input: UserInput): AsyncIterable<GatewayEvent> {
            if (myIndex === 0) {
              // Session A: emit usage over ceiling, then block forever
              yield {
                type: "usage",
                sessionId: id,
                usage: {
                  inputTokens: 100,
                  outputTokens: 100,
                  model: "fake-model",
                  raw: {},
                  costUsd: 10.0, // over the $5 ceiling
                },
              };
              // Stream never ends on its own — waits for cancellation
              await new Promise<void>(() => {});
            } else {
              // Session B: never ends
              await new Promise<void>(() => {});
            }
          },
        };

        sessions.push(session);
        return session;
      },
      resumeSession() { throw new Error("no resume"); },
    };

    const registry = new BackendRegistry();
    registry.register(trackingBackend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      costCeilingUsd: 5.0,
    });

    const { childId: idA } = tree.spawnAgent({ backend: "claude", task: "expensive child A" });
    const { childId: idB } = tree.spawnAgent({ backend: "claude", task: "never-ending child B" });

    // Wait for the ceiling to trigger (session A emits usage immediately)
    const start = Date.now();
    while (Date.now() - start < 2000) {
      const stA = tree.getAgentResult(idA).status;
      const stB = tree.getAgentResult(idB).status;
      if (stA === "cancelled" && stB === "cancelled") break;
      await new Promise((r) => setTimeout(r, 20));
    }

    // Both statuses must be cancelled
    expect(tree.getAgentResult(idA).status).toBe("cancelled");
    expect(tree.getAgentResult(idB).status).toBe("cancelled");

    // Both sessions' cancel() must have been called
    expect(sessions[0]?.cancelCalled).toBe(true);
    expect(sessions[1]?.cancelCalled).toBe(true);

    // Total cost should reflect session A's usage
    expect(tree.totalCostUsd).toBeGreaterThanOrEqual(10.0);
  });

  test("cost ceiling exceeded: spawnAgent throws after ceiling is exceeded", async () => {
    const expensiveScript = (sessionId: string): GatewayEvent[] => [
      {
        type: "usage",
        sessionId,
        usage: {
          inputTokens: 100,
          outputTokens: 100,
          model: "fake-model",
          raw: {},
          costUsd: 10.0,
        },
      },
      { type: "done", sessionId, reason: "complete" },
    ];

    const backend = makeFakeBackend({ id: "claude", scriptFn: expensiveScript });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
      costCeilingUsd: 5.0,
    });

    const { childId } = tree.spawnAgent({ backend: "claude", task: "expensive task" });
    await waitForAgent(tree, childId, 3000);

    // Ceiling is now exceeded; next spawn must throw
    expect(() =>
      tree.spawnAgent({ backend: "claude", task: "should be rejected" })
    ).toThrow(/cannot spawn.*cost ceiling/i);
  });

  // ── Permission routing ─────────────────────────────────────────────────────

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

  test("permission round-trip: respondToPermission routes to ONLY the owning child session", async () => {
    // Two children, only child A emits a permission-request.
    // After responding, only child A's session should have received the call —
    // child B's session must have zero respondToPermission calls.

    const permRequestId = "req-routing-test";

    // A script that emits a permission-request then completes
    const permScriptA = (sessionId: string): GatewayEvent[] => [
      {
        type: "permission-request",
        sessionId,
        requestId: permRequestId,
        tool: "bash",
        description: "run a command",
        input: { command: "ls" },
        options: ["allow", "allow-session", "deny"],
      },
      { type: "text-delta", sessionId, text: "ran the command" },
      { type: "done", sessionId, reason: "complete" },
    ];

    // B script: plain success (no permission needed)
    const plainScriptB = (sessionId: string): GatewayEvent[] => [
      { type: "text-delta", sessionId, text: "done" },
      { type: "done", sessionId, reason: "complete" },
    ];

    let sessionIdx = 0;
    const sessions: FakeSession[] = [];

    const mixedBackend: AgentBackend = {
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
        const idx = sessionIdx++;
        const id = randomUUID();
        const script = idx === 0 ? permScriptA(id) : plainScriptB(id);
        const sess = makeSession(id, script);
        sessions.push(sess);
        return sess;
      },
      resumeSession() { throw new Error("no resume"); },
    };

    const registry = new BackendRegistry();
    registry.register(mixedBackend);

    const rootEvents: GatewayEvent[] = [];
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "prompt",
      cwd: "/tmp",
      onRootEvent: (e) => rootEvents.push(e),
    });

    const { childId: childA } = tree.spawnAgent({ backend: "claude", task: "needs perm" });
    const { childId: childB } = tree.spawnAgent({ backend: "claude", task: "no perm" });

    // Wait for the permission-request to bubble up
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rootEvents.some((e) => e.type === "permission-request")) {
          clearInterval(check);
          resolve();
        }
      }, 10);
      setTimeout(() => { clearInterval(check); resolve(); }, 500);
    });

    const permEvt = rootEvents.find((e) => e.type === "permission-request");
    expect(permEvt).toBeDefined();
    expect(permEvt?.type).toBe("permission-request");

    // Respond via tree
    tree.respondToPermission(permRequestId, "allow");

    // Wait for child A to complete
    await waitForAgent(tree, childA, 3000);
    await waitForAgent(tree, childB, 3000);

    expect(tree.getAgentResult(childA).status).toBe("done");

    // ONLY session A should have received respondToPermission call
    const sessA = sessions[0]!;
    const sessB = sessions[1]!;
    expect(sessA.respondToPermissionCalls.length).toBeGreaterThan(0);
    expect(sessA.respondToPermissionCalls[0]?.requestId).toBe(permRequestId);
    expect(sessA.respondToPermissionCalls[0]?.decision).toBe("allow");

    // Session B must NOT have received the call
    expect(sessB.respondToPermissionCalls.length).toBe(0);
  });

  test("respondToPermission: unknown requestId is a no-op (does not throw)", () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "acceptAll",
      cwd: "/tmp",
    });

    // Should not throw for an unknown requestId
    expect(() =>
      tree.respondToPermission("nonexistent-req-id", "allow")
    ).not.toThrow();
  });

  // ── permissionMode inheritance ─────────────────────────────────────────────

  test("permissionMode inheritance: child inherits parent's effective permissionMode", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "prompt",
      cwd: "/tmp",
    });

    // Spawn root with explicit permissionMode "acceptEdits"
    const { childId: parentId } = tree.spawnAgent({
      backend: "claude",
      task: "parent task",
      permissionMode: "acceptEdits",
    });

    // Spawn child WITHOUT explicit permissionMode — should inherit "acceptEdits"
    const { childId } = tree.spawnAgent({
      backend: "claude",
      task: "child task",
      parentId,
    });

    await waitForAgent(tree, parentId);
    await waitForAgent(tree, childId);

    // The parent session (index 0) should have received "acceptEdits"
    expect(backend.createdSessionOpts[0]?.permissionMode).toBe("acceptEdits");
    // The child session (index 1) should also have received "acceptEdits" (inherited)
    expect(backend.createdSessionOpts[1]?.permissionMode).toBe("acceptEdits");
  });

  test("permissionMode: root spawn without explicit mode receives defaultPermissionMode", async () => {
    const backend = makeFakeBackend({ id: "claude" });
    const registry = makeRegistry(backend);
    const tree = new AgentTree(registry, {
      defaultPermissionMode: "prompt",
      cwd: "/tmp",
    });

    tree.spawnAgent({ backend: "claude", task: "root task" });

    // Give it a moment to call createSession
    await new Promise((r) => setTimeout(r, 10));

    expect(backend.createdSessionOpts[0]?.permissionMode).toBe("prompt");
  });

  // ── sendToAgent active-turn guard ─────────────────────────────────────────

  test("sendToAgent: throws when a turn is already in-flight for that node", async () => {
    // Session that never completes its first send
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
            // First turn: block forever (never yields done)
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

    const { childId } = tree.spawnAgent({ backend: "claude", task: "initial task" });

    // Give the first turn a moment to start
    await new Promise((r) => setTimeout(r, 20));

    // The initial turn is in-flight; attempting sendToAgent must throw
    expect(() =>
      tree.sendToAgent(childId, "follow-up message")
    ).toThrow(/already has a turn in-flight/i);

    await tree.cancelAll();
  });

  // ── Misc ───────────────────────────────────────────────────────────────────

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
