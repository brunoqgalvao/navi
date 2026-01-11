/**
 * @experimental This feature is experimental and may change or be removed.
 *
 * Proactive Hooks Feature
 *
 * Lightweight AI-powered suggestions that help users during conversation.
 * Uses cheap Haiku calls (via server API) to analyze patterns and surface helpful actions.
 *
 * ## Available Hooks
 *
 * 1. **Skill Scout** - Detects reusable workflows and suggests creating skills
 * 2. **Error Detector** - Spots recurring errors and suggests documentation
 * 3. **Memory Builder** - Learns preferences and saves to project memory
 *
 * ## Usage
 *
 * ```ts
 * import {
 *   setupProactiveHooks,
 *   onUserMessage,
 *   onAssistantMessage,
 *   SuggestionPanel,
 * } from "$lib/features/proactive-hooks";
 *
 * // On app init:
 * await setupProactiveHooks();
 *
 * // After user sends message:
 * await onUserMessage(message, conversation, sessionId, project);
 *
 * // After assistant responds:
 * await onAssistantMessage(message, conversation, sessionId, project);
 * ```
 */

// Types
export type {
  ProactiveHook,
  HookTrigger,
  HookContext,
  HookEvaluation,
  Suggestion,
  SuggestionType,
  SuggestionPriority,
  ErrorPattern,
  MemoryEntry,
  ProjectMemory,
  HookSessionState,
  HookRegistryState,
} from "./types";

// Stores
export {
  hooksEnabled,
  hookConfig,
  hookRegistry,
  createSessionSuggestions,
  pendingSuggestionCount,
} from "./stores";

// Runner
export {
  runHooks,
  startIdleTimer,
  resetIdleTimer,
  stopIdleTimer,
  acceptSuggestion,
  dismissSuggestion,
  detectErrors,
  type RunHooksOptions,
} from "./runner";

// Analyzer
export {
  analyzeForSkill,
  analyzeForMemory,
  analyzeErrorPattern,
  summarizeConversation,
  resetAnalyzerClient,
  checkHooksStatus,
} from "./analyzer";

// Hooks
export { skillScoutHook } from "./hooks/skill-scout";
export { errorDetectorHook } from "./hooks/error-detector";
export { memoryBuilderHook, formatMemoryMarkdown, parseMemoryMarkdown } from "./hooks/memory-builder";

// Components
export { default as SuggestionToast } from "./components/SuggestionToast.svelte";
export { default as SuggestionPanel } from "./components/SuggestionPanel.svelte";

// App Integration
export {
  setupProactiveHooks,
  onUserMessage,
  onAssistantMessage,
  onSessionIdle,
  onSessionEnd,
  startSessionTracking,
  stopSessionTracking,
  buildHookContext,
  areHooksEnabled,
  isInitialized,
} from "./integration";

// Legacy - kept for backwards compatibility
export function initializeHooks(): void {
  console.warn("[ProactiveHooks] initializeHooks() is deprecated. Use setupProactiveHooks() instead.");
}

export function cleanupHooks(): void {
  // No-op - hooks are managed by the registry
}
