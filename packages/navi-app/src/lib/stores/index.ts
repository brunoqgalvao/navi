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
  // Cloud execution mode
  executionModeStore,
  defaultExecutionMode,
  cloudExecutionStore,
  // Backend selection (claude, codex, gemini)
  sessionBackendStore,
  defaultBackend,
  backendModels,
  getBackendModelsFormatted,
  // Memory management utilities
  cleanupAuxiliaryStores,
  getClientMemoryStats,
  // Active waits (native pause/wait tool)
  activeWaits,
  currentSessionWait,
} from "./session";

export type { ProjectWorkspace, SessionPaginationState, ExecutionMode, CloudExecutionSettings, CloudExecutionState, CloudExecutionStage, BackendId } from "./session";

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
  dashboardEnabled,
  channelsEnabled,
  loopModeEnabled,
  deployToCloudEnabled,
  resourceMonitorEnabled,
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

export type { UIScaleLevel, FileBrowserState, ProjectStatusInfo, ThemeMode, ChatSortOrder } from "./ui";

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

// Update store
export {
  updateStore,
  updateAvailable,
  isCheckingUpdate,
  isDownloadingUpdate,
  updateDownloadProgress,
  updateError,
  showUpdateBanner,
  currentAppVersion,
  type UpdateInfo,
  type UpdateState,
} from "./update";

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
  globalPermissionSettings,
  permissionDefaults,
  resetWorkspaceState,
  type WorkspaceFolder,
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

// Planning stores (Plan Mode)
export {
  planMode,
  sessionPlans,
  getPlanForSession,
  hasActivePlan,
  PLAN_MODE_SYSTEM_PROMPT,
  generatePlanModePrompt,
  type Plan,
  type PlanStep,
  type PlanModeState,
} from "./planning";

// Chat input store
export { chatInputValue } from "./chat";
