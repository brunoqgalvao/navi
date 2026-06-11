import { describe, expect, test } from "bun:test";
import { BackendRegistry } from "../src/registry";
import type { AgentBackend, BackendId, Capabilities, DetectResult, SessionOptions } from "../src/types";
import type { AgentSession, UserInput } from "../src/types";
import type { GatewayEvent, PermissionDecision } from "../src/events";

// Minimal stub that satisfies AgentBackend
function makeBackend(id: BackendId, detectResult: DetectResult = { installed: true, authed: true }): AgentBackend {
  return {
    id,
    capabilities(): Capabilities {
      return {
        streaming: true,
        thinkingStream: false,
        permissions: "callback",
        resume: false,
        mcp: false,
        skills: "native",
        models: [{ id: "model-1", label: "Model 1", default: true }],
      };
    },
    async detect(): Promise<DetectResult> {
      return detectResult;
    },
    createSession(_opts: SessionOptions): AgentSession {
      throw new Error("not implemented");
    },
    resumeSession(_backendSessionId: string, _opts: SessionOptions): AgentSession {
      throw new Error("not implemented");
    },
  };
}

describe("BackendRegistry", () => {
  test("register and get roundtrip", () => {
    const registry = new BackendRegistry();
    const backend = makeBackend("claude");
    registry.register(backend);
    expect(registry.get("claude")).toBe(backend);
  });

  test("duplicate register throws", () => {
    const registry = new BackendRegistry();
    registry.register(makeBackend("claude"));
    expect(() => registry.register(makeBackend("claude"))).toThrow();
  });

  test("unknown get throws with clear message", () => {
    const registry = new BackendRegistry();
    expect(() => registry.get("codex")).toThrow(/codex/);
  });

  test("getAll returns all registered backends in insertion order", () => {
    const registry = new BackendRegistry();
    const claude = makeBackend("claude");
    const codex = makeBackend("codex");
    const gemini = makeBackend("gemini");
    registry.register(claude);
    registry.register(codex);
    registry.register(gemini);
    expect(registry.getAll()).toEqual([claude, codex, gemini]);
  });

  test("detectInstalled returns results for each backend", async () => {
    const registry = new BackendRegistry();
    registry.register(makeBackend("claude", { installed: true, authed: true, version: "1.0" }));
    registry.register(makeBackend("codex", { installed: false, authed: false, fixHint: "install codex" }));
    const results = await registry.detectInstalled();
    expect(results.get("claude")).toEqual({ installed: true, authed: true, version: "1.0" });
    expect(results.get("codex")).toEqual({ installed: false, authed: false, fixHint: "install codex" });
  });

  test("detectInstalled caches results (no re-probe without refresh)", async () => {
    let callCount = 0;
    const countingBackend: AgentBackend = {
      id: "claude",
      capabilities: makeBackend("claude").capabilities,
      async detect(): Promise<DetectResult> {
        callCount++;
        return { installed: true, authed: true };
      },
      createSession: makeBackend("claude").createSession,
      resumeSession: makeBackend("claude").resumeSession,
    };
    const registry = new BackendRegistry();
    registry.register(countingBackend);

    await registry.detectInstalled();
    await registry.detectInstalled(); // second call — should NOT re-probe
    expect(callCount).toBe(1);
  });

  test("detectInstalled re-probes with refresh:true", async () => {
    let callCount = 0;
    const countingBackend: AgentBackend = {
      id: "claude",
      capabilities: makeBackend("claude").capabilities,
      async detect(): Promise<DetectResult> {
        callCount++;
        return { installed: true, authed: true };
      },
      createSession: makeBackend("claude").createSession,
      resumeSession: makeBackend("claude").resumeSession,
    };
    const registry = new BackendRegistry();
    registry.register(countingBackend);

    await registry.detectInstalled();
    await registry.detectInstalled({ refresh: true }); // should re-probe
    expect(callCount).toBe(2);
  });

  test("a backend whose detect() rejects yields installed:false instead of throwing", async () => {
    const failingBackend: AgentBackend = {
      id: "gemini",
      capabilities: makeBackend("gemini").capabilities,
      async detect(): Promise<DetectResult> {
        throw new Error("binary not found");
      },
      createSession: makeBackend("gemini").createSession,
      resumeSession: makeBackend("gemini").resumeSession,
    };
    const registry = new BackendRegistry();
    registry.register(failingBackend);

    const results = await registry.detectInstalled();
    const entry = results.get("gemini");
    expect(entry).toBeDefined();
    expect(entry!.installed).toBe(false);
    expect(entry!.authed).toBe(false);
    expect(entry!.fixHint).toMatch(/detect failed/);
    expect(entry!.fixHint).toMatch(/binary not found/);
  });

  test("detectInstalled returns a defensive copy; mutating it does not affect subsequent calls", async () => {
    const registry = new BackendRegistry();
    registry.register(makeBackend("claude", { installed: true, authed: true }));

    const results1 = await registry.detectInstalled();
    results1.set("fake-backend", { installed: true, authed: true });
    results1.delete("claude");

    const results2 = await registry.detectInstalled();
    expect(results2.has("claude")).toBe(true);
    expect(results2.has("fake-backend")).toBe(false);
  });

  test("mixed result: one backend succeeds, one rejects; both appear in results and cache is populated", async () => {
    let successDetectCount = 0;
    let failDetectCount = 0;

    const successBackend: AgentBackend = {
      id: "success-backend",
      capabilities: makeBackend("success-backend").capabilities,
      async detect(): Promise<DetectResult> {
        successDetectCount++;
        return { installed: true, authed: true, version: "1.0" };
      },
      createSession: makeBackend("success-backend").createSession,
      resumeSession: makeBackend("success-backend").resumeSession,
    };

    const failBackend: AgentBackend = {
      id: "fail-backend",
      capabilities: makeBackend("fail-backend").capabilities,
      async detect(): Promise<DetectResult> {
        failDetectCount++;
        throw new Error("setup failed");
      },
      createSession: makeBackend("fail-backend").createSession,
      resumeSession: makeBackend("fail-backend").resumeSession,
    };

    const registry = new BackendRegistry();
    registry.register(successBackend);
    registry.register(failBackend);

    const results = await registry.detectInstalled();

    // Both entries should exist
    expect(results.has("success-backend")).toBe(true);
    expect(results.has("fail-backend")).toBe(true);

    // Success entry has correct data
    expect(results.get("success-backend")).toEqual({ installed: true, authed: true, version: "1.0" });

    // Fail entry has installed:false and fixHint
    const failEntry = results.get("fail-backend");
    expect(failEntry).toBeDefined();
    expect(failEntry!.installed).toBe(false);
    expect(failEntry!.authed).toBe(false);
    expect(failEntry!.fixHint).toMatch(/detect failed/);
    expect(failEntry!.fixHint).toMatch(/setup failed/);

    // Cache should be populated: second call should not re-probe
    const results2 = await registry.detectInstalled();
    expect(successDetectCount).toBe(1);
    expect(failDetectCount).toBe(1);
    expect(results2.get("success-backend")).toEqual({ installed: true, authed: true, version: "1.0" });
  });
});
