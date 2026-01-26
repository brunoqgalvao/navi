/**
 * Query Hooks Pipeline
 *
 * A simple, extensible hook system that runs at query lifecycle events.
 * Hooks run in parallel and never block the main query flow.
 *
 * Usage:
 *   import { registerQueryHook, runQueryHooks } from './query-hooks';
 *
 *   // Register a hook
 *   registerQueryHook(async (ctx) => {
 *     console.log(`Query ${ctx.event} for session ${ctx.sessionId}`);
 *   });
 *
 *   // Run hooks (fire-and-forget)
 *   runQueryHooks({ sessionId, event: 'start', messages: [...] });
 */

import type { Message } from "../db";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type QueryEvent = "start" | "complete" | "error";

export interface QueryHookContext {
  sessionId: string;
  projectId?: string;
  event: QueryEvent;
  messages: Message[];      // Last N messages for context
  projectPath?: string;
  error?: string;           // Present when event = 'error'
}

export type QueryHook = (ctx: QueryHookContext) => Promise<void>;

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

const hooks: QueryHook[] = [];

/**
 * Register a hook to run at query lifecycle events.
 * Hooks run in parallel and should not throw (errors are caught and logged).
 */
export function registerQueryHook(hook: QueryHook): void {
  hooks.push(hook);
}

/**
 * Unregister a hook (useful for testing).
 */
export function unregisterQueryHook(hook: QueryHook): void {
  const idx = hooks.indexOf(hook);
  if (idx !== -1) hooks.splice(idx, 1);
}

/**
 * Get count of registered hooks (for debugging).
 */
export function getHookCount(): number {
  return hooks.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all registered hooks in parallel.
 * This is fire-and-forget - it returns immediately and hooks run in background.
 * Errors are caught and logged, never propagated.
 */
export function runQueryHooks(ctx: QueryHookContext): void {
  if (hooks.length === 0) return;

  // Fire-and-forget: run all hooks in parallel, catch errors
  Promise.allSettled(
    hooks.map(async (hook) => {
      try {
        await hook(ctx);
      } catch (err) {
        console.error("[QueryHooks] Hook error:", err);
      }
    })
  ).catch((err) => {
    // This shouldn't happen with allSettled, but just in case
    console.error("[QueryHooks] Unexpected error:", err);
  });
}
