import type { ContentBlock } from "../claude";
import type { Project, Session, Skill } from "../api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: ContentBlock[] | string;
  contentHistory?: (ContentBlock[] | string)[];
  timestamp: Date;
  parentToolUseId?: string | null;
  isSynthetic?: boolean;
  isFinal?: boolean;
  pruned?: boolean;
  isSystemInfo?: boolean; // System-generated info messages (compact notifications, etc.)
  inlineCommand?: {
    command: string;
    cwd?: string;
  };
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface TourStep {
  id: string;
  target: string;
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

export interface AttachedFile {
  path: string;
  name: string;
  type: "file" | "directory";
}

export interface QueuedMessage {
  id?: string;
  sessionId: string;
  text: string;
  attachments: AttachedFile[];
}

export interface SessionDebugInfo {
  cwd: string;
  model: string;
  tools: string[];
  skills: string[];
  timestamp: Date;
}

export type ModelInfo = {
  value: string;
  displayName: string;
  description: string;
  provider?: string;
};

export type NotificationType = "info" | "success" | "warning" | "error" | "permission_request";

export interface NotificationAction {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  handler: () => void;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: Date;
  read: boolean;
  dismissed: boolean;
  persistent: boolean;
  sessionId?: string;
  projectId?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
}

export interface NotificationOptions {
  type?: NotificationType;
  title: string;
  message?: string;
  persistent?: boolean;
  sessionId?: string;
  projectId?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
  browserNotification?: boolean;
  sound?: boolean;
}

export type SessionStatusType = "idle" | "running" | "permission" | "awaiting_input" | "unread";

export interface SessionStatus {
  sessionId: string;
  projectId: string;
  status: SessionStatusType;
  lastActivity: Date;
  hasUnreadResults: boolean;
}

export type ProjectStatusType = "idle" | "active" | "attention";

export type CostViewMode = "ever" | "today";

export interface CostState {
  viewMode: CostViewMode;
  totalEver: number;
  totalToday: number;
  projectCosts: Map<string, { ever: number; today: number }>;
  sessionCosts: Map<string, number>;
}

export type ChatViewMode = "conversation" | "timeline";

// Terminal tab state
export interface TerminalTab {
  id: string;
  name: string;
  terminalId?: string; // PTY terminal ID from backend
  initialCommand?: string;
  cwd?: string;
}

// Browser state per session
export interface BrowserState {
  url: string;
  history: string[];
  historyIndex: number;
}

// Workspace state per session (terminals + browser)
export interface SessionWorkspace {
  sessionId: string;
  terminalTabs: TerminalTab[];
  activeTerminalId: string;
  terminalCounter: number;
  browser: BrowserState;
}

// Text reference from preview selection
export interface TextReference {
  id: string;
  text: string;
  truncatedText: string;
  source: {
    type: "code" | "csv" | "xlsx" | "json" | "markdown" | "text" | "url" | "terminal";
    path?: string;
    startLine?: number;
    endLine?: number;
    rows?: [number, number];
    columns?: string[];
    sheet?: string;
    jsonPath?: string;
    url?: string;
    // Terminal-specific fields
    terminalId?: string;
    terminalName?: string;
  };
}

// Terminal reference for @terminal mentions
export interface TerminalReference {
  id: string;
  terminalId: string;
  name: string;
  bufferLines: number;
}

// Chat reference for @chat mentions - lazy loaded
export interface ChatReference {
  id: string;
  sessionId: string;
  title: string;
  messageCount: number;
  projectName: string | null;
  updatedAt: number;
}

// SDK Event types for debug/timeline view
export type SDKEventType =
  | "system_init"
  | "system_status"
  | "system_compact"
  | "system_hook"
  | "assistant"
  | "assistant_streaming"
  | "user"
  | "tool_progress"
  | "tool_use"
  | "tool_result"
  | "result"
  | "error"
  | "permission_request"
  | "auth_status"
  | "unknown";

export interface SDKEvent {
  id: string;
  type: SDKEventType;
  timestamp: number;
  sessionId: string;
  parentToolUseId?: string | null;
  data: unknown;
  expanded?: boolean;
}

export type { Project, Session, Skill };
