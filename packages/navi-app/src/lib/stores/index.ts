// Types
export type {
  ChatMessage,
  TodoItem,
  TourStep,
  AttachedFile,
  SessionDebugInfo,
  ModelInfo,
  NotificationType,
  NotificationAction,
  Notification,
  NotificationOptions,
  SessionStatusType,
  SessionStatus,
  ProjectStatusType,
  CostViewMode,
  CostState,
  ChatViewMode,
  SDKEventType,
  SDKEvent,
  Project,
  Session,
  Skill,
  TerminalTab,
  BrowserState,
  SessionWorkspace,
} from "./types";

// Session stores
export {
  sessionMessages,
  sessionDrafts,
  currentSession,
  sessionTodos,
  sessionDebugInfo,
  sessionStatus,
  loadingSessions,
  availableModels,
  messageQueue,
  sessionHistoryContext,
  todos,
  sessionEvents,
  sessionWorkspaces,
  currentWorkspace,
  sessionModels,
  projectWorkspaces,
} from "./session";

export type { ProjectWorkspace } from "./session";

// Project stores
export {
  projects,
  sessions,
  currentProject,
} from "./projects";

// UI stores
export {
  onboardingComplete,
  advancedMode,
  debugMode,
  newChatView,
  showArchivedWorkspaces,
  tour,
  notifications,
  attachedFiles,
  chatViewMode,
  uiScale,
  isConnected,
  unreadNotificationCount,
  activeNotifications,
  pendingPermissionRequests,
  projectStatus,
} from "./ui";

export type { UIScaleLevel } from "./ui";

// Cost stores
export { costStore } from "./costs";

// Skills stores
export { skillLibrary } from "./skills";

// Navigation history
export { navHistory, type NavHistoryEntry } from "./navHistory";

// Error handling (re-export for convenience)
export { showError, showWarning, showSuccess, showInfo, pendingErrorReport } from "../errorHandler";
