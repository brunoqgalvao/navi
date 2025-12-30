/**
 * Application-wide constants
 * Centralized location for magic numbers and configuration values
 */

// =============================================================================
// STREAMING & THROTTLING
// =============================================================================

/** Throttle interval for streaming updates (ms) */
export const STREAMING_THROTTLE_MS = 500;

// =============================================================================
// CONTEXT MANAGEMENT
// =============================================================================

/** Number of recent user/assistant exchanges to keep during context pruning */
export const CONTEXT_RECENT_EXCHANGES_TO_KEEP = 3;

/** Max characters for user message in pruned context */
export const CONTEXT_MAX_USER_MSG_LENGTH = 500;

/** Max characters for assistant text in pruned context */
export const CONTEXT_MAX_ASSISTANT_TEXT_LENGTH = 1000;

/** Number of recent messages to preserve full tool results (the rest get pruned) */
export const TOOL_RESULT_PRESERVE_RECENT_COUNT = 5;

/** Max characters for pruned tool result summary */
export const TOOL_RESULT_PRUNED_MAX_LENGTH = 200;

/** Max age for cached project summary (ms) - 1 day */
export const PROJECT_SUMMARY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// =============================================================================
// TERMINAL
// =============================================================================

/** Maximum lines to keep in terminal output buffer */
export const TERMINAL_MAX_BUFFER_LINES = 500;

/** Default terminal columns */
export const TERMINAL_DEFAULT_COLS = 80;

/** Default terminal rows */
export const TERMINAL_DEFAULT_ROWS = 24;

/** PTY server reconnect interval (ms) */
export const PTY_SERVER_RECONNECT_INTERVAL_MS = 3000;

/** PTY server creation timeout (ms) */
export const PTY_SERVER_CREATION_TIMEOUT_MS = 5000;

/** Patterns to detect errors in terminal output */
export const TERMINAL_ERROR_PATTERNS = [
  /error:/i,
  /ERR!/,
  /failed/i,
  /exception/i,
  /ENOENT/,
  /Cannot find module/,
  /command not found/,
  /permission denied/i,
  /EACCES/,
  /ECONNREFUSED/,
  /TypeError:/,
  /SyntaxError:/,
  /ReferenceError:/,
] as const;

// =============================================================================
// UI & DISPLAY
// =============================================================================

/** Max length for toast messages before truncation */
export const TOAST_MAX_MESSAGE_LENGTH = 150;

/** Tour start delay after project selection (ms) */
export const TOUR_START_DELAY_MS = 500;

// =============================================================================
// NETWORK
// =============================================================================

/** Default PTY server WebSocket URL */
export const DEFAULT_PTY_SERVER_WS_URL = "ws://localhost:3002";

/** Default PTY server HTTP URL */
export const DEFAULT_PTY_SERVER_HTTP_URL = "http://localhost:3002";

export { TOUR_STEPS } from "./constants/tour-steps";
export { HOTKEYS, type Hotkey } from "./constants/hotkeys";
