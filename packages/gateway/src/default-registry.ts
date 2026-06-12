/**
 * default-registry.ts — creates a BackendRegistry pre-populated with all three
 * built-in backends (claude, codex, gemini).
 *
 * Contract: ALL three backends are registered unconditionally at construction
 * time. Backends MUST NOT probe the system (spawn, stat, etc.) during
 * construction — that is the job of detect(). Consumers call
 * registry.detectInstalled() to learn which backends are actually usable, and
 * read DetectResult.fixHint to surface install/auth guidance.
 *
 * "Missing CLI ≠ missing backend." The registry is always fully populated.
 */

import { BackendRegistry } from "./registry.js";
import { ClaudeBackend } from "./adapters/claude.js";
import { CodexBackend } from "./adapters/codex.js";
import { GeminiBackend } from "./adapters/gemini.js";

export function createDefaultRegistry(): BackendRegistry {
  const registry = new BackendRegistry();
  registry.register(new ClaudeBackend());
  registry.register(new CodexBackend());
  registry.register(new GeminiBackend());
  return registry;
}
