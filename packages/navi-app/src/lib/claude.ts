import { getWsUrl } from "./config";

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

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock | ImageBlock;

export type SystemSubtype = "init" | "compact_boundary" | "status" | "hook_response" | "success" | "error";

export interface McpServerInfo {
  name: string;
  status: string;
}

export interface SystemMessage {
  type: "system";
  sessionId?: string;
  claudeSessionId?: string;
  uiSessionId?: string;
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
  uiSessionId?: string;
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
  uiSessionId?: string;
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
  uiSessionId?: string;
  subtype?: "success" | "error_during_execution" | "error_max_turns" | "error_max_budget_usd" | "error_max_structured_output_retries";
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
  uiSessionId?: string;
  error: string;
  uuid?: string;
  timestamp?: number;
}

export interface DoneMessage {
  type: "done";
  uiSessionId?: string;
  finalMessageId?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  uuid?: string;
  timestamp?: number;
}

export interface ToolProgressMessage {
  type: "tool_progress";
  uiSessionId?: string;
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

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionItem {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionMessage {
  type: "ask_user_question";
  requestId: string;
  sessionId?: string;
  questions: QuestionItem[];
  uuid?: string;
  timestamp?: number;
}

export interface StreamEventMessage {
  type: "stream_event";
  sessionId?: string;
  claudeSessionId?: string;
  uiSessionId?: string;
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

// Session Hierarchy Events (Multi-Agent)
export interface SessionSpawnedMessage {
  type: "session:spawned";
  session: {
    id: string;
    title: string;
    role: string | null;
    task: string | null;
    agent_status: string;
    depth: number;
    parent_session_id: string | null;
    root_session_id: string | null;
  };
  parentId: string;
}

export interface SessionStatusChangedMessage {
  type: "session:status_changed";
  sessionId: string;
  status: string;
  previousStatus: string;
}

export interface SessionEscalatedMessage {
  type: "session:escalated";
  sessionId: string;
  escalation: {
    type: string;
    summary: string;
    context: string;
    options?: string[];
    created_at: number;
  };
}

export interface SessionEscalationResolvedMessage {
  type: "session:escalation_resolved";
  sessionId: string;
  response: {
    action: string;
    content: string;
  };
}

export interface SessionDeliveredMessage {
  type: "session:delivered";
  sessionId: string;
  deliverable: {
    type: string;
    summary: string;
    content: any;
    artifacts?: Array<{ path: string; description?: string }>;
  };
}

export interface SessionArchivedMessage {
  type: "session:archived";
  sessionId: string;
}

export interface SessionDecisionLoggedMessage {
  type: "session:decision_logged";
  decision: {
    id: string;
    root_session_id: string;
    session_id: string;
    category: string | null;
    decision: string;
    rationale: string | null;
    created_at: number;
  };
}

export interface SessionArtifactCreatedMessage {
  type: "session:artifact_created";
  artifact: {
    id: string;
    session_id: string;
    root_session_id: string;
    path: string;
    description: string | null;
    artifact_type: string | null;
    created_at: number;
  };
}

export type SessionHierarchyMessage =
  | SessionSpawnedMessage
  | SessionStatusChangedMessage
  | SessionEscalatedMessage
  | SessionEscalationResolvedMessage
  | SessionDeliveredMessage
  | SessionArchivedMessage
  | SessionDecisionLoggedMessage
  | SessionArtifactCreatedMessage;

// Cloud execution message types
export interface CloudExecutionStartedMessage {
  type: "cloud_execution_started";
  uiSessionId?: string;
  executionId: string;
  repoUrl?: string;
  branch?: string;
}

export interface CloudStageMessage {
  type: "cloud_stage";
  uiSessionId?: string;
  executionId: string;
  stage: "starting" | "cloning" | "checkout" | "executing" | "syncing" | "completed" | "failed";
  message?: string;
}

export interface CloudOutputMessage {
  type: "cloud_output";
  uiSessionId?: string;
  executionId: string;
  stream: "stdout" | "stderr";
  data: string;
}

export interface CloudResultMessage {
  type: "cloud_result";
  uiSessionId?: string;
  executionId: string;
  success: boolean;
  exitCode: number;
  modifiedFiles?: string[];
  syncedFiles?: string[];
  duration: number;
  estimatedCostUsd?: number;
  error?: string;
}

export interface CloudErrorMessage {
  type: "cloud_error";
  uiSessionId?: string;
  executionId: string;
  error: string;
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
  | AskUserQuestionMessage
  | StreamEventMessage
  | AuthStatusMessage
  | UnknownMessage
  | SessionHierarchyMessage
  | CloudExecutionStartedMessage
  | CloudStageMessage
  | CloudOutputMessage
  | CloudResultMessage
  | CloudErrorMessage
  | { type: "connected" }
  | { type: "aborted"; sessionId?: string; uiSessionId?: string }
  | { type: "ui_command"; command: string; payload: Record<string, unknown> }
  | { type: "until_done_continue"; uiSessionId?: string; iteration: number; maxIterations: number; totalCost: number; reason: string }
  | { type: "until_done_complete"; uiSessionId?: string; totalIterations: number; totalCost: number; reason: string }
  | { type: "play_sound"; sound: string };

export class ClaudeClient {
  private ws: WebSocket | null = null;
  private listeners: ((msg: ClaudeMessage) => void)[] = [];
  private url: string;

  constructor(url = getWsUrl()) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("Connected to Claude server");
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ClaudeMessage = JSON.parse(event.data);
          this.listeners.forEach((fn) => fn(msg));
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("Disconnected from Claude server");
      };
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  onMessage(fn: (msg: ClaudeMessage) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  query(options: {
    prompt: string;
    projectId?: string;
    sessionId?: string;
    claudeSessionId?: string;
    workingDirectory?: string;
    allowedTools?: string[];
    model?: string;
    historyContext?: string;
    // Cloud execution options
    executionMode?: "local" | "cloud";
    cloudRepoUrl?: string;
    cloudBranch?: string;
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    this.ws.send(
      JSON.stringify({
        type: "query",
        ...options,
      })
    );
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  abort(sessionId?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    this.ws.send(
      JSON.stringify({
        type: "abort",
        sessionId,
      })
    );
  }

  attachSession(sessionId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    this.ws.send(
      JSON.stringify({
        type: "attach",
        sessionId,
      })
    );
  }

  respondToPermission(requestId: string, approved: boolean, approveAll?: boolean) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    this.ws.send(
      JSON.stringify({
        type: "permission_response",
        permissionRequestId: requestId,
        approved,
        approveAll,
      })
    );
  }

  respondToQuestion(requestId: string, answers: Record<string, string | string[]>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }

    this.ws.send(
      JSON.stringify({
        type: "question_response",
        questionRequestId: requestId,
        answers,
      })
    );
  }
}
