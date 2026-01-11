/**
 * Unified Backend Adapter Types
 *
 * This abstraction allows Navi to work with multiple AI CLI backends
 * (Claude Code, Codex, Gemini) through a common interface.
 *
 * Claude Code SDK is the reference implementation - others are adapted to match.
 */

// =============================================================================
// Backend Identification
// =============================================================================

export type BackendId = 'claude' | 'codex' | 'gemini';

export interface BackendInfo {
  id: BackendId;
  name: string;
  description: string;
  installed: boolean;
  version?: string;
  path?: string;
}

// =============================================================================
// Normalized Message Types (matches Claude SDK structure)
// =============================================================================

export type NormalizedMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface NormalizedTextContent {
  type: 'text';
  text: string;
}

export interface NormalizedToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface NormalizedToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface NormalizedThinkingContent {
  type: 'thinking';
  thinking: string;
}

export type NormalizedContentBlock =
  | NormalizedTextContent
  | NormalizedToolUseContent
  | NormalizedToolResultContent
  | NormalizedThinkingContent;

// =============================================================================
// Normalized Event Types (streaming)
// =============================================================================

export interface SystemInitEvent {
  type: 'system';
  subtype: 'init';
  sessionId: string;
  backendId: BackendId;
  model: string;
  cwd: string;
  tools?: string[];
}

export interface SystemStatusEvent {
  type: 'system';
  subtype: 'status';
  status: string;
}

export interface AssistantMessageEvent {
  type: 'assistant';
  sessionId: string;
  content: NormalizedContentBlock[];
  parentToolUseId?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface UserMessageEvent {
  type: 'user';
  sessionId: string;
  content: NormalizedContentBlock[];
  parentToolUseId?: string;
}

export interface ToolProgressEvent {
  type: 'tool_progress';
  toolUseId: string;
  toolName: string;
  elapsedTimeSeconds?: number;
}

export interface PermissionRequestEvent {
  type: 'permission_request';
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  message: string;
}

export interface ResultEvent {
  type: 'result';
  sessionId: string;
  subtype: 'success' | 'error' | 'cancelled';
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  isError?: boolean;
  result?: string;
  errors?: string[];
}

export interface ErrorEvent {
  type: 'error';
  sessionId: string;
  error: string;
  code?: string;
}

export interface CompleteEvent {
  type: 'complete';
  sessionId: string;
  lastAssistantContent?: NormalizedContentBlock[];
  resultData?: {
    session_id: string;
    model: string;
    total_cost_usd?: number;
    num_turns?: number;
  };
}

export type NormalizedEvent =
  | SystemInitEvent
  | SystemStatusEvent
  | AssistantMessageEvent
  | UserMessageEvent
  | ToolProgressEvent
  | PermissionRequestEvent
  | ResultEvent
  | ErrorEvent
  | CompleteEvent;

// =============================================================================
// Query Options (unified across backends)
// =============================================================================

export interface QueryOptions {
  prompt: string;
  cwd: string;
  sessionId: string;

  // Optional settings
  model?: string;
  resume?: string;

  // Permission handling
  permissionMode?: 'auto' | 'confirm' | 'deny';
  autoApproveTools?: string[];

  // Backend-specific options (passed through)
  backendOptions?: Record<string, unknown>;
}

// =============================================================================
// Permission Response
// =============================================================================

export interface PermissionResponse {
  requestId: string;
  approved: boolean;
  approveAll?: boolean;
}

// =============================================================================
// Backend Adapter Interface
// =============================================================================

export interface BackendAdapter {
  /** Unique identifier */
  readonly id: BackendId;

  /** Human-readable name */
  readonly name: string;

  /** Available models for this backend */
  readonly models: string[];

  /** Default model */
  readonly defaultModel: string;

  /**
   * Check if this backend is installed and available
   */
  detect(): Promise<BackendInfo>;

  /**
   * Start a query and yield normalized events
   * This is an async generator that streams events as they occur
   */
  query(options: QueryOptions): AsyncGenerator<NormalizedEvent, void, unknown>;

  /**
   * Send a permission response back to the backend
   */
  respondToPermission(response: PermissionResponse): void;

  /**
   * Cancel the current query
   */
  cancel(): void;

  /**
   * Whether this backend supports callback-based permissions
   * (vs flag-based like --yolo)
   */
  readonly supportsCallbackPermissions: boolean;

  /**
   * Whether this backend supports session resume
   */
  readonly supportsResume: boolean;
}

// =============================================================================
// Backend Registry
// =============================================================================

export interface BackendRegistry {
  /**
   * Get all registered backends
   */
  getAll(): BackendAdapter[];

  /**
   * Get a specific backend by ID
   */
  get(id: BackendId): BackendAdapter | undefined;

  /**
   * Detect which backends are installed
   */
  detectInstalled(): Promise<BackendInfo[]>;

  /**
   * Register a new backend adapter
   */
  register(adapter: BackendAdapter): void;
}
