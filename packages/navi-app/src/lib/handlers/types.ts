import type { TodoItem, ActiveWait } from "../stores/types";
import type { SessionHierarchyEvent } from "../features/session-hierarchy/types";

export interface UICommand {
  command: "open_preview" | "navigate" | "notification" | "open_terminal" | "open_logs";
  payload: Record<string, unknown>;
}

export interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface CompactMetadata {
  trigger: "manual" | "auto";
  pre_tokens: number;
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

export interface AskUserQuestionData {
  requestId: string;
  sessionId?: string;
  questions: QuestionItem[];
}

export interface UntilDoneContinueData {
  iteration: number;
  maxIterations: number;
  totalCost: number;
  reason: string;
  // Infinite loop mode additions
  contextReset?: boolean;
  contextPercent?: number;
  nextAction?: string;
  loopId?: string;
}

export interface UntilDoneCompleteData {
  totalIterations: number;
  totalCost: number;
  reason: string;
  // Infinite loop mode additions
  loopId?: string;
  confidence?: number;
}

export interface UntilDoneVerifyingData {
  iteration: number;
  message: string;
}

export interface UntilDoneContextResetData {
  iteration: number;
  contextPercent: number;
  message: string;
}
export interface HandlerCallbacks {
  onSessionInit?: (sessionId: string, data: { claudeSessionId?: string; model?: string; cwd?: string; tools?: string[]; skills?: string[] }) => void;
  onClaudeSessionId?: (sessionId: string, claudeSessionId: string) => void;
  onMessageUpdate?: (sessionId: string) => void;
  onStreamingStart?: (sessionId: string) => void;
  onStreamingEnd?: (sessionId: string, reason: "done" | "aborted" | "error") => void;
  onError?: (sessionId: string, error: string) => void;
  onContextOverflow?: (sessionId: string, autoRetry: boolean) => void;
  onComplete?: (sessionId: string, data: { costUsd: number; usage?: MessageUsage }) => void;
  onPermissionRequest?: (data: { requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string }) => void;
  onAskUserQuestion?: (data: AskUserQuestionData) => void;
  onTodoUpdate?: (sessionId: string, todos: TodoItem[]) => void;
  onSubagentProgress?: (sessionId: string, toolUseId: string, elapsed: number) => void;
  onUICommand?: (command: UICommand) => void;
  onCompactStart?: (sessionId: string) => void;
  onCompactEnd?: (sessionId: string, metadata?: CompactMetadata) => void;
  onUntilDoneContinue?: (sessionId: string, data: UntilDoneContinueData) => void;
  onUntilDoneComplete?: (sessionId: string, data: UntilDoneCompleteData) => void;
  onUntilDoneVerifying?: (sessionId: string, data: UntilDoneVerifyingData) => void;
  onUntilDoneContextReset?: (sessionId: string, data: UntilDoneContextResetData) => void;
  // Session Hierarchy (Multi-Agent)
  onSessionHierarchyEvent?: (event: SessionHierarchyEvent) => void;
  // Wait/Pause
  onWaitStart?: (wait: ActiveWait) => void;
  onWaitEnd?: (requestId: string, skipped: boolean) => void;
  onPlaySound?: (sound: string) => void;
  scrollToBottom?: () => void;
  onNewContent?: () => void;
}
