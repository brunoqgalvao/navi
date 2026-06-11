import type { AgentBackend, BackendId, DetectResult } from "./types.js";

export class BackendRegistry {
  private readonly _backends = new Map<BackendId, AgentBackend>();
  private _cache: Map<BackendId, DetectResult> | null = null;

  register(backend: AgentBackend): void {
    if (this._backends.has(backend.id)) {
      throw new Error(`Backend with id "${backend.id}" is already registered`);
    }
    this._backends.set(backend.id, backend);
  }

  get(id: BackendId): AgentBackend {
    const backend = this._backends.get(id);
    if (!backend) {
      throw new Error(`No backend registered with id "${id}"`);
    }
    return backend;
  }

  getAll(): AgentBackend[] {
    return Array.from(this._backends.values());
  }

  async detectInstalled(opts?: { refresh?: boolean }): Promise<Map<BackendId, DetectResult>> {
    if (this._cache !== null && !opts?.refresh) {
      return new Map(this._cache);
    }

    const results = new Map<BackendId, DetectResult>();

    await Promise.all(
      Array.from(this._backends.values()).map(async (backend) => {
        try {
          const result = await backend.detect();
          results.set(backend.id, result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.set(backend.id, {
            installed: false,
            authed: false,
            fixHint: `detect failed: ${msg}`,
          });
        }
      })
    );

    this._cache = results;
    return new Map(results);
  }
}
