<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { get } from "svelte/store";
  import { ClaudeClient, type ClaudeMessage, type ContentBlock } from "./lib/claude";
  import { relativeTime, formatContent, linkifyUrls, linkifyCodePaths, linkifyFilenames, linkifyFileLineReferences, linkifyChatReferences } from "./lib/utils";
  import { sessionMessages, sessionDrafts, currentSession as session, isConnected, projects, availableModels, onboardingComplete, messageQueue, loadingSessions, advancedMode, debugMode, todos, sessionTodos, sessionHistoryContext, notifications, pendingPermissionRequests, sessionStatus, tour, attachedFiles, textReferences, sessionDebugInfo, costStore, showArchivedWorkspaces, navHistory, sessionModels, attention, projectWorkspaces, compactingSessionsStore, startConnectivityMonitoring, stopConnectivityMonitoring, theme, executionModeStore, cloudExecutionStore, sessionBackendStore, defaultBackend, backendModels, getBackendModelsFormatted, auth, planMode, type ChatMessage, type AttachedFile, type NavHistoryEntry, type TextReference, type ExecutionMode, type BackendId } from "./lib/stores";
  import { backgroundProcessEvents } from "./lib/stores/backgroundProcessEvents";
  import { api, skillsApi, costsApi, worktreeApi, type Project, type Session, type Skill } from "./lib/api";
  import { mcpApi, type McpServer } from "./lib/features/mcp";
  import { getStatus as getGitStatus } from "./lib/features/git/api";
  import { createNewChatWithWorktree, startNewChat } from "./lib/actions";
  import { initBrowserEmail } from "./lib/features/browser-email-init";
  import { parseHash, onHashChange } from "./lib/router";
  import { setServerPort, setPtyServerPort, isTauri, DEV_SERVER_PORT, BUNDLED_SERVER_PORT, BUNDLED_PTY_PORT, discoverPorts, getServerUrl } from "./lib/config";
  import { setupGlobalErrorHandlers, pendingErrorReport, showError, showSuccess, type ErrorReport } from "./lib/errorHandler";
  import Preview from "./lib/Preview.svelte";
  import { marked, type Tokens } from "marked";
  import hljs from "highlight.js";

  const renderer = new marked.Renderer();
  renderer.link = ({ href, title, text }: Tokens.Link) => {
    const titleAttr = title ? ` title="${title}"` : "";
    let url = href;
    if (url.startsWith("//")) {
      url = "https:" + url;
    }
    const isExternal = url.startsWith("http://") || url.startsWith("https://");
    const isLocalhost = url.includes("localhost") || url.match(/:\d+/);
    if (isExternal) {
      try {
        const domain = new URL(url).hostname;
        const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        if (isLocalhost) {
          return `<a href="${url}"${titleAttr} data-url="${url}" class="source-link preview-link external-link"><img src="${favicon}" alt="" class="source-favicon" onerror="this.style.display='none'">${text}<span class="external-arrow">↗</span></a>`;
        }
        return `<a href="${url}"${titleAttr} data-url="${url}" target="_blank" rel="noopener noreferrer" class="source-link external-link"><img src="${favicon}" alt="" class="source-favicon" onerror="this.style.display='none'">${text}<span class="external-arrow">↗</span></a>`;
      } catch {
        if (isLocalhost) {
          return `<a href="${url}"${titleAttr} data-url="${url}" class="preview-link external-link">${text}<span class="external-arrow">↗</span></a>`;
        }
        return `<a href="${url}"${titleAttr} data-url="${url}" target="_blank" rel="noopener noreferrer" class="external-link">${text}<span class="external-arrow">↗</span></a>`;
      }
    }
    return `<a href="${url}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  
  let jsonBlocksMap = new Map<string, any>();
  let jsonBlockCounter = 0;
  let shellBlocksMap = new Map<string, { code: string; language: string }>();
  let shellBlockCounter = 0;

  renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = lang || '';
    const shellLanguages = ['bash', 'sh', 'shell', 'zsh', 'console', 'terminal'];

    // Use interactive code block for shell/bash - store and use placeholder
    if (shellLanguages.includes(language.toLowerCase())) {
      const id = `shell-block-${shellBlockCounter++}`;
      shellBlocksMap.set(id, { code: text, language });
      return `<div class="shell-block-placeholder" data-shell-id="${id}"></div>`;
    }
    
    // Use interactive JSON tree for JSON
    if (language.toLowerCase() === 'json') {
      try {
        const parsed = JSON.parse(text);
        const id = `json-tree-${jsonBlockCounter++}`;
        jsonBlocksMap.set(id, parsed);
        return `<div class="json-block-placeholder" data-json-id="${id}"></div>`;
      } catch {
        // If JSON is invalid, fall through to regular highlighting
      }
    }
    
    // Use syntax highlighting for other languages
    let highlighted: string;
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(text, { language }).value;
    } else {
      highlighted = hljs.highlightAuto(text).value;
    }
    
    const langLabel = language ? `<span class="code-language">${language}</span>` : '';
    return `<div class="code-block-wrapper"><div class="code-header">${langLabel}</div><pre class="hljs"><code>${highlighted}</code></pre></div>`;
  };
  
  marked.setOptions({ renderer });
  
  import Modal from "./lib/components/Modal.svelte";
  import Onboarding from "./lib/components/Onboarding.svelte";
  import Settings from "./lib/components/Settings.svelte";
  import InfiniteLoopConfig from "./lib/components/InfiniteLoopConfig.svelte";
  import InfiniteLoopStatus from "./lib/components/InfiniteLoopStatus.svelte";

  // Proactive Hooks - AI-powered suggestions (skill scout, error detector, memory builder)
  import {
    setupProactiveHooks,
    onUserMessage as hookOnUserMessage,
    onAssistantMessage as hookOnAssistantMessage,
    startSessionTracking,
    stopSessionTracking,
    buildHookContext,
    SuggestionPanel,
  } from "./lib/features/proactive-hooks";

  import ProjectSettings from "./lib/components/ProjectSettings.svelte";
  import SearchModal from "./lib/components/SearchModal.svelte";
  import QuickSessionsPanel from "./lib/components/QuickSessionsPanel.svelte";
  import NotificationToast from "./lib/components/NotificationToast.svelte";
  import Confetti from "./lib/components/Confetti.svelte";
  import WelcomeScreen from "./lib/components/WelcomeScreenLogo.svelte";
  import TourOverlay from "./lib/components/TourOverlay.svelte";
  import ChatView from "./lib/components/ChatView.svelte";
  import ChatInput from "./lib/components/ChatInput.svelte";
  import CloudExecutionStatus from "./lib/components/CloudExecutionStatus.svelte";
  import ContextWarning from "./lib/components/ContextWarning.svelte";
  import MergeModal from "./lib/components/MergeModal.svelte";
  import CommandHelpModal from "./lib/components/CommandHelpModal.svelte";
  import { QueuedMessagesPanel } from "./lib/components/queue";
  import ProcessManager from "./lib/components/ProcessManager.svelte";
  import { useMessageHandler } from "./lib/handlers";
  import SessionDebug from "./lib/components/SessionDebug.svelte";
  import ContextMenu from "./lib/components/ContextMenu.svelte";
  import TitleSuggestion from "./lib/components/TitleSuggestion.svelte";
  import UpdateChecker from "./lib/components/UpdateChecker.svelte";
  import ConnectivityBanner from "./lib/components/ConnectivityBanner.svelte";
  import ResourceMonitor from "./lib/components/ResourceMonitor.svelte";
  import ProjectEmptyState from "./lib/components/ProjectEmptyState.svelte";
  import ProjectLanding from "./lib/components/ProjectLanding.svelte";
  import NewProjectModal from "./lib/components/NewProjectModal.svelte";
  // Channels
  import { currentChannelId } from "./lib/features/channels";
  import { channelsEnabled, resourceMonitorEnabled } from "./lib/stores";
  import ChannelView from "./lib/features/channels/components/ChannelView.svelte";
  import ProjectPermissionsModal from "./lib/components/ProjectPermissionsModal.svelte";
  import FeedbackModal from "./lib/components/FeedbackModal.svelte";
  import ContextOverflowModal from "./lib/components/ContextOverflowModal.svelte";
  import Sidebar from "./lib/components/sidebar/Sidebar.svelte";
  import { ExperimentalAgentsPanel, SelfHealingWidget } from "./lib/components/agents";
  import { AgentBuilder, agentBuilderApi, createAgent, openAgent, loadLibrary, agentLibrary, skillLibraryForBuilder, type AgentDefinition } from "./lib/features/agent-builder";
  import { initializeRegistry, projectExtensions, ExtensionToolbar, ExtensionSettingsModal } from "./lib/features/extensions";
  import { handleSessionHierarchyWSEvent, parseEscalation } from "./lib/features/session-hierarchy";
  import SessionBreadcrumbs from "./lib/features/session-hierarchy/components/SessionBreadcrumbs.svelte";
  import EscalationBanner from "./lib/features/session-hierarchy/components/EscalationBanner.svelte";
  import { SessionsBoard, type BoardSession } from "./lib/features/sessions-board";
  import { fetchCommands, type CustomCommand } from "./lib/features/commands";
  import NavHistoryButton from "./lib/components/NavHistoryButton.svelte";
  import type { PermissionRequestMessage } from "./lib/claude";
  import type { PermissionSettings, WorkspaceFolder } from "./lib/api";
  import { TOUR_STEPS, HOTKEYS } from "./lib/constants";
  import { WorkspaceHome } from "./lib/pages";
  import { RightPanel } from "./lib/layout";
  import {
    initProjectActions,
    initSessionActions,
    initFolderActions,
    loadProjects as loadProjectsAction,
    loadProjectCost,
    loadClaudeMd,
    loadProjectContext,
    indexProjectFiles,
    startNewChat as startNewChatAction,
    createNewChat as createNewChatAction,
    loadFolders as loadFoldersAction,
    createFolder as createFolderAction,
    updateFolder as updateFolderAction,
    deleteFolder as deleteFolderAction,
    toggleFolderCollapse as toggleFolderCollapseAction,
    setProjectFolder as setProjectFolderAction,
    reorderFolders as reorderFoldersAction,
    toggleFolderPin as toggleFolderPinAction,
    initDataLoaders,
    loadConfig as loadConfigAction,
    loadModels as loadModelsAction,
    loadPermissions as loadPermissionsAction,
    loadCosts as loadCostsAction,
    loadRecentChats as loadRecentChatsAction,
    loadActiveSessions as loadActiveSessionsAction,
    pruneToolResults,
    startNewChatWithSummary,
    hasPrunedContext,
    hasRollbackContext,
    getDefaultModel,
  } from "./lib/actions";

  let sidecarProcess: any = null;
  let serverReady = $state(false);
  let serverError = $state<string | null>(null);

  async function startSidecar(): Promise<number> {
    if (!isTauri()) {
      try {
        const ports = await discoverPorts();
        const res = await fetch(`http://localhost:${ports.server}/health`);
        if (res.ok) return ports.server;
      } catch {
      }
      serverError = "Server not running. Start with: bun run dev:all";
      throw new Error(serverError);
    }

    let serverPort = BUNDLED_SERVER_PORT;
    let ptyPort = BUNDLED_PTY_PORT;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const ports = await invoke<[number, number]>("get_server_ports");
      if (Array.isArray(ports)) {
        const [tauriServerPort, tauriPtyPort] = ports;
        if (typeof tauriServerPort === "number") {
          serverPort = tauriServerPort;
        }
        if (typeof tauriPtyPort === "number") {
          ptyPort = tauriPtyPort;
        }
      }
    } catch (e) {
      // Failed to read ports from Tauri backend, using defaults
    }

    setServerPort(serverPort);
    setPtyServerPort(ptyPort);

    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${serverPort}/health`);
        if (res.ok) {
          return serverPort;
        }
      } catch {
      }
      await new Promise(r => setTimeout(r, 100));
    }

    serverError = "Bundled server failed to respond";
    throw new Error(serverError);
  }
  
  async function retryServerConnection() {
    serverError = null;
    try {
      await startSidecar();
      serverReady = true;
      loadProjects();
      loadRecentChatsAction();
      loadFolders();
      loadConfigAction();
      loadModelsAction();
      loadPermissionsAction();
      loadCostsAction();
    } catch {
      // Error already set in startSidecar
    }
  }

  let client: ClaudeClient;
  let inputText = $state("");
  let lastAttachedSessionId = $state<string | null>(null);
  let activeSessionsPoll: ReturnType<typeof setInterval> | null = null;
  let lastActiveSessions = new Map<string, string>();
  
  let currentMessages = $derived($session.sessionId ? ($sessionMessages.get($session.sessionId) || []) : []);
  let currentTodos = $derived($session.sessionId ? ($sessionTodos.get($session.sessionId) || []) : []);

  let sidebarProjects = $state<Project[]>([]);
  let sidebarSessions = $state<Session[]>([]);
  let recentChats = $state<Session[]>([]);

  // Get current session data from sidebar sessions for worktree info
  let currentSessionData = $derived($session.sessionId ? sidebarSessions.find(s => s.id === $session.sessionId) : null);

  // Session hierarchy info for multi-agent
  let currentSessionHierarchy = $derived(() => {
    if (!currentSessionData) return null;
    const sess = currentSessionData as any;
    const hasParent = !!sess.parent_session_id;
    const isBlocked = sess.agent_status === "blocked";
    const escalation = isBlocked ? parseEscalation(sess.escalation) : null;
    return {
      hasParent,
      isBlocked,
      escalation,
      role: sess.role || null,
    };
  });

  // Track if current project is a git repo (for worktree feature)
  let currentProjectIsGitRepo = $state(false);
  let workspaceFolders = $state<WorkspaceFolder[]>([]);

  // Chat reference lookup for cross-chat linking
  let chatLookup = $derived(() => {
    const lookup = new Map<string, { title: string; projectName?: string }>();
    // Add sidebar sessions
    for (const s of sidebarSessions) {
      const project = sidebarProjects.find(p => p.id === s.project_id);
      lookup.set(s.id, { title: s.title, projectName: project?.name });
    }
    // Add recent chats (may overlap, that's fine)
    for (const s of recentChats) {
      if (!lookup.has(s.id)) {
        const project = sidebarProjects.find(p => p.id === s.project_id);
        lookup.set(s.id, { title: s.title, projectName: project?.name });
      }
    }
    return lookup;
  });
  let showNewProjectModal = $state(false);
  let newProjectTargetFolderId = $state<string | null>(null);
  let newProjectName = $state("");
  let newProjectPath = $state("");
  let newProjectQuickName = $state("");
  let defaultProjectsDir = $state("");
  let projectCreationMode = $state<"quick" | "browse" | "agent" | "template">("quick");
  let editingProject = $state<Project | null>(null);
  let editProjectName = $state("");
  let editProjectPath = $state("");
  let showDeleteConfirm = $state(false);
  let projectToDelete = $state<Project | null>(null);
  let editingSession = $state<Session | null>(null);
  let editSessionTitle = $state("");
  let messagesContainer: HTMLElement;
  let userIsNearBottom = $state(true);
  let newMessagesWhileAway = $state(0);
  let modelSelection = $state("");
  let lastSessionModel = $state("");
  let showSettings = $state(false);
  let showAgentBuilder = $state(false);
  let showSessionsDashboard = $state(false);
  let sessionsDashboardProjectId = $state<string | undefined>(undefined);
  let showExperimentalAgents = $state(false);

  // Derived agents list for sidebar (combine agents + skills from stores)
  let sidebarAgents = $derived([...$agentLibrary, ...$skillLibraryForBuilder].slice(0, 10));
  let settingsInitialTab = $state<"api" | "permissions" | "claude-md" | "skills" | "features" | "analytics" | "mcp" | undefined>(undefined);
  let showProjectSettings = $state(false);
  let projectSettingsInitialTab = $state<"instructions" | "model" | "permissions" | "skills" | undefined>(undefined);
  let showDebugInfo = $state(false);
  let showMergeModal = $state(false);
  let showCommandHelp = $state(false);
  let isResolvingMergeConflicts = $state(false);
  let mergeConflictInfo = $state<{ branch: string; baseBranch: string; fileCount: number; snapshotId: string } | null>(null);
  let sidebarCollapsed = $state(false);
  let messageMenuId: string | null = $state(null);
  let messageMenuPos = $state({ x: 0, y: 0 });
  let linkContextMenu = $state<{ url: string; x: number; y: number } | null>(null);

  let sessionMenuId = $state<string | null>(null);
  let sessionMenuPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });
  let projectMenuId = $state<string | null>(null);
  let showProjectPermissions = $state<Project | null>(null);
  let globalPermissionSettings = $state<PermissionSettings | null>(null);
  let permissionDefaults = $state<{ tools: string[]; dangerous: string[] }>({ tools: [], dangerous: [] });

  // Until Done / Infinite Loop mode state (per-session)
  interface LoopSessionState {
    enabled: boolean;
    iteration: number;
    maxIterations: number;
    totalCost: number;
    // Infinite loop mode additions
    loopId?: string;
    isVerifying?: boolean;
    contextPercent?: number;
    contextResets?: number;
    lastReason?: string;
    nextAction?: string;
    definitionOfDone?: Array<{ id: string; description: string; verified: boolean }>;
  }
  let untilDoneSessions = $state<Map<string, LoopSessionState>>(new Map());

  // Infinite loop config modal state
  let showInfiniteLoopConfig = $state(false);
  let infiniteLoopPendingPrompt = $state("");

  // Derived state for current session
  let currentUntilDone = $derived(
    $session.sessionId ? untilDoneSessions.get($session.sessionId) : undefined
  );
  let untilDoneEnabled = $derived(currentUntilDone?.enabled ?? false);
  let untilDoneIteration = $derived(currentUntilDone?.iteration ?? 0);
  let isInfiniteLoopMode = $derived(!!currentUntilDone?.loopId);
  let untilDoneMaxIterations = 10; // Default max iterations

  // Cloud execution state
  let cloudBranches = $state<string[]>([]);
  let currentExecutionSettings = $derived(
    $session.sessionId ? executionModeStore.get($session.sessionId, get(executionModeStore)) : { mode: "local" as ExecutionMode }
  );
  let executionMode = $derived(currentExecutionSettings.mode);
  let cloudBranch = $derived(currentExecutionSettings.branch || "main");

  // Current cloud execution status for the active session
  let currentCloudExecution = $derived(
    $session.sessionId ? cloudExecutionStore.get($session.sessionId, get(cloudExecutionStore)) : undefined
  );
  let showCloudStatus = $derived(
    currentCloudExecution && !["completed", "failed"].includes(currentCloudExecution.stage)
  );

  // Load branches when project changes and it's a git repo
  async function loadCloudBranches() {
    if (!currentProjectIsGitRepo || !currentProject?.path) {
      cloudBranches = [];
      return;
    }
    try {
      const { getBranches } = await import("./lib/features/git/api");
      const branchData = await getBranches(currentProject.path);
      cloudBranches = [branchData.current, ...branchData.local.filter(b => b !== branchData.current)];
    } catch (e) {
      cloudBranches = ["main"];
    }
  }

  function handleExecutionModeChange(mode: ExecutionMode) {
    const sessionId = $session.sessionId;
    if (sessionId) {
      // Get git remote URL for cloud execution
      const repoUrl = currentProjectIsGitRepo ? getGitRemoteUrl() : undefined;
      executionModeStore.setMode(sessionId, mode, repoUrl, cloudBranch);
    }
  }

  function handleCloudBranchChange(branch: string) {
    const sessionId = $session.sessionId;
    if (sessionId) {
      executionModeStore.setBranch(sessionId, branch);
    }
  }

  function getGitRemoteUrl(): string | undefined {
    // TODO: Get actual remote URL from git status
    // For now, return undefined - the cloud executor will need the repo URL passed explicitly
    return undefined;
  }

  const messageHandler = useMessageHandler({
    getCurrentSessionId: () => $session.sessionId,
    getProjectId: () => $session.projectId,
    onCostUpdate: (sessionId, costUsd) => {
      if (sessionId === $session.sessionId) {
        session.setCost($session.costUsd + costUsd);
      }
      costStore.addSessionCost(sessionId, costUsd);
      loadCostsAction();
      if ($session.projectId) {
        loadProjectCost($session.projectId);
      }
    },
    onUsageUpdate: (inputTokens, outputTokens) => {
      session.setUsage(inputTokens, outputTokens);
    },
    onPermissionRequest: (data) => {
      pendingPermissionRequest = {
        requestId: data.requestId,
        tools: data.tools,
        toolInput: data.toolInput,
        message: data.message,
      };
      notifications.add({
        type: "permission_request",
        title: `${data.tools[0]} Permission Required`,
        message: data.message,
        sessionId: $session.sessionId || undefined,
        persistent: true,
        data: {
          requestId: data.requestId,
          tools: data.tools,
          toolInput: data.toolInput,
        },
      });
    },
    onAskUserQuestion: (data) => {
      // Only show question if it's for the current session
      if (data.sessionId && data.sessionId !== $session.sessionId) {
        return;
      }
      pendingQuestion = {
        requestId: data.requestId,
        questions: data.questions,
      };
    },
    onSubagentProgress: (sessionId, toolUseId, elapsed) => {
      activeSubagents = new Map(activeSubagents.set(toolUseId, { elapsed }));
    },
    onUICommand: (command) => {
      switch (command.command) {
        case "open_preview":
          const { source, type } = command.payload as { source: string; type?: string };
          previewSource = source;
          showPreview = true;
          rightPanelMode = "preview";
          break;
        case "navigate":
          const { projectId: navProjectId, sessionId: navSessionId } = command.payload as { projectId?: string; sessionId?: string };
          if (navProjectId) {
            const foundProject = $projects.find(p => p.id === navProjectId);
            if (foundProject) selectProject(foundProject);
          }
          if (navSessionId) {
            const navSession = sidebarSessions.find(s => s.id === navSessionId);
            if (navSession) selectSession(navSession);
          }
          break;
        case "notification":
          const { title, message, type: notifType } = command.payload as { title: string; message?: string; type?: string };
          notifications.add({
            type: (notifType as any) || "info",
            title,
            message,
          });
          break;
        case "open_terminal":
          const { terminalId: openTermId, projectId: openTermProjId, cwd: openTermCwd, command: openTermCmd } = command.payload as { terminalId?: string; projectId?: string; cwd?: string; command?: string };
          // Open the terminal panel
          showTerminal = true;
          rightPanelMode = "terminal";
          // If a specific project was provided and we're not in it, navigate to it
          if (openTermProjId && openTermProjId !== $session.projectId) {
            const foundProject = $projects.find(p => p.id === openTermProjId);
            if (foundProject) selectProject(foundProject);
          }
          // Add a new terminal tab for this project
          const targetProjId = openTermProjId || $session.projectId;
          if (targetProjId) {
            projectWorkspaces.addTerminalTab(targetProjId, {
              terminalId: openTermId,
              cwd: openTermCwd || currentProject?.path,
              initialCommand: openTermCmd,
            });
          }
          break;
        case "open_logs":
          const { processId: openLogsProcessId, terminalId: openLogsTermId } = command.payload as { processId?: string; terminalId?: string };
          // Open logs in preview panel using the logs: source format
          if (openLogsProcessId) {
            previewSource = `logs:${openLogsProcessId}`;
            showPreview = true;
            rightPanelMode = "preview";
          } else if (openLogsTermId) {
            // Open terminal logs in preview panel
            previewSource = `logs:terminal:${openLogsTermId}`;
            showPreview = true;
            rightPanelMode = "preview";
          }
          break;
      }
    },
    scrollToBottom,
    onNewContent: notifyNewContent,
    onClaudeSessionInit: (claudeSessionId, model) => {
      session.setClaudeSession(claudeSessionId);
      if (model) {
        session.setModel(model);
      }
    },
    onStreamingEnd: (sessionId, reason) => {
      // Reset activeSubagents for current session
      if (sessionId === $session.sessionId) {
        activeSubagents = new Map();
        // Clear any pending question when streaming ends (agent moved on)
        pendingQuestion = null;
      }
      // Clear merge conflict resolution state when streaming ends
      if (isResolvingMergeConflicts && sessionId === $session.sessionId) {
        const snapshotId = mergeConflictInfo?.snapshotId;
        isResolvingMergeConflicts = false;
        mergeConflictInfo = null;

        if (snapshotId) {
          // Clean up the snapshot since resolution is complete
          worktreeApi.deleteSnapshot(snapshotId).catch(() => {
            // Snapshot cleanup failed
          });
        }

        if (reason === "done") {
          showSuccess('Merge Conflicts Resolved', 'Conflicts resolved. Archiving session...');
          // Archive the session after successful merge conflict resolution
          if ($session.projectId && sessionId) {
            api.sessions.setArchived(sessionId, true).then(async () => {
              const sessionsList = await api.sessions.list($session.projectId!, $showArchivedWorkspaces);
              sidebarSessions = sessionsList;
              // Select a different session or clear current if not showing archived
              if (!$showArchivedWorkspaces) {
                session.setSession(null);
              }
              showSuccess('Session Archived', 'The merge session has been archived.');
            }).catch(e => {
              console.error("[MergeConflict] Failed to archive session:", e);
            });
          }
        }
      }
      // Process any queued messages
      processMessageQueue(sessionId);
      // Refresh sidebar sessions list
      if ($session.projectId) {
        api.sessions.list($session.projectId, $showArchivedWorkspaces).then(list => {
          sidebarSessions = list;
        });
      }
      // Trigger tour after first message
      if (reason === "done" && sessionId === $session.sessionId && !$tour.completedTours.includes("chat")) {
        const msgs = $sessionMessages.get(sessionId) || [];
        const userMsgs = msgs.filter(m => m.role === "user");
        if (userMsgs.length === 1) {
          setTimeout(() => tour.start("chat"), 800);
        }
      }

      // Trigger proactive hooks after assistant responds
      if (reason === "done") {
        const msgs = $sessionMessages.get(sessionId) || [];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          const proj = currentProject ? { id: currentProject.id, name: currentProject.name, path: currentProject.path } : null;
          hookOnAssistantMessage(lastMsg, msgs, sessionId, proj);
        }
      }
    },
    onCompactStart: (sessionId) => {
      compactingSessionsStore.update(set => {
        set.add(sessionId);
        return new Set(set);
      });
      // Add visible message in chat
      sessionMessages.addMessage(sessionId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [{ type: "text", text: "🧠 **Compacting context...** Claude is summarizing the conversation to free up space." }],
        timestamp: new Date(),
        isSystemInfo: true,
      });
      notifications.add({
        type: "info",
        title: "Compacting context",
        message: "Claude is summarizing the conversation to free up space...",
      });
    },
    onCompactEnd: (sessionId, metadata) => {
      compactingSessionsStore.update(set => {
        set.delete(sessionId);
        return new Set(set);
      });
      const preTokens = metadata?.pre_tokens || 0;
      const saved = preTokens ? `Freed ~${Math.round(preTokens / 1000)}k tokens` : "Context compacted";

      // Reset token count - after compaction, context is typically ~5-10k tokens for the summary
      // We estimate 10% of pre-compact tokens as a reasonable starting point
      const estimatedPostTokens = preTokens ? Math.min(10000, Math.round(preTokens * 0.1)) : 5000;
      session.setUsage(estimatedPostTokens, 0);

      // Add visible message in chat showing result
      sessionMessages.addMessage(sessionId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: [{ type: "text", text: `✅ **Context compacted!** ${saved}. The conversation has been summarized and you can continue.` }],
        timestamp: new Date(),
        isSystemInfo: true,
      });

      notifications.add({
        type: "success",
        title: "Context compacted",
        message: saved,
      });
    },
    onContextOverflow: async (sessionId, autoRetry) => {
      if (autoRetry) {
        // Auto-retry: prune tool results first, then continue
        notifications.add({
          type: "warning",
          title: "Context limit reached",
          message: "Pruning old outputs and retrying with a more concise approach...",
        });

        // Prune tool results to make space
        await pruneToolResults(sessionId);

        // Small delay to let the UI update, then send a follow-up
        setTimeout(() => {
          sendCommand("Continue from where you left off, but be more concise. Avoid reading entire large files - use targeted grep/search instead. Summarize findings rather than showing full content.");
        }, 500);
      } else {
        // No auto-retry possible, show modal
        showContextOverflowModal = true;
      }
    },
    onUntilDoneContinue: (sessionId, data) => {
      // Update the session's until-done state (preserve existing fields)
      const existing = untilDoneSessions.get(sessionId);
      untilDoneSessions = new Map(untilDoneSessions.set(sessionId, {
        ...existing,
        enabled: true,
        iteration: data.iteration,
        maxIterations: data.maxIterations,
        totalCost: data.totalCost,
        loopId: data.loopId || existing?.loopId,
        isVerifying: false,
        contextPercent: data.contextPercent,
        lastReason: data.reason,
        nextAction: data.nextAction,
      }));

      // Show notification on context reset
      if (data.contextReset && sessionId === $session.sessionId) {
        notifications.add({
          type: "info",
          title: "Context Reset",
          message: `Fresh context at iteration ${data.iteration} (was ${data.contextPercent}% full)`,
        });
      }
    },
    onUntilDoneComplete: (sessionId, data) => {
      // Remove from tracking
      untilDoneSessions.delete(sessionId);
      untilDoneSessions = new Map(untilDoneSessions);

      // Show notification only if it's the current session
      if (sessionId === $session.sessionId) {
        const isVerified = data.loopId && data.confidence;
        notifications.add({
          type: "success",
          title: isVerified ? "✅ Verified Complete" : "Task Complete",
          message: `Finished in ${data.totalIterations} iteration${data.totalIterations > 1 ? 's' : ''} ($${data.totalCost.toFixed(2)})${data.confidence ? ` - ${Math.round(data.confidence * 100)}% confidence` : ''}`,
        });
      }
    },
    onUntilDoneVerifying: (sessionId, data) => {
      // Mark session as verifying
      const existing = untilDoneSessions.get(sessionId);
      if (existing) {
        untilDoneSessions = new Map(untilDoneSessions.set(sessionId, {
          ...existing,
          isVerifying: true,
        }));
      }
    },
    onUntilDoneContextReset: (sessionId, data) => {
      // Update context reset info
      const existing = untilDoneSessions.get(sessionId);
      if (existing) {
        untilDoneSessions = new Map(untilDoneSessions.set(sessionId, {
          ...existing,
          contextResets: (existing.contextResets || 0) + 1,
          contextPercent: data.contextPercent,
        }));
      }
    },
    // Session Hierarchy (Multi-Agent) events
    onSessionHierarchyEvent: (event) => {
      // Forward to session hierarchy store handler
      handleSessionHierarchyWSEvent(event);

      // Show notifications for important events
      switch (event.type) {
        case "session:spawned":
          notifications.add({
            type: "info",
            title: "Agent Spawned",
            message: `${event.session.role || "Agent"}: ${event.session.task || event.session.title}`,
          });
          break;
        case "session:escalated":
          notifications.add({
            type: "warning",
            title: "Agent Needs Help",
            message: event.escalation.summary,
            persistent: true,
          });
          break;
        case "session:delivered":
          notifications.add({
            type: "success",
            title: "Agent Completed",
            message: event.deliverable.summary,
          });
          break;
      }
    },
    onPlaySound: (sound) => {
      // Play notification sound
      if (sound === "escalation") {
        // Could play a sound file here
      }
    },
  });

  let showPreview = $state(false);
  let previewSource = $state("");
  let showFileBrowser = $state(false);
  let showBrowser = $state(false);
  let showGitPanel = $state(false);
  let showTerminal = $state(false);
  let showKanban = $state(false);
  let showContext = $state(false);
  let showEmail = $state(false);
  let showExtensionSettings = $state(false);
  let browserUrl = $state("http://localhost:3000");
  let rightPanelMode = $state<"preview" | "files" | "browser" | "git" | "terminal" | "processes" | "kanban" | "preview-unified" | "context" | "email">("preview");
  let containerPreviewUrl = $state<string | null>(null);
  let terminalRef: { pasteCommand: (cmd: string) => void; runCommand: (cmd: string) => void } | null = $state(null);
  let terminalInitialCommand = $state("");
  let projectFileIndex = $state<Map<string, string>>(new Map());
  let activeSubagents = $state<Map<string, { elapsed: number }>>(new Map());
  let codeBlocksMap = $state<Map<string, { code: string; language: string }>>(new Map());
  
  let rightPanelWidth = $state(600);
  let isResizingRight = $state(false);
  
  let sidebarWidth = $state(288);
  let isResizingLeft = $state(false);
  
  let projectContext = $state<{ summary: string; suggestions: string[] } | null>(null);
  let claudeMdContent = $state<string | null>(null);
  let showClaudeMdModal = $state(false);
  let projectContextError = $state<string | null>(null);

  let audioRecorderRef: { toggleRecording: () => void; isRecording: () => boolean } | null = $state(null);
  let showHotkeysHelp = $state(false);
  let showFeedbackModal = $state(false);
  let currentErrorReport = $state<ErrorReport | null>(null);

  // Subscribe to pending error reports to open feedback modal
  $effect(() => {
    const report = $pendingErrorReport;
    if (report) {
      currentErrorReport = report;
      showFeedbackModal = true;
    }
  });
  let inputRef: HTMLTextAreaElement | undefined = $state(undefined);
  let showSearchModal = $state(false);
  let showQuickSessions = $state(false);
  let showContextOverflowModal = $state(false);

  let showConfetti = $state(false);
  let showWelcome = $state(false);
  let startTourAfterWelcome = $state(false);
  let titleSuggestionRef: TitleSuggestion | null = $state(null);

  // TOUR_STEPS and HOTKEYS are now imported from ./lib/constants

  function handleGlobalKeydown(e: KeyboardEvent) {
    const isMod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (!isInput) {
      if (e.key === '?') {
        e.preventDefault();
        showHotkeysHelp = !showHotkeysHelp;
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        audioRecorderRef?.toggleRecording();
        return;
      }
    }

    if (e.key === 'Escape') {
      if (showQuickSessions) {
        showQuickSessions = false;
      } else if (showHotkeysHelp) {
        showHotkeysHelp = false;
      } else if (showSettings) {
        showSettings = false;
      } else if (showPreview || showFileBrowser) {
        closeRightPanel();
      } else if (currentSessionLoading) {
        stopGeneration();
      }
      return;
    }

    if (!isMod) return;

    if (e.key === 'k') {
      e.preventDefault();
      showSearchModal = true;
    } else if (e.key === 'j') {
      e.preventDefault();
      showQuickSessions = !showQuickSessions;
    } else if (e.key === 'p') {
      e.preventDefault();
      showPreview = !showPreview;
      if (showPreview) rightPanelMode = 'preview';
    } else if (e.key === 'b') {
      e.preventDefault();
      toggleFileBrowser();
    } else if (e.key === 'g') {
      e.preventDefault();
      toggleGitPanel();
    } else if (e.key === '/') {
      e.preventDefault();
      inputRef?.focus();
    } else if (e.key === ',') {
      e.preventDefault();
      showSettings = true;
    } else if (e.key === 't') {
      e.preventDefault();
      toggleKanban();
    } else if (e.key === 'd') {
      e.preventDefault();
      if (showSessionsDashboard) {
        // Close
        showSessionsDashboard = false;
        sessionsDashboardProjectId = undefined;
      } else {
        // Open with current project context if in a project
        sessionsDashboardProjectId = currentProject?.id;
        showSessionsDashboard = true;
      }
    }

    // Experimental agent shortcuts (Cmd/Ctrl + Shift + key)
    if (e.shiftKey && isMod) {
      if (e.key === 'A' || e.key === 'a') {
        e.preventDefault();
        showExperimentalAgents = !showExperimentalAgents;
      } else if (e.key === 'H' || e.key === 'h') {
        e.preventDefault();
        toggleSelfHealing();
      } else if (e.key === 'F' || e.key === 'f') {
        e.preventDefault();
        spawnQuickAgent('healer-agent');
      }
    }
  }

  let pendingPermissionRequest = $state<{ requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string } | null>(null);
  let pendingQuestion = $state<{ requestId: string; questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> } | null>(null);

  function handlePermissionApprove(approveAll: boolean = false) {
    if (pendingPermissionRequest && client) {
      client.respondToPermission(pendingPermissionRequest.requestId, true, approveAll);
      const reqId = pendingPermissionRequest.requestId;
      $pendingPermissionRequests
        .filter(n => (n.data?.requestId as string) === reqId)
        .forEach(n => notifications.dismiss(n.id));
      if ($session.sessionId && $session.projectId) {
        sessionStatus.setRunning($session.sessionId, $session.projectId);
      }
      pendingPermissionRequest = null;
    }
  }

  function handlePermissionDeny() {
    if (pendingPermissionRequest && client) {
      client.respondToPermission(pendingPermissionRequest.requestId, false, false);
      const reqId = pendingPermissionRequest.requestId;
      $pendingPermissionRequests
        .filter(n => (n.data?.requestId as string) === reqId)
        .forEach(n => notifications.dismiss(n.id));
      if ($session.sessionId && $session.projectId) {
        sessionStatus.setIdle($session.sessionId, $session.projectId);
        sessionTodos.clearSession($session.sessionId);
      }
      pendingPermissionRequest = null;
    }
  }

  function handleQuestionAnswer(answers: Record<string, string | string[]>) {
    if (pendingQuestion && client) {
      client.respondToQuestion(pendingQuestion.requestId, answers);
      pendingQuestion = null;
      // Set status back to running since the agent will continue
      if ($session.sessionId && $session.projectId) {
        sessionStatus.setRunning($session.sessionId, $session.projectId);
      }
    }
  }

  function startResizingRight(e: MouseEvent) {
    e.preventDefault();
    isResizingRight = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function stopResizingRight() {
    isResizingRight = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function startResizingLeft(e: MouseEvent) {
    e.preventDefault();
    isResizingLeft = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function stopResizingLeft() {
    isResizingLeft = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function handleMouseMove(e: MouseEvent) {
    if (isResizingLeft) {
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 400) {
        sidebarWidth = newWidth;
      }
      return;
    }
    if (!isResizingRight) return;
    const newWidth = window.innerWidth - e.clientX;
    const currentSidebarWidth = sidebarCollapsed ? 56 : sidebarWidth;
    const minChatWidth = 400;
    const maxPanelWidth = window.innerWidth - currentSidebarWidth - minChatWidth;
    if (newWidth >= 300 && newWidth <= maxPanelWidth) {
      rightPanelWidth = newWidth;
    }
  }

  let currentProject = $derived(sidebarProjects.find(p => p.id === $session.projectId) ?? null);
  let currentSessionLoading = $derived($session.sessionId && $loadingSessions.has($session.sessionId));
  let queuedCount = $derived($session.sessionId ? $messageQueue.filter(m => m.sessionId === $session.sessionId).length : 0);
  let showOnboarding = $derived(!$onboardingComplete);

  // Context usage percentage for current session
  const contextWindow = $derived(currentProject?.context_window || 200000);
  const usagePercent = $derived(contextWindow > 0 ? Math.min(100, Math.round(($session.inputTokens / contextWindow) * 100)) : 0);
  let activeSkills = $state<Skill[]>([]);
  let mcpServers = $state<McpServer[]>([]);
  let customCommands = $state<CustomCommand[]>([]);

  // Check git status when project changes
  $effect(() => {
    const projectPath = currentProject?.path;
    if (projectPath) {
      getGitStatus(projectPath).then(status => {
        currentProjectIsGitRepo = status.isGitRepo;
      }).catch(() => {
        currentProjectIsGitRepo = false;
      });
    } else {
      currentProjectIsGitRepo = false;
    }
  });

  // Update browser tab title when project changes
  $effect(() => {
    document.title = currentProject?.name ? `${currentProject.name} - Navi` : 'Navi';
  });

  $effect(() => {
    if ($session.selectedModel !== lastSessionModel) {
      lastSessionModel = $session.selectedModel;
      modelSelection = $session.selectedModel;
    }
  });

  // Close right panel when leaving a workspace
  let lastProjectId: string | null = null;
  $effect(() => {
    const projectId = currentProject?.id ?? null;
    if (lastProjectId && !projectId) {
      // Left a workspace - close panel
      closeRightPanel();
    }
    lastProjectId = projectId;
  });

  function handleOnboardingComplete() {
    showWelcome = true;
    onboardingComplete.complete();
    // Mark that we should start the tour after the welcome animation finishes
    if (!$tour.completedTours.includes("main")) {
      startTourAfterWelcome = true;
    }
  }

  // Initialize action modules with callbacks
  initProjectActions({
    setSidebarProjects: (p) => { sidebarProjects = p; },
    setSidebarSessions: (s) => { sidebarSessions = s; },
    setProjectFileIndex: (idx) => { projectFileIndex = idx; },
    setProjectContext: (ctx) => { projectContext = ctx; },
    setProjectContextError: (err) => { projectContextError = err; },
    setClaudeMdContent: (content) => { claudeMdContent = content; },
    setInputText: (text) => { inputText = text; },
    getSidebarProjects: () => sidebarProjects,
    getInputText: () => inputText,
    getShowArchivedWorkspaces: () => $showArchivedWorkspaces,
  });

  initSessionActions({
    setSidebarSessions: (s) => { sidebarSessions = s; },
    getSidebarSessions: () => sidebarSessions,
    setInputText: (text) => { inputText = text; },
    getInputText: () => inputText,
    loadRecentChats: loadRecentChatsAction,
    scrollToBottom: (instant) => scrollToBottom(instant),
  });

  initFolderActions({
    setWorkspaceFolders: (f) => { workspaceFolders = f; },
    getWorkspaceFolders: () => workspaceFolders,
    setSidebarProjects: (p) => { sidebarProjects = p; },
    getSidebarProjects: () => sidebarProjects,
  });

  initDataLoaders({
    setDefaultProjectsDir: (dir) => { defaultProjectsDir = dir; },
    setGlobalPermissionSettings: (settings) => { globalPermissionSettings = settings; },
    setPermissionDefaults: (defaults) => { permissionDefaults = defaults; },
    setRecentChats: (chats) => {
      recentChats = chats;
      attention.setRecentChats(chats); // Sync to attention store for derived attention items
    },
  });

  onMount(() => {
    // Set up global error handlers
    const cleanupErrorHandlers = setupGlobalErrorHandlers();

    // Start connectivity monitoring (checks every 30 seconds)
    startConnectivityMonitoring(30000);

    // Initialize extension registry with default extensions
    initializeRegistry();

    // Initialize browser-use and email features
    initBrowserEmail();

    startSidecar().then(() => {
      serverReady = true;

      // Initialize auth state (check if user is already logged in)
      auth.init();

      loadProjects();
      loadRecentChatsAction();
      loadFolders();
      loadConfigAction();
      loadModelsAction();
      loadPermissionsAction();
      loadCostsAction();
      loadLibrary(); // Load agents for sidebar
      loadMcpServers(); // Load MCP server states

      // Initialize proactive hooks (skill scout, error detector, memory builder)
      setupProactiveHooks().then(() => {
        // Proactive hooks setup complete
      });

      client = new ClaudeClient();
      client.connect().then(() => {
        isConnected.set(true);
      }).catch(e => {
        console.error("Failed to connect:", e);
      });
      
      loadActiveSessionsAction();
      activeSessionsPoll = setInterval(loadActiveSessionsAction, 5000);

      client.onMessage((msg) => {
        messageHandler.handleMessage(msg);

        // Handle cloud execution messages
        if (msg.type === "cloud_execution_started") {
          cloudExecutionStore.start(
            msg.uiSessionId || "",
            msg.executionId,
            msg.repoUrl,
            msg.branch
          );
        } else if (msg.type === "cloud_stage") {
          cloudExecutionStore.setStage(msg.uiSessionId || "", msg.stage, msg.message);
        } else if (msg.type === "cloud_output") {
          cloudExecutionStore.addOutput(msg.uiSessionId || "", msg.data);
        } else if (msg.type === "cloud_result") {
          cloudExecutionStore.complete(
            msg.uiSessionId || "",
            msg.success,
            msg.duration,
            msg.estimatedCostUsd,
            msg.error
          );
          // Clear loading state
          loadingSessions.update(s => { s.delete(msg.uiSessionId || ""); return new Set(s); });
        } else if (msg.type === "cloud_error") {
          cloudExecutionStore.complete(msg.uiSessionId || "", false, 0, 0, msg.error);
          loadingSessions.update(s => { s.delete(msg.uiSessionId || ""); return new Set(s); });
        } else if (msg.type === "background_process_event") {
          // Forward background process events to the store for real-time updates
          backgroundProcessEvents.emit(msg as any);
        }
      });
    }).catch(() => {
      // Error already set in startSidecar
    });

    if ($onboardingComplete) {
      showWelcome = true;
    }

    // Restore state from URL hash on load (e.g., when opening in new window)
    const initialRoute = parseHash();
    if (initialRoute.projectId) {
      // Wait for projects to load, then properly initialize the project
      const initProjectFromUrl = async () => {
        // Give projects a moment to load
        await new Promise(resolve => setTimeout(resolve, 100));

        // Find the project in the loaded list
        const projectsList = get(projects);
        const project = projectsList.find(p => p.id === initialRoute.projectId);

        if (project) {
          // Fully initialize the project (like selectProject does)
          session.setProject(project.id);

          try {
            const sessionsList = await api.sessions.list(project.id, $showArchivedWorkspaces);
            sidebarSessions = sessionsList;

            // Load project context and files
            indexProjectFiles(project.path);
            loadProjectContext(project);
            loadClaudeMd(project.path);
            loadProjectCost(project.id);

            // Load extension settings for this project
            projectExtensions.loadForProject(project.id);

            // If a specific session was requested, select it
            if (initialRoute.sessionId) {
              const targetSession = sessionsList.find(s => s.id === initialRoute.sessionId);
              if (targetSession) {
                selectSession(targetSession, true);
              }
            }
          } catch (e) {
            console.error("Failed to initialize project from URL:", e);
          }
        } else {
          // Fallback: just set the session store
          session.restoreFromUrl(initialRoute.projectId, initialRoute.sessionId);
          if (initialRoute.projectId) {
            api.sessions.list(initialRoute.projectId).then(sessions => {
              sidebarSessions = sessions;
            }).catch(e => console.error("Failed to load sessions from URL:", e));
          }
        }
      };

      initProjectFromUrl();
    }

    // Listen for back/forward navigation
    const unsubscribeHash = onHashChange((route) => {
      const currentProjectId = get(session).projectId;
      const currentSessionId = get(session).sessionId;

      // Only restore if actually different (avoids loops)
      if (route.projectId !== currentProjectId || route.sessionId !== currentSessionId) {
        session.restoreFromUrl(route.projectId, route.sessionId);
        if (route.projectId && route.projectId !== currentProjectId) {
          api.sessions.list(route.projectId).then(sessions => {
            sidebarSessions = sessions;
          }).catch(e => console.error("Failed to load sessions:", e));
        }
      }
    });

    const handleGlobalClick = () => {
      sessionMenuId = null;
      projectMenuId = null;
      messageMenuId = null;
    };
    document.addEventListener("click", handleGlobalClick);

    // Handle integration setup chat requests from Settings
    const handleSetupChat = async (event: CustomEvent) => {
      const { providerId, providerName, setupGuide } = event.detail;

      // Close settings modal if open
      showSettings = false;
      await tick();

      // Start a new chat
      startNewChat();
      await tick();

      // Build the initial prompt with context
      const capabilities = setupGuide?.capabilities?.join("\n- ") || "";
      const examplePrompts = setupGuide?.examplePrompts?.join("\n- ") || "";

      const initialMessage = `Help me connect ${providerName} to Navi.

I want to set up the ${providerName} integration. Please guide me through getting the API key and help me test it.

${capabilities ? `\n**What I'll be able to do:**\n- ${capabilities}` : ""}

${examplePrompts ? `\n**Example things to try after setup:**\n- ${examplePrompts}` : ""}

Please walk me through the setup step by step. When I have the credentials, save them for me using the credentials API.`;

      // Set the input text and auto-send
      inputText = initialMessage;
      await tick();

      // Trigger send - use sendMessage which is the actual handler
      sendMessage(initialMessage);
    };
    document.addEventListener("open-setup-chat", handleSetupChat as EventListener);

    return () => {
      document.removeEventListener("click", handleGlobalClick);
      document.removeEventListener("open-setup-chat", handleSetupChat as EventListener);
      unsubscribeHash();
      cleanupErrorHandlers();
    };
  });


  onDestroy(() => {
    client?.disconnect();
    stopConnectivityMonitoring();
    if (activeSessionsPoll) {
      clearInterval(activeSessionsPoll);
    }
    if (sidecarProcess) {
      sidecarProcess.kill();
    }
  });

  function attachSession(sessionId: string | null, connected: boolean) {
    if (!sessionId) {
      lastAttachedSessionId = null;
      return;
    }
    if (!connected || !client?.isConnected) return;
    if (lastAttachedSessionId === sessionId) return;

    try {
      client.attachSession(sessionId);
      lastAttachedSessionId = sessionId;
    } catch (e) {
      console.error("Failed to attach session:", e);
    }
  }

  $effect(() => {
    attachSession($session.sessionId, $isConnected);
  });

  // Process message queue when session is ready and connected
  $effect(() => {
    const sessionId = $session.sessionId;
    const connected = $isConnected;
    const queue = $messageQueue;

    if (sessionId && connected && queue.length > 0) {
      // Check if there are queued messages for this session
      const sessionQueue = queue.filter(m => m.sessionId === sessionId);
      if (sessionQueue.length > 0) {
        // Small delay to ensure session is fully attached
        setTimeout(() => processMessageQueue(sessionId), 150);
      }
    }
  });

  $effect(() => {
    const projectId = $session.projectId;
    if (projectId) {
      skillsApi.listProjectSkills(projectId).then(skills => {
        activeSkills = skills;
      }).catch(e => {
        console.error("Failed to load project skills:", e);
        activeSkills = [];
      });
    } else {
      activeSkills = [];
    }
  });

  // Load MCP servers
  async function loadMcpServers() {
    try {
      mcpServers = await mcpApi.list(currentProject?.path);
    } catch (e) {
      console.error("Failed to load MCP servers:", e);
      mcpServers = [];
    }
  }

  // Load custom commands when project changes
  $effect(() => {
    const projectPath = currentProject?.path;
    fetchCommands(projectPath).then(commands => {
      customCommands = commands;
    }).catch(e => {
      console.error("Failed to load custom commands:", e);
      customCommands = [];
    });
  });

  async function loadProjects() {
    const projectsList = await loadProjectsAction();
    projects.set(projectsList);
  }

  // Folder functions - delegate to action modules
  const loadFolders = loadFoldersAction;
  const createFolder = createFolderAction;
  const updateFolder = updateFolderAction;
  const deleteFolder = deleteFolderAction;
  const toggleFolderCollapse = toggleFolderCollapseAction;
  const setProjectFolder = setProjectFolderAction;
  const reorderFolders = reorderFoldersAction;

  async function toggleFolderPin(folder: WorkspaceFolder, e: Event) {
    e.stopPropagation();
    await toggleFolderPinAction(folder);
  }

  $effect(() => {
    const _ = $showArchivedWorkspaces;
    loadProjects();
    // Also reload sessions if a project is selected
    if ($session.projectId) {
      api.sessions.list($session.projectId, $showArchivedWorkspaces).then(list => {
        sidebarSessions = list;
      });
    }
  });

  async function toggleProjectArchive(proj: Project, e: Event) {
    e.stopPropagation();
    const newArchived = !proj.archived;
    try {
      await api.projects.setArchived(proj.id, newArchived);
      if (!$showArchivedWorkspaces && newArchived) {
        sidebarProjects = sidebarProjects.filter(p => p.id !== proj.id);
        recentChats = recentChats.filter(c => c.project_id !== proj.id);
        attention.setRecentChats(recentChats);
      } else {
        sidebarProjects = sidebarProjects.map(p => 
          p.id === proj.id ? { ...p, archived: newArchived ? 1 : 0 } : p
        );
        if (!newArchived) {
          loadRecentChatsAction();
        }
      }
      projects.set(sidebarProjects);
    } catch (e) {
      console.error("Failed to toggle archive:", e);
    }
  }

  $effect(() => {
    const _ = $showArchivedWorkspaces;
    loadRecentChatsAction();
  });

  async function handleModelSelect(model: string) {
    modelSelection = model;
    session.setSelectedModel(model);
    // Store in per-session model cache and update sidebar sessions
    if ($session.sessionId) {
      sessionModels.setModel($session.sessionId, model);
      // Update the model in sidebarSessions so it persists when switching sessions
      const idx = sidebarSessions.findIndex(s => s.id === $session.sessionId);
      if (idx !== -1) {
        sidebarSessions[idx] = { ...sidebarSessions[idx], model };
      }
      // Persist model to session in DB
      try {
        await api.sessions.update($session.sessionId, { model });
      } catch (e) {
        console.error("Failed to save model:", e);
      }
    }
  }

  async function selectProject(project: Project) {
    const prevSessionId = $session.sessionId;
    if (prevSessionId && inputText.trim()) {
      sessionDrafts.setDraft(prevSessionId, inputText);
    }
    inputText = "";

    // Clear session-specific UI state when switching projects
    pendingPermissionRequest = null;
    pendingQuestion = null;

    // Close any open channel when selecting a workspace
    currentChannelId.set(null);

    session.setProject(project.id);
    session.setSession(null);
    sidebarSessions = [];
    projectFileIndex = new Map();
    projectContext = null;
    projectContextError = null;
    claudeMdContent = null;
    currentProjectIsGitRepo = false;

    try {
      const sessionsList = await api.sessions.list(project.id, $showArchivedWorkspaces);
      sidebarSessions = sessionsList;
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }

    // Check if project is a git repo
    try {
      const gitStatus = await getGitStatus(project.path);
      currentProjectIsGitRepo = gitStatus.isGitRepo;
      // Load branches for cloud execution if it's a git repo
      if (gitStatus.isGitRepo) {
        loadCloudBranches();
      }
    } catch (e) {
      currentProjectIsGitRepo = false;
    }

    api.claudeMd.initProject(project.path).catch(e => {
      console.error("Failed to init CLAUDE.md:", e);
    });
    
    indexProjectFiles(project.path);
    loadProjectContext(project);
    loadClaudeMd(project.path);
    loadProjectCost(project.id);

    // Load extension settings for this project
    projectExtensions.loadForProject(project.id);

    if (!$tour.completedTours.includes("project")) {
      setTimeout(() => tour.start("project"), 500);
    }
  }

  async function goToChat(chat: Session) {
    let project = sidebarProjects.find(p => p.id === chat.project_id);
    if (!project) {
      try {
        project = await api.projects.get(chat.project_id);
      } catch (e) {
        console.error("Failed to load project:", e);
        return;
      }
    }
    if (!project) return;
    
    session.setProject(chat.project_id);
    projectFileIndex = new Map();
    projectContext = null;
    projectContextError = null;
    claudeMdContent = null;
    
    try {
      const sessionsList = await api.sessions.list(chat.project_id, $showArchivedWorkspaces);
      sidebarSessions = sessionsList;
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }

    selectSession({ ...chat, claude_session_id: chat.claude_session_id } as Session);
    indexProjectFiles(project.path);
    loadProjectContext(project);
    loadClaudeMd(project.path);
  }

  async function goToSessionById(projectId: string, sessionId: string) {
    // Fetch the session and then use goToChat
    try {
      const sessionData = await api.sessions.get(sessionId);
      if (sessionData) {
        goToChat(sessionData);
      }
    } catch (e) {
      console.error("Failed to load session:", e);
    }
  }

  async function createProject() {
    if (projectCreationMode === "quick") {
      if (!newProjectQuickName.trim()) return;
      const sanitizedName = newProjectQuickName.trim().replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
      const fullPath = `${defaultProjectsDir}/${sanitizedName}`;
      
      try {
        await api.fs.mkdir(fullPath);
      } catch (e: any) {
        console.error("Failed to create directory:", e);
        alert(`Failed to create directory: ${e.message}`);
        return;
      }
      
      try {
        const newProject = await api.projects.create({
          name: newProjectQuickName.trim(),
          path: fullPath
        });
        if (newProjectTargetFolderId) {
          await setProjectFolder(newProject.id, newProjectTargetFolderId);
        }
        await loadProjects();
        selectProject(newProject);
        showNewProjectModal = false;
        newProjectQuickName = "";
        newProjectTargetFolderId = null;
      } catch (e: any) {
        console.error("Failed to create project:", e);
        alert(`Failed to create project: ${e.message}`);
      }
    } else {
      if (!newProjectName || !newProjectPath) return;

      try {
        const newProject = await api.projects.create({
          name: newProjectName,
          path: newProjectPath
        });
        if (newProjectTargetFolderId) {
          await setProjectFolder(newProject.id, newProjectTargetFolderId);
        }
        await loadProjects();
        selectProject(newProject);
        showNewProjectModal = false;
        newProjectName = "";
        newProjectPath = "";
        newProjectTargetFolderId = null;
      } catch (e: any) {
        console.error("Failed to create project:", e);
        alert(`Failed to create project: ${e.message}`);
      }
    }
  }

  async function createProjectFromTemplate(templateId: string, name: string) {
    if (!name.trim()) return;

    const sanitizedName = name.trim().replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    const fullPath = `${defaultProjectsDir}/${sanitizedName}`;

    try {
      // Create the directory first
      await api.fs.mkdir(fullPath);
    } catch (e: any) {
      console.error("Failed to create directory:", e);
      alert(`Failed to create directory: ${e.message}`);
      return;
    }

    let skillSlugs: string[] = [];
    try {
      // Apply the template (returns skill slugs to enable)
      const result = await api.fs.applyTemplate(templateId, fullPath);
      skillSlugs = result.skillSlugs || [];
    } catch (e: any) {
      console.error("Failed to apply template:", e);
      alert(`Failed to apply template: ${e.message}`);
      return;
    }

    try {
      // Create the project record
      const newProject = await api.projects.create({
        name: name.trim(),
        path: fullPath
      });
      if (newProjectTargetFolderId) {
        await setProjectFolder(newProject.id, newProjectTargetFolderId);
      }

      // Enable template skills for this project
      if (skillSlugs.length > 0) {
        try {
          // Sync global skills first to ensure they're in the library
          await skillsApi.syncGlobal();
          // Get all skills to find IDs by slug
          const allSkills = await skillsApi.list();
          for (const slug of skillSlugs) {
            const skill = allSkills.find(s => s.slug === slug);
            if (skill) {
              try {
                await skillsApi.enableForProject(newProject.id, skill.id);
              } catch (e) {
                // Failed to enable skill
              }
            }
          }
        } catch (e) {
          // Failed to enable template skills
        }
      }

      await loadProjects();
      selectProject(newProject);
      showNewProjectModal = false;
      projectCreationMode = "quick";
      newProjectTargetFolderId = null;
    } catch (e: any) {
      console.error("Failed to create project:", e);
      alert(`Failed to create project: ${e.message}`);
    }
  }

  async function pickDirectory() {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
        });
        if (selected && typeof selected === "string") {
          newProjectPath = selected;
          if (!newProjectName) {
            newProjectName = selected.split("/").filter(Boolean).pop() || "";
          }
        }
      } catch (e) {
        console.error("Failed to pick directory:", e);
      }
    } else {
      const path = prompt("Enter directory path:", "/Users/");
      if (path) {
        newProjectPath = path;
        if (!newProjectName) {
          newProjectName = path.split("/").filter(Boolean).pop() || "";
        }
      }
    }
  }

  function openEditProject(proj: Project, e: Event) {
    e.stopPropagation();
    editingProject = proj;
    editProjectName = proj.name;
    editProjectPath = proj.path;
  }

  async function updateProject() {
    if (!editingProject || !editProjectName || !editProjectPath) return;
    
    try {
      await api.projects.update(editingProject.id, {
        name: editProjectName,
        path: editProjectPath
      });
      await loadProjects();
      editingProject = null;
    } catch (e) {
      console.error("Failed to update project:", e);
      alert("Failed to update project");
    }
  }

  function openDeleteConfirm(proj: Project, e: Event) {
    e.stopPropagation();
    projectToDelete = proj;
    showDeleteConfirm = true;
  }

  async function deleteProject() {
    if (!projectToDelete) return;
    
    try {
      await api.projects.delete(projectToDelete.id);
      await loadProjects();
      if ($session.projectId === projectToDelete.id) {
        session.setProject(null);
        sidebarSessions = [];
      }
      showDeleteConfirm = false;
      projectToDelete = null;
    } catch (e) {
      console.error("Failed to delete project:", e);
      alert("Failed to delete project");
    }
  }

  async function pickDirectoryForEdit() {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
        });
        if (selected && typeof selected === "string") {
          editProjectPath = selected;
        }
      } catch (e) {
        console.error("Failed to pick directory:", e);
      }
    } else {
      const path = prompt("Enter directory path:", editProjectPath);
      if (path) {
        editProjectPath = path;
      }
    }
  }

  async function selectSession(s: Session, skipHistory = false) {
    const prevSessionId = $session.sessionId;
    if (prevSessionId && inputText.trim()) {
      sessionDrafts.setDraft(prevSessionId, inputText);
    }

    // Clear session-specific UI state when switching sessions
    pendingPermissionRequest = null;
    pendingQuestion = null;

    // Load any pending question for this session from the database
    api.sessions.getPendingQuestion(s.id).then((pending) => {
      if (pending && pending.questions) {
        pendingQuestion = {
          requestId: pending.request_id,
          questions: pending.questions,
        };
        // Set the awaiting_input status
        if ($session.projectId) {
          sessionStatus.setAwaitingInput(s.id, $session.projectId);
        }
      }
    }).catch(() => {
      // Failed to load pending question
    });

    inputText = $sessionDrafts.get(s.id) || "";

    session.setSession(s.id, s.claude_session_id);
    session.setCost(s.total_cost_usd || 0);
    session.setUsage(s.input_tokens || 0, s.output_tokens || 0);

    // Restore model for this session from cache or DB, default to Opus
    const cachedModel = $sessionModels.get(s.id);
    if (cachedModel) {
      session.setSelectedModel(cachedModel);
    } else if (s.model) {
      session.setSelectedModel(s.model);
      sessionModels.setModel(s.id, s.model);
    } else {
      // No model set - use default (Opus)
      const defaultModel = getDefaultModel();
      session.setSelectedModel(defaultModel);
    }

    // Restore backend for this session from DB if specified
    // Always trust the session's stored backend over cache (cache may have stale defaults)
    if (s.backend) {
      sessionBackendStore.set(s.id, s.backend as BackendId);
    }
    // If session doesn't have a backend, check the map directly to see if we have a cached value
    // (The get() method returns "claude" as default, which could be wrong for a codex session)

    sessionStatus.markSeen(s.id);

    // Track in navigation history
    if (!skipHistory) {
      // Use session's project_id (for child sessions), fallback to current project
      const sessionProjectId = s.project_id || $session.projectId || "";
      const project = sidebarProjects.find(p => p.id === sessionProjectId);
      navHistory.push({
        chatId: s.id,
        chatTitle: s.title || "Untitled Chat",
        projectId: sessionProjectId,
        projectName: project?.name || "Unknown Project",
      });
    }

    try {
      const freshSession = await api.sessions.get(s.id);
      if (freshSession) {
        session.setUsage(freshSession.input_tokens || 0, freshSession.output_tokens || 0);
        session.setCost(freshSession.total_cost_usd || 0);
        // Update model from DB if we don't have a cached value
        if (freshSession.model && !cachedModel) {
          session.setSelectedModel(freshSession.model);
          sessionModels.setModel(s.id, freshSession.model);
        }
        // Always update backend from fresh session data (trust DB over cache)
        if (freshSession.backend) {
          sessionBackendStore.set(s.id, freshSession.backend as BackendId);
        }
      }
    } catch {}
    
    if (!$sessionMessages.has(s.id)) {
      try {
        const msgs = await api.messages.list(s.id);
        const loadedMsgs: ChatMessage[] = msgs.map(m => {
          let content = m.content;
          if (typeof content === "string") {
            try { content = JSON.parse(content); } catch {}
          }
          return {
            id: m.id,
            role: m.role as any,
            content: content,
            timestamp: new Date(m.timestamp),
            parentToolUseId: m.parent_tool_use_id ?? undefined,
            isSynthetic: !!m.is_synthetic,
            isFinal: !!m.is_final,
          };
        });
        sessionMessages.setMessages(s.id, loadedMsgs);
      } catch (e) {
        console.error("Failed to load messages:", e);
      }
    }

    userIsNearBottom = true; // Reset on session switch
    // Wait for DOM to update with new messages before scrolling
    await tick();
    scrollToBottom(true);
  }

  async function deleteSession(e: Event, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;

    try {
      await api.sessions.delete(id);
      sidebarSessions = sidebarSessions.filter(s => s.id !== id);
      loadRecentChatsAction();
      sessionMessages.clearSession(id);
      if ($session.sessionId === id) {
        session.setSession(null);
      }
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  }

  async function duplicateSession(sess: Session, e: Event) {
    e.stopPropagation();
    try {
      const result = await api.sessions.fork(sess.id, { title: `${sess.title} (copy)` });
      const { historyContext, ...forked } = result;
      sidebarSessions = [forked, ...sidebarSessions];
      loadRecentChatsAction();
      selectSession(forked);

      // If the fork returned historyContext (no SDK session was copied),
      // store it so Claude has context for the first message
      if (historyContext) {
        sessionHistoryContext.update(map => {
          map.set(forked.id, historyContext);
          return new Map(map);
        });
      }
    } catch (err) {
      console.error("Failed to duplicate session:", err);
    }
  }

  async function handleStartNewChatWithSummary(sess: Session, e: Event) {
    e.stopPropagation();
    await startNewChatWithSummary(sess.id, {
      createNewChat: createNewChatAction,
      setInputText: (text) => { inputText = text; }
    });
  }

  async function handleNavHistoryNavigate(entry: NavHistoryEntry) {
    // If different project, switch to it first
    if (entry.projectId !== $session.projectId) {
      const project = sidebarProjects.find(p => p.id === entry.projectId);
      if (project) {
        session.setProject(project.id);
        try {
          const sessionsList = await api.sessions.list(project.id, $showArchivedWorkspaces);
          sidebarSessions = sessionsList;
        } catch (e) {
          console.error("Failed to load sessions:", e);
        }
        indexProjectFiles(project.path);
        loadProjectContext(project);
        loadClaudeMd(project.path);
        loadProjectCost(project.id);
      }
    }

    // Find and select the session
    let targetSession = sidebarSessions.find(s => s.id === entry.chatId);
    if (!targetSession) {
      try {
        targetSession = await api.sessions.get(entry.chatId);
      } catch (e) {
        console.error("Failed to load session from history:", e);
        return;
      }
    }
    if (targetSession) {
      selectSession(targetSession, true); // skipHistory = true to avoid duplicate entries
    }
  }

  async function toggleProjectPin(proj: Project, e: Event) {
    e.stopPropagation();
    const newPinned = !proj.pinned;
    try {
      await api.projects.togglePin(proj.id, newPinned);
      sidebarProjects = sidebarProjects.map(p =>
        p.id === proj.id ? { ...p, pinned: newPinned ? 1 : 0 } : p
      ).sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
    } catch (e) {
      console.error("Failed to toggle project pin:", e);
    }
  }

  async function openProjectInNewWindow(project: Project) {
    console.log("[CMD+CLICK] openProjectInNewWindow called for:", project.name, "isTauri:", isTauri());
    if (!isTauri()) {
      // In browser mode, open in a new browser tab
      console.log("[CMD+CLICK] Opening in browser tab");
      window.open(`#/project/${project.id}`, '_blank');
      return;
    }

    try {
      console.log("[CMD+CLICK] Calling Tauri invoke");
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_project_in_new_window", {
        projectId: project.id,
        projectName: project.name
      });
    } catch (e) {
      console.error("Failed to open project in new window:", e);
      notifications.add({
        title: "Error",
        message: "Failed to open project in new window",
        type: "error"
      });
    }
  }

  async function openSessionInNewWindow(sess: Session) {
    if (!selectedProject) return;

    if (!isTauri()) {
      // In browser mode, open in a new browser tab
      window.open(`#/project/${selectedProject.id}/chat/${sess.id}`, '_blank');
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_session_in_new_window", {
        projectId: selectedProject.id,
        sessionId: sess.id,
        sessionTitle: sess.title || "Chat"
      });
    } catch (e) {
      console.error("Failed to open session in new window:", e);
      notifications.add({
        title: "Error",
        message: "Failed to open session in new window",
        type: "error"
      });
    }
  }

  async function openHomeInNewWindow() {
    if (!isTauri()) {
      // In browser mode, open in a new browser tab
      window.open('#/', '_blank');
      return;
    }

    try {
      // Use create_new_window by opening without a project
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const windowNum = Date.now();
      new WebviewWindow(`home-${windowNum}`, {
        url: 'index.html',
        title: 'Navi',
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        center: true
      });
    } catch (e) {
      console.error("Failed to open home in new window:", e);
      notifications.add({
        title: "Error",
        message: "Failed to open new window",
        type: "error"
      });
    }
  }

  async function toggleSessionPin(sess: Session, e: Event) {
    e.stopPropagation();
    const newPinned = !sess.pinned;
    try {
      await api.sessions.togglePin(sess.id, newPinned);
      sidebarSessions = sidebarSessions.map(s => 
        s.id === sess.id ? { ...s, pinned: newPinned ? 1 : 0 } : s
      ).sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        if ((b.favorite || 0) !== (a.favorite || 0)) return (b.favorite || 0) - (a.favorite || 0);
        if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
        return b.updated_at - a.updated_at;
      });
    } catch (e) {
      console.error("Failed to toggle session pin:", e);
    }
  }

  async function toggleSessionFavorite(sess: Session, e: Event) {
    e.stopPropagation();
    const newFavorite = !sess.favorite;
    try {
      await api.sessions.toggleFavorite(sess.id, newFavorite);
      sidebarSessions = sidebarSessions.map(s => 
        s.id === sess.id ? { ...s, favorite: newFavorite ? 1 : 0 } : s
      ).sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        if ((b.favorite || 0) !== (a.favorite || 0)) return (b.favorite || 0) - (a.favorite || 0);
        if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
        return b.updated_at - a.updated_at;
      });
    } catch (e) {
      console.error("Failed to toggle session favorite:", e);
    }
  }

  async function toggleSessionArchive(sess: Session, e: Event) {
    e.stopPropagation();
    const newArchived = !sess.archived;
    try {
      await api.sessions.setArchived(sess.id, newArchived);
      if (newArchived && !$showArchivedWorkspaces) {
        // Remove from sidebar if archiving and not showing archived
        sidebarSessions = sidebarSessions.filter(s => s.id !== sess.id);
        if ($session.sessionId === sess.id) {
          session.setSession(null);
        }
      } else {
        sidebarSessions = sidebarSessions.map(s =>
          s.id === sess.id ? { ...s, archived: newArchived ? 1 : 0 } : s
        );
      }
      loadRecentChatsAction();
    } catch (err) {
      console.error("Failed to toggle session archive:", err);
    }
  }

  async function archiveAllNonStarred() {
    if (!currentProject) return;
    try {
      await api.sessions.archiveAllNonStarred(currentProject.id);
      if (!$showArchivedWorkspaces) {
        // Remove non-starred sessions from sidebar
        const currentSessionId = $session.sessionId;
        const wasCurrentArchived = sidebarSessions.find(s => s.id === currentSessionId && !s.favorite);
        sidebarSessions = sidebarSessions.filter(s => s.favorite);
        if (wasCurrentArchived) {
          session.setSession(null);
        }
      } else {
        // Mark all non-starred as archived
        sidebarSessions = sidebarSessions.map(s => s.favorite ? s : { ...s, archived: 1 });
      }
      loadRecentChatsAction();
    } catch (err) {
      console.error("Failed to archive all non-starred sessions:", err);
    }
  }

  async function toggleSessionMarkedForReview(sess: Session, e: Event) {
    e.stopPropagation();
    const newMarkedForReview = !sess.marked_for_review;
    try {
      await api.sessions.setMarkedForReview(sess.id, newMarkedForReview);
      sidebarSessions = sidebarSessions.map(s =>
        s.id === sess.id ? { ...s, marked_for_review: newMarkedForReview ? 1 : 0 } : s
      );
      loadRecentChatsAction();
    } catch (err) {
      console.error("Failed to toggle session marked for review:", err);
    }
  }

  async function toggleSessionBacklog(sess: Session, e: Event) {
    e.stopPropagation();
    const isInBacklog = !!sess.in_backlog;
    try {
      const response = await fetch(`${getServerUrl()}/api/sessions/${sess.id}/backlog`, {
        method: isInBacklog ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: isInBacklog ? undefined : JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Failed to toggle backlog");
      const updated = await response.json();
      sidebarSessions = sidebarSessions.map(s =>
        s.id === sess.id ? { ...s, in_backlog: updated.in_backlog, backlog_added_at: updated.backlog_added_at } : s
      );
      loadRecentChatsAction();
    } catch (err) {
      console.error("Failed to toggle session backlog:", err);
    }
  }

  function openEditSession(sess: Session, e: Event) {
    e.stopPropagation();
    editingSession = sess;
    editSessionTitle = sess.title;
  }

  async function updateSession() {
    if (!editingSession || !editSessionTitle.trim()) return;
    
    try {
      await api.sessions.update(editingSession.id, { title: editSessionTitle.trim() });
      sidebarSessions = sidebarSessions.map(s => 
        s.id === editingSession!.id ? { ...s, title: editSessionTitle.trim() } : s
      );
      editingSession = null;
    } catch (e) {
      console.error("Failed to update session:", e);
      alert("Failed to update chat name");
    }
  }
  let isProgrammaticScroll = false;

  function formatReference(ref: TextReference): string {
    const { source } = ref;
    let annotation = "";

    if (source.path) {
      const filename = source.path.split("/").pop();
      annotation = `Source: \`${filename}\``;

      if (source.startLine) {
        annotation += source.endLine && source.endLine !== source.startLine
          ? ` (lines ${source.startLine}-${source.endLine})`
          : ` (line ${source.startLine})`;
      }
      if (source.jsonPath) {
        annotation += ` at ${source.jsonPath}`;
      }
      if (source.rows && source.columns) {
        const sheetPrefix = source.sheet ? `[${source.sheet}] ` : "";
        annotation += ` ${sheetPrefix}Row ${source.rows[0]}, Column: ${source.columns.join(", ")}`;
      }
    } else if (source.url) {
      annotation = `Source: ${source.url}`;
    }

    const quotedText = ref.text
      .split("\n")
      .map(line => `> ${line}`)
      .join("\n");

    return `${quotedText}\n> *${annotation}*`;
  }

  async function scrollToBottom(instant = false) {
    // Only auto-scroll if user is near the bottom, or if it's an instant scroll
    if (!instant && !userIsNearBottom) return;

    isProgrammaticScroll = true;
    newMessagesWhileAway = 0;

    // Wait for Svelte to render DOM updates before scrolling
    // Double tick: first for store propagation, second for DOM render
    await tick();
    await tick();

    // Use requestAnimationFrame to ensure layout is complete before scrolling
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        messagesContainer?.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: instant ? "instant" : "smooth",
        });
        // Reset flag after scroll animation completes
        setTimeout(() => { isProgrammaticScroll = false; }, instant ? 50 : 300);
      });
    });
  }

  function jumpToBottom() {
    isProgrammaticScroll = true;
    newMessagesWhileAway = 0;
    userIsNearBottom = true;
    messagesContainer?.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: "smooth",
    });
    setTimeout(() => { isProgrammaticScroll = false; }, 300);
  }

  /**
   * Build a conversation history context string from session messages.
   * Used when switching to non-Claude backends that don't maintain their own session state.
   */
  function buildHistoryContextFromMessages(sessionId: string): string | undefined {
    const msgs = get(sessionMessages).get(sessionId);
    if (!msgs || msgs.length === 0) return undefined;

    // Filter to main conversation messages (not tool results, not system info)
    const mainMsgs = msgs
      .filter(m => !m.parentToolUseId && !m.isSystemInfo && m.role !== "system")
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (mainMsgs.length === 0) return undefined;

    // Build context string
    const contextParts: string[] = [];
    for (const msg of mainMsgs) {
      const role = msg.role === "user" ? "User" : "Assistant";
      let text = "";

      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Extract text from content blocks
        text = msg.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text || "")
          .join("\n");
      }

      if (text.trim()) {
        contextParts.push(`${role}: ${text.trim()}`);
      }
    }

    if (contextParts.length === 0) return undefined;

    return `Previous conversation:\n\n${contextParts.join("\n\n")}`;
  }

  function notifyNewContent() {
    // Only increment if user is scrolled away - called for actual new messages, not stream chunks
    if (!userIsNearBottom) {
      newMessagesWhileAway++;
    }
  }

  function handleMessagesScroll() {
    if (!messagesContainer) return;
    // Ignore scroll events triggered by our own scrollToBottom
    if (isProgrammaticScroll) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    // User scrolled - are they at the very bottom? (within 20px tolerance for rounding)
    const wasNearBottom = userIsNearBottom;
    userIsNearBottom = scrollHeight - scrollTop - clientHeight < 20;

    // If user scrolled back to bottom, reset the counter
    if (!wasNearBottom && userIsNearBottom) {
      newMessagesWhileAway = 0;
    }
  }

  function processMessageQueue(sessionId: string) {
    const queue = $messageQueue.filter(m => m.sessionId === sessionId);
    if (queue.length === 0) return;

    const first = queue[0];
    if (first.id) {
      messageQueue.remove(first.id);
    }

    const prompt = first.text;
    
    sessionMessages.addMessage(sessionId, {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      timestamp: new Date(),
    });

    loadingSessions.update(s => { s.add(sessionId); return new Set(s); });
    if ($session.projectId) {
      sessionStatus.setRunning(sessionId, $session.projectId);
    }

    // Get the backend for this session
    const backend = sessionBackendStore.get(sessionId, get(sessionBackendStore)) || get(defaultBackend);

    client.query({
      prompt,
      projectId: $session.projectId || undefined,
      sessionId,
      claudeSessionId: $session.claudeSessionId || undefined,
      model: $session.selectedModel || undefined,
      backend,
    });

    if (sessionId === $session.sessionId) {
      scrollToBottom();
    }
  }

  function stopGeneration() {
    const sessionId = $session.sessionId;
    if (!sessionId) return;

    // Also disable until done mode when stopping
    if (untilDoneSessions.has(sessionId)) {
      untilDoneSessions.delete(sessionId);
      untilDoneSessions = new Map(untilDoneSessions);
      // Also disable on server
      fetch(`${getServerUrl()}/api/sessions/${sessionId}/until-done`, { method: "DELETE" }).catch(() => {});
    }

    try {
      client.abort(sessionId);
    } catch (e) {
      console.error("Failed to abort:", e);
      loadingSessions.update(s => { s.delete(sessionId); return new Set(s); });
      sessionMessages.addMessage(sessionId, {
        id: crypto.randomUUID(),
        role: "system",
        content: "Request stopped",
        timestamp: new Date(),
      });
    }
  }

  async function toggleUntilDone() {
    const sessionId = $session.sessionId;
    if (!sessionId) return;

    const baseUrl = getServerUrl();
    const currentlyEnabled = untilDoneSessions.has(sessionId);

    if (!currentlyEnabled) {
      // Enable until done mode (basic mode - for infinite loop, use openInfiniteLoopConfig)
      try {
        await fetch(`${baseUrl}/api/sessions/${sessionId}/until-done`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxIterations: untilDoneMaxIterations }),
        });
        untilDoneSessions = new Map(untilDoneSessions.set(sessionId, {
          enabled: true,
          iteration: 0,
          maxIterations: untilDoneMaxIterations,
          totalCost: 0,
        }));
      } catch (e) {
        console.error("[UntilDone] Failed to enable:", e);
      }
    } else {
      // Disable until done mode (and infinite loop if active)
      const existing = untilDoneSessions.get(sessionId);
      try {
        if (existing?.loopId) {
          // Stop the infinite loop
          await fetch(`${baseUrl}/api/loops/${existing.loopId}/stop`, { method: "POST" });
        }
        await fetch(`${baseUrl}/api/sessions/${sessionId}/until-done`, { method: "DELETE" });
        untilDoneSessions.delete(sessionId);
        untilDoneSessions = new Map(untilDoneSessions);
      } catch (e) {
        console.error("[UntilDone] Failed to disable:", e);
      }
    }
  }

  // Open infinite loop configuration modal
  function openInfiniteLoopConfig(prompt: string) {
    infiniteLoopPendingPrompt = prompt;
    showInfiniteLoopConfig = true;
  }

  // Handle infinite loop started
  function handleInfiniteLoopStarted(loopId: string) {
    const sessionId = $session.sessionId;
    if (!sessionId) return;

    untilDoneSessions = new Map(untilDoneSessions.set(sessionId, {
      enabled: true,
      iteration: 1,
      maxIterations: 100,
      totalCost: 0,
      loopId,
    }));

    notifications.add({
      type: "info",
      title: "🔄 Infinite Loop Started",
      message: "Claude will work until your Definition of Done is verified",
    });
  }

  // Send a command/message programmatically (e.g., /compact)
  async function sendCommand(command: string) {
    if (!command.trim() || !$isConnected) return;
    if (!$session.projectId || !$session.sessionId) return;

    const currentSessionId = $session.sessionId;

    loadingSessions.update(s => { s.add(currentSessionId); return new Set(s); });
    sessionStatus.setRunning(currentSessionId, $session.projectId!);

    const backend = sessionBackendStore.get(currentSessionId, get(sessionBackendStore)) || get(defaultBackend);

    client.query({
      prompt: command,
      projectId: $session.projectId,
      sessionId: currentSessionId,
      claudeSessionId: $session.claudeSessionId || undefined,
      model: $session.selectedModel || undefined,
      backend,
    });
  }

  async function sendMessage() {
    if (!inputText.trim() || !$isConnected) return;
    if (!$session.projectId) {
        alert("Please select or create a project first.");
        return;
    }

    let currentSessionId = $session.sessionId;

    // If in pending state or no session, create the actual DB session now
    if (!currentSessionId || $session.isPending) {
        // Use first line of message (up to 50 chars) as title hint
        const titleHint = inputText.trim().split('\n')[0].slice(0, 50);
        const newSessionId = await createNewChatAction(titleHint);
        if (!newSessionId) return;
        currentSessionId = newSessionId;
    }
    const isCurrentSessionLoading = $loadingSessions.has(currentSessionId);
    
    if (isCurrentSessionLoading) {
      messageQueue.add({ sessionId: currentSessionId, text: inputText.trim(), attachments: [] });
      inputText = "";
      sessionDrafts.clearDraft(currentSessionId);
      return;
    }

    const currentInput = inputText;
    const currentAttachedFiles = get(attachedFiles);
    const currentReferences = get(textReferences);
    inputText = "";
    sessionDrafts.clearDraft(currentSessionId);
    attachedFiles.clear();
    textReferences.clear();

    const currentTodos = get(todos);
    if (currentTodos.length > 0 && currentTodos.every(t => t.status === "completed")) {
      todos.set([]);
    }

    const thanksPatterns = /\b(thanks|thank you|thx|ty|awesome|perfect|great job|well done|amazing|love it)\b/i;
    if (thanksPatterns.test(currentInput)) {
      showConfetti = true;
    }

    let messageContent = currentInput;

    // Add text references as markdown blockquotes
    if (currentReferences.length > 0) {
      const referenceBlocks = currentReferences.map(formatReference).join("\n\n");
      messageContent = `${referenceBlocks}\n\n${messageContent}`;
    }

    // Add file references
    if (currentAttachedFiles.length > 0) {
      const fileRefs = currentAttachedFiles.map(f => `[File: ${f.path}]`).join("\n");
      messageContent = `${fileRefs}\n\n${messageContent}`;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };
    sessionMessages.addMessage(currentSessionId, userMessage);

    // Trigger proactive hooks on user message
    const projectForHooks = currentProject ? { id: currentProject.id, name: currentProject.name, path: currentProject.path } : null;
    hookOnUserMessage(userMessage, get(sessionMessages).get(currentSessionId) || [], currentSessionId, projectForHooks);

    loadingSessions.update(s => { s.add(currentSessionId); return new Set(s); });
    sessionStatus.setRunning(currentSessionId, $session.projectId!);

    // Get execution mode settings for this session
    const execSettings = executionModeStore.get(currentSessionId, get(executionModeStore));

    // Extract @agent mention from the beginning of the message (e.g., "@coder add feature")
    // Agent must be at the start of the message, followed by space
    const agentMatch = messageContent.match(/^@(\w+)\s+/);
    let agentId: string | undefined;
    let promptWithoutAgent = messageContent;
    if (agentMatch) {
      agentId = agentMatch[1];
      promptWithoutAgent = messageContent.slice(agentMatch[0].length);
    }

    const backend = sessionBackendStore.get(currentSessionId, get(sessionBackendStore)) || get(defaultBackend);

    // For non-Claude backends, build history context from messages if not already provided
    // Claude maintains its own session state via claudeSessionId, but Gemini/Codex need the full context
    let historyCtx = $sessionHistoryContext.get(currentSessionId);
    if (!historyCtx && backend !== "claude") {
      historyCtx = buildHistoryContextFromMessages(currentSessionId);
    }

    client.query({
      prompt: promptWithoutAgent,
      projectId: $session.projectId || undefined,
      sessionId: currentSessionId,
      claudeSessionId: backend === "claude" ? ($session.claudeSessionId || undefined) : undefined,
      model: $session.selectedModel || undefined,
      historyContext: historyCtx,
      agentId,
      backend,
      // Plan mode - Claude plans before acting
      planMode: get(planMode),
      // Cloud execution options
      executionMode: execSettings.mode,
      cloudRepoUrl: execSettings.repoUrl,
      cloudBranch: execSettings.branch,
    });

    if ($sessionHistoryContext.get(currentSessionId)) {
      sessionHistoryContext.update(map => {
        map.delete(currentSessionId);
        return new Map(map);
      });
    }

    scrollToBottom();
  }

  // Send message to a specific session (avoids race conditions with store updates)
  async function sendMessageToSession(targetSessionId: string) {
    if (!inputText.trim() || !$isConnected) return;
    if (!$session.projectId) {
      alert("Please select or create a project first.");
      return;
    }

    const isCurrentSessionLoading = $loadingSessions.has(targetSessionId);

    if (isCurrentSessionLoading) {
      messageQueue.add({ sessionId: targetSessionId, text: inputText.trim(), attachments: [] });
      inputText = "";
      sessionDrafts.clearDraft(targetSessionId);
      return;
    }

    const currentInput = inputText;
    const currentAttachedFiles = get(attachedFiles);
    const currentReferences = get(textReferences);
    inputText = "";
    sessionDrafts.clearDraft(targetSessionId);
    attachedFiles.clear();
    textReferences.clear();

    const currentTodos = get(todos);
    if (currentTodos.length > 0 && currentTodos.every(t => t.status === "completed")) {
      todos.set([]);
    }

    const thanksPatterns = /\b(thanks|thank you|thx|ty|awesome|perfect|great job|well done|amazing|love it)\b/i;
    if (thanksPatterns.test(currentInput)) {
      showConfetti = true;
    }

    let messageContent = currentInput;

    // Add text references as markdown blockquotes
    if (currentReferences.length > 0) {
      const referenceBlocks = currentReferences.map(formatReference).join("\n\n");
      messageContent = `${referenceBlocks}\n\n${messageContent}`;
    }

    // Add file references
    if (currentAttachedFiles.length > 0) {
      const fileRefs = currentAttachedFiles.map(f => `[File: ${f.path}]`).join("\n");
      messageContent = `${fileRefs}\n\n${messageContent}`;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };
    sessionMessages.addMessage(targetSessionId, userMsg);

    // Trigger proactive hooks
    const projForHooks = currentProject ? { id: currentProject.id, name: currentProject.name, path: currentProject.path } : null;
    hookOnUserMessage(userMsg, get(sessionMessages).get(targetSessionId) || [], targetSessionId, projForHooks);

    loadingSessions.update(s => { s.add(targetSessionId); return new Set(s); });
    sessionStatus.setRunning(targetSessionId, $session.projectId!);

    const backend = sessionBackendStore.get(targetSessionId, get(sessionBackendStore)) || get(defaultBackend);

    // For non-Claude backends, build history context from messages
    let historyCtx = $sessionHistoryContext.get(targetSessionId);
    if (!historyCtx && backend !== "claude") {
      historyCtx = buildHistoryContextFromMessages(targetSessionId);
    }

    client.query({
      prompt: messageContent,
      projectId: $session.projectId || undefined,
      sessionId: targetSessionId,
      claudeSessionId: backend === "claude" ? ($session.claudeSessionId || undefined) : undefined,
      model: $session.selectedModel || undefined,
      historyContext: historyCtx,
      backend,
    });

    if ($sessionHistoryContext.get(targetSessionId)) {
      sessionHistoryContext.update(map => {
        map.delete(targetSessionId);
        return new Map(map);
      });
    }

    scrollToBottom();
  }

  // Send message to a specific session with explicit content (for worktree flow)
  async function sendMessageWithContent(targetSessionId: string, messageContent: string) {
    if (!messageContent.trim() || !$isConnected) return;
    if (!$session.projectId) return;

    sessionMessages.addMessage(targetSessionId, {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    });

    loadingSessions.update(s => { s.add(targetSessionId); return new Set(s); });
    sessionStatus.setRunning(targetSessionId, $session.projectId!);

    const backend = sessionBackendStore.get(targetSessionId, get(sessionBackendStore)) || get(defaultBackend);

    // Check sessionHistoryContext first (for forked sessions, rollback, etc.)
    // For non-Claude backends, fall back to building history from messages
    let historyCtx = $sessionHistoryContext.get(targetSessionId);
    if (!historyCtx && backend !== "claude") {
      historyCtx = buildHistoryContextFromMessages(targetSessionId);
    }

    client.query({
      prompt: messageContent,
      projectId: $session.projectId || undefined,
      sessionId: targetSessionId,
      claudeSessionId: backend === "claude" ? ($session.claudeSessionId || undefined) : undefined,
      model: $session.selectedModel || undefined,
      historyContext: historyCtx,
      backend,
    });

    // Clear history context after use (one-time injection)
    if ($sessionHistoryContext.get(targetSessionId)) {
      sessionHistoryContext.update(map => {
        map.delete(targetSessionId);
        return new Map(map);
      });
    }

    scrollToBottom();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleExecCommand(command: string) {
    if (!command.trim()) return;

    const projectId = currentProject?.id;
    if (!projectId) return;

    // Open the terminal panel
    showTerminal = true;
    rightPanelMode = "terminal";

    // Check if there's already an active terminal
    const workspace = get(projectWorkspaces).get(projectId);
    const hasActiveTerminal = workspace && workspace.terminalTabs.length > 0;

    if (hasActiveTerminal && terminalRef) {
      // Terminal already exists and is connected - run the command directly
      terminalRef.runCommand(command);
    } else if (hasActiveTerminal) {
      // Terminal exists but not connected yet - wait for it
      setTimeout(() => {
        if (terminalRef) {
          terminalRef.runCommand(command);
        }
      }, 500);
    } else {
      // No terminal tabs exist - create one with the initial command
      projectWorkspaces.addTerminalTab(projectId, {
        cwd: currentProject?.path || undefined,
        initialCommand: command,
      });
    }
  }

  // Handle UI-only slash commands (e.g., /help, /config, /status)
  function handleUICommand(command: string, args?: string): boolean {
    switch (command) {
      case "help":
        showCommandHelp = true;
        return true;

      case "config":
        // Open settings modal
        showSettings = true;
        return true;

      case "status":
        // Show status notification
        notifications.add({
          type: "info",
          title: "Status",
          message: `Connected: ${$isConnected ? 'Yes' : 'No'} | Model: ${$session.selectedModel || $session.model || 'Unknown'} | Session: ${$session.sessionId || 'None'}`,
        });
        return true;

      case "bug":
        // Open GitHub issues
        window.open("https://github.com/anthropics/claude-code/issues", "_blank");
        return true;

      default:
        return false;
    }
  }

  // Handle "Send to Claude" from Terminal Panel in Dock (auto-sends)
  function handleTerminalSendToClaude(context: string) {
    inputText = context;
    sendMessage();
  }

  // Handle "Ask Claude" from Preview Panel error state (auto-sends)
  function handlePreviewAskClaude(message: string) {
    inputText = message;
    sendMessage();
  }

  // Handle element inspection from browser preview
  function handleElementInspected(element: import("./lib/Preview.svelte").InspectedElement) {
    // Format element data for chat context
    const elementInfo = [
      `**Inspected Element from ${element.page.url}**`,
      "",
      "```html",
      element.outerHTML,
      "```",
      "",
      `**Selector:** \`${element.selector}\``,
      "",
      `**Tag:** ${element.tagName}`,
      element.attributes.class ? `**Classes:** ${element.attributes.class}` : "",
      element.attributes.id ? `**ID:** ${element.attributes.id}` : "",
      element.textContent ? `**Text:** "${element.textContent.slice(0, 100)}${element.textContent.length > 100 ? '...' : ''}"` : "",
    ].filter(Boolean).join("\n");

    // Pre-fill input with element context
    inputText = elementInfo + "\n\nHelp me with this element: ";
    inputRef?.focus();
  }

  // Handle "Send to Claude" from Bash tool results (pre-fills input for review)
  function handleBashSendToClaude(context: string) {
    inputText = context;
    // Focus the input - scroll to bottom first
    messagesContainer?.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: "smooth",
    });
  }

  async function handleTitleSuggestionApply(title: string) {
    if ($session.sessionId) {
      await api.sessions.update($session.sessionId, { title });
      const idx = sidebarSessions.findIndex(s => s.id === $session.sessionId);
      if (idx !== -1) sidebarSessions[idx].title = title;
    }
  }

  async function renameSession(sessionId: string, newTitle: string) {
    await api.sessions.update(sessionId, { title: newTitle });
    const idx = sidebarSessions.findIndex(s => s.id === sessionId);
    if (idx !== -1) sidebarSessions[idx].title = newTitle;
  }

  function openPreview(source: string, line?: number) {
    const isUrl = source.startsWith("http://") || source.startsWith("https://") || source.startsWith("localhost") || source.match(/^:\d+/);
    if (isUrl) {
      openBrowser(source);
    } else {
      // If line number is provided, append it as a fragment identifier
      const sourceWithLine = line ? `${source}#line${line}` : source;
      previewSource = sourceWithLine;
      showPreview = true;
      rightPanelMode = "preview";
    }
  }

  function openBrowser(url: string) {
    browserUrl = url.startsWith(":") ? `http://localhost${url}` : url.startsWith("localhost") ? `http://${url}` : url;
    showBrowser = true;
    rightPanelMode = "browser";
  }

  function closePreview() {
    showPreview = false;
    previewSource = "";
  }

  function handlePreviewInput() {
    const input = prompt("Enter URL or file path to preview:", previewSource || "http://localhost:");
    if (input) {
      openPreview(input);
    }
  }

  function toggleFileBrowser() {
    if (showFileBrowser && rightPanelMode === "files") {
      showFileBrowser = false;
    } else {
      showFileBrowser = true;
      rightPanelMode = "files";
    }
  }

  function handleFileSelect(path: string) {
    openPreview(path);
  }

  function closeRightPanel() {
    showFileBrowser = false;
    showPreview = false;
    showBrowser = false;
    showGitPanel = false;
    showTerminal = false;
    showKanban = false;
    showContext = false;
    showEmail = false;
    previewSource = "";
    terminalInitialCommand = "";
  }

  function toggleGitPanel() {
    if (showGitPanel && rightPanelMode === "git") {
      showGitPanel = false;
    } else {
      showGitPanel = true;
      rightPanelMode = "git";
    }
  }

  function toggleTerminal() {
    if (showTerminal && rightPanelMode === "terminal") {
      showTerminal = false;
    } else {
      showTerminal = true;
      rightPanelMode = "terminal";
    }
  }

  function toggleKanban() {
    if (showKanban && rightPanelMode === "kanban") {
      showKanban = false;
    } else {
      showKanban = true;
      rightPanelMode = "kanban";
    }
  }

  // Experimental agent functions
  async function toggleSelfHealing() {
    if (!currentProject) {
      showError({ message: "Select a project first" });
      return;
    }
    try {
      const res = await fetch(`${getServerUrl()}/api/experimental/healing/${currentProject.id}`);
      const data = await res.json();

      if (data.running) {
        await fetch(`${getServerUrl()}/api/experimental/healing/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProject.id })
        });
        showSuccess("Self-Healing Stopped");
      } else {
        await fetch(`${getServerUrl()}/api/experimental/healing/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProject.id })
        });
        showSuccess("Self-Healing Started", "Watching for build errors");
      }
    } catch (e: any) {
      showError({ message: e.message });
    }
  }

  async function spawnQuickAgent(agentType: string) {
    if (!$session.sessionId) {
      showError({ message: "Start a chat session first" });
      return;
    }

    const tasks: Record<string, string> = {
      "red-team": `Perform a security analysis of the current project at ${currentProject?.path || "."}. Look for vulnerabilities, injection risks, auth issues, and edge cases.`,
      "healer-agent": `Run type check and fix any TypeScript or build errors in the project at ${currentProject?.path || "."}`,
    };

    try {
      const res = await fetch(`${getServerUrl()}/api/experimental/agents/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: $session.sessionId,
          agentType,
          task: tasks[agentType] || "Analyze the codebase",
          context: {}
        })
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      showSuccess("Agent Spawned", `${agentType} is working on your task`);
    } catch (e: any) {
      showError({ message: e.message });
    }
  }

  /**
   * Handle extension toolbar clicks - toggles the corresponding panel
   */
  function handleExtensionClick(mode: string) {
    type PanelMode = "files" | "preview" | "browser" | "git" | "terminal" | "processes" | "kanban" | "preview-unified" | "context" | "email";
    const panelMode = mode as PanelMode;

    // Check if we're already showing this panel - if so, close it
    const isPanelOpen = showFileBrowser || showPreview || showBrowser || showGitPanel || showTerminal || showKanban || showContext || showEmail;
    if (isPanelOpen && rightPanelMode === panelMode) {
      closeRightPanel();
      return;
    }

    // Set the right panel mode and show flag based on extension
    switch (panelMode) {
      case "files":
      case "preview":
        showFileBrowser = true;
        break;
      case "browser":
        showBrowser = true;
        break;
      case "git":
        showGitPanel = true;
        break;
      case "terminal":
        showTerminal = true;
        break;
      case "kanban":
        showKanban = true;
        break;
      case "preview-unified":
        showPreview = true;
        break;
      case "context":
        showContext = true;
        break;
      case "email":
        showEmail = true;
        break;
    }
    rightPanelMode = panelMode;
  }

  function renderMarkdown(content: string): string {
    const html = marked.parse(content) as string;
    const projectPath = currentProject?.path;
    return linkifyChatReferences(
      linkifyUrls(
        linkifyFilenames(
          linkifyFileLineReferences(
            linkifyCodePaths(html, projectPath, projectFileIndex),
            projectPath,
            projectFileIndex
          ),
          projectFileIndex
        )
      ),
      chatLookup()
    );
  }

  function handleCodeRun(code: string, language: string) {
    // Code run handler
  }

  function handleMessageClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const link = target.closest('a.preview-link') as HTMLAnchorElement | null;

    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const url = link.dataset.url || link.href;
      if (url) {
        openPreview(url);
      }
      return;
    }

    // Handle chat reference clicks
    const chatRef = target.closest('.chat-reference') as HTMLElement | null;
    if (chatRef) {
      e.preventDefault();
      e.stopPropagation();
      const sessionId = chatRef.dataset.sessionId;
      if (sessionId) {
        // Find the session and navigate to it
        const targetSession = sidebarSessions.find(s => s.id === sessionId) ||
                              recentChats.find(s => s.id === sessionId);
        if (targetSession) {
          selectSession(targetSession);
        } else {
          // Session not in current list - try to fetch and navigate
          api.sessions.get(sessionId).then((session) => {
            if (session) {
              selectSession(session);
            }
          }).catch(err => {
            console.error("Failed to load referenced chat:", err);
          });
        }
      }
      return;
    }

    if (target.classList.contains("file-link")) {
      e.preventDefault();
      const path = target.dataset.path;
      if (path) {
        openPreview(path);
      }
    } else if (target.classList.contains("file-line-link")) {
      e.preventDefault();
      const path = target.dataset.path;
      const line = target.dataset.line;
      if (path && line) {
        openPreview(path, parseInt(line, 10));
      }
    }
  }

  function handleMessageContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const link = target.closest('a.external-link') as HTMLAnchorElement | null;
    
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const url = link.dataset.url || link.href;
      if (url) {
        linkContextMenu = { url, x: e.clientX, y: e.clientY };
      }
    }
  }

  function getLinkContextMenuItems() {
    if (!linkContextMenu) return [];
    return [
      {
        label: "Open in Preview",
        icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>',
        onclick: () => {
          if (linkContextMenu) openPreview(linkContextMenu.url);
        }
      },
      {
        label: "Open in Browser",
        icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>',
        onclick: () => {
          if (linkContextMenu) window.open(linkContextMenu.url, '_blank');
        }
      },
      {
        label: "Copy URL",
        icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>',
        onclick: () => {
          if (linkContextMenu) navigator.clipboard.writeText(linkContextMenu.url);
        }
      }
    ];
  }

  function showMessageMenu(e: MouseEvent, msgId: string) {
    e.preventDefault();
    e.stopPropagation();
    messageMenuId = msgId;
    messageMenuPos = { x: e.clientX, y: e.clientY };
  }

  function closeMessageMenu() {
    messageMenuId = null;
  }

  function getMessageText(msgId: string): string {
    const msg = currentMessages.find(m => m.id === msgId);
    return msg ? formatContent(msg.content) : "";
  }

  function editAsNewMessage(msgId: string) {
    const msg = currentMessages.find(m => m.id === msgId);
    if (msg && msg.role === "user") {
      inputText = formatContent(msg.content);
    }
    closeMessageMenu();
  }

  let editingMessageId = $state<string | null>(null);
  let editingMessageContent = $state("");

  async function reloadSessionMessages() {
    if (!$session.sessionId) return;
    try {
      const msgs = await api.messages.list($session.sessionId);
      const loadedMsgs: ChatMessage[] = msgs.map(m => {
        let content = m.content;
        if (typeof content === "string") {
          try { content = JSON.parse(content); } catch {}
        }
        return {
          id: m.id,
          role: m.role as any,
          content: content,
          timestamp: new Date(m.timestamp),
          parentToolUseId: m.parent_tool_use_id ?? undefined,
          isSynthetic: !!m.is_synthetic,
          isFinal: !!m.is_final,
        };
      });
      sessionMessages.setMessages($session.sessionId, loadedMsgs);
      return loadedMsgs;
    } catch (e) {
      console.error("Failed to reload messages:", e);
      return null;
    }
  }

  async function startEditMessage(msgId: string) {
    const msg = currentMessages.find(m => m.id === msgId);
    if (msg && msg.role === "user") {
      const reloaded = await reloadSessionMessages();
      if (reloaded) {
        const dbMsg = reloaded.find(m => formatContent(m.content) === formatContent(msg.content) && m.role === "user");
        if (dbMsg) {
          editingMessageId = dbMsg.id;
          editingMessageContent = formatContent(dbMsg.content);
        } else {
          alert("Message not found in database. It may not have been saved yet.");
        }
      }
    }
    closeMessageMenu();
  }

  async function saveEditedMessage(content?: string) {
    if (content !== undefined) {
      editingMessageContent = content;
    }
    if (!editingMessageId || !$session.sessionId) return;
    
    try {
      const result = await api.messages.update(editingMessageId, editingMessageContent);
      
      const updatedMsgs = currentMessages.map(m => 
        m.id === editingMessageId 
          ? { ...m, content: editingMessageContent }
          : m
      );
      sessionMessages.setMessages($session.sessionId, updatedMsgs);
      
      if (result.sessionReset) {
        session.setSession($session.sessionId, null);
      }
      
      if (result.historyContext) {
        sessionHistoryContext.update(map => {
          map.set($session.sessionId!, result.historyContext!);
          return new Map(map);
        });
      }
      
      editingMessageId = null;
      editingMessageContent = "";
    } catch (e: any) {
      console.error("Failed to update message:", e);
      if (e.message?.includes("not found")) {
        alert("Cannot edit this message - it hasn't been saved to the database yet. Try refreshing the session first.");
      } else {
        alert("Failed to update message: " + (e.message || "Unknown error"));
      }
    }
  }

  function cancelEditMessage() {
    editingMessageId = null;
    editingMessageContent = "";
  }

  async function rollbackToMessage(msgId: string) {
    if (!$session.sessionId) return;
    
    const reloaded = await reloadSessionMessages();
    if (!reloaded) {
      alert("Failed to sync messages. Please try again.");
      return;
    }
    
    const msg = currentMessages.find(m => m.id === msgId);
    if (!msg) return;
    
    const dbMsg = reloaded.find(m => formatContent(m.content) === formatContent(msg.content) && m.role === msg.role);
    if (!dbMsg) {
      alert("Message not found in database. It may not have been saved yet.");
      return;
    }
    
    const msgIndex = reloaded.findIndex(m => m.id === dbMsg.id);
    const messagesAfter = reloaded.slice(msgIndex + 1);
    
    if (messagesAfter.length === 0) {
      alert("No messages to rollback");
      return;
    }
    
    if (!confirm(`This will delete ${messagesAfter.length} message${messagesAfter.length > 1 ? 's' : ''} after this point and reset Claude's context. Continue?`)) {
      return;
    }
    
    try {
      const result = await api.messages.rollback($session.sessionId, dbMsg.id);
      
      if (result.success) {
        const loadedMsgs: ChatMessage[] = result.messages.map(m => ({
          id: m.id,
          role: m.role as any,
          content: m.content,
          timestamp: new Date(m.timestamp),
          isFinal: !!(m as any).is_final,
        }));
        sessionMessages.setMessages($session.sessionId!, loadedMsgs);
        
        if (result.sessionReset) {
          session.setSession($session.sessionId, null);
        }
        
        if (result.historyContext) {
          sessionHistoryContext.update(map => {
            map.set($session.sessionId!, result.historyContext!);
            return new Map(map);
          });
        }
      }
    } catch (e) {
      console.error("Failed to rollback:", e);
      alert("Failed to rollback conversation");
    }
    closeMessageMenu();
  }

  async function deleteMessage(msgId: string) {
    if (!$session.sessionId) return;

    try {
      // Find the message in current messages
      const msg = currentMessages.find(m => m.id === msgId);
      if (!msg) {
        console.error("[Delete] Message not found in local state:", msgId);
        return;
      }

      // Call the API to delete
      await api.messages.delete(msgId);

      // Remove the message from local state
      sessionMessages.update(map => {
        const msgs = map.get($session.sessionId!) || [];
        const filtered = msgs.filter(m => m.id !== msgId);
        map.set($session.sessionId!, filtered);
        return new Map(map);
      });
    } catch (e: any) {
      console.error("[Delete] Failed to delete message:", e);
      if (e.message?.includes("not found")) {
        // Message wasn't saved to DB yet, just remove from local state
        sessionMessages.update(map => {
          const msgs = map.get($session.sessionId!) || [];
          const filtered = msgs.filter(m => m.id !== msgId);
          map.set($session.sessionId!, filtered);
          return new Map(map);
        });
      } else {
        showError({ title: "Delete failed", message: e.message || "Could not delete message", error: e });
      }
    }
  }

  async function forkFromMessage(msgId: string) {
    if (!$session.sessionId) {
      return;
    }

    try {
      const forkedSession = await api.sessions.fork($session.sessionId, { fromMessageId: msgId });
      sidebarSessions = [forkedSession, ...sidebarSessions];
      selectSession(forkedSession);
    } catch (e) {
      console.error("[Fork] Failed to fork session:", e);
    }
    closeMessageMenu();
  }

  // Quote selected text from message - adds to input as blockquote
  function quoteTextInChat(text: string) {
    // Format as a markdown blockquote
    const quotedText = text
      .split("\n")
      .map(line => `> ${line}`)
      .join("\n");

    // Append to current input or set as new input
    if (inputText.trim()) {
      inputText = `${inputText}\n\n${quotedText}\n\n`;
    } else {
      inputText = `${quotedText}\n\n`;
    }

    // Clear any text selection
    window.getSelection()?.removeAllRanges();
  }

  // Fork session with quoted text pre-filled
  async function forkWithQuote(text: string) {
    if (!$session.sessionId) {
      return;
    }

    try {
      // Create a fork from the current point
      const forkedSession = await api.sessions.fork($session.sessionId);
      sidebarSessions = [forkedSession, ...sidebarSessions];
      await selectSession(forkedSession);

      // Pre-fill the input with the quoted text
      const quotedText = text
        .split("\n")
        .map(line => `> ${line}`)
        .join("\n");
      inputText = `${quotedText}\n\n`;

      // Clear any text selection
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      console.error("[ForkWithQuote] Failed to fork session:", e);
      showError({ title: "Fork Failed", message: "Could not fork the chat", error: e });
    }
  }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={() => { stopResizingRight(); stopResizingLeft(); }} onkeydown={handleGlobalKeydown} />

{#if showWelcome}
  <WelcomeScreen onComplete={() => {
    showWelcome = false;
    // Start the tour after welcome animation completes, not during
    if (startTourAfterWelcome) {
      startTourAfterWelcome = false;
      setTimeout(() => tour.start("main"), 300);
    }
  }} />
{/if}

<Confetti trigger={showConfetti} onComplete={() => showConfetti = false} />

<!-- Proactive Hooks Suggestions (skill scout, error detector, memory builder) -->
{#if $session.sessionId}
  <SuggestionPanel
    sessionId={$session.sessionId}
    getContext={() => buildHookContext(
      $session.sessionId!,
      $sessionMessages.get($session.sessionId!) || [],
      currentProject ? { id: currentProject.id, name: currentProject.name, path: currentProject.path } : null
    )}
  />
{/if}

{#if showOnboarding}
  <Onboarding onComplete={handleOnboardingComplete} />
{/if}

<TourOverlay tourSteps={TOUR_STEPS} />

{#if serverError}
<div class="flex h-screen bg-white dark:bg-gray-900 items-center justify-center">
  <div class="text-center p-8 max-w-md">
    <div class="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
      <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Server Connection Failed</h1>
    <p class="text-gray-600 dark:text-gray-400 mb-6">{serverError}</p>
    <button
      onclick={retryServerConnection}
      class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
    >
      Retry Connection
    </button>
  </div>
</div>
{:else}
<div class="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden selection:bg-blue-100 dark:selection:bg-blue-900 selection:text-blue-900 dark:selection:text-blue-100">

  <!-- Sidebar -->
  <Sidebar
    projects={sidebarProjects}
    sessions={sidebarSessions}
    {recentChats}
    {currentProject}
    {currentMessages}
    {sidebarCollapsed}
    {sidebarWidth}
    bind:modelSelection
    folders={workspaceFolders}
    onSelectProject={selectProject}
    onSelectSession={selectSession}
    onCreateNewChat={startNewChatAction}
    onGoToChat={goToChat}
    onNewProjectModal={() => { newProjectTargetFolderId = null; showNewProjectModal = true; }}
    onSettings={() => showSettings = true}
    onSearchModal={() => showSearchModal = true}
    onHotkeysHelp={() => showHotkeysHelp = true}
    onFeedback={() => showFeedbackModal = true}
    onProjectSettings={() => showProjectSettings = true}
    onEditProject={openEditProject}
    onDeleteProject={openDeleteConfirm}
    onToggleProjectPin={toggleProjectPin}
    onToggleProjectArchive={toggleProjectArchive}
    onProjectPermissions={(p) => showProjectPermissions = p}
    onEditSession={openEditSession}
    onRenameSession={renameSession}
    onDeleteSession={deleteSession}
    onDuplicateSession={duplicateSession}
    onStartNewChatWithSummary={handleStartNewChatWithSummary}
    onToggleSessionFavorite={toggleSessionFavorite}
    onToggleSessionArchive={toggleSessionArchive}
    onArchiveAllNonStarred={archiveAllNonStarred}
    onToggleSessionMarkedForReview={toggleSessionMarkedForReview}
    onToggleSessionBacklog={toggleSessionBacklog}
    onProjectReorder={(order) => {
      const orderMap = new Map(order.map((id, i) => [id, i]));
      const previousProjects = sidebarProjects;
      sidebarProjects = [...sidebarProjects].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      api.projects.reorder(order).catch(() => {
        sidebarProjects = previousProjects;
      });
    }}
    onSessionReorder={(order) => {
      if (currentProject) {
        const orderMap = new Map(order.map((id, i) => [id, i]));
        const previousSessions = sidebarSessions;
        sidebarSessions = [...sidebarSessions].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
        api.sessions.reorder(currentProject.id, order).catch(() => {
          sidebarSessions = previousSessions;
        });
      }
    }}
    onModelSelect={handleModelSelect}
    backend={$session.sessionId ? (sessionBackendStore.get($session.sessionId, $sessionBackendStore) || $defaultBackend) : $defaultBackend}
    onBackendChange={async (newBackend) => {
      if ($session.sessionId) {
        sessionBackendStore.set($session.sessionId, newBackend);
        // Persist to database
        try {
          await api.sessions.update($session.sessionId, { backend: newBackend });
        } catch (e) {
          console.error("Failed to persist backend:", e);
        }
      }
      defaultBackend.set(newBackend);
      // Auto-select the default model for the new backend
      const models = getBackendModelsFormatted(newBackend, get(backendModels));
      if (models.length > 0) {
        modelSelection = models[0].value;
        handleModelSelect(models[0].value);
      }
    }}
    onTitleApply={handleTitleSuggestionApply}
    onStartResizing={startResizingLeft}
    isResizing={isResizingLeft}
    onCollapseToggle={() => sidebarCollapsed = !sidebarCollapsed}
    onBackToWorkspaces={() => { session.setProject(null); session.setSession(null); sidebarSessions = []; }}
    onFolderCreate={createFolder}
    onFolderUpdate={updateFolder}
    onFolderDelete={deleteFolder}
    onFolderToggleCollapse={toggleFolderCollapse}
    onProjectSetFolder={setProjectFolder}
    onFolderReorder={reorderFolders}
    onToggleFolderPin={toggleFolderPin}
    onNewProjectInFolder={(folderId) => { newProjectTargetFolderId = folderId; showNewProjectModal = true; }}
    onOpenProjectInNewWindow={openProjectInNewWindow}
    onOpenSessionInNewWindow={openSessionInNewWindow}
    onOpenHomeInNewWindow={openHomeInNewWindow}
    onOpenSessionsBoard={(projectId) => { sessionsDashboardProjectId = projectId; showSessionsDashboard = true; }}
    onOpenAgentBuilder={() => showAgentBuilder = true}
    agents={sidebarAgents}
    onSelectAgent={(agent) => {
      openAgent(agent as AgentDefinition);
      showAgentBuilder = true;
    }}
    bind:titleSuggestionRef
  />



  <!-- Main Content Area -->
  <div class="flex-1 flex min-w-0 min-h-0 overflow-hidden">

  <!-- Chat Area -->
  <main class="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-gray-900 relative overflow-hidden">

    <!-- Navigation History (top-left) -->
    <div class="absolute top-3 left-3 z-20 bg-white/95 dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
      <NavHistoryButton onNavigate={handleNavHistoryNavigate} />
    </div>

    <!-- Toolbar Buttons -->
    {#if currentProject}
    <div class="absolute top-3 right-3 z-20 flex gap-1">
      {#if $advancedMode}
      <button
        onclick={() => showDebugInfo = true}
        class={`p-2 border rounded-lg shadow-sm transition-all group ${showDebugInfo ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
        title="Session Debug Info"
      >
        <svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
      </button>
      {/if}
      <ExtensionToolbar
        projectId={currentProject.id}
        currentMode={rightPanelMode}
        maxVisible={4}
        onExtensionClick={handleExtensionClick}
        onOpenSettings={() => showExtensionSettings = true}
      />
    </div>
    {/if}

    <!-- Extension Settings Modal -->
    {#if currentProject}
      <ExtensionSettingsModal
        open={showExtensionSettings}
        onClose={() => showExtensionSettings = false}
        projectId={currentProject.id}
      />
    {/if}

    {#if $channelsEnabled && $currentChannelId}
      <!-- Channel View -->
      <ChannelView
        onClose={() => currentChannelId.set(null)}
      />
    {:else if !currentProject}
      <WorkspaceHome
        projects={sidebarProjects}
        onSelectProject={selectProject}
        onTogglePin={toggleProjectPin}
        onNewProject={() => showNewProjectModal = true}
        {relativeTime}
      />
    {:else}

        <!-- Header (Mobile/Simplified) -->

        <header class="h-14 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 bg-white/95 dark:bg-gray-800/95 md:hidden z-10 sticky top-0">

            <button onclick={() => session.setProject(null)} class="text-gray-500 dark:text-gray-400">

                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7"></path></svg>

            </button>

            <span class="font-medium text-gray-900 dark:text-gray-100 text-sm">{currentProject.name}</span>

            <div class={`w-2 h-2 rounded-full ${$isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>

        </header>



        <!-- Merge Conflict Resolution Banner -->
        {#if isResolvingMergeConflicts && mergeConflictInfo}
          <div class="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center w-8 h-8 bg-amber-100 rounded-full">
                <svg class="w-5 h-5 text-amber-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-amber-800">Resolving Merge Conflicts</p>
                <p class="text-xs text-amber-600">
                  Claude is resolving {mergeConflictInfo.fileCount} conflicting file{mergeConflictInfo.fileCount > 1 ? 's' : ''}
                  to merge <code class="bg-amber-100 px-1 rounded">{mergeConflictInfo.branch.replace('session/', '')}</code>
                  into <code class="bg-amber-100 px-1 rounded">{mergeConflictInfo.baseBranch}</code>
                </p>
              </div>
            </div>
            <button
              class="text-xs px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-md transition-colors flex items-center gap-1"
              onclick={async () => {
                if (mergeConflictInfo?.snapshotId && confirm('Abort merge and restore repository to previous state?')) {
                  try {
                    await worktreeApi.restoreSnapshot(mergeConflictInfo.snapshotId);
                    isResolvingMergeConflicts = false;
                    mergeConflictInfo = null;
                    showSuccess('Merge Aborted', 'Repository restored to pre-merge state');
                  } catch (e: any) {
                    showError({ title: 'Abort Failed', message: e.message, error: e });
                  }
                }
              }}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Abort
            </button>
          </div>
        {/if}

        <!-- Messages -->

        <div class="flex-1 overflow-y-auto p-4 md:p-0 scroll-smooth" bind:this={messagesContainer} onscroll={handleMessagesScroll}>
          {#if currentMessages.length === 0 && !$session.sessionId}
            {#if $session.isPending}
              <!-- New chat - show simple empty state -->
              <ProjectEmptyState
                projectName={currentProject.name}
                projectDescription={currentProject?.description}
                {claudeMdContent}
                {projectContext}
                onSuggestionClick={(suggestion) => { inputText = suggestion; }}
                onShowClaudeMd={() => showClaudeMdModal = true}
              />
            {:else}
              <!-- Project selected, no session - show dashboard -->
              <ProjectLanding
                projectPath={currentProject?.path || ''}
                projectName={currentProject.name}
                projectDescription={currentProject?.description}
                {claudeMdContent}
                {projectContext}
                onSuggestionClick={(suggestion) => { inputText = suggestion; }}
                onShowClaudeMd={() => showClaudeMdModal = true}
              />
            {/if}
          {:else}
            <!-- Cloud Execution Status -->
            {#if currentCloudExecution}
              <div class="px-4 max-w-4xl mx-auto">
                <CloudExecutionStatus
                  executionId={currentCloudExecution.executionId}
                  stage={currentCloudExecution.stage}
                  stageMessage={currentCloudExecution.stageMessage}
                  repoUrl={currentCloudExecution.repoUrl}
                  branch={currentCloudExecution.branch}
                  outputLines={currentCloudExecution.outputLines}
                  duration={currentCloudExecution.duration}
                  estimatedCostUsd={currentCloudExecution.estimatedCostUsd}
                  success={currentCloudExecution.success}
                  error={currentCloudExecution.error}
                  onCancel={() => stopGeneration()}
                />
              </div>
            {/if}

            <!-- Subagent sticky header - stays visible when scrolling in child agent sessions -->
            {#if currentSessionHierarchy()?.hasParent && $session.sessionId}
              <div class="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                <div class="max-w-3xl mx-auto w-full px-4 py-2">
                  <SessionBreadcrumbs
                    sessionId={$session.sessionId}
                    onSelectSession={(sess) => {
                      if (sess.id && sess.id !== $session.sessionId) {
                        selectSession(sess as Session);
                      }
                    }}
                  />
                </div>

                <!-- Escalation banner - show when this child session is blocked -->
                {#if currentSessionHierarchy()?.isBlocked && currentSessionHierarchy()?.escalation}
                  <div class="max-w-3xl mx-auto w-full px-4 py-2">
                    <EscalationBanner
                      sessionId={$session.sessionId}
                      escalation={currentSessionHierarchy()?.escalation ?? null}
                      sessionTitle={currentSessionData?.title || ''}
                      sessionRole={currentSessionHierarchy()?.role || undefined}
                      onResolved={async () => {
                        if ($session.projectId) {
                          const sessionsList = await api.sessions.list($session.projectId, $showArchivedWorkspaces);
                          sidebarSessions = sessionsList;
                        }
                      }}
                    />
                  </div>
                {/if}
              </div>
            {/if}

            <ChatView
              sessionId={$session.sessionId}
              projectPath={currentProject?.path || ''}
              activeSubagents={activeSubagents}
              pendingPermissionRequest={pendingPermissionRequest}
              pendingQuestion={pendingQuestion}
              editingMessageId={editingMessageId}
              bind:editingMessageContent={editingMessageContent}
              renderMarkdown={renderMarkdown}
              jsonBlocksMap={jsonBlocksMap}
              shellBlocksMap={shellBlocksMap}
              onEditMessage={startEditMessage}
              onSaveEdit={saveEditedMessage}
              onCancelEdit={cancelEditMessage}
              onRollback={rollbackToMessage}
              onFork={forkFromMessage}
              onDelete={deleteMessage}
              onPreview={openPreview}
              onRunInTerminal={handleExecCommand}
              onSendToClaude={handleBashSendToClaude}
              onMessageClick={handleMessageClick}
              onQuoteText={quoteTextInChat}
              onForkWithQuote={forkWithQuote}
              onPermissionApprove={handlePermissionApprove}
              onPermissionDeny={handlePermissionDeny}
              onQuestionAnswer={handleQuestionAnswer}
              emptyState="continue"
              onOpenProcesses={() => { showTerminal = true; rightPanelMode = 'processes'; }}
              onSuggestionClick={(prompt) => { inputText = prompt; }}
              {projectContext}
              projectDescription={currentProject?.description}
              isGitRepo={currentProjectIsGitRepo}
              worktreeBranch={currentSessionData?.worktree_branch}
              worktreeBaseBranch={currentSessionData?.worktree_base_branch}
              sessionTitle={currentSessionData?.title || ''}
              sessionHierarchy={currentSessionHierarchy()}
              onSelectHierarchySession={(sess) => {
                // Switch to the selected session (use selectSession to properly load messages)
                if (sess.id && sess.id !== $session.sessionId) {
                  selectSession(sess as Session);
                }
              }}
              onEscalationResolved={async () => {
                // Refresh session data
                if ($session.projectId) {
                  const sessionsList = await api.sessions.list($session.projectId, $showArchivedWorkspaces);
                  sidebarSessions = sessionsList;
                }
              }}
              onMergeComplete={async () => {
                // Refresh sessions list after merge
                if ($session.projectId) {
                  const sessionsList = await api.sessions.list($session.projectId, $showArchivedWorkspaces);
                  sidebarSessions = sessionsList;
                }
              }}
            />
          {/if}

        </div>

        <!-- Scroll to Bottom Button -->
        <div
          class="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ease-out {!userIsNearBottom && currentMessages.length > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}"
        >
          <button
            onclick={jumpToBottom}
            class="relative p-2 bg-white border border-gray-200 rounded-full shadow-lg hover:bg-gray-50 transition-all hover:shadow-xl hover:scale-105 group"
            title={newMessagesWhileAway > 0 ? `${newMessagesWhileAway} new update${newMessagesWhileAway > 1 ? 's' : ''} below` : 'Scroll to bottom'}
          >
            <svg class="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
            </svg>
            {#if newMessagesWhileAway > 0}
              <span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-medium text-white bg-blue-500 rounded-full shadow-sm animate-pulse">
                {newMessagesWhileAway > 99 ? '99+' : newMessagesWhileAway}
              </span>
            {/if}
          </button>
        </div>

        <!-- Input Area -->
        <div class="absolute bottom-0 left-0 right-0 p-6 pointer-events-none flex justify-center bg-gradient-to-t from-white via-white to-transparent dark:from-gray-900 dark:via-gray-900" data-tour="chat-input">

            <div class="w-full max-w-3xl pointer-events-auto relative">
                <!-- Process Manager - positioned top right above input -->
                <div class="absolute -top-2 right-0 transform -translate-y-full z-10">
                    <ProcessManager sessionId={$session.sessionId} />
                </div>

                <!-- Queued Messages Panel -->
                {#if $session.sessionId && currentSessionLoading}
                    <QueuedMessagesPanel sessionId={$session.sessionId} />
                {/if}

                <!-- Context Warning - attached to top of input -->
                {#if $session.sessionId && (usagePercent >= 80 || hasPrunedContext($session.sessionId) || hasRollbackContext($session.sessionId) || $compactingSessionsStore.has($session.sessionId))}
                <div class="mb-0">
                    <ContextWarning
                        {usagePercent}
                        inputTokens={$session.inputTokens}
                        contextWindow={currentProject?.context_window || 200000}
                        isPruned={hasPrunedContext($session.sessionId)}
                        isRollback={hasRollbackContext($session.sessionId)}
                        isCompacting={$compactingSessionsStore.has($session.sessionId)}
                        onPruneToolResults={() => pruneToolResults($session.sessionId || '')}
                        onSDKCompact={() => sendCommand("/compact")}
                        onStartNewChat={() => startNewChatWithSummary($session.sessionId || '', {
                            createNewChat: createNewChatAction,
                            setInputText: (text) => { inputText = text; }
                        })}
                    />
                </div>
                {/if}

                <ChatInput
                    bind:value={inputText}
                    disabled={!$isConnected}
                    loading={currentSessionLoading || false}
                    {queuedCount}
                    projectPath={currentProject?.path}
                    activeSkills={activeSkills.map(s => ({ name: s.name, path: s.slug }))}
                    {mcpServers}
                    sessionId={$session.sessionId || undefined}
                    {untilDoneEnabled}
                    isGitRepo={currentProjectIsGitRepo}
                    isNewChat={$session.isPending || !$session.sessionId || currentMessages.length === 0}
                    worktreeBranch={currentSessionData?.worktree_branch}
                    worktreeBaseBranch={currentSessionData?.worktree_base_branch}
                    {executionMode}
                    {cloudBranch}
                    {cloudBranches}
                    onSubmit={sendMessage}
                    onStop={stopGeneration}
                    onPreview={openPreview}
                    onExecCommand={handleExecCommand}
                    onManageSkills={() => { projectSettingsInitialTab = "skills"; showProjectSettings = true; }}
                    onManageMcp={() => { settingsInitialTab = "mcp"; showSettings = true; }}
                    onToggleUntilDone={toggleUntilDone}
                    onOpenInfiniteLoop={() => openInfiniteLoopConfig(inputText)}
                    {isInfiniteLoopMode}
                    onExecutionModeChange={handleExecutionModeChange}
                    onCloudBranchChange={handleCloudBranchChange}
                    onCreateWithWorktree={async (description, message) => {
                      const newSessionId = await createNewChatWithWorktree(description);
                      if (newSessionId && message.trim()) {
                        // Refresh sessions and send the first message
                        const sessionsList = await api.sessions.list($session.projectId!, $showArchivedWorkspaces);
                        sidebarSessions = sessionsList;
                        // Send the message directly - don't rely on inputText which may have been cleared
                        sendMessageWithContent(newSessionId, message);
                      }
                    }}
                    onMergeWorktree={() => showMergeModal = true}
                    onUICommand={handleUICommand}
                    slashCommands={customCommands.map(c => ({
                      name: c.name,
                      description: c.description,
                      argsHint: c.argsHint,
                      isBuiltIn: false,
                    }))}
                    backend={$session.sessionId ? (sessionBackendStore.get($session.sessionId, $sessionBackendStore) || $defaultBackend) : $defaultBackend}
                    onBackendChange={(newBackend) => {
                      // Only allow backend change for new chats
                      if ($session.isPending || !$session.sessionId || currentMessages.length === 0) {
                        defaultBackend.set(newBackend);
                        // Auto-select the default model for the new backend
                        const models = getBackendModelsFormatted(newBackend, get(backendModels));
                        if (models.length > 0) {
                          modelSelection = models[0].value;
                          handleModelSelect(models[0].value);
                        }
                      }
                    }}
                />

                <div class="text-center mt-2">
                    <span class="text-[10px] text-gray-400">navi can make mistakes. Please verify important information.</span>
                </div>
            </div>

        </div>

    {/if}

  </main>

  <!-- Right Panel (File Browser / Preview / Browser / Git / Terminal / Context / Email) -->
  {#if showFileBrowser || showPreview || showBrowser || showGitPanel || showTerminal || showKanban || showContext || showEmail}
    <RightPanel
      mode={rightPanelMode}
      width={rightPanelWidth}
      projectId={currentProject?.id || null}
      sessionId={$session.sessionId || null}
      projectPath={currentProject?.path || null}
      worktreePath={currentSessionData?.worktree_path}
      worktreeBranch={currentSessionData?.worktree_branch}
      {previewSource}
      {containerPreviewUrl}
      {browserUrl}
      isResizing={isResizingRight}
      {terminalInitialCommand}
      onModeChange={(mode) => {
        rightPanelMode = mode;
        if (mode === "files") showFileBrowser = true;
        else if (mode === "preview") showPreview = true;
        else if (mode === "browser") showBrowser = true;
        else if (mode === "git") showGitPanel = true;
        else if (mode === "terminal") showTerminal = true;
        else if (mode === "kanban") showKanban = true;
        else if (mode === "preview-unified") showPreview = true;
        else if (mode === "context") showContext = true;
      }}
      onClose={closeRightPanel}
      onStartResize={startResizingRight}
      onFileSelect={handleFileSelect}
      onBrowserUrlChange={(url) => browserUrl = url}
      onTerminalRef={(ref) => terminalRef = ref}
      onTerminalSendToClaude={handleTerminalSendToClaude}
      onPreviewAskClaude={handlePreviewAskClaude}
      onElementInspected={handleElementInspected}
      onNavigateToSession={(sessionId, prompt, autoSend) => {
        // Navigate to the session
        session.setSession($session.projectId!, sessionId);
        // Close the right panel to focus on the chat
        closeRightPanel();
        // If there's a prompt, set it and optionally auto-send
        if (prompt) {
          if (autoSend) {
            // Use message queue to ensure message is sent even if WS isn't ready yet
            messageQueue.add({ sessionId, text: prompt, attachments: [] });
          } else {
            inputText = prompt;
          }
        }
      }}
    />
  {/if}

  </div>

  <NewProjectModal
    open={showNewProjectModal}
    {defaultProjectsDir}
    onClose={() => { showNewProjectModal = false; newProjectTargetFolderId = null; projectCreationMode = "quick"; }}
    onCreate={createProject}
    onPickDirectory={pickDirectory}
    onCreateAgent={async (name, description) => {
      const agent = await createAgent(name, description, "agent");
      if (agent) {
        showNewProjectModal = false;
        projectCreationMode = "quick";
        openAgent(agent);
        showAgentBuilder = true;
      }
    }}
    onCreateFromTemplate={async (templateId, name) => {
      await createProjectFromTemplate(templateId, name);
    }}
    {projectCreationMode}
    {newProjectQuickName}
    {newProjectPath}
    {newProjectName}
    onModeChange={(mode) => projectCreationMode = mode}
    onQuickNameChange={(name) => newProjectQuickName = name}
    onPathChange={(path) => newProjectPath = path}
    onNameChange={(name) => newProjectName = name}
  />

  <Modal open={!!editingProject} onClose={() => editingProject = null} title="Edit Workspace">
    {#snippet children()}
      <div class="space-y-5">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-gray-700">Workspace Name</label>
          <input 
            type="text" 
            bind:value={editProjectName}
            class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-gray-700">Workspace Path</label>
          <div class="flex gap-2">
            <input 
              type="text" 
              bind:value={editProjectPath}
              class="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors font-mono"
            />
            <button onclick={pickDirectoryForEdit} class="bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 rounded-lg border border-gray-300 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path></svg>
            </button>
          </div>
        </div>
              </div>
    {/snippet}
    {#snippet footer()}
      <button onclick={() => editingProject = null} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
      <button onclick={updateProject} class="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-black text-white rounded-lg shadow-sm transition-all active:scale-95">Save Changes</button>
    {/snippet}
  </Modal>

  <Modal open={showDeleteConfirm} onClose={() => { showDeleteConfirm = false; projectToDelete = null; }} title="Delete Workspace">
    {#snippet children()}
      <p class="text-sm text-gray-600">
        Are you sure you want to delete <span class="font-semibold text-gray-900">{projectToDelete?.name}</span>? This will also delete all associated chats and messages. This action cannot be undone.
      </p>
    {/snippet}
    {#snippet footer()}
      <button onclick={() => { showDeleteConfirm = false; projectToDelete = null; }} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
      <button onclick={deleteProject} class="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition-all active:scale-95">Delete Workspace</button>
    {/snippet}
  </Modal>

  <Modal open={!!editingSession} onClose={() => editingSession = null} title="Edit Chat Name">
    {#snippet children()}
      <div class="space-y-1.5">
        <label class="text-xs font-medium text-gray-700">Chat Name</label>
        <input 
          type="text" 
          bind:value={editSessionTitle}
          onkeydown={(e) => e.key === 'Enter' && updateSession()}
          class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors"
        />
      </div>
    {/snippet}
    {#snippet footer()}
      <button onclick={() => editingSession = null} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
      <button onclick={updateSession} class="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-black text-white rounded-lg shadow-sm transition-all active:scale-95">Save</button>
    {/snippet}
  </Modal>

  <Settings open={showSettings} onClose={() => { showSettings = false; settingsInitialTab = undefined; loadMcpServers(); }} initialTab={settingsInitialTab} />

  {#if showAgentBuilder}
    <div class="fixed inset-0 z-50 bg-white">
      <AgentBuilder onClose={() => showAgentBuilder = false} />
    </div>
  {/if}

  {#if showSessionsDashboard}
    <div class="fixed inset-0 z-50 bg-white dark:bg-gray-900">
      <SessionsBoard
        projectId={sessionsDashboardProjectId}
        projectName={sessionsDashboardProjectId ? sidebarProjects.find(p => p.id === sessionsDashboardProjectId)?.name : undefined}
        onClose={() => { showSessionsDashboard = false; sessionsDashboardProjectId = undefined; }}
        onSessionSelect={(boardSession) => {
          showSessionsDashboard = false;
          sessionsDashboardProjectId = undefined;
          goToSessionById(boardSession.projectId, boardSession.id);
        }}
      />
    </div>
  {/if}
  <FeedbackModal
    open={showFeedbackModal}
    onClose={() => {
      showFeedbackModal = false;
      currentErrorReport = null;
    }}
    initialReport={currentErrorReport}
  />

  {#if showProjectSettings && currentProject}
    <ProjectSettings project={currentProject} onClose={() => { showProjectSettings = false; projectSettingsInitialTab = undefined; }} initialTab={projectSettingsInitialTab} />
  {/if}

  <!-- Worktree Merge Modal -->
  {#if currentSessionData?.worktree_branch && $session.sessionId}
    <MergeModal
      open={showMergeModal}
      sessionId={$session.sessionId}
      sessionTitle={currentSessionData.title || ''}
      branch={currentSessionData.worktree_branch}
      baseBranch={currentSessionData.worktree_base_branch || 'main'}
      worktreePath={currentSessionData.worktree_path || undefined}
      onClose={() => showMergeModal = false}
      onMergeComplete={async ({ keepChatting }) => {
        showMergeModal = false;
        if ($session.projectId && $session.sessionId) {
          if (keepChatting) {
            // Clear worktree data, keep the session active on main
            await api.sessions.clearWorktree($session.sessionId);
            // Refresh sessions list (currentSessionData is $derived and will auto-update)
            const sessionsList = await api.sessions.list($session.projectId, $showArchivedWorkspaces);
            sidebarSessions = sessionsList;
          } else {
            // Archive the session and clear it
            await api.sessions.setArchived($session.sessionId, true);
            const sessionsList = await api.sessions.list($session.projectId, $showArchivedWorkspaces);
            sidebarSessions = sessionsList;
            if (!$showArchivedWorkspaces) {
              session.setSession(null);
            }
          }
        }
      }}
      onConflictResolution={(conflictContext, prompt) => {
        // Set merge conflict state for UI indicator
        isResolvingMergeConflicts = true;
        mergeConflictInfo = {
          branch: conflictContext.worktreeBranch,
          baseBranch: conflictContext.baseBranch,
          fileCount: conflictContext.conflictingFiles.length,
          snapshotId: conflictContext.snapshotId,
        };
        // Send the conflict resolution prompt to Claude
        sendCommand(prompt);
      }}
    />
  {/if}

  <!-- Command Help Modal -->
  <CommandHelpModal
    open={showCommandHelp}
    onClose={() => showCommandHelp = false}
    commands={customCommands.map(c => ({
      name: c.name,
      description: c.description,
      argsHint: c.argsHint,
      isBuiltIn: false,
    }))}
    onExecuteCommand={(cmd) => {
      showCommandHelp = false;
      // Send the command to the input or execute directly
      if (["compact", "clear"].includes(cmd)) {
        sendCommand(`/${cmd}`);
      } else {
        handleUICommand(cmd);
      }
    }}
  />

  <SearchModal 
    bind:isOpen={showSearchModal} 
    projectId={$session.projectId}
    onNavigate={async (sessionId: string, projectId: string) => {
      session.setProject(projectId);
      try {
        const sessionsList = await api.sessions.list(projectId);
        sidebarSessions = sessionsList;
      } catch (e) {
        console.error("Failed to load sessions:", e);
      }
      const targetSession = sidebarSessions.find(s => s.id === sessionId);
      if (targetSession) {
        selectSession(targetSession);
      }
    }}
    onNavigateProject={async (projectId: string) => {
      session.setProject(projectId);
      session.setSession(null);
      try {
        const sessionsList = await api.sessions.list(projectId);
        sidebarSessions = sessionsList;
      } catch (e) {
        console.error("Failed to load sessions:", e);
      }
    }}
  />

  <QuickSessionsPanel
    open={showQuickSessions}
    onClose={() => showQuickSessions = false}
    onSelectSession={goToChat}
  />

  <ContextOverflowModal
    open={showContextOverflowModal}
    onClose={() => showContextOverflowModal = false}
    onPrune={() => pruneToolResults($session.sessionId || '')}
    onCompact={() => sendCommand("/compact")}
    onNewChat={() => {
      startNewChatAction();
      showContextOverflowModal = false;
    }}
  />

  <!-- Infinite Loop Configuration Modal -->
  {#if $session.sessionId && $session.projectId}
    <InfiniteLoopConfig
      open={showInfiniteLoopConfig}
      sessionId={$session.sessionId}
      projectId={$session.projectId}
      prompt={infiniteLoopPendingPrompt}
      onClose={() => {
        showInfiniteLoopConfig = false;
        infiniteLoopPendingPrompt = "";
      }}
      onStart={handleInfiniteLoopStarted}
    />
  {/if}

  {#if showHotkeysHelp}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30" onclick={() => showHotkeysHelp = false} role="dialog" aria-modal="true" tabindex="-1">
      <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onclick={(e) => e.stopPropagation()}>
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-gray-100 rounded-lg">
              <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
              </svg>
            </div>
            <h3 class="font-semibold text-base text-gray-900">Keyboard Shortcuts</h3>
          </div>
          <button onclick={() => showHotkeysHelp = false} class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {#each HOTKEYS as hotkey}
            <div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors {hotkey.category === 'experimental' ? 'bg-amber-50' : ''}">
              <span class="text-sm text-gray-600">{hotkey.action}</span>
              <kbd class="px-2 py-1 text-xs font-mono bg-gray-100 border border-gray-200 rounded text-gray-700">{hotkey.key}</kbd>
            </div>
          {/each}
        </div>
        <div class="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p class="text-xs text-gray-500 text-center">Press <kbd class="px-1.5 py-0.5 font-mono bg-gray-200 rounded text-gray-600">?</kbd> anytime to toggle this help</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Experimental Agents Panel -->
  {#if showExperimentalAgents}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30" onclick={() => showExperimentalAgents = false} role="dialog" aria-modal="true" tabindex="-1">
      <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" onclick={(e) => e.stopPropagation()}>
        <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="p-1.5 bg-amber-100 rounded-lg">
              <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 class="font-semibold text-sm text-gray-900">Experimental Agents</h3>
            <span class="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Beta</span>
          </div>
          <button onclick={() => showExperimentalAgents = false} class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ExperimentalAgentsPanel />
        {#if currentProject}
          <div class="px-4 pb-4 border-t border-gray-100 pt-3">
            <SelfHealingWidget />
          </div>
        {/if}
      </div>
    </div>
  {/if}


  <!-- CLAUDE.md Modal -->
  {#if showClaudeMdModal}
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30"
      onclick={() => showClaudeMdModal = false}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div 
        class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-gray-100 rounded-lg">
              <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-sm text-gray-900">CLAUDE.md</h3>
              <p class="text-xs text-gray-500">Project instructions for Claude</p>
            </div>
          </div>
          <button onclick={() => showClaudeMdModal = false} class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          <pre class="text-sm text-gray-700 font-mono whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-200">{claudeMdContent}</pre>
        </div>
      </div>
    </div>
  {/if}

  <SessionDebug 
    open={showDebugInfo} 
    onClose={() => showDebugInfo = false} 
    sessionId={$session.sessionId} 
    claudeMdContent={claudeMdContent}
    projectPath={currentProject?.path || null}
  />

  <ProjectPermissionsModal
    project={showProjectPermissions}
    {globalPermissionSettings}
    onClose={() => showProjectPermissions = null}
    onToggleAutoAccept={async (proj, newValue) => {
      await api.projects.setAutoAcceptAll(proj.id, newValue);
      showProjectPermissions = { ...proj, auto_accept_all: newValue ? 1 : 0 };
      const idx = sidebarProjects.findIndex(p => p.id === proj.id);
      if (idx >= 0) {
        sidebarProjects[idx] = { ...sidebarProjects[idx], auto_accept_all: newValue ? 1 : 0 };
      }
    }}
    onOpenSettings={() => { showProjectPermissions = null; showSettings = true; }}
  />

</div>
{/if}

{#if linkContextMenu}
  <ContextMenu
    x={linkContextMenu.x}
    y={linkContextMenu.y}
    items={getLinkContextMenuItems()}
    onclose={() => linkContextMenu = null}
  />
{/if}

<NotificationToast />
<UpdateChecker />
<ConnectivityBanner />

<!-- Resource Monitor (floating button + modal) -->
{#if $resourceMonitorEnabled}
  <ResourceMonitor />
{/if}

<style>

  :global(body) {

    background: #ffffff;

  }

  

  :global(.markdown-body) {

    font-size: 15px;

    line-height: 1.6;

    color: #1f2937;

  }

  :global(.markdown-body pre) {

    background-color: #f9fafb !important;

    border: 1px solid #e5e7eb;

    border-radius: 0.5rem;

    padding: 1rem;

    margin: 1rem 0;

    overflow-x: auto;

  }

  :global(.markdown-body code) {

    background-color: #f3f4f6;

    color: #111827;

    padding: 0.2em 0.4em;

    border-radius: 0.3em;

    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

    font-size: 85%;

  }

  :global(.markdown-body p) {

    margin-bottom: 0.75em;

  }

  :global(.markdown-body ul, .markdown-body ol) {
    margin-left: 1.5em;
    margin-bottom: 0.75em;
  }

  :global(.markdown-body a) {
    color: #2563eb;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color 0.15s;
  }

  :global(.markdown-body a:hover) {
    color: #1d4ed8;
  }

  :global(.markdown-body a .external-arrow) {
    font-size: 0.75em;
    opacity: 0.6;
    margin-left: 0.15em;
  }

  :global(.markdown-body .source-link) {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
  }

  :global(.markdown-body .source-favicon) {
    width: 16px;
    height: 16px;
    vertical-align: middle;
    flex-shrink: 0;
    border-radius: 2px;
  }

  :global(.markdown-body h1, .markdown-body h2, .markdown-body h3) {
    font-weight: 600;
    margin-top: 1.25em;
    margin-bottom: 0.5em;
    color: #111827;
  }

  :global(.markdown-body h1) {
    font-size: 1.5em;
  }

  :global(.markdown-body h2) {
    font-size: 1.25em;
  }

  :global(.markdown-body h3) {
    font-size: 1.1em;
  }

  :global(.markdown-body strong) {
    font-weight: 600;
    color: #111827;
  }

  :global(.markdown-body blockquote) {
    border-left: 3px solid #e5e7eb;
    padding-left: 1em;
    margin-left: 0;
    color: #6b7280;
    font-style: italic;
  }

  :global(.markdown-body hr) {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 1.5em 0;
  }

  :global(.file-link) {
    color: #059669;
    cursor: pointer;
    background-color: #ecfdf5;
    padding: 0.15em 0.4em;
    border-radius: 0.25em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    transition: all 0.15s;
    border: 1px solid transparent;
  }

  :global(.file-link:hover) {
    background-color: #d1fae5;
    border-color: #a7f3d0;
    color: #047857;
  }

  :global(.file-link::before) {
    content: "📄 ";
    font-size: 0.85em;
  }

  :global(.file-line-link) {
    color: #7c3aed;
    cursor: pointer;
    background-color: #f3f4f6;
    padding: 0.15em 0.4em;
    border-radius: 0.25em;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.9em;
    transition: all 0.15s;
    border: 1px solid transparent;
  }

  :global(.file-line-link:hover) {
    background-color: #ede9fe;
    border-color: #c4b5fd;
    color: #5b21b6;
  }

  :global(.file-line-link::before) {
    content: "📍 ";
    font-size: 0.85em;
  }

  :global(.preview-link) {
    color: #2563eb;
    cursor: pointer;
    background-color: #eff6ff;
    padding: 0.15em 0.4em;
    border-radius: 0.25em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    transition: all 0.15s;
    border: 1px solid transparent;
    text-decoration: none;
  }

  :global(.preview-link:hover) {
    background-color: #dbeafe;
    border-color: #bfdbfe;
    color: #1d4ed8;
  }

  :global(.preview-link::before) {
    content: "🌐 ";
    font-size: 0.85em;
  }

  :global(.preview-link::after) {
    content: none !important;
  }

</style>
