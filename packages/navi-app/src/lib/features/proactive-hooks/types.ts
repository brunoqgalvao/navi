/**
 * Proactive Hooks - Types
 *
 * Proactive hooks are lightweight analyzers that run during conversation
 * and surface helpful suggestions to the user. They use cheap Haiku calls
 * to evaluate patterns and prompt users with actionable insights.
 */

import type { ChatMessage } from "$lib/stores/types";

// =============================================================================
// HOOK CONFIGURATION
// =============================================================================

/**
 * When a hook should fire
 */
export type HookTrigger =
  | "postUserMessage"      // After user sends a message
  | "postAssistantMessage" // After Claude responds
  | "onIdle"               // After N seconds of no activity
  | "onError"              // When an error is detected in messages
  | "sessionEnd";          // When chat is marked complete

/**
 * What the hook suggests to the user
 */
export type SuggestionType =
  | "skill"    // Save a skill
  | "memory"   // Save to project memory
  | "docs"     // Fetch relevant documentation
  | "action"   // Perform an action (commit, test, etc.)
  | "insight"; // Just informational

/**
 * Priority affects how/when suggestions are shown
 */
export type SuggestionPriority = "low" | "medium" | "high";

// =============================================================================
// HOOK DEFINITION
// =============================================================================

/**
 * Context passed to hook evaluators
 */
export interface HookContext {
  /** Current message (for post-message hooks) */
  message?: ChatMessage;
  /** Full conversation history */
  conversation: ChatMessage[];
  /** Current session ID */
  sessionId: string;
  /** Current project info */
  project: {
    id: string;
    name: string;
    path: string;
  } | null;
  /** Errors detected in recent messages */
  recentErrors: ErrorPattern[];
  /** Time since last message (for idle hooks) */
  idleTimeMs?: number;
}

/**
 * Result of hook evaluation
 */
export interface HookEvaluation {
  /** Should we prompt the user? */
  shouldPrompt: boolean;
  /** Type of suggestion */
  type?: SuggestionType;
  /** Priority affects display style */
  priority?: SuggestionPriority;
  /** Short title for the toast */
  title?: string;
  /** Longer explanation */
  description?: string;
  /** Detailed content for expanded view */
  expandedContent?: string;
  /** Data payload for the action */
  payload?: Record<string, unknown>;
}

/**
 * A proactive hook definition
 */
export interface ProactiveHook {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** When this hook fires */
  trigger: HookTrigger;
  /** Minimum messages before this hook activates */
  minMessages?: number;
  /** Cooldown between prompts (ms) */
  cooldownMs?: number;
  /** Whether this hook is enabled by default */
  defaultEnabled?: boolean;
  /**
   * Quick local check before expensive API call.
   * Return false to skip this hook entirely.
   */
  shouldEvaluate?: (ctx: HookContext) => boolean;
  /**
   * Evaluate whether to prompt user.
   * This is where Haiku gets called.
   */
  evaluate: (ctx: HookContext) => Promise<HookEvaluation>;
  /**
   * Handler when user accepts the suggestion.
   * For skills: generates and saves the skill.
   * For memory: saves to project memory.
   * For docs: fetches and displays docs.
   */
  onAccept?: (ctx: HookContext, payload: Record<string, unknown>) => Promise<void>;
  /**
   * Optional handler when user dismisses.
   * Could be used to tune future suggestions.
   */
  onDismiss?: (ctx: HookContext, payload: Record<string, unknown>) => void;
}

// =============================================================================
// ERROR TRACKING
// =============================================================================

/**
 * Tracked error pattern for error detection hook
 */
export interface ErrorPattern {
  /** Error message or type */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** File where error occurred */
  file?: string;
  /** Line number */
  line?: number;
  /** How many times we've seen this */
  count: number;
  /** First occurrence */
  firstSeen: number;
  /** Most recent occurrence */
  lastSeen: number;
  /** Which library/framework (if detected) */
  library?: string;
}

// =============================================================================
// SUGGESTION (what gets shown to user)
// =============================================================================

/**
 * A suggestion ready to show to the user
 */
export interface Suggestion {
  /** Unique ID for this suggestion instance */
  id: string;
  /** Which hook generated this */
  hookId: string;
  /** Suggestion type */
  type: SuggestionType;
  /** Priority */
  priority: SuggestionPriority;
  /** Toast title */
  title: string;
  /** Toast description */
  description: string;
  /** Expanded content (markdown) */
  expandedContent?: string;
  /** Action payload */
  payload: Record<string, unknown>;
  /** When this was created */
  timestamp: number;
  /** Whether user has seen this */
  seen: boolean;
  /** Session this relates to */
  sessionId: string;
}

// =============================================================================
// HOOK REGISTRY STATE
// =============================================================================

/**
 * State tracked per hook per session
 */
export interface HookSessionState {
  /** Last time this hook fired */
  lastPromptTime: number;
  /** Number of times user accepted */
  acceptCount: number;
  /** Number of times user dismissed */
  dismissCount: number;
}

/**
 * Global hook registry state
 */
export interface HookRegistryState {
  /** Registered hooks */
  hooks: Map<string, ProactiveHook>;
  /** Per-session state for each hook */
  sessionState: Map<string, Map<string, HookSessionState>>;
  /** Active suggestions waiting for user response */
  pendingSuggestions: Suggestion[];
  /** Whether hooks are globally enabled */
  enabled: boolean;
  /** Tracked errors per session */
  sessionErrors: Map<string, ErrorPattern[]>;
}

// =============================================================================
// MEMORY TYPES
// =============================================================================

/**
 * A memory entry to save to project memory
 */
export interface MemoryEntry {
  /** Category of memory */
  category: "preference" | "stack" | "pattern" | "style" | "context";
  /** The actual content */
  content: string;
  /** When this was learned */
  learnedAt: number;
  /** Which session it came from */
  sessionId?: string;
}

/**
 * Project memory structure
 */
export interface ProjectMemory {
  /** User preferences */
  preferences: string[];
  /** Tech stack info */
  stack: string[];
  /** Coding patterns */
  patterns: string[];
  /** Style preferences */
  style: string[];
  /** Project-specific context */
  context: string[];
  /** Last updated */
  updatedAt: number;
}
