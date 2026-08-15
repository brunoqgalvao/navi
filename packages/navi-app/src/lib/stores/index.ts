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
  SessionWorkspace,
  TextReference,
  TerminalReference,
  ChatReference,
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
  loadingMessagesSessions,
  availableModels,
  messageQueue,
  sessionHistoryContext,
  compactingSessionsStore,
  todos,
  sessionEvents,
  sessionWorkspaces,
  currentWorkspace,
  sessionModels,
  projectWorkspaces,
  // Backend selection (claude, codex, gemini)
  sessionBackendStore,
  defaultBackend,
  backendModels,
  getBackendModelsFormatted,
  // Reasoning effort
  sessionReasoningEffort,
  defaultReasoningEffort,
  // Memory management utilities
  cleanupAuxiliaryStores,
  getClientMemoryStats,
  // Active waits (native pause/wait tool)
  activeWaits,
  currentSessionWait,
} from "./session";

export type { ProjectWorkspace, SessionPaginationState, BackendId, ReasoningEffort } from "./session";

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
  loopModeEnabled,
  deployToCloudEnabled,
  resourceMonitorEnabled,
  autoCompactEnabled,
  autoCompactMethod,
  newChatView,
  showArchivedWorkspaces,
  chatSortOrder,
  tour,
  notifications,
  attachedFiles,
  chatViewMode,
  uiScale,
  theme,
  isConnected,
  unreadNotificationCount,
  activeNotifications,
  pendingPermissionRequests,
  projectStatus,
  fileBrowserState,
} from "./ui";

// References store
export { textReferences, terminalReferences, chatReferences } from "./references";

export type { UIScaleLevel, FileBrowserState, ProjectStatusInfo, ThemeMode, ChatSortOrder, AutoCompactMethod } from "./ui";

// Cost stores
export { costStore } from "./costs";

// Skills stores
export { skillLibrary } from "./skills";

// Navigation history
export { navHistory, type NavHistoryEntry } from "./navHistory";

// Attention system - bubbles up items needing user attention
export {
  attention,
  attentionItems,
  pendingActionCount,
  reviewQueueCount,
  totalAttentionCount,
  sessionNeedsAttention,
  runningSessionCount,
  needsInputCount,
  idleSessionCount,
  type AttentionItem,
  type AttentionReason,
} from "./attention";

// Error handling (re-export for convenience)
export { showError, showWarning, showSuccess, showInfo, pendingErrorReport } from "../errorHandler";

// Workspace stores (centralized state for action modules)
export {
  sidebarProjects,
  sidebarSessions,
  recentChats,
  projectFileIndex,
  projectContext,
  projectContextError,
  claudeMdContent,
  defaultProjectsDir,
  workspaceFolders,
  sessionFolders,
  globalPermissionSettings,
  permissionDefaults,
  resetWorkspaceState,
  type WorkspaceFolder,
  type SessionFolder,
  type PermissionSettings,
} from "./workspace";

// Connectivity monitoring
export {
  connectivityStore,
  connectionStatus,
  isOnline,
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  checkConnectivity,
  isNetworkError,
  handleNetworkError,
  type ConnectionStatus,
  type ConnectivityState,
} from "./connectivity";

// Auth store
export {
  auth,
  isAuthenticated,
  currentUser,
  authLoading,
  naviEmail,
  type NaviUser,
  type AuthState,
} from "./auth";

// Planning stores (plan rendering widgets)
export {
  sessionPlans,
  getPlanForSession,
  hasActivePlan,
  type Plan,
  type PlanStep,
} from "./planning";

// Chat input store
export { chatInputValue } from "./chat";
