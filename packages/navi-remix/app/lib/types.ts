// Re-export content types from claude.ts to avoid duplication
export type {
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
} from "./claude";

import type { ContentBlock } from "./claude";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: ContentBlock[] | string;
  contentHistory?: (ContentBlock[] | string)[];
  timestamp: Date;
  parentToolUseId?: string | null;
  isSynthetic?: boolean;
  isFinal?: boolean;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

export interface CurrentSessionState {
  projectId: string | null;
  sessionId: string | null;
  claudeSessionId: string | null;
  isLoading: boolean;
  costUsd: number;
  model: string | null;
  selectedModel: string;
  inputTokens: number;
  outputTokens: number;
}

export interface StreamingState {
  isStreaming: boolean;
  currentBlocks: ContentBlock[];
  partialText: string;
  partialThinking: string;
  partialJson: string;
}

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error" | "permission";
  title: string;
  message?: string;
  timestamp: Date;
  read: boolean;
  data?: any;
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}
