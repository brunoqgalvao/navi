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

export interface HandlerCallbacks {
  onSessionInit?: (sessionId: string, data: { model?: string; cwd?: string; tools?: string[]; skills?: string[] }) => void;
  onMessageUpdate?: (sessionId: string) => void;
  onStreamingStart?: (sessionId: string) => void;
  onStreamingEnd?: (sessionId: string, reason: "done" | "aborted" | "error") => void;
  onError?: (sessionId: string, error: string) => void;
  onComplete?: (sessionId: string, data: { costUsd: number; usage?: any }) => void;
  onPermissionRequest?: (data: { requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string }) => void;
  onAskUserQuestion?: (data: AskUserQuestionData) => void;
  onTodoUpdate?: (sessionId: string, todos: any[]) => void;
  onSubagentProgress?: (sessionId: string, toolUseId: string, elapsed: number) => void;
  onUICommand?: (command: UICommand) => void;
  scrollToBottom?: () => void;
  onNewContent?: () => void;
}
