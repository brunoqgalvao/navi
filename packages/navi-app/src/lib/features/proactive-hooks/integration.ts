/**
 * Proactive Hooks - App Integration
 *
 * This module provides the integration layer between the proactive hooks
 * system and the main App.svelte.
 *
 * Note: API key handling is done server-side.
 */

import { get } from "svelte/store";
import { hookRegistry } from "./stores";
import { hooksEnabled } from "./stores";
import {
  runHooks,
  startIdleTimer,
  resetIdleTimer,
  stopIdleTimer,
  detectErrors,
} from "./runner";
import { skillScoutHook } from "./hooks/skill-scout";
import { errorDetectorHook } from "./hooks/error-detector";
import { memoryBuilderHook } from "./hooks/memory-builder";
import { checkHooksStatus } from "./analyzer";
import type { HookContext } from "./types";
import type { ChatMessage } from "$lib/stores/types";

// Track initialization state
let initialized = false;

/**
 * Initialize all built-in hooks
 */
function registerBuiltInHooks(): void {
  hookRegistry.register(skillScoutHook);
  hookRegistry.register(errorDetectorHook);
  hookRegistry.register(memoryBuilderHook);
}

/**
 * Initialize the proactive hooks system
 *
 * Call this once when the app starts.
 * Returns true if hooks are available (API key configured).
 */
export async function setupProactiveHooks(): Promise<boolean> {
  if (initialized) {
    console.warn("[ProactiveHooks] Already initialized");
    return true;
  }

  // Check if server has API key configured
  const status = await checkHooksStatus();
  if (!status.enabled) {
    console.log("[ProactiveHooks] Disabled - no API key configured");
    return false;
  }

  registerBuiltInHooks();
  initialized = true;

  console.log("[ProactiveHooks] System initialized with 3 hooks");
  return true;
}

/**
 * Handle a new user message
 */
export async function onUserMessage(
  message: ChatMessage,
  conversation: ChatMessage[],
  sessionId: string,
  project: { id: string; name: string; path: string } | null
): Promise<void> {
  if (!initialized) return;
  if (!get(hooksEnabled)) return;

  // Reset idle timer on user activity
  resetIdleTimer(sessionId, conversation, project);

  // Run post-user-message hooks
  await runHooks({
    trigger: "postUserMessage",
    sessionId,
    message,
    conversation,
    project,
  });
}

/**
 * Handle a new assistant message
 */
export async function onAssistantMessage(
  message: ChatMessage,
  conversation: ChatMessage[],
  sessionId: string,
  project: { id: string; name: string; path: string } | null
): Promise<void> {
  if (!initialized) return;
  if (!get(hooksEnabled)) return;

  // Extract message content for error detection
  const content = typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

  // Detect errors in the response
  detectErrors(sessionId, content);

  // Reset idle timer
  resetIdleTimer(sessionId, conversation, project);

  // Run post-assistant-message hooks
  await runHooks({
    trigger: "postAssistantMessage",
    sessionId,
    message,
    conversation,
    project,
  });
}

/**
 * Handle session becoming idle
 */
export async function onSessionIdle(
  conversation: ChatMessage[],
  sessionId: string,
  project: { id: string; name: string; path: string } | null
): Promise<void> {
  if (!initialized) return;
  if (!get(hooksEnabled)) return;

  await runHooks({
    trigger: "onIdle",
    sessionId,
    conversation,
    project,
  });
}

/**
 * Handle session end
 */
export async function onSessionEnd(
  conversation: ChatMessage[],
  sessionId: string,
  project: { id: string; name: string; path: string } | null
): Promise<void> {
  if (!initialized) return;
  if (!get(hooksEnabled)) return;

  stopIdleTimer();

  await runHooks({
    trigger: "sessionEnd",
    sessionId,
    conversation,
    project,
  });

  hookRegistry.clearSession(sessionId);
}

/**
 * Start idle tracking for a session
 */
export function startSessionTracking(
  conversation: ChatMessage[],
  sessionId: string,
  project: { id: string; name: string; path: string } | null
): void {
  if (!initialized) return;
  startIdleTimer(sessionId, conversation, project);
}

/**
 * Stop idle tracking
 */
export function stopSessionTracking(): void {
  stopIdleTimer();
}

/**
 * Build hook context for manual operations
 */
export function buildHookContext(
  sessionId: string,
  conversation: ChatMessage[],
  project: { id: string; name: string; path: string } | null
): HookContext {
  return {
    sessionId,
    conversation,
    project,
    recentErrors: hookRegistry.getSessionErrors(sessionId),
  };
}

/**
 * Check if hooks are enabled
 */
export function areHooksEnabled(): boolean {
  return get(hooksEnabled);
}

/**
 * Check if system is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}
