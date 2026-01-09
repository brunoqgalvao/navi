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
  // Memory management utilities
  cleanupAuxiliaryStores,
  getClientMemoryStats,
} from "./session";

export type { ProjectWorkspace, SessionPaginationState } from "./session";

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

export type { UIScaleLevel, FileBrowserState, ProjectStatusInfo, ThemeMode } from "./ui";

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
