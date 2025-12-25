<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { ClaudeClient, type ClaudeMessage, type ContentBlock, type TextBlock, type ToolUseBlock, type ToolProgressMessage, type StreamEventMessage, type StreamEvent } from "./lib/claude";
  import { sessionMessages, sessionDrafts, currentSession as session, isConnected, projects, availableModels, onboardingComplete, messageQueue, loadingSessions, advancedMode, debugMode, todos, sessionTodos, sessionHistoryContext, notifications, pendingPermissionRequests, unreadNotificationCount, sessionStatus, projectStatus, tour, attachedFiles, sessionDebugInfo, costStore, showArchivedWorkspaces, sessionEvents, streamingState, assistantTurns, type ChatMessage, type TourStep, type AttachedFile, type CostViewMode, type SDKEvent, type SDKEventType, type AssistantStep, type StepType } from "./lib/stores";
  import ModelSelector from "./lib/components/ModelSelector.svelte";
  import { api, skillsApi, costsApi, type Project, type Session, type Skill } from "./lib/api";
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

  renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = lang || '';
    const shellLanguages = ['bash', 'sh', 'shell', 'zsh', 'console', 'terminal'];
    
    // Use terminal style for shell/bash output
    if (shellLanguages.includes(language.toLowerCase())) {
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<div class="terminal-block"><div class="terminal-header"><span class="terminal-dot red"></span><span class="terminal-dot yellow"></span><span class="terminal-dot green"></span><span class="terminal-title">${language}</span></div><pre class="terminal-content">${escapedText}</pre></div>`;
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
  
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  
  import FileBrowser from "./lib/FileBrowser.svelte";
  import Modal from "./lib/components/Modal.svelte";
  import AudioRecorder from "./lib/components/AudioRecorder.svelte";
  import InteractiveCodeBlock from "./lib/components/InteractiveCodeBlock.svelte";
  import Onboarding from "./lib/components/Onboarding.svelte";
  import Settings from "./lib/components/Settings.svelte";
  import ProjectSettings from "./lib/components/ProjectSettings.svelte";
  import ToolConfirmDialog from "./lib/components/ToolConfirmDialog.svelte";
  import SearchModal from "./lib/components/SearchModal.svelte";
  import NotificationToast from "./lib/components/NotificationToast.svelte";
  import NotificationBadge from "./lib/components/NotificationBadge.svelte";
  import PermissionEditor from "./lib/components/PermissionEditor.svelte";
  import Confetti from "./lib/components/Confetti.svelte";
  import CopyButton from "./lib/components/CopyButton.svelte";
  import WelcomeScreen from "./lib/components/WelcomeScreenLogo.svelte";
  import TourOverlay from "./lib/components/TourOverlay.svelte";
  import ChatView from "./lib/components/ChatView.svelte";
  import ChatInput from "./lib/components/ChatInput.svelte";
  import { useMessageHandler } from "./lib/handlers";
  import SessionDebug from "./lib/components/SessionDebug.svelte";
  import ContextMenu from "./lib/components/ContextMenu.svelte";
  import TitleSuggestion from "./lib/components/TitleSuggestion.svelte";
  import WorkspaceCard from "./lib/components/WorkspaceCard.svelte";
  import StarButton from "./lib/components/StarButton.svelte";
  import Sidebar from "./lib/components/sidebar/Sidebar.svelte";
  import type { PermissionRequestMessage } from "./lib/claude";
  import type { PermissionSettings, WorkspaceFolder } from "./lib/api";

  function relativeTime(timestamp: number | null | undefined): string {
    if (!timestamp) return "Never";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

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
  let workspaceFolders = $state<WorkspaceFolder[]>([]);
  let showNewProjectModal = $state(false);
  let newProjectName = $state("");
  let newProjectPath = $state("");
  let newProjectQuickName = $state("");
  let defaultProjectsDir = $state("");
  let projectCreationMode = $state<"quick" | "browse">("quick");
  let editingProject = $state<Project | null>(null);
  let editProjectName = $state("");
  let editProjectPath = $state("");
  let showDeleteConfirm = $state(false);
  let projectToDelete = $state<Project | null>(null);
  let editingSession = $state<Session | null>(null);
  let editSessionTitle = $state("");
  let messagesContainer: HTMLElement;
  let modelSelection = $state("");
  let lastSessionModel = $state("");
  let showSettings = $state(false);
  let showProjectSettings = $state(false);
  let showDebugInfo = $state(false);
  let sidebarCollapsed = $state(false);
  let messageMenuId: string | null = $state(null);
  let messageMenuPos = $state({ x: 0, y: 0 });
  let linkContextMenu = $state<{ url: string; x: number; y: number } | null>(null);

  let draggedProjectId = $state<string | null>(null);
  let dragOverProjectId = $state<string | null>(null);
  let draggedSessionId = $state<string | null>(null);
  let dragOverSessionId = $state<string | null>(null);
  let sessionMenuId = $state<string | null>(null);
  let sessionMenuPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });
  let projectMenuId = $state<string | null>(null);
  let showProjectPermissions = $state<Project | null>(null);
  let globalPermissionSettings = $state<PermissionSettings | null>(null);
  let permissionDefaults = $state<{ tools: string[]; dangerous: string[] }>({ tools: [], dangerous: [] });

  let currentTurnId = $state<Map<string, string>>(new Map());
  let currentStepId = $state<Map<string, string>>(new Map());
  let streamingStepText = $state<Map<string, string>>(new Map());
  
  const messageHandler = useMessageHandler({
    getCurrentSessionId: () => $session.sessionId,
    getProjectId: () => $session.projectId,
    onCostUpdate: (sessionId, costUsd) => {
      if (sessionId === $session.sessionId) {
        session.setCost($session.costUsd + costUsd);
      }
      costStore.addSessionCost(sessionId, costUsd);
      loadCosts();
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
            selectProject($projects.find(p => p.id === navProjectId) || null);
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
      }
    },
    scrollToBottom,
    onClaudeSessionInit: (claudeSessionId, model) => {
      session.setClaudeSession(claudeSessionId);
      session.setModel(model);
    },
  });

  let showPreview = $state(false);
  let previewSource = $state("");
  let showFileBrowser = $state(false);
  let showBrowser = $state(false);
  let browserUrl = $state("http://localhost:3000");
  let rightPanelMode = $state<"preview" | "files" | "browser">("preview");
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
  let inputRef: HTMLTextAreaElement | null = $state(null);
  let showSearchModal = $state(false);

  let showConfetti = $state(false);
  let showWelcome = $state(false);
  let titleSuggestionRef: TitleSuggestion | null = $state(null);

  const TOUR_STEPS: Record<string, TourStep[]> = {
    main: [
      {
        id: "workspaces",
        target: "[data-tour='workspaces']",
        title: "Your Workspaces",
        content: "Create and manage project workspaces here. Each workspace is linked to a folder on your machine.",
        position: "right"
      },
      {
        id: "new-workspace",
        target: "[data-tour='new-workspace']",
        title: "Create a Workspace",
        content: "Click here to add a new project folder. You can point to an existing project or create a new one.",
        position: "bottom"
      },
      {
        id: "settings",
        target: "[data-tour='settings']",
        title: "Settings & Search",
        content: "Access settings here. Use ⌘K to quickly search chats and navigate anywhere in the app.",
        position: "top"
      }
    ],
    project: [
      {
        id: "pin-project",
        target: "[data-tour='project-menu']",
        title: "Pin Your Favorites",
        content: "Use this menu to pin projects to the top, rename them, or manage permissions.",
        position: "right"
      },
      {
        id: "chat-input",
        target: "[data-tour='chat-input']",
        title: "Start a Conversation",
        content: "Type your message here to chat with Claude. Ask questions, request code changes, or run terminal commands.",
        position: "top"
      }
    ],
    chat: [
      {
        id: "message-menu",
        target: "[data-tour='message-menu']",
        title: "Message Actions",
        content: "Edit your messages, rollback the conversation, or fork from any point to explore different approaches.",
        position: "left"
      }
    ]
  };

  const HOTKEYS = [
    { key: "Cmd/Ctrl + K", action: "Open search" },
    { key: "Cmd/Ctrl + P", action: "Toggle preview panel" },
    { key: "Cmd/Ctrl + B", action: "Toggle file browser" },
    { key: "M", action: "Toggle mic recording" },
    { key: "Cmd/Ctrl + /", action: "Focus input" },
    { key: "Cmd/Ctrl + ,", action: "Open settings" },
    { key: "Escape", action: "Close panels" },
    { key: "?", action: "Show hotkeys help" },
  ];

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
      if (showHotkeysHelp) {
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
    } else if (e.key === 'p') {
      e.preventDefault();
      showPreview = !showPreview;
      if (showPreview) rightPanelMode = 'preview';
    } else if (e.key === 'b') {
      e.preventDefault();
      toggleFileBrowser();
    } else if (e.key === '/') {
      e.preventDefault();
      inputRef?.focus();
    } else if (e.key === ',') {
      e.preventDefault();
      showSettings = true;
    }
  }

  let pendingPermissionRequest = $state<{ requestId: string; tools: string[]; toolInput?: Record<string, unknown>; message: string } | null>(null);

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

  let currentProject = $derived(sidebarProjects.find(p => p.id === $session.projectId));
  let currentSessionLoading = $derived($session.sessionId && $loadingSessions.has($session.sessionId));
  let queuedCount = $derived($session.sessionId ? $messageQueue.filter(m => m.startsWith($session.sessionId + ':')).length : 0);
  let showOnboarding = $derived(!$onboardingComplete);
  let activeSkills = $state<Skill[]>([]);

  $effect(() => {
    if ($session.selectedModel !== lastSessionModel) {
      lastSessionModel = $session.selectedModel;
      modelSelection = $session.selectedModel;
    }
  });

  function handleOnboardingComplete() {
    showWelcome = true;
    onboardingComplete.complete();
    if (!$tour.completedTours.includes("main")) {
      setTimeout(() => tour.start("main"), 300);
    }
  }

  onMount(async () => {
    if ($onboardingComplete) {
      showWelcome = true;
    }
    
    loadProjects();
    loadRecentChats();
    loadFolders();
    loadConfig();
    loadModels();
    loadPermissions();
    loadCosts();

    client = new ClaudeClient();
    try {
      await client.connect();
      isConnected.set(true);
    } catch (e) {
      console.error("Failed to connect:", e);
    }
    loadActiveSessions();
    activeSessionsPoll = setInterval(loadActiveSessions, 5000);

    client.onMessage((msg) => {
      messageHandler.handleMessage(msg);
    });

    const handleGlobalClick = () => {
      sessionMenuId = null;
      projectMenuId = null;
      messageMenuId = null;
    };
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  });


  onDestroy(() => {
    client?.disconnect();
    if (activeSessionsPoll) {
      clearInterval(activeSessionsPoll);
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

  async function loadProjects() {
    try {
      sidebarProjects = await api.projects.list($showArchivedWorkspaces);
      projects.set(sidebarProjects);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  async function loadFolders() {
    try {
      workspaceFolders = await api.folders.list();
    } catch (e) {
      console.error("Failed to load folders:", e);
    }
  }

  async function createFolder(name: string): Promise<WorkspaceFolder> {
    const folder = await api.folders.create(name);
    workspaceFolders = [...workspaceFolders, folder];
    return folder;
  }

  async function updateFolder(id: string, name: string) {
    await api.folders.update(id, name);
    workspaceFolders = workspaceFolders.map(f => f.id === id ? { ...f, name } : f);
  }

  async function deleteFolder(id: string) {
    await api.folders.delete(id);
    workspaceFolders = workspaceFolders.filter(f => f.id !== id);
    sidebarProjects = sidebarProjects.map(p => p.folder_id === id ? { ...p, folder_id: null } : p);
  }

  async function toggleFolderCollapse(id: string, collapsed: boolean) {
    await api.folders.toggleCollapse(id, collapsed);
    workspaceFolders = workspaceFolders.map(f => f.id === id ? { ...f, collapsed: collapsed ? 1 : 0 } : f);
  }

  async function setProjectFolder(projectId: string, folderId: string | null) {
    await api.projects.setFolder(projectId, folderId);
    sidebarProjects = sidebarProjects.map(p => p.id === projectId ? { ...p, folder_id: folderId } : p);
  }

  async function reorderFolders(order: string[]) {
    await api.folders.reorder(order);
    const orderMap = new Map(order.map((id, i) => [id, i]));
    workspaceFolders = [...workspaceFolders].sort((a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0));
  }

  async function toggleFolderPin(folder: WorkspaceFolder, e: Event) {
    e.stopPropagation();
    const newPinned = !folder.pinned;
    try {
      await api.folders.togglePin(folder.id, newPinned);
      workspaceFolders = workspaceFolders.map(f =>
        f.id === folder.id ? { ...f, pinned: newPinned ? 1 : 0 } : f
      ).sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
    } catch (e) {
      console.error("Failed to toggle folder pin:", e);
    }
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

  async function toggleProjectArchive(proj: Project, e: MouseEvent) {
    e.stopPropagation();
    const newArchived = !proj.archived;
    try {
      await api.projects.setArchived(proj.id, newArchived);
      if (!$showArchivedWorkspaces && newArchived) {
        sidebarProjects = sidebarProjects.filter(p => p.id !== proj.id);
        recentChats = recentChats.filter(c => c.project_id !== proj.id);
      } else {
        sidebarProjects = sidebarProjects.map(p => 
          p.id === proj.id ? { ...p, archived: newArchived ? 1 : 0 } : p
        );
        if (!newArchived) {
          loadRecentChats();
        }
      }
      projects.set(sidebarProjects);
    } catch (e) {
      console.error("Failed to toggle archive:", e);
    }
  }

  async function loadRecentChats() {
    try {
      recentChats = await api.sessions.listRecent(10, $showArchivedWorkspaces);
    } catch (e) {
      console.error("Failed to load recent chats:", e);
    }
  }

  async function loadActiveSessions() {
    try {
      const active = await api.sessions.active();
      const nextActive = new Map(active.map((item) => [item.sessionId, item.projectId]));

      for (const item of active) {
        if (item.status === "permission") {
          sessionStatus.setPermissionRequired(item.sessionId, item.projectId);
        } else {
          sessionStatus.setRunning(item.sessionId, item.projectId);
        }
      }

      for (const [sessionId, projectId] of lastActiveSessions.entries()) {
        if (!nextActive.has(sessionId)) {
          if (sessionId === $session.sessionId) {
            sessionStatus.setIdle(sessionId, projectId);
          } else {
            sessionStatus.setUnread(sessionId, projectId);
          }
        }
      }

      lastActiveSessions = nextActive;
    } catch (e) {
      console.error("Failed to load active sessions:", e);
    }
  }
  
  $effect(() => {
    const _ = $showArchivedWorkspaces;
    loadRecentChats();
  });

  async function loadConfig() {
    try {
      const config = await api.config.get();
      defaultProjectsDir = config.defaultProjectsDir;
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }

  async function loadModels() {
    try {
      const models = await api.models.list();
      availableModels.set(models);
      if (models.length > 0 && !$session.selectedModel) {
        session.setSelectedModel(models[0].value);
      }
    } catch (e) {
      console.error("Failed to load models:", e);
    }
  }

  async function loadPermissions() {
    try {
      const perms = await api.permissions.get();
      globalPermissionSettings = perms.global;
      permissionDefaults = perms.defaults;
    } catch (e) {
      console.error("Failed to load permissions:", e);
    }
  }

  async function loadCosts() {
    try {
      const costs = await costsApi.getTotal();
      costStore.setTotals(costs.totalEver, costs.totalToday);
    } catch (e) {
      console.error("Failed to load costs:", e);
    }
  }

  async function loadProjectCost(projectId: string) {
    try {
      const costs = await costsApi.getProjectCost(projectId);
      costStore.setProjectCost(projectId, costs.totalEver, costs.totalToday);
    } catch (e) {
      console.error("Failed to load project cost:", e);
    }
  }

  function handleModelSelect(model: string) {
    modelSelection = model;
    session.setSelectedModel(model);
  }

  async function selectProject(project: Project) {
    const prevSessionId = $session.sessionId;
    if (prevSessionId && inputText.trim()) {
      sessionDrafts.setDraft(prevSessionId, inputText);
    }
    inputText = "";
    
    session.setProject(project.id);
    session.setSession(null);
    sidebarSessions = [];
    projectFileIndex = new Map();
    projectContext = null;
    projectContextError = null;
    claudeMdContent = null;
    
    try {
      const sessionsList = await api.sessions.list(project.id, $showArchivedWorkspaces);
      sidebarSessions = sessionsList;
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }

    api.claudeMd.initProject(project.path).catch(e => {
      console.error("Failed to init CLAUDE.md:", e);
    });
    
    indexProjectFiles(project.path);
    loadProjectContext(project);
    loadClaudeMd(project.path);
    loadProjectCost(project.id);
    
    if (!$tour.completedTours.includes("project")) {
      setTimeout(() => tour.start("project"), 500);
    }
  }

  async function loadClaudeMd(projectPath: string) {
    try {
      const res = await fetch(`http://localhost:3001/api/fs/read?path=${encodeURIComponent(projectPath + "/CLAUDE.md")}`);
      const data = await res.json();
      if (!data.error && data.content) {
        claudeMdContent = data.content;
      } else {
        claudeMdContent = null;
      }
    } catch (e) {
      claudeMdContent = null;
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
  
  async function loadProjectContext(project: Project) {
    const cached = project.summary || project.description;
    const cacheAge = project.summary_updated_at ? Date.now() - project.summary_updated_at : Infinity;
    const maxAge = 24 * 60 * 60 * 1000; // 1 day cache
    
    if (cached && cacheAge < maxAge) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.summary) {
          projectContext = parsed;
          return;
        }
      } catch {}
    }
    
    projectContext = null;
    projectContextError = null;
    
    // Get recent chat titles for context
    const recentChatTitles = sidebarSessions
      .slice(0, 5)
      .map(s => s.title)
      .filter(t => t && t !== "New Chat")
      .join(", ");
    
    const chatContext = recentChatTitles 
      ? `\n\nRecent conversations in this project: ${recentChatTitles}` 
      : "";
    
    api.ephemeral.chat({
      prompt: `Analyze this project directory and provide:
1. A brief summary (2-3 sentences) of what this project is about and its main technologies
2. 3-4 suggested next steps or tasks the user might want to do based on the project state${chatContext}

Respond in this exact JSON format only, no other text:
{"summary": "...", "suggestions": ["...", "...", "..."]}`,
      projectPath: project.path,
      useTools: true,
      maxTokens: 500,
    }).then(async response => {
      try {
        if (!response.result) {
          projectContext = { summary: "New project ready for development.", suggestions: ["Create a package.json or project configuration", "Add source code files", "Set up version control with git"] };
          return;
        }
        const jsonMatch = response.result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          projectContext = parsed;
          // Save to DB for caching
          try {
            await api.projects.update(project.id, { 
              summary: JSON.stringify(parsed),
              summary_updated_at: Date.now()
            });
          } catch {}
        } else {
          projectContext = { summary: response.result.slice(0, 500), suggestions: [] };
        }
      } catch {
        projectContext = { summary: response.result?.slice(0, 500) || "Project loaded.", suggestions: [] };
      }
    }).catch(e => {
      console.error("Project context error:", e);
      projectContext = { summary: "Project ready.", suggestions: ["Start coding", "Add dependencies", "Create project structure"] };
    });
  }

  async function indexProjectFiles(rootPath: string, currentPath: string = rootPath) {
    try {
      const res = await fetch(`http://localhost:3001/api/fs/list?path=${encodeURIComponent(currentPath)}`);
      const data = await res.json();
      if (data.entries) {
        for (const entry of data.entries) {
          if (entry.type === "file") {
            const relativePath = entry.path.replace(rootPath + "/", "");
            const fileName = entry.name;
            projectFileIndex.set(fileName, entry.path);
            projectFileIndex.set(relativePath, entry.path);
            projectFileIndex.set("./" + relativePath, entry.path);
          } else if (entry.type === "directory" && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "target" && entry.name !== "dist" && entry.name !== "build" && entry.name !== ".git") {
            indexProjectFiles(rootPath, entry.path);
          }
        }
      }
    } catch (e) {
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
        await loadProjects();
        selectProject(newProject);
        showNewProjectModal = false;
        newProjectQuickName = "";
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
        await loadProjects();
        selectProject(newProject);
        showNewProjectModal = false;
        newProjectName = "";
        newProjectPath = "";
      } catch (e: any) {
        console.error("Failed to create project:", e);
        alert(`Failed to create project: ${e.message}`);
      }
    }
  }

  async function pickDirectory() {
    if (isTauri) {
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
    if (isTauri) {
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

  async function createNewChat(): Promise<string | null> {
    if (!$session.projectId) return null;
    
    try {
      const newSession = await api.sessions.create($session.projectId, { title: "New Chat" });
      sidebarSessions = [newSession, ...sidebarSessions];
      session.setSession(newSession.id, newSession.claude_session_id);
      sessionMessages.setMessages(newSession.id, []);
      loadRecentChats();
      return newSession.id;
    } catch (e) {
      console.error("Failed to create session:", e);
      return null;
    }
  }

  async function selectSession(s: Session) {
    const prevSessionId = $session.sessionId;
    if (prevSessionId && inputText.trim()) {
      sessionDrafts.setDraft(prevSessionId, inputText);
    }
    
    inputText = $sessionDrafts.get(s.id) || "";
    
    session.setSession(s.id, s.claude_session_id);
    session.setCost(s.total_cost_usd || 0);
    session.setUsage(s.input_tokens || 0, s.output_tokens || 0);
    sessionStatus.markSeen(s.id);
    
    try {
      const freshSession = await api.sessions.get(s.id);
      if (freshSession) {
        session.setUsage(freshSession.input_tokens || 0, freshSession.output_tokens || 0);
        session.setCost(freshSession.total_cost_usd || 0);
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

    scrollToBottom(true);
  }

  async function deleteSession(e: Event, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;

    try {
      await api.sessions.delete(id);
      sidebarSessions = sidebarSessions.filter(s => s.id !== id);
      loadRecentChats();
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
      const forked = await api.sessions.fork(sess.id, { title: `${sess.title} (copy)` });
      sidebarSessions = [forked, ...sidebarSessions];
      loadRecentChats();
      selectSession(forked);
    } catch (err) {
      console.error("Failed to duplicate session:", err);
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
      loadRecentChats();
    } catch (err) {
      console.error("Failed to toggle session archive:", err);
    }
  }

  function handleProjectDragStart(e: DragEvent, proj: Project) {
    draggedProjectId = proj.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", proj.id);
    }
  }

  function handleProjectDragOver(e: DragEvent, projId: string) {
    e.preventDefault();
    if (draggedProjectId && draggedProjectId !== projId) {
      dragOverProjectId = projId;
    }
  }

  function handleProjectDragLeave() {
    dragOverProjectId = null;
  }

  async function handleProjectDrop(e: DragEvent, targetProj: Project) {
    e.preventDefault();
    if (!draggedProjectId || draggedProjectId === targetProj.id) {
      draggedProjectId = null;
      dragOverProjectId = null;
      return;
    }
    
    const draggedIndex = sidebarProjects.findIndex(p => p.id === draggedProjectId);
    const targetIndex = sidebarProjects.findIndex(p => p.id === targetProj.id);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      draggedProjectId = null;
      dragOverProjectId = null;
      return;
    }

    const newProjects = [...sidebarProjects];
    const [removed] = newProjects.splice(draggedIndex, 1);
    newProjects.splice(targetIndex, 0, removed);
    sidebarProjects = newProjects;

    const order = newProjects.map(p => p.id);
    try {
      await api.projects.reorder(order);
    } catch (e) {
      console.error("Failed to reorder projects:", e);
    }

    draggedProjectId = null;
    dragOverProjectId = null;
  }

  function handleProjectDragEnd() {
    draggedProjectId = null;
    dragOverProjectId = null;
  }

  function handleSessionDragStart(e: DragEvent, sess: Session) {
    draggedSessionId = sess.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", sess.id);
    }
  }

  function handleSessionDragOver(e: DragEvent, sessId: string) {
    e.preventDefault();
    if (draggedSessionId && draggedSessionId !== sessId) {
      dragOverSessionId = sessId;
    }
  }

  function handleSessionDragLeave() {
    dragOverSessionId = null;
  }

  async function handleSessionDrop(e: DragEvent, targetSess: Session) {
    e.preventDefault();
    if (!draggedSessionId || draggedSessionId === targetSess.id || !currentProject) {
      draggedSessionId = null;
      dragOverSessionId = null;
      return;
    }
    
    const draggedIndex = sidebarSessions.findIndex(s => s.id === draggedSessionId);
    const targetIndex = sidebarSessions.findIndex(s => s.id === targetSess.id);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      draggedSessionId = null;
      dragOverSessionId = null;
      return;
    }

    const newSessions = [...sidebarSessions];
    const [removed] = newSessions.splice(draggedIndex, 1);
    newSessions.splice(targetIndex, 0, removed);
    sidebarSessions = newSessions;

    const order = newSessions.map(s => s.id);
    try {
      await api.sessions.reorder(currentProject.id, order);
    } catch (e) {
      console.error("Failed to reorder sessions:", e);
    }

    draggedSessionId = null;
    dragOverSessionId = null;
  }

  function handleSessionDragEnd() {
    draggedSessionId = null;
    dragOverSessionId = null;
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

  function getEventType(msg: ClaudeMessage): SDKEventType {
    switch (msg.type) {
      case "system":
        const subtype = (msg as any).subtype;
        if (subtype === "init") return "system_init";
        if (subtype === "status") return "system_status";
        if (subtype === "compact_boundary") return "system_compact";
        if (subtype === "hook_response") return "system_hook";
        return "system_init";
      case "assistant": return "assistant";
      case "user": return "user";
      case "result": return "result";
      case "error": return "error";
      case "tool_progress": return "tool_progress";
      case "permission_request": return "permission_request";
      case "stream_event": return "assistant_streaming";
      case "auth_status": return "auth_status";
      default: return "unknown";
    }
  }

  function logEvent(sessionId: string, msg: ClaudeMessage) {
    const event: SDKEvent = {
      id: (msg as any).uuid || crypto.randomUUID(),
      type: getEventType(msg),
      timestamp: (msg as any).timestamp || Date.now(),
      sessionId,
      parentToolUseId: (msg as any).parentToolUseId || null,
      data: msg,
    };
    sessionEvents.addEvent(sessionId, event);
  }

  function handleStreamEvent(sessionId: string, msg: StreamEventMessage) {
    const event = msg.event;
    if (!event) return;

    let turnId = currentTurnId.get(sessionId);

    switch (event.type) {
      case "message_start":
        turnId = crypto.randomUUID();
        currentTurnId.set(sessionId, turnId);
        currentTurnId = new Map(currentTurnId);
        assistantTurns.startTurn(sessionId, turnId);
        streamingState.startStreaming(sessionId);
        break;

      case "content_block_start":
        if (event.content_block && turnId) {
          const block = event.content_block;
          let stepType: StepType = "text";
          if (block.type === "thinking") stepType = "thinking";
          else if (block.type === "tool_use") stepType = "tool_use";
          else if (block.type === "tool_result") stepType = "tool_result";
          
          const stepId = crypto.randomUUID();
          currentStepId.set(sessionId, stepId);
          currentStepId = new Map(currentStepId);
          streamingStepText.set(sessionId, "");
          streamingStepText = new Map(streamingStepText);
          
          const step: AssistantStep = {
            id: stepId,
            type: stepType,
            content: block,
            isStreaming: true,
            streamingText: "",
            timestamp: Date.now(),
          };
          assistantTurns.addStep(sessionId, turnId, step);
          streamingState.setContentBlock(sessionId, event.index || 0, block);
        }
        break;

      case "content_block_delta":
        if (event.delta && turnId) {
          const stepId = currentStepId.get(sessionId);
          if (stepId) {
            let currentText = streamingStepText.get(sessionId) || "";
            
            if (event.delta.text) {
              currentText += event.delta.text;
              streamingStepText.set(sessionId, currentText);
              streamingStepText = new Map(streamingStepText);
              assistantTurns.updateStep(sessionId, turnId, stepId, { 
                streamingText: currentText,
                content: { type: "text", text: currentText } as ContentBlock,
              });
              streamingState.appendText(sessionId, event.delta.text);
            }
            if (event.delta.thinking) {
              currentText += event.delta.thinking;
              streamingStepText.set(sessionId, currentText);
              streamingStepText = new Map(streamingStepText);
              assistantTurns.updateStep(sessionId, turnId, stepId, { 
                streamingText: currentText,
                content: { type: "thinking", thinking: currentText } as ContentBlock,
              });
              streamingState.appendThinking(sessionId, event.delta.thinking);
            }
            if (event.delta.partial_json) {
              currentText += event.delta.partial_json;
              streamingStepText.set(sessionId, currentText);
              streamingStepText = new Map(streamingStepText);
              const state = $streamingState.get(sessionId);
              if (state?.toolUseInProgress) {
                streamingState.setToolUseInProgress(sessionId, {
                  ...state.toolUseInProgress,
                  partialJson: state.toolUseInProgress.partialJson + event.delta.partial_json,
                });
              }
            }
          }
        }
        break;

      case "content_block_stop":
        if (turnId) {
          const stepId = currentStepId.get(sessionId);
          if (stepId) {
            assistantTurns.finishStep(sessionId, turnId, stepId);
          }
        }
        break;

      case "message_delta":
      case "message_stop":
        if (turnId) {
          assistantTurns.completeTurn(sessionId, turnId);
        }
        streamingState.stopStreaming(sessionId);
        currentStepId.delete(sessionId);
        currentStepId = new Map(currentStepId);
        break;
    }
  }

  function handleMessage(msg: ClaudeMessage) {
    const uiSessionId = (msg as any).uiSessionId;
    const claudeSessionId = (msg as any).claudeSessionId;
    
    if (uiSessionId) {
      logEvent(uiSessionId, msg);
    }
    
    if (msg.type === "result") {
      console.log("[SDK Result]", { 
        uiSessionId, 
        currentSessionId: $session.sessionId,
        match: uiSessionId === $session.sessionId,
        usage: (msg as any).usage,
        costUsd: (msg as any).costUsd 
      });
    }
    
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init" && uiSessionId && uiSessionId === $session.sessionId) {
          session.setClaudeSession(claudeSessionId);
          if ((msg as any).model) session.setModel((msg as any).model);
          sessionDebugInfo.setForSession(uiSessionId, {
            cwd: (msg as any).cwd || "",
            model: (msg as any).model || "",
            tools: (msg as any).tools || [],
            skills: (msg as any).skills || [],
            timestamp: new Date(),
          });
        }
        break;

      case "tool_progress":
        if (uiSessionId && uiSessionId === $session.sessionId) {
          const progressMsg = msg as ToolProgressMessage;
          if (progressMsg.parentToolUseId) {
            activeSubagents = new Map(activeSubagents.set(progressMsg.parentToolUseId, { elapsed: progressMsg.elapsedTimeSeconds }));
          }
        }
        break;

      case "assistant":
        if (!uiSessionId) break;
        const parentId = (msg as any).parentToolUseId;
        const existingMsgs = $sessionMessages.get(uiSessionId) || [];
        
        let lastUserIdx = -1;
        for (let i = existingMsgs.length - 1; i >= 0; i--) {
          if (existingMsgs[i].role === "user" && !existingMsgs[i].parentToolUseId) {
            lastUserIdx = i;
            break;
          }
        }
        
        let matchingMsg = null;
        for (let i = existingMsgs.length - 1; i >= 0; i--) {
          const m = existingMsgs[i];
          if (m.role === "assistant" && m.parentToolUseId === parentId) {
            if (parentId || i > lastUserIdx) {
              matchingMsg = m;
            }
            break;
          }
        }
        
        if (matchingMsg) {
          sessionMessages.updateLastAssistant(uiSessionId, (msg as any).content, parentId);
        } else {
          sessionMessages.addMessage(uiSessionId, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: (msg as any).content,
            timestamp: new Date(),
            parentToolUseId: parentId,
          });
        }
        const msgContent = (msg as any).content;
        if (Array.isArray(msgContent) && uiSessionId) {
          const todoTool = msgContent.find(
            (b: any): b is ToolUseBlock => b.type === "tool_use" && b.name === "TodoWrite"
          );
          if (todoTool?.input?.todos) {
            sessionTodos.setForSession(uiSessionId, todoTool.input.todos);
          }
        }
        const usage = (msg as any).usage;
        if (!parentId && usage && uiSessionId === $session.sessionId) {
          const totalInputTokens = (usage.input_tokens || 0) + 
            (usage.cache_creation_input_tokens || 0) + 
            (usage.cache_read_input_tokens || 0);
          session.setUsage(totalInputTokens, usage.output_tokens || 0);
        }
        if (uiSessionId === $session.sessionId) {
          scrollToBottom();
        }
        break;

      case "result":
        const resultCost = (msg as any).costUsd || 0;
        const numTurns = (msg as any).numTurns ?? 1;
        if (uiSessionId && uiSessionId === $session.sessionId) {
          session.setCost($session.costUsd + resultCost);
          if (numTurns <= 1 && (msg as any).usage) {
            const usage = (msg as any).usage;
            const totalInputTokens = (usage.input_tokens || 0) + 
              (usage.cache_creation_input_tokens || 0) + 
              (usage.cache_read_input_tokens || 0);
            session.setUsage(totalInputTokens, usage.output_tokens || 0);
          }
        }
        if (uiSessionId && resultCost > 0) {
          costStore.addSessionCost(uiSessionId, resultCost);
          loadCosts();
          if ($session.projectId) {
            loadProjectCost($session.projectId);
          }
        }
        if (uiSessionId) {
          loadingSessions.update(s => { s.delete(uiSessionId); return new Set(s); });
          if ($session.projectId) {
            if (uiSessionId !== $session.sessionId) {
              sessionStatus.setUnread(uiSessionId, $session.projectId);
            } else {
              sessionStatus.setIdle(uiSessionId, $session.projectId);
            }
          }
        }
        if ($session.projectId) {
          api.sessions.list($session.projectId, $showArchivedWorkspaces).then(list => {
            sidebarSessions = list;
          });
        }
        break;

      case "error":
        if (uiSessionId) {
          sessionMessages.addMessage(uiSessionId, {
            id: crypto.randomUUID(),
            role: "system",
            content: `Error: ${(msg as any).error}`,
            timestamp: new Date(),
          });
          loadingSessions.update(s => { s.delete(uiSessionId); return new Set(s); });
          if ($session.projectId) {
            sessionStatus.setIdle(uiSessionId, $session.projectId);
          }
        }
        break;

      case "done":
        const doneSessionId = uiSessionId || (msg as any).sessionId;
        if (doneSessionId) {
          loadingSessions.update(s => { s.delete(doneSessionId); return new Set(s); });
          processMessageQueue(doneSessionId);
          if ($session.projectId) {
            if (doneSessionId !== $session.sessionId) {
              sessionStatus.setUnread(doneSessionId, $session.projectId);
            } else {
              sessionStatus.setIdle(doneSessionId, $session.projectId);
            }
          }
          if (doneSessionId === $session.sessionId && !$tour.completedTours.includes("chat")) {
            const msgs = $sessionMessages.get(doneSessionId) || [];
            const userMsgs = msgs.filter(m => m.role === "user");
            if (userMsgs.length === 1) {
              setTimeout(() => tour.start("chat"), 800);
            }
          }
        }
        if (doneSessionId === $session.sessionId) {
          activeSubagents = new Map();
        }
        break;

      case "aborted":
        const abortedSessionId = uiSessionId || (msg as any).sessionId;
        if (abortedSessionId) {
          loadingSessions.update(s => { s.delete(abortedSessionId); return new Set(s); });
          sessionMessages.addMessage(abortedSessionId, {
            id: crypto.randomUUID(),
            role: "system",
            content: "Request stopped",
            timestamp: new Date(),
          });
          processMessageQueue(abortedSessionId);
          if ($session.projectId) {
            sessionStatus.setIdle(abortedSessionId, $session.projectId);
          }
        }
        if (abortedSessionId === $session.sessionId) {
          activeSubagents = new Map();
        }
        break;

      case "permission_request":
        const permMsg = msg as PermissionRequestMessage;
        pendingPermissionRequest = {
          requestId: permMsg.requestId,
          tools: permMsg.tools,
          toolInput: permMsg.toolInput,
          message: permMsg.message,
        };
        if ($session.projectId && $session.sessionId) {
          sessionStatus.setPermissionRequired($session.sessionId, $session.projectId);
        }
        notifications.add({
          type: "permission_request",
          title: `${permMsg.tools[0]} Permission Required`,
          message: permMsg.message,
          sessionId: $session.sessionId || undefined,
          persistent: true,
          data: {
            requestId: permMsg.requestId,
            tools: permMsg.tools,
            toolInput: permMsg.toolInput,
          },
        });
        break;

      case "stream_event":
        if (uiSessionId) {
          handleStreamEvent(uiSessionId, msg as StreamEventMessage);
        }
        break;

      case "auth_status":
        console.log("Auth status:", msg);
        break;

      case "unknown":
        console.log("Unknown SDK message:", msg);
        break;
    }
  }

  function scrollToBottom(instant = false) {
    setTimeout(() => {
      messagesContainer?.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: instant ? "instant" : "smooth",
      });
    }, instant ? 0 : 50);
  }

  function processMessageQueue(sessionId: string) {
    const queue = $messageQueue.filter(m => m.startsWith(`${sessionId}:`));
    if (queue.length === 0) return;
    
    const first = queue[0];
    messageQueue.update(q => q.filter(m => m !== first));
    
    const prompt = first.substring(sessionId.length + 1);
    
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

    client.query({
      prompt,
      projectId: $session.projectId || undefined,
      sessionId,
      claudeSessionId: $session.claudeSessionId || undefined,
      model: $session.selectedModel || undefined,
    });

    if (sessionId === $session.sessionId) {
      scrollToBottom();
    }
  }

  function stopGeneration() {
    const sessionId = $session.sessionId;
    if (!sessionId) return;
    
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

  async function sendMessage() {
    if (!inputText.trim() || !$isConnected) return;
    if (!$session.projectId) {
        alert("Please select or create a project first.");
        return;
    }

    let currentSessionId = $session.sessionId;
    
    if (!currentSessionId) {
        const newSessionId = await createNewChat();
        if (!newSessionId) return;
        currentSessionId = newSessionId;
    }
    const isCurrentSessionLoading = $loadingSessions.has(currentSessionId);
    
    if (isCurrentSessionLoading) {
      messageQueue.update(q => [...q, `${currentSessionId}:${inputText.trim()}`]);
      inputText = "";
      sessionDrafts.clearDraft(currentSessionId);
      return;
    }

    const currentInput = inputText;
    const currentAttachedFiles = get(attachedFiles);
    inputText = "";
    sessionDrafts.clearDraft(currentSessionId);
    attachedFiles.clear();
    
    const currentTodos = get(todos);
    if (currentTodos.length > 0 && currentTodos.every(t => t.status === "completed")) {
      todos.set([]);
    }
    
    const thanksPatterns = /\b(thanks|thank you|thx|ty|awesome|perfect|great job|well done|amazing|love it)\b/i;
    if (thanksPatterns.test(currentInput)) {
      showConfetti = true;
    }

    let messageContent = currentInput;
    if (currentAttachedFiles.length > 0) {
      const fileRefs = currentAttachedFiles.map(f => `[File: ${f.path}]`).join("\n");
      messageContent = `${fileRefs}\n\n${currentInput}`;
    }

    sessionMessages.addMessage(currentSessionId, {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    });

    loadingSessions.update(s => { s.add(currentSessionId); return new Set(s); });
    sessionStatus.setRunning(currentSessionId, $session.projectId!);

    const historyCtx = $sessionHistoryContext.get(currentSessionId);
    
    client.query({
      prompt: messageContent,
      projectId: $session.projectId || undefined,
      sessionId: currentSessionId,
      claudeSessionId: $session.claudeSessionId || undefined,
      model: $session.selectedModel || undefined,
      historyContext: historyCtx,
    });

    if (historyCtx) {
      sessionHistoryContext.update(map => {
        map.delete(currentSessionId);
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

  function formatContent(content: ContentBlock[] | string): string {
    if (typeof content === "string") return content;
    
    return content
      .map((block) => {
        if (block.type === "text") {
          return (block as TextBlock).text;
        }
        if (block.type === "tool_use") {
          const tool = block as ToolUseBlock;
          return `[Using ${tool.name}]`;
        }
        return "";
      })
      .filter(text => text)
      .join(" ");
  }

  async function handleTitleSuggestionApply(title: string) {
    if ($session.sessionId) {
      await api.sessions.update($session.sessionId, { title });
      const idx = sidebarSessions.findIndex(s => s.id === $session.sessionId);
      if (idx !== -1) sidebarSessions[idx].title = title;
    }
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
    previewSource = "";
  }

  function renderMarkdown(content: string): string {
    const html = marked.parse(content) as string;
    return linkifyUrls(linkifyFilenames(linkifyFileLineReferences(linkifyCodePaths(html, currentProject?.path), currentProject?.path)));
  }

  function handleCodeRun(code: string, language: string) {
    // For now, just log the code. In a real implementation, you'd execute it
    console.log('Running code:', { code, language });
    
    // You could emit an event or call an API here to execute the code
    // This depends on your backend implementation for code execution
  }

  function linkifyUrls(html: string): string {
    const urlPattern = /(https?:\/\/localhost[:\d]*[^\s<"']*|https?:\/\/127\.0\.0\.1[:\d]*[^\s<"']*|(?<![\/\w])localhost:\d+[^\s<"']*|(?<![\/\w])127\.0\.0\.1:\d+[^\s<"']*)/g;
    return html.replace(urlPattern, (url) => {
      const fullUrl = url.startsWith("http") ? url : `http://${url}`;
      return `<a href="#" class="preview-link" data-url="${escapeHtml(fullUrl)}">${url}</a>`;
    });
  }

  function linkifyCodePaths(html: string, projectPath: string | undefined): string {
    return html.replace(/<code>([^<]+)<\/code>/g, (match, codeContent) => {
      const decoded = codeContent
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
      
      const indexedPath = projectFileIndex.get(decoded);
      if (indexedPath) {
        return `<code class="file-link" data-path="${escapeHtml(indexedPath)}">${codeContent}</code>`;
      }
      
      const isFilePath = /^(\/[\w\-\.\/]+|\.\.?\/[\w\-\.\/]+|[\w\-\/]+\.(ts|js|tsx|jsx|svelte|vue|py|rs|go|md|json|css|scss|html|yml|yaml|toml|sql|sh|txt|env|lock|pdf|csv|xml|log))$/.test(decoded);
      
      if (isFilePath) {
        let fullPath = decoded;
        if (!decoded.startsWith("/") && projectPath) {
          fullPath = `${projectPath}/${decoded.replace(/^\.\//,"")}`;
        }
        return `<code class="file-link" data-path="${escapeHtml(fullPath)}">${codeContent}</code>`;
      }
      return match;
    });
  }

  function linkifyFilenames(html: string): string {
    const filenamePattern = /([\w\-\.]+\.(csv|txt|json|xml|md|pdf|log|sql|yml|yaml|toml|env|html|css|js|ts|tsx|jsx|py|rs|go|svelte|vue|sh|lock))(?![^<]*<\/code>)(?![^<]*<\/a>)/gi;
    return html.replace(filenamePattern, (match, filename) => {
      const indexedPath = projectFileIndex.get(filename);
      if (indexedPath) {
        return `<span class="file-link cursor-pointer text-blue-600 hover:text-blue-800 hover:underline" data-path="${escapeHtml(indexedPath)}">${match}</span>`;
      }
      return match;
    });
  }

  function linkifyFileLineReferences(html: string, projectPath: string | undefined): string {
    // Pattern to match file:line and file:line-line patterns
    // Supports both backtick-wrapped and plain text patterns
    const fileLinePattern = /(?:^|(?<=\s|>|^))(`?)([^\s<>`]+\.(ts|js|tsx|jsx|svelte|vue|py|rs|go|md|json|css|scss|html|yml|yaml|toml|sql|sh|txt|env|lock|pdf|csv|xml|log)):(\d+)(?:-(\d+))?\1(?=\s|<|$|[.,;!?])/gm;
    
    return html.replace(fileLinePattern, (match, backtick, filePath, extension, startLine, endLine) => {
      // Resolve file path
      let fullPath = filePath;
      
      // First check if it's in the project file index
      const indexedPath = projectFileIndex.get(filePath) || 
                          projectFileIndex.get(filePath.split('/').pop() || '');
      
      if (indexedPath) {
        fullPath = indexedPath;
      } else if (!filePath.startsWith("/") && projectPath) {
        fullPath = `${projectPath}/${filePath.replace(/^\.\//,"")}`;
      }

      const lineInfo = endLine ? `${startLine}-${endLine}` : startLine;
      const displayText = backtick ? `\`${filePath}:${lineInfo}\`` : `${filePath}:${lineInfo}`;
      
      return `<span class="file-line-link" data-path="${escapeHtml(fullPath)}" data-line="${escapeHtml(startLine)}" data-end-line="${escapeHtml(endLine || '')}">${displayText}</span>`;
    });
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

  async function forkFromMessage(msgId: string) {
    if (!$session.sessionId) return;
    
    try {
      const forkedSession = await api.sessions.fork($session.sessionId, { fromMessageId: msgId });
      sidebarSessions = [forkedSession, ...sidebarSessions];
      selectSession(forkedSession);
    } catch (e) {
      console.error("Failed to fork session:", e);
    }
    closeMessageMenu();
  }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={() => { stopResizingRight(); stopResizingLeft(); }} onkeydown={handleGlobalKeydown} />

{#if showWelcome}
  <WelcomeScreen onComplete={() => showWelcome = false} />
{/if}

<Confetti trigger={showConfetti} onComplete={() => showConfetti = false} />

{#if showOnboarding}
  <Onboarding onComplete={handleOnboardingComplete} />
{/if}

<TourOverlay tourSteps={TOUR_STEPS} />

<div class="flex h-screen bg-white text-gray-900 font-sans overflow-hidden selection:bg-blue-100 selection:text-blue-900">

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
    onCreateNewChat={createNewChat}
    onGoToChat={goToChat}
    onNewProjectModal={() => showNewProjectModal = true}
    onSettings={() => showSettings = true}
    onSearchModal={() => showSearchModal = true}
    onHotkeysHelp={() => showHotkeysHelp = true}
    onProjectSettings={() => showProjectSettings = true}
    onEditProject={openEditProject}
    onDeleteProject={openDeleteConfirm}
    onToggleProjectPin={toggleProjectPin}
    onToggleProjectArchive={toggleProjectArchive}
    onProjectPermissions={(p) => showProjectPermissions = p}
    onEditSession={openEditSession}
    onDeleteSession={deleteSession}
    onDuplicateSession={duplicateSession}
    onToggleSessionFavorite={toggleSessionFavorite}
    onToggleSessionArchive={toggleSessionArchive}
    onProjectReorder={async (order) => { 
      await api.projects.reorder(order); 
      const orderMap = new Map(order.map((id, i) => [id, i]));
      sidebarProjects = [...sidebarProjects].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
    }}
    onSessionReorder={async (order) => { 
      if (currentProject) {
        await api.sessions.reorder(currentProject.id, order);
        const orderMap = new Map(order.map((id, i) => [id, i]));
        sidebarSessions = [...sidebarSessions].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      }
    }}
    onModelSelect={handleModelSelect}
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
    bind:titleSuggestionRef
  />



  <!-- Main Content Area -->
  <div class="flex-1 flex min-w-0 min-h-0 overflow-hidden">

  <!-- Chat Area -->
  <main class="flex-1 flex flex-col min-w-0 min-h-0 bg-white relative overflow-hidden">

    <!-- Toolbar Buttons -->
    {#if currentProject}
    <div class="absolute top-3 right-3 z-20 flex gap-1">
      {#if $advancedMode}
      <button 
        onclick={() => showDebugInfo = true}
        class={`p-2 border rounded-lg shadow-sm transition-all group ${showDebugInfo ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
        title="Session Debug Info"
      >
        <svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
      </button>
      {/if}
      <button 
        onclick={toggleFileBrowser}
        class={`p-2 border rounded-lg shadow-sm transition-all group ${showFileBrowser && rightPanelMode === 'files' ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
        title="Browse Files"
      >
        <svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
      </button>
      <button 
        onclick={() => { showBrowser = true; rightPanelMode = 'browser'; }}
        class={`p-2 border rounded-lg shadow-sm transition-all group ${showBrowser && rightPanelMode === 'browser' ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
        title="Open Browser"
      >
        <svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
      </button>
    </div>
    {/if}

    {#if !currentProject}

        <div class="flex-1 overflow-y-auto p-8 bg-white">

            <div class="w-full max-w-4xl mx-auto flex flex-col items-center pt-12">
                <div class="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-200 mb-6">
                    <img src="/logo.png" alt="Logo" class="w-10 h-10" />
                </div>

                <h1 class="text-3xl font-serif text-gray-900 mb-3 tracking-tight">Navi</h1>
                <p class="text-base text-gray-500 mb-8 max-w-md text-center font-light">Select a workspace to get started. Already on it.</p>

                <button 
                    onclick={() => showNewProjectModal = true} 
                    class="group relative inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] font-medium text-white transition-all duration-200 bg-gray-900 rounded-lg hover:bg-gray-800 hover:shadow-lg hover:shadow-gray-900/10 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 mb-16"
                >
                    <svg class="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    Create New Workspace
                </button>

                {#if sidebarProjects.length > 0}
                <div class="w-full">
                    <div class="flex items-center justify-between mb-5">
                        <h3 class="text-sm font-semibold text-gray-700">Your Workspaces</h3>
                        <span class="text-xs text-gray-400">{sidebarProjects.length} workspace{sidebarProjects.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {#each sidebarProjects as proj}
                          <WorkspaceCard 
                            project={proj}
                            onclick={() => selectProject(proj)}
                            onTogglePin={(e) => toggleProjectPin(proj, e)}
                            {relativeTime}
                          />
                        {/each}
                    </div>
                </div>
                {/if}
            </div>

        </div>

    {:else}

        <!-- Header (Mobile/Simplified) -->

        <header class="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white/80 backdrop-blur md:hidden z-10 sticky top-0">

            <button onclick={() => session.setProject(null)} class="text-gray-500">

                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7"></path></svg>

            </button>

            <span class="font-medium text-gray-900 text-sm">{currentProject.name}</span>

            <div class={`w-2 h-2 rounded-full ${$isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>

        </header>



        <!-- Messages -->

        <div class="flex-1 overflow-y-auto p-4 md:p-0 scroll-smooth" bind:this={messagesContainer}>
          {#if currentMessages.length === 0 && !$session.sessionId}
            <div class="space-y-6">
              {#if $advancedMode && claudeMdContent}
                <div class="max-w-3xl mx-auto w-full md:pt-4 md:px-0 px-4">
                  <button
                    onclick={() => showClaudeMdModal = true}
                    class="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <span>CLAUDE.md loaded</span>
                    <span class="text-gray-400">({claudeMdContent.split('\n').length} lines)</span>
                  </button>
                </div>
              {/if}

              <div class="max-w-3xl mx-auto w-full md:pt-10 space-y-8 pb-64">
                <div class="flex flex-col items-center justify-center text-center min-h-[70vh] animate-in fade-in duration-500">
                  <h2 class="text-2xl font-serif font-medium text-gray-900 mb-1">Start a conversation</h2>
                  <p class="text-sm text-gray-500 mb-8">in <span class="font-medium text-gray-700">{currentProject.name}</span></p>

                  <!-- Centered Input Box -->
                  <div class="w-full max-w-xl mb-6">
                    <div class="relative group bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200 transition-shadow focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-gray-300">
                      <textarea
                        bind:this={inputRef}
                        bind:value={inputText}
                        onkeydown={handleKeydown}
                        placeholder="Type a message to Claude..."
                        disabled={!$isConnected}
                        class="w-full bg-transparent text-gray-900 placeholder-gray-400 border-none rounded-xl pl-4 pr-14 py-3.5 focus:outline-none focus:ring-0 resize-none max-h-48 min-h-[56px] text-[15px] disabled:opacity-50"
                        rows="1"
                      ></textarea>
                      <div class="absolute right-2 bottom-2 flex items-center gap-1">
                        <button
                          onclick={sendMessage}
                          disabled={!$isConnected || !inputText.trim()}
                          class="p-1.5 text-gray-400 bg-transparent rounded-lg hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                        >
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"></path></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {#if projectContext}
                    {#if projectContext.suggestions && projectContext.suggestions.length > 0}
                      <div class="flex flex-wrap gap-2 justify-center max-w-xl mb-6">
                        {#each projectContext.suggestions as suggestion}
                          <button 
                            onclick={() => { inputText = suggestion; }}
                            class="text-sm text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 rounded-full px-4 py-2 transition-all border border-gray-200 hover:border-gray-300 hover:shadow-sm"
                          >
                            {suggestion}
                          </button>
                        {/each}
                      </div>
                    {/if}
                    
                    <p class="text-xs text-gray-400 text-center max-w-md">{projectContext.summary}</p>
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <ChatView
              sessionId={$session.sessionId}
              projectPath={currentProject?.path || ''}
              activeSubagents={activeSubagents}
              pendingPermissionRequest={pendingPermissionRequest}
              editingMessageId={editingMessageId}
              bind:editingMessageContent={editingMessageContent}
              renderMarkdown={renderMarkdown}
              jsonBlocksMap={jsonBlocksMap}
              onEditMessage={startEditMessage}
              onSaveEdit={saveEditedMessage}
              onCancelEdit={cancelEditMessage}
              onRollback={rollbackToMessage}
              onFork={forkFromMessage}
              onPreview={openPreview}
              onMessageClick={handleMessageClick}
              onPermissionApprove={handlePermissionApprove}
              onPermissionDeny={handlePermissionDeny}
              emptyState="continue"
            />
          {/if}

        </div>

        <!-- Input Area (hidden on project home via CSS) -->
        <div class="absolute bottom-0 left-0 right-0 p-6 pointer-events-none flex justify-center bg-gradient-to-t from-white via-white to-transparent {currentMessages.length === 0 && !$session.sessionId ? 'hidden' : ''}" data-tour="chat-input">

            <div class="w-full max-w-3xl pointer-events-auto">
                <ChatInput
                    bind:value={inputText}
                    disabled={!$isConnected}
                    loading={currentSessionLoading || false}
                    {queuedCount}
                    projectPath={currentProject?.path}
                    {activeSkills}
                    onSubmit={sendMessage}
                    onStop={stopGeneration}
                />

                <div class="text-center mt-2">
                    <span class="text-[10px] text-gray-400">navi can make mistakes. Please verify important information.</span>
                </div>
            </div>

        </div>

    {/if}

  </main>

  <!-- Right Panel (File Browser / Preview / Browser) -->
  {#if showFileBrowser || showPreview || showBrowser}
    <!-- Resizer Handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-1 bg-transparent hover:bg-gray-400 cursor-col-resize z-30 transition-colors flex flex-col justify-center items-center group relative -mr-[1px] {isResizingRight ? 'bg-gray-400' : ''}"
      onmousedown={startResizingRight}
    >
      <div class="w-[1px] h-full bg-gray-200 group-hover:bg-transparent"></div>
    </div>

    <div style="width: {rightPanelWidth}px" class="flex flex-col border-l border-gray-200 min-w-[400px]">
      <!-- Panel Header with Tabs -->
      <div class="h-10 px-2 border-b border-gray-200 flex items-center gap-1 bg-gray-50/50 shrink-0">
        <button
          onclick={() => { rightPanelMode = "files"; showFileBrowser = true; }}
          class={`px-3 py-1 text-xs font-medium rounded transition-colors ${rightPanelMode === 'files' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Files
        </button>
        <button
          onclick={() => { rightPanelMode = "preview"; showPreview = true; }}
          class={`px-3 py-1 text-xs font-medium rounded transition-colors ${rightPanelMode === 'preview' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Preview
        </button>
        <button
          onclick={() => { rightPanelMode = "browser"; showBrowser = true; }}
          class={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${rightPanelMode === 'browser' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
          Browser
        </button>
        <div class="flex-1"></div>
        <button onclick={closeRightPanel} class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <!-- Panel Content -->
      <div class="flex-1 overflow-hidden flex flex-col">
        {#if rightPanelMode === "files" && currentProject}
          <FileBrowser rootPath={currentProject.path} onPreview={handleFileSelect} />
        {:else if rightPanelMode === "preview"}
          <Preview source={previewSource} />
        {:else if rightPanelMode === "browser"}
          <Preview source={browserUrl} type="url" onUrlChange={(url) => browserUrl = url} />
        {/if}
      </div>
    </div>
  {/if}

  </div>

  <!-- New Project Modal -->

  {#if showNewProjectModal}

    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm">

        <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

            <div class="px-6 py-5 border-b border-gray-100">

                <h3 class="font-serif text-2xl text-gray-900">Create New Workspace</h3>

            </div>

            <!-- Mode Tabs -->
            <div class="px-6 pt-4 flex gap-1 border-b border-gray-100">
                <button 
                    onclick={() => projectCreationMode = "quick"}
                    class={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${projectCreationMode === 'quick' ? 'text-gray-900 border-gray-900' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
                >
                    Quick Start
                </button>
                <button 
                    onclick={() => projectCreationMode = "browse"}
                    class={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${projectCreationMode === 'browse' ? 'text-gray-900 border-gray-900' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
                >
                    Existing Folder
                </button>
            </div>

            <div class="p-6 space-y-5">

                {#if projectCreationMode === "quick"}
                    <div class="space-y-1.5">
                        <label class="text-xs font-medium text-gray-700">Workspace Name</label>
                        <!-- svelte-ignore a11y_autofocus -->
                        <input 
                            type="text" 
                            bind:value={newProjectQuickName}
                            placeholder="e.g. my-new-app" 
                            onkeydown={(e) => e.key === "Enter" && createProject()}
                            autofocus
                            class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors placeholder:text-gray-400"
                        />
                    </div>
                    <div class="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                        <span class="font-medium">Location:</span> <span class="font-mono">{defaultProjectsDir}/{newProjectQuickName.trim().replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "project-name"}</span>
                    </div>
                {:else}
                    <div class="space-y-1.5">

                        <label class="text-xs font-medium text-gray-700">Workspace Directory</label>

                        <div class="flex gap-2">

                            <input 

                                type="text" 

                                bind:value={newProjectPath}

                                placeholder="/path/to/directory" 

                                class="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors font-mono placeholder:text-gray-400"

                            />

                            <button onclick={pickDirectory} class="bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 rounded-lg border border-gray-300 transition-colors">

                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path></svg>

                            </button>

                        </div>

                    </div>

                    <div class="space-y-1.5">

                        <label class="text-xs font-medium text-gray-700">Project Name</label>

                        <input 

                            type="text" 

                            bind:value={newProjectName}

                            placeholder="e.g. Website Redesign" 

                            class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors placeholder:text-gray-400"

                        />

                    </div>
                {/if}

            </div>

            <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">

                <button onclick={() => showNewProjectModal = false} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>

                <button onclick={createProject} class="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-black text-white rounded-lg shadow-sm transition-all active:scale-95">Create Workspace</button>

            </div>

        </div>

    </div>

  {/if}

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

  <Settings open={showSettings} onClose={() => showSettings = false} />

  {#if showProjectSettings && currentProject}
    <ProjectSettings project={currentProject} onClose={() => showProjectSettings = false} />
  {/if}

  <SearchModal 
    bind:isOpen={showSearchModal} 
    projectId={$session.projectId}
    onNavigate={async (sessionId, projectId) => {
      session.setProject(projectId);
      await loadSessions(projectId);
      const targetSession = sidebarSessions.find(s => s.id === sessionId);
      if (targetSession) {
        selectSession(targetSession);
      }
    }}
    onNavigateProject={async (projectId) => {
      session.setProject(projectId);
      session.setSession(null);
      await loadSessions(projectId);
    }}
  />

  {#if showHotkeysHelp}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm" onclick={() => showHotkeysHelp = false} role="dialog" aria-modal="true" tabindex="-1">
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
            <div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
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


  <!-- CLAUDE.md Modal -->
  {#if showClaudeMdModal}
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm"
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

  {#if showProjectPermissions}
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm"
      onclick={() => showProjectPermissions = null}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div 
        class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-purple-100 rounded-lg">
              <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-sm text-gray-900">Permissions</h3>
              <p class="text-xs text-gray-500">{showProjectPermissions.name}</p>
            </div>
          </div>
          <button onclick={() => showProjectPermissions = null} class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div class="space-y-4">
            <div class="border border-gray-200 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-medium text-sm text-gray-900">Always Allow for this Project</h4>
                  <p class="text-xs text-gray-500 mt-1">Skip permission prompts for all chats in this project</p>
                </div>
                <button
                  onclick={async () => {
                    if (showProjectPermissions) {
                      const newValue = !showProjectPermissions.auto_accept_all;
                      await api.projects.setAutoAcceptAll(showProjectPermissions.id, newValue);
                      showProjectPermissions = { ...showProjectPermissions, auto_accept_all: newValue ? 1 : 0 };
                      const idx = sidebarProjects.findIndex(p => p.id === showProjectPermissions?.id);
                      if (idx >= 0) {
                        sidebarProjects[idx] = { ...sidebarProjects[idx], auto_accept_all: newValue ? 1 : 0 };
                      }
                    }
                  }}
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {showProjectPermissions?.auto_accept_all ? 'bg-purple-600' : 'bg-gray-300'}"
                >
                  <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {showProjectPermissions?.auto_accept_all ? 'translate-x-6' : 'translate-x-1'}"></span>
                </button>
              </div>
            </div>

            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 class="font-medium text-sm text-gray-900 mb-2">How Permissions Work</h4>
              <ul class="text-xs text-gray-600 space-y-1.5">
                <li class="flex items-start gap-2">
                  <span class="text-gray-400">•</span>
                  <span><strong>Allow</strong> - Allows that single action</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-gray-400">•</span>
                  <span><strong>Always Allow</strong> - Allows all actions for the rest of the chat (persists)</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-gray-400">•</span>
                  <span><strong>Project toggle above</strong> - Skips all prompts for this project</span>
                </li>
              </ul>
            </div>
            
            <div class="border border-gray-200 rounded-lg p-4">
              <h4 class="font-medium text-sm text-gray-900 mb-2">Global Settings</h4>
              <p class="text-xs text-gray-500 mb-3">These settings apply to all projects.</p>
              {#if globalPermissionSettings}
                <div class="space-y-2 text-sm">
                  <div class="flex items-center justify-between py-1">
                    <span class="text-gray-600">Auto-accept all (global)</span>
                    <span class={globalPermissionSettings.autoAcceptAll ? "text-amber-600 font-medium" : "text-gray-400"}>
                      {globalPermissionSettings.autoAcceptAll ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div class="flex items-center justify-between py-1">
                    <span class="text-gray-600">Tools requiring confirmation</span>
                    <span class="text-gray-900 font-medium">{globalPermissionSettings.requireConfirmation.length}</span>
                  </div>
                </div>
              {:else}
                <p class="text-sm text-gray-500">Loading...</p>
              {/if}
            </div>

            <div class="flex justify-end">
              <button 
                onclick={() => { showProjectPermissions = null; showSettings = true; }}
                class="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Open Global Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

</div>

{#if linkContextMenu}
  <ContextMenu
    x={linkContextMenu.x}
    y={linkContextMenu.y}
    items={getLinkContextMenuItems()}
    onclose={() => linkContextMenu = null}
  />
{/if}

<NotificationToast />

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
