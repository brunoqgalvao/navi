// Claude WebSocket message types

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface ImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | ImageBlock;

export type SystemSubtype =
  | "init"
  | "compact_boundary"
  | "status"
  | "hook_response"
  | "success"
  | "error";

export interface McpServerInfo {
  name: string;
  status: string;
}

export interface SystemMessage {
  type: "system";
  sessionId?: string;
  claudeSessionId?: string;
  subtype: SystemSubtype;
  uuid?: string;
  timestamp?: number;
  cwd?: string;
  model?: string;
  tools?: string[];
  skills?: string[];
  mcp_servers?: McpServerInfo[];
  permissionMode?: string;
  apiKeySource?: string;
  betas?: string[];
  agents?: string[];
  compactMetadata?: {
    trigger: "manual" | "auto";
    pre_tokens: number;
  };
  status?: "compacting" | null;
  hookName?: string;
  hookEvent?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface AssistantMessage {
  type: "assistant";
  sessionId?: string;
  claudeSessionId?: string;
  content: ContentBlock[];
  parentToolUseId: string | null;
  uuid?: string;
  timestamp?: number;
  error?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface UserMessage {
  type: "user";
  sessionId?: string;
  content: ContentBlock[];
  parentToolUseId: string | null;
  uuid?: string;
  timestamp?: number;
  isSynthetic?: boolean;
  toolUseResult?: unknown;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
}

export interface PermissionDenial {
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
}

export interface ResultMessage {
  type: "result";
  sessionId?: string;
  claudeSessionId?: string;
  subtype?:
    | "success"
    | "error_during_execution"
    | "error_max_turns"
    | "error_max_budget_usd"
    | "error_max_structured_output_retries";
  costUsd: number;
  durationMs: number;
  durationApiMs?: number;
  numTurns: number;
  isError?: boolean;
  result?: string;
  errors?: string[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, ModelUsage>;
  permissionDenials?: PermissionDenial[];
  structuredOutput?: unknown;
  uuid?: string;
  timestamp?: number;
}

export interface ErrorMessage {
  type: "error";
  error: string;
  uuid?: string;
  timestamp?: number;
}

export interface DoneMessage {
  type: "done";
  uuid?: string;
  timestamp?: number;
}

export interface ToolProgressMessage {
  type: "tool_progress";
  toolUseId: string;
  toolName: string;
  parentToolUseId: string | null;
  elapsedTimeSeconds: number;
  uuid?: string;
  timestamp?: number;
}

export interface PermissionRequestMessage {
  type: "permission_request";
  requestId: string;
  tools: string[];
  toolName?: string;
  toolInput?: Record<string, unknown>;
  message: string;
  uuid?: string;
  timestamp?: number;
}

export interface StreamEventMessage {
  type: "stream_event";
  sessionId?: string;
  claudeSessionId?: string;
  event: StreamEvent;
  parentToolUseId: string | null;
  uuid?: string;
  timestamp?: number;
}

export type StreamEventType =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop";

export interface StreamEvent {
  type: StreamEventType;
  index?: number;
  message?: {
    id: string;
    type: string;
    role: string;
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  content_block?: ContentBlock;
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
  usage?: {
    output_tokens: number;
  };
}

export interface AuthStatusMessage {
  type: "auth_status";
  sessionId?: string;
  claudeSessionId?: string;
  isAuthenticating: boolean;
  output: string[];
  error?: string;
  uuid?: string;
  timestamp?: number;
}

export interface UnknownMessage {
  type: "unknown";
  raw: unknown;
  uuid?: string;
  timestamp?: number;
}

export type ClaudeMessage =
  | SystemMessage
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | ErrorMessage
  | DoneMessage
  | ToolProgressMessage
  | PermissionRequestMessage
  | StreamEventMessage
  | AuthStatusMessage
  | UnknownMessage
  | { type: "connected" }
  | { type: "aborted"; sessionId?: string }
  | { type: "ui_command"; command: string; payload: Record<string, unknown> };

export interface QueryOptions {
  prompt: string;
  projectId?: string;
  sessionId?: string;
  claudeSessionId?: string;
  workingDirectory?: string;
  allowedTools?: string[];
  model?: string;
  historyContext?: string;
}
