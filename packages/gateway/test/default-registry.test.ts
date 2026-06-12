/**
 * default-registry.test.ts
 *
 * Verifies that createDefaultRegistry() always returns a registry with all
 * three backends, regardless of what CLIs are installed on the current machine.
 */

import { expect, test, describe } from "bun:test";
import { createDefaultRegistry } from "../src/default-registry.js";
import { BackendRegistry } from "../src/registry.js";

describe("createDefaultRegistry", () => {
  test("returns a BackendRegistry instance", () => {
    const registry = createDefaultRegistry();
    expect(registry).toBeInstanceOf(BackendRegistry);
  });

  test("always registers exactly 3 backends", () => {
    const registry = createDefaultRegistry();
    expect(registry.getAll()).toHaveLength(3);
  });

  test("registers claude backend", () => {
    const registry = createDefaultRegistry();
    const backend = registry.get("claude");
    expect(backend.id).toBe("claude");
  });

  test("registers codex backend", () => {
    const registry = createDefaultRegistry();
    const backend = registry.get("codex");
    expect(backend.id).toBe("codex");
  });

  test("registers gemini backend", () => {
    const registry = createDefaultRegistry();
    const backend = registry.get("gemini");
    expect(backend.id).toBe("gemini");
  });

  test("constructors do not probe system (no throws at creation time)", () => {
    // If constructors did spawn/stat at construction, they would throw in test
    // env with a restricted PATH or missing CLIs. The fact that we can call
    // createDefaultRegistry() without error proves backends are lazy.
    expect(() => createDefaultRegistry()).not.toThrow();
  });

  test("each call returns a fresh registry (no shared state)", () => {
    const r1 = createDefaultRegistry();
    const r2 = createDefaultRegistry();
    // They should be distinct instances
    expect(r1).not.toBe(r2);
    // Both have 3 backends
    expect(r1.getAll()).toHaveLength(3);
    expect(r2.getAll()).toHaveLength(3);
  });

  test("detect() resolves without throwing even when CLI is absent", async () => {
    const registry = createDefaultRegistry();
    // detectInstalled runs detect() on all backends in an env where CLIs may
    // or may not be installed. It must never throw — the registry wraps errors
    // into {installed:false, fixHint}.
    let results: Map<string, unknown>;
    await expect(
      (async () => {
        results = await registry.detectInstalled();
      })()
    ).resolves.toBeUndefined();
    // @ts-ignore — results is assigned in the async block above
    expect(results.size).toBe(3);
  });

  test("detect() for each backend returns {installed, authed} shape", async () => {
    const registry = createDefaultRegistry();
    const results = await registry.detectInstalled();
    for (const [, result] of results) {
      const r = result as { installed: boolean; authed: boolean; fixHint?: string };
      expect(typeof r.installed).toBe("boolean");
      expect(typeof r.authed).toBe("boolean");
      // If not installed, a fixHint must be present to guide users
      if (!r.installed) {
        expect(typeof r.fixHint).toBe("string");
        expect((r.fixHint as string).length).toBeGreaterThan(0);
      }
    }
  });
});
