/**
 * Proactive Hooks - Runner
 *
 * Orchestrates hook evaluation and suggestion display.
 * This is the main entry point for triggering hooks from the message flow.
 *
 * Note: API key handling is done server-side, not needed here.
 */

import { get } from "svelte/store";
import { hookRegistry, hooksEnabled, hookConfig } from "./stores";
import type {
  ProactiveHook,
  HookContext,
  HookTrigger,
  Suggestion,
  HookEvaluation,
} from "./types";
import type { ChatMessage } from "$lib/stores/types";

// =============================================================================
// RUNNER STATE
// =============================================================================

/** Idle timer reference */
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Default idle timeout (30 seconds) */
const IDLE_TIMEOUT_MS = 30_000;

/** Last activity timestamp per session */
const lastActivity = new Map<string, number>();

// =============================================================================
// HOOK RUNNER
// =============================================================================

/**
 * Options for running hooks
 */
export interface RunHooksOptions {
  trigger: HookTrigger;
  sessionId: string;
  message?: ChatMessage;
  conversation: ChatMessage[];
  project: {
    id: string;
    name: string;
    path: string;
  } | null;
}

/**
 * Run all hooks for a specific trigger
 *
 * Returns suggestions that should be shown to the user
 */
export async function runHooks(options: RunHooksOptions): Promise<Suggestion[]> {
  const { trigger, sessionId, message, conversation, project } = options;

  // Check if hooks are globally enabled
  if (!get(hooksEnabled)) {
    return [];
  }

  // Get all hooks for this trigger
  const hooks = hookRegistry.getByTrigger(trigger);
  if (hooks.length === 0) {
    return [];
  }

  // Update activity timestamp
  lastActivity.set(sessionId, Date.now());

  // Build context
  const ctx: HookContext = {
    message,
    conversation,
    sessionId,
    project,
    recentErrors: hookRegistry.getSessionErrors(sessionId),
    idleTimeMs: trigger === "onIdle"
      ? Date.now() - (lastActivity.get(sessionId) || Date.now())
      : undefined,
  };

  const suggestions: Suggestion[] = [];

  // Run each hook
  for (const hook of hooks) {
    try {
      const suggestion = await runSingleHook(hook, ctx);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    } catch (error) {
      console.error(`[ProactiveHooks] Error running hook ${hook.id}:`, error);
    }
  }

  return suggestions;
}

/**
 * Run a single hook
 */
async function runSingleHook(
  hook: ProactiveHook,
  ctx: HookContext
): Promise<Suggestion | null> {
  // Check if hook is enabled
  if (!hookConfig.isEnabled(hook.id, hook.defaultEnabled ?? true)) {
    return null;
  }

  // Check minimum messages
  if (hook.minMessages && ctx.conversation.length < hook.minMessages) {
    return null;
  }

  // Check cooldown
  const sessionState = hookRegistry.getSessionState(ctx.sessionId, hook.id);
  if (hook.cooldownMs && sessionState.lastPromptTime > 0) {
    const elapsed = Date.now() - sessionState.lastPromptTime;
    if (elapsed < hook.cooldownMs) {
      return null;
    }
  }

  // Quick local check
  if (hook.shouldEvaluate && !hook.shouldEvaluate(ctx)) {
    return null;
  }

  // Run the expensive evaluation
  let evaluation: HookEvaluation;
  try {
    evaluation = await hook.evaluate(ctx);
  } catch (error) {
    console.error(`[ProactiveHooks] Evaluation failed for ${hook.id}:`, error);
    return null;
  }

  // Check if we should prompt
  if (!evaluation.shouldPrompt) {
    return null;
  }

  // Update session state
  hookRegistry.updateSessionState(ctx.sessionId, hook.id, {
    lastPromptTime: Date.now(),
  });

  // Create suggestion
  const suggestion: Suggestion = {
    id: crypto.randomUUID(),
    hookId: hook.id,
    type: evaluation.type || "insight",
    priority: evaluation.priority || "medium",
    title: evaluation.title || hook.name,
    description: evaluation.description || "",
    expandedContent: evaluation.expandedContent,
    payload: evaluation.payload || {},
    timestamp: Date.now(),
    seen: false,
    sessionId: ctx.sessionId,
  };

  // Add to registry
  hookRegistry.addSuggestion(suggestion);

  return suggestion;
}

// =============================================================================
// IDLE HOOK MANAGEMENT
// =============================================================================

/**
 * Start the idle timer for a session
 */
export function startIdleTimer(
  sessionId: string,
  conversation: ChatMessage[],
  project: { id: string; name: string; path: string } | null
): void {
  // Clear existing timer
  stopIdleTimer();

  // Set last activity
  lastActivity.set(sessionId, Date.now());

  // Start new timer
  idleTimer = setTimeout(async () => {
    await runHooks({
      trigger: "onIdle",
      sessionId,
      conversation,
      project,
    });
    // Suggestions are already added to the registry by runHooks
    // The UI will pick them up via the store subscription
  }, IDLE_TIMEOUT_MS);
}

/**
 * Reset the idle timer (call on user activity)
 */
export function resetIdleTimer(
  sessionId: string,
  conversation: ChatMessage[],
  project: { id: string; name: string; path: string } | null
): void {
  lastActivity.set(sessionId, Date.now());
  startIdleTimer(sessionId, conversation, project);
}

/**
 * Stop the idle timer
 */
export function stopIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

// =============================================================================
// SUGGESTION HANDLERS
// =============================================================================

/**
 * Handle user accepting a suggestion
 */
export async function acceptSuggestion(
  suggestionId: string,
  ctx: HookContext
): Promise<void> {
  const state = get(hookRegistry);
  const suggestion = state.pendingSuggestions.find(s => s.id === suggestionId);

  if (!suggestion) {
    console.warn(`[ProactiveHooks] Suggestion ${suggestionId} not found`);
    return;
  }

  const hook = state.hooks.get(suggestion.hookId);
  if (!hook) {
    console.warn(`[ProactiveHooks] Hook ${suggestion.hookId} not found`);
    hookRegistry.removeSuggestion(suggestionId);
    return;
  }

  // Update stats
  hookRegistry.updateSessionState(ctx.sessionId, hook.id, {
    acceptCount: hookRegistry.getSessionState(ctx.sessionId, hook.id).acceptCount + 1,
  });

  // Run accept handler
  if (hook.onAccept) {
    try {
      await hook.onAccept(ctx, suggestion.payload);
    } catch (error) {
      console.error(`[ProactiveHooks] Accept handler failed for ${hook.id}:`, error);
    }
  }

  // Remove suggestion
  hookRegistry.removeSuggestion(suggestionId);
}

/**
 * Handle user dismissing a suggestion
 */
export function dismissSuggestion(
  suggestionId: string,
  sessionId: string
): void {
  const state = get(hookRegistry);
  const suggestion = state.pendingSuggestions.find(s => s.id === suggestionId);

  if (!suggestion) {
    return;
  }

  const hook = state.hooks.get(suggestion.hookId);
  if (hook) {
    // Update stats
    hookRegistry.updateSessionState(sessionId, hook.id, {
      dismissCount: hookRegistry.getSessionState(sessionId, hook.id).dismissCount + 1,
    });

    // Run dismiss handler
    if (hook.onDismiss) {
      hook.onDismiss({ sessionId, conversation: [], project: null, recentErrors: [] }, suggestion.payload);
    }
  }

  // Remove suggestion
  hookRegistry.removeSuggestion(suggestionId);
}

// =============================================================================
// ERROR DETECTION HELPER
// =============================================================================

/**
 * Detect and track errors from message content
 */
export function detectErrors(
  sessionId: string,
  content: string
): void {
  // Common error patterns
  const errorPatterns = [
    // JavaScript/TypeScript errors
    /(?:Error|TypeError|ReferenceError|SyntaxError):\s*(.+?)(?:\n|$)/gi,
    // Stack traces
    /at\s+.+?\s+\((.+?):(\d+):\d+\)/g,
    // Build errors
    /(?:error|failed|failure)(?:\[.+?\])?:\s*(.+?)(?:\n|$)/gi,
    // Python errors
    /(?:Traceback|Exception|Error):\s*(.+?)(?:\n|$)/gi,
  ];

  for (const pattern of errorPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const errorMessage = match[1]?.trim();
      if (errorMessage && errorMessage.length > 5) {
        hookRegistry.trackError(sessionId, {
          message: errorMessage,
          file: match[2] || undefined,
          line: match[3] ? parseInt(match[3]) : undefined,
        });
      }
    }
  }

  // Detect library from common patterns
  const libraryPatterns: Array<[RegExp, string]> = [
    [/react|jsx|useState|useEffect/i, "React"],
    [/svelte|\.svelte/i, "Svelte"],
    [/vue|\.vue/i, "Vue"],
    [/next|getServerSideProps|getStaticProps/i, "Next.js"],
    [/express|app\.get|app\.post/i, "Express"],
    [/prisma|@prisma/i, "Prisma"],
    [/tailwind|@apply/i, "Tailwind CSS"],
    [/typescript|\.ts:|type\s+\w+\s*=/i, "TypeScript"],
  ];

  for (const [pattern, library] of libraryPatterns) {
    if (pattern.test(content)) {
      // Update the most recent error with library info
      const errors = hookRegistry.getSessionErrors(sessionId);
      if (errors.length > 0) {
        const latest = errors[errors.length - 1];
        if (!latest.library) {
          latest.library = library;
        }
      }
      break;
    }
  }
}
