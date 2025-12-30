import type { TodoItem } from "../stores/types";

export interface UICommand {
  command: "open_preview" | "navigate" | "notification";
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

export interface HandlerCallbacks {
  onSessionInit?: (sessionId: string, data: { model?: string; cwd?: string; tools?: string[]; skills?: string[] }) => void;
  onMessageUpdate?: (sessionId: string) => void;
  onStreamingStart?: (sessionId: string) => void;
  onStreamingEnd?: (sessionId: string, reason: "done" | "aborted" | "error") => void;
  onError?: (sessionId: string, error: string) => void;
  onContextOverflow?: (sessionId: string, autoRetry: boolean) => void;
  onComplete?: (sessionId: string, data: { costUsd: number; usage?: MessageUsage }) => void;
  onPermissionRequest?: (data: { requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string }) => void;
  onTodoUpdate?: (sessionId: string, todos: TodoItem[]) => void;
  onSubagentProgress?: (sessionId: string, toolUseId: string, elapsed: number) => void;
  onUICommand?: (command: UICommand) => void;
  onCompactStart?: (sessionId: string) => void;
  onCompactEnd?: (sessionId: string, metadata?: CompactMetadata) => void;
  scrollToBottom?: () => void;
  onNewContent?: () => void;
}
