/**
 * Backend Registry
 *
 * Central registry for all backend adapters.
 * Provides detection, selection, and access to backends.
 */

import type {
  BackendAdapter,
  BackendRegistry,
  BackendId,
  BackendInfo,
} from "./types";
import { claudeAdapter } from "./claude-adapter";
import { codexAdapter } from "./codex-adapter";
import { geminiAdapter } from "./gemini-adapter";

// Export types
export * from "./types";

// Export individual adapters
export { claudeAdapter } from "./claude-adapter";
export { codexAdapter } from "./codex-adapter";
export { geminiAdapter } from "./gemini-adapter";

class BackendRegistryImpl implements BackendRegistry {
  private adapters = new Map<BackendId, BackendAdapter>();

  constructor() {
    // Register default adapters
    this.register(claudeAdapter);
    this.register(codexAdapter);
    this.register(geminiAdapter);
  }

  getAll(): BackendAdapter[] {
    return Array.from(this.adapters.values());
  }

  get(id: BackendId): BackendAdapter | undefined {
    return this.adapters.get(id);
  }

  async detectInstalled(): Promise<BackendInfo[]> {
    const results = await Promise.all(
      this.getAll().map((adapter) => adapter.detect())
    );
    return results;
  }

  register(adapter: BackendAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }
}

// Singleton registry
export const backendRegistry = new BackendRegistryImpl();

/**
 * Get the appropriate adapter for a backend ID
 */
export function getAdapter(id: BackendId): BackendAdapter {
  const adapter = backendRegistry.get(id);
  if (!adapter) {
    throw new Error(`Unknown backend: ${id}`);
  }
  return adapter;
}

/**
 * Get the default adapter (Claude)
 */
export function getDefaultAdapter(): BackendAdapter {
  return claudeAdapter;
}

/**
 * Detect all installed backends
 */
export async function detectBackends(): Promise<BackendInfo[]> {
  return backendRegistry.detectInstalled();
}

/**
 * Get models for a specific backend
 */
export function getModels(id: BackendId): string[] {
  const adapter = backendRegistry.get(id);
  return adapter?.models ?? [];
}

/**
 * Get all available models grouped by backend
 */
export function getAllModels(): Record<BackendId, string[]> {
  const result: Record<string, string[]> = {};
  for (const adapter of backendRegistry.getAll()) {
    result[adapter.id] = adapter.models;
  }
  return result as Record<BackendId, string[]>;
}
