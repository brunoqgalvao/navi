<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { ClaudeClient, type ClaudeMessage, type ContentBlock, type TextBlock, type ToolUseBlock, type ToolProgressMessage } from "./lib/claude";
  import { sessionMessages, currentSession as session, isConnected, projects, availableModels, onboardingComplete, messageQueue, loadingSessions, type ChatMessage } from "./lib/stores";
  import ModelSelector from "./lib/components/ModelSelector.svelte";
  import { api, type Project, type Session } from "./lib/api";
  import Preview from "./lib/Preview.svelte";
  import { marked, type Tokens } from "marked";

  const renderer = new marked.Renderer();
  renderer.link = ({ href, title, text }: Tokens.Link) => {
    const titleAttr = title ? ` title="${title}"` : "";
    let url = href;
    if (url.startsWith("//")) {
      url = "https:" + url;
    }
    return `<a href="${url}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  
  renderer.code = ({ text, lang }: Tokens.Code) => {
    const langClass = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${langClass}>${escapeHtml(text)}</code></pre>`;
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
  import SubagentBlock from "./lib/components/SubagentBlock.svelte";
  import AudioRecorder from "./lib/components/AudioRecorder.svelte";
  import Onboarding from "./lib/components/Onboarding.svelte";
  import Settings from "./lib/components/Settings.svelte";
  import ToolRenderer from "./lib/components/ToolRenderer.svelte";

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
  
  let currentMessages = $derived($session.sessionId ? ($sessionMessages.get($session.sessionId) || []) : []);
  
  let sidebarProjects = $state<Project[]>([]);
  let sidebarSessions = $state<Session[]>([]);
  let recentChats = $state<Session[]>([]);
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
  let sidebarCollapsed = $state(false);
  let messageMenuId: string | null = $state(null);
  let messageMenuPos = $state({ x: 0, y: 0 });

  let showPreview = $state(false);
  let previewSource = $state("");
  let showFileBrowser = $state(false);
  let showBrowser = $state(false);
  let browserUrl = $state("http://localhost:3000");
  let rightPanelMode = $state<"preview" | "files" | "browser">("preview");
  let projectFileIndex = $state<Map<string, string>>(new Map());
  let activeSubagents = $state<Map<string, { elapsed: number }>>(new Map());
  
  let rightPanelWidth = $state(600);
  let isResizingRight = $state(false);
  
  let projectContext = $state<{ summary: string; suggestions: string[] } | null>(null);
  let projectContextError = $state<string | null>(null);

  function startResizingRight() {
    isResizingRight = true;
  }

  function stopResizingRight() {
    isResizingRight = false;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizingRight) return;
    const newWidth = window.innerWidth - e.clientX;
    const sidebarWidth = sidebarCollapsed ? 56 : 288;
    const minChatWidth = 400;
    const maxPanelWidth = window.innerWidth - sidebarWidth - minChatWidth;
    if (newWidth >= 300 && newWidth <= maxPanelWidth) {
      rightPanelWidth = newWidth;
    }
  }

  let currentProject = $derived(sidebarProjects.find(p => p.id === $session.projectId));
  let currentSessionLoading = $derived($session.sessionId && $loadingSessions.has($session.sessionId));
  let queuedCount = $derived($session.sessionId ? $messageQueue.filter(m => m.startsWith($session.sessionId + ':')).length : 0);
  let showOnboarding = $state(!$onboardingComplete);

  $effect(() => {
    if ($session.selectedModel !== lastSessionModel) {
      lastSessionModel = $session.selectedModel;
      modelSelection = $session.selectedModel;
    }
  });

  function handleOnboardingComplete() {
    onboardingComplete.complete();
    showOnboarding = false;
  }

  onMount(async () => {
    loadProjects();
    loadRecentChats();
    loadConfig();
    loadModels();

    client = new ClaudeClient();
    try {
      await client.connect();
      isConnected.set(true);
    } catch (e) {
      console.error("Failed to connect:", e);
    }

    client.onMessage(handleMessage);
  });


  onDestroy(() => {
    client?.disconnect();
  });

  async function loadProjects() {
    try {
      sidebarProjects = await api.projects.list();
      projects.set(sidebarProjects);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  async function loadRecentChats() {
    try {
      recentChats = await api.sessions.listRecent(10);
    } catch (e) {
      console.error("Failed to load recent chats:", e);
    }
  }

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

  function handleModelSelect(model: string) {
    modelSelection = model;
    session.setSelectedModel(model);
  }

  async function selectProject(project: Project) {
    session.setProject(project.id);
    session.setSession(null);
    sidebarSessions = [];
    projectFileIndex = new Map();
    projectContext = null;
    projectContextError = null;
    
    try {
      const sessionsList = await api.sessions.list(project.id);
      sidebarSessions = sessionsList.sort((a, b) => b.updated_at - a.updated_at);
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }
    
    indexProjectFiles(project.path);
    loadProjectContext(project);
  }

  async function goToChat(chat: Session) {
    const project = sidebarProjects.find(p => p.id === chat.project_id);
    if (!project) return;
    
    session.setProject(chat.project_id);
    projectFileIndex = new Map();
    projectContext = null;
    projectContextError = null;
    
    try {
      const sessionsList = await api.sessions.list(chat.project_id);
      sidebarSessions = sessionsList.sort((a, b) => b.updated_at - a.updated_at);
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }
    
    selectSession({ ...chat, claude_session_id: chat.claude_session_id } as Session);
    indexProjectFiles(project.path);
    loadProjectContext(project);
  }
  
  async function loadProjectContext(project: Project) {
    const cached = project.summary || project.description;
    const cacheAge = project.summary_updated_at ? Date.now() - project.summary_updated_at : Infinity;
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    
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
    
    api.ephemeral.chat({
      prompt: `Analyze this project directory and provide:
1. A brief summary (2-3 sentences) of what this project is about and its main technologies
2. 3-4 suggested next steps or tasks the user might want to do

Respond in this exact JSON format only, no other text:
{"summary": "...", "suggestions": ["...", "...", "..."]}`,
      projectPath: project.path,
      useTools: true,
      maxTokens: 500,
    }).then(response => {
      try {
        const jsonMatch = response.result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          projectContext = JSON.parse(jsonMatch[0]);
          api.projects.generateSummary(project.id).catch(() => {});
        }
      } catch {
        projectContext = { summary: response.result.slice(0, 500), suggestions: [] };
      }
    }).catch(e => {
      console.error("Project context error:", e);
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
    session.setSession(s.id, s.claude_session_id);
    session.setCost(s.total_cost_usd || 0);
    session.setUsage(s.input_tokens || 0, s.output_tokens || 0);
    
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
          };
        });
        sessionMessages.setMessages(s.id, loadedMsgs);
      } catch (e) {
        console.error("Failed to load messages:", e);
      }
    }
    
    scrollToBottom();
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

  function handleMessage(msg: ClaudeMessage) {
    const uiSessionId = (msg as any).uiSessionId;
    const claudeSessionId = (msg as any).claudeSessionId;
    
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init" && uiSessionId && uiSessionId === $session.sessionId) {
          session.setClaudeSession(claudeSessionId);
          if ((msg as any).model) session.setModel((msg as any).model);
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
        const matchingMsg = existingMsgs.findLast(
          (m: ChatMessage) => m.role === "assistant" && m.parentToolUseId === parentId
        );
        
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
        if (uiSessionId === $session.sessionId) {
          scrollToBottom();
        }
        break;

      case "result":
        if (uiSessionId && uiSessionId === $session.sessionId) {
          session.setCost($session.costUsd + ((msg as any).costUsd || 0));
          if ((msg as any).usage) {
            session.setUsage(
              $session.inputTokens + ((msg as any).usage.input_tokens || 0),
              $session.outputTokens + ((msg as any).usage.output_tokens || 0)
            );
          }
        }
        if (uiSessionId) {
          loadingSessions.update(s => { s.delete(uiSessionId); return new Set(s); });
        }
        if ($session.projectId) {
          api.sessions.list($session.projectId).then(list => {
            sidebarSessions = list.sort((a, b) => b.updated_at - a.updated_at);
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
        }
        break;

      case "done":
        const doneSessionId = uiSessionId || (msg as any).sessionId;
        if (doneSessionId) {
          loadingSessions.update(s => { s.delete(doneSessionId); return new Set(s); });
          processMessageQueue(doneSessionId);
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
        }
        if (abortedSessionId === $session.sessionId) {
          activeSubagents = new Map();
        }
        break;
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      messagesContainer?.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
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
      return;
    }

    const currentInput = inputText;
    inputText = "";

    sessionMessages.addMessage(currentSessionId, {
      id: crypto.randomUUID(),
      role: "user",
      content: currentInput,
      timestamp: new Date(),
    });

    loadingSessions.update(s => { s.add(currentSessionId); return new Set(s); });

    client.query({
      prompt: currentInput,
      projectId: $session.projectId || undefined,
      sessionId: currentSessionId,
      claudeSessionId: $session.claudeSessionId || undefined,
      model: $session.selectedModel || undefined,
    });

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
      .join("\n");
  }

  function getToolCalls(content: ContentBlock[] | string): ToolUseBlock[] {
    if (typeof content === "string") return [];
    return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
  }

  function isTaskTool(tool: ToolUseBlock): boolean {
    return tool.name === "Task";
  }

  function getSubagentMessages(toolUseId: string) {
    return currentMessages.filter(m => m.parentToolUseId === toolUseId);
  }

  function getMainMessages() {
    return currentMessages.filter(m => !m.parentToolUseId);
  }

  function getHistoryToolCalls(contentHistory: (ContentBlock[] | string)[] | undefined): ToolUseBlock[] {
    if (!contentHistory) return [];
    return contentHistory.flatMap(content => {
      if (typeof content === "string") return [];
      return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    });
  }

  let expandedHistories = $state<Set<string>>(new Set());

  function openPreview(source: string) {
    const isUrl = source.startsWith("http://") || source.startsWith("https://") || source.startsWith("localhost") || source.match(/^:\d+/);
    if (isUrl) {
      openBrowser(source);
    } else {
      previewSource = source;
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
    return linkifyUrls(linkifyCodePaths(html, currentProject?.path));
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
      
      const isFilePath = /^(\/[\w\-\.\/]+|\.\.?\/[\w\-\.\/]+|[\w\-\/]+\.(ts|js|tsx|jsx|svelte|vue|py|rs|go|md|json|css|scss|html|yml|yaml|toml|sql|sh|txt|env|lock|pdf))$/.test(decoded);
      
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

  function handleMessageClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("file-link")) {
      e.preventDefault();
      const path = target.dataset.path;
      if (path) {
        openPreview(path);
      }
    } else if (target.classList.contains("preview-link")) {
      e.preventDefault();
      const url = target.dataset.url;
      if (url) {
        openPreview(url);
      }
    }
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

  function copyMessageContent(msgId: string) {
    const msg = currentMessages.find(m => m.id === msgId);
    if (msg) {
      const text = formatContent(msg.content);
      navigator.clipboard.writeText(text);
    }
    closeMessageMenu();
  }

  function editAsNewMessage(msgId: string) {
    const msg = currentMessages.find(m => m.id === msgId);
    if (msg && msg.role === "user") {
      inputText = formatContent(msg.content);
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

<svelte:window onmousemove={handleMouseMove} onmouseup={stopResizingRight} />

{#if showOnboarding}
  <Onboarding onComplete={handleOnboardingComplete} />
{/if}

<div class="flex h-screen bg-white text-gray-900 font-sans overflow-hidden selection:bg-gray-100 selection:text-gray-900">

  <!-- Sidebar -->

  <aside class={`${sidebarCollapsed ? 'w-14' : 'w-72'} bg-gray-50/50 border-r border-gray-200 flex flex-col hidden md:flex shrink-0 transition-all duration-200`}>

    <!-- Header -->

    <div class="h-14 px-2 border-b border-gray-100 flex items-center justify-between">

        {#if sidebarCollapsed}
          <button onclick={() => sidebarCollapsed = false} class="w-10 h-10 mx-auto flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all" title="Expand sidebar">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
          </button>
        {:else}
          <div class="flex items-center gap-2.5 px-2">

              <div class="w-6 h-6 rounded bg-gray-900 flex items-center justify-center font-bold text-white text-xs">C</div>

              <span class="font-medium text-sm tracking-tight text-gray-900">Claude Code</span>

          </div>

          <div class="flex items-center gap-0.5">
            {#if currentProject}
            <button onclick={createNewChat} class="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all duration-200" title="New Chat">

                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>

            </button>
            {/if}
            <button onclick={() => sidebarCollapsed = true} class="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all duration-200" title="Collapse sidebar">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
            </button>
          </div>
        {/if}

    </div>

    

    <!-- Projects List -->

    <div class="flex-1 overflow-y-auto min-h-0 flex flex-col py-2">

        {#if sidebarCollapsed}
          <!-- Collapsed view: minimal icons -->
          <div class="flex flex-col items-center gap-1 px-2">
            <button 
              onclick={() => sidebarCollapsed = false}
              class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all"
              title="Projects"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
            </button>
            {#if currentProject}
              <button 
                onclick={createNewChat}
                class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all"
                title="New chat"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
              </button>
            {/if}
          </div>
        {:else if !currentProject}

             <div class="px-3">

                 <div class="flex items-center justify-between mb-2 mt-2 px-2">
                   <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Projects</h3>
                   <button onclick={() => showNewProjectModal = true} class="text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded transition-colors border border-gray-200">
                      + New
                   </button>
                 </div>

                 {#if sidebarProjects.length === 0}

                    <div class="text-xs text-gray-400 italic text-center py-4">No projects yet</div>

                 {:else}

                    <div class="space-y-0.5">

                        {#each sidebarProjects as proj}

                            <div class="group relative">
                            <button 
                                onclick={() => selectProject(proj)}
                                class="w-full text-left px-2.5 py-2 rounded-md text-gray-600 hover:bg-gray-200/50 hover:text-gray-900 transition-colors"
                            >
                                <div class="flex items-center gap-2">
                                    <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                                    <span class="text-[13px] font-medium truncate">{proj.name}</span>
                                </div>
                                <div class="flex items-center gap-2 mt-0.5 pl-5.5 text-[10px] text-gray-400">
                                    <span>{proj.session_count || 0} chats</span>
                                    <span class="text-gray-300">·</span>
                                    <span>{relativeTime(proj.last_activity || proj.updated_at)}</span>
                                </div>
                            </button>
                            <div class="absolute right-1 top-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onclick={(e) => openEditProject(proj, e)}
                                    class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="Edit project"
                                >
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                </button>
                                <button 
                                    onclick={(e) => openDeleteConfirm(proj, e)}
                                    class="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                    title="Delete project"
                                >
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>
                        </div>

                        {/each}

                    </div>

                 {/if}

                 {#if recentChats.length > 0}
                   <div class="mt-6">
                     <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Recent Chats</h3>
                     <div class="space-y-0.5">
                       {#each recentChats.slice(0, 5) as chat}
                         <button
                           onclick={() => goToChat(chat)}
                           class="w-full text-left px-2.5 py-2 rounded-md text-gray-600 hover:bg-gray-200/50 hover:text-gray-900 transition-colors"
                         >
                           <div class="text-[13px] font-medium truncate">{chat.title}</div>
                           <div class="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                             <span class="truncate">{chat.project_name}</span>
                             <span class="text-gray-300">·</span>
                             <span>{relativeTime(chat.updated_at)}</span>
                           </div>
                         </button>
                       {/each}
                     </div>
                   </div>
                 {/if}

             </div>

        {:else}

            <!-- Selected Project View -->

             <div class="px-3 flex-1 flex flex-col min-h-0">

                 <button onclick={() => { session.setProject(null); sidebarSessions = []; }} class="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800 mb-4 px-1 py-1 -ml-1 transition-colors">

                     <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7"></path></svg>

                     Back to Projects

                 </button>

                 

                 <button onclick={() => { session.setSession(null); }} class="mb-6 px-1 text-left w-full hover:bg-gray-100 rounded-lg py-2 -my-2 transition-colors group">

                     <h2 class="text-sm font-semibold text-gray-900 truncate flex items-center gap-2 group-hover:text-gray-700">

                        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>

                        {currentProject.name}

                     </h2>

                     <p class="text-[11px] text-gray-400 truncate mt-0.5 pl-6" title={currentProject.path}>{currentProject.path}</p>

                 </button>



                 <div class="flex items-center justify-between mb-2 px-1">

                     <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Chats</h3>

                     <button onclick={createNewChat} class="text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded transition-colors border border-gray-200">

                        + New

                     </button>

                 </div>



                 <div class="flex-1 overflow-y-auto space-y-0.5">

                     {#if sidebarSessions.length === 0}

                        <div class="text-xs text-gray-400 italic text-center py-8">No chats yet</div>

                     {:else}

                        {#each sidebarSessions as sess}

                            <div class="group relative">

                                <button 

                                    onclick={() => selectSession(sess)}

                                    class={`w-full text-left px-2.5 py-2 rounded-md text-[13px] transition-all border ${$session.sessionId === sess.id ? 'bg-white border-gray-200 shadow-sm text-gray-900 z-10 relative' : 'border-transparent text-gray-500 hover:bg-gray-200/50 hover:text-gray-800'}`}

                                >

                                    <div class="truncate pr-4 font-medium">{sess.title}</div>

                                    <div class="text-[10px] opacity-60 mt-0.5 flex justify-between">

                                        <span>{new Date(sess.updated_at).toLocaleDateString()}</span>

                                    </div>

                                </button>

                                <div class="absolute right-1 top-2.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    <button 
                                        onclick={(e) => openEditSession(sess, e)}
                                        class="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Edit chat name"
                                    >
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                    </button>
                                    <button 
                                        onclick={(e) => deleteSession(e, sess.id)}
                                        class="p-0.5 text-gray-400 hover:text-red-600 transition-colors"
                                        title="Delete chat"
                                    >
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>

                            </div>

                        {/each}

                     {/if}

                 </div>

             </div>

        {/if}

    </div>



    <!-- Footer Stats -->

    <div class={`${sidebarCollapsed ? 'px-2' : 'px-4'} py-3 border-t border-gray-200 bg-gray-50/50 space-y-2`}>

      <!-- Model Selector -->
      {#if $session.sessionId && !sidebarCollapsed}
        <ModelSelector 
          models={$availableModels} 
          bind:selectedModel={modelSelection}
          onSelect={handleModelSelect}
        />
      {/if}

      <!-- Context Usage -->
      {#if $session.inputTokens > 0 && !sidebarCollapsed}
        {@const contextWindow = 200000}
        {@const usagePercent = Math.min(100, Math.round(($session.inputTokens / contextWindow) * 100))}
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px] text-gray-500">
            <span>Context</span>
            <span>{usagePercent}% ({($session.inputTokens / 1000).toFixed(1)}k / {(contextWindow / 1000).toFixed(0)}k)</span>
          </div>
          <div class="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div 
              class={`h-full rounded-full transition-all ${usagePercent > 80 ? 'bg-red-500' : usagePercent > 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
              style={`width: ${usagePercent}%`}
            ></div>
          </div>
        </div>
      {/if}

      {#if sidebarCollapsed}
        <div class="flex flex-col items-center gap-2">
          <span class={`w-2 h-2 rounded-full ${$isConnected ? "bg-emerald-500" : "bg-red-400"}`} title={$isConnected ? "Online" : "Offline"}></span>
          <button onclick={() => showSettings = true} class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Settings">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
        </div>
      {:else}
      <div class="flex items-center justify-between text-[11px]">

        <div class="flex items-center gap-1.5 text-gray-500">

            <span class={`w-1.5 h-1.5 rounded-full ${$isConnected ? "bg-emerald-500" : "bg-red-400"}`}></span>

            <span>{$isConnected ? "Online" : "Offline"}</span>

        </div>

        <div class="flex items-center gap-2">
          {#if $session.costUsd > 0}
              <span class="text-gray-600 font-mono bg-gray-200/50 px-1.5 py-0.5 rounded border border-gray-200">${$session.costUsd.toFixed(4)}</span>
          {/if}
          <button onclick={() => showSettings = true} class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Settings">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
        </div>

      </div>
      {/if}

    </div>

  </aside>



  <!-- Main Content Area -->
  <div class="flex-1 flex min-w-0 min-h-0 overflow-hidden">

  <!-- Chat Area -->
  <main class="flex-1 flex flex-col min-w-0 min-h-0 bg-white relative overflow-hidden">

    <!-- Toolbar Buttons -->
    {#if currentProject}
    <div class="absolute top-3 right-3 z-20 flex gap-1">
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

        <div class="flex-1 flex flex-col items-center justify-center p-8 bg-white min-h-full">

            <div class="w-full max-w-4xl mx-auto flex flex-col items-center">
                <div class="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-200 mb-6">
                    <div class="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-serif font-bold text-xl">C</div>
                </div>

                <h1 class="text-3xl font-serif text-gray-900 mb-3 tracking-tight">Claude Code</h1>
                <p class="text-base text-gray-500 mb-10 max-w-md text-center font-light">Select a project to start coding or continue where you left off</p>

                <button 
                    onclick={() => showNewProjectModal = true} 
                    class="group relative inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] font-medium text-white transition-all duration-200 bg-gray-900 rounded-lg hover:bg-gray-800 hover:shadow-lg hover:shadow-gray-900/10 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 mb-16"
                >
                    <svg class="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    Create New Project
                </button>

                <div class="w-full grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 px-4">
                  {#if sidebarProjects.length > 0}
                    <div class="flex flex-col gap-4">
                      <div class="flex items-center gap-3 pb-2 border-b border-gray-100">
                          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Projects</h3>
                      </div>
                      <div class="space-y-2">
                        {#each sidebarProjects.slice(0, 5) as proj}
                          <button 
                            onclick={() => selectProject(proj)}
                            class="group flex items-center w-full p-3 -mx-3 text-left rounded-lg transition-colors duration-200 hover:bg-gray-50"
                          >
                            <div class="flex items-center justify-center w-8 h-8 mr-3 text-gray-400 bg-white border border-gray-200 rounded-md shadow-sm group-hover:border-gray-300 group-hover:text-gray-600 transition-all">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                            </div>
                            <div class="flex-1 min-w-0">
                              <h4 class="text-[15px] font-medium text-gray-900 truncate group-hover:text-gray-900">{proj.name}</h4>
                              <p class="text-xs text-gray-500 mt-0.5">{relativeTime(proj.last_activity || proj.updated_at)}</p>
                            </div>
                            <svg class="w-4 h-4 text-gray-300 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5l7 7-7 7"></path></svg>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if recentChats.length > 0}
                    <div class="flex flex-col gap-4">
                      <div class="flex items-center gap-3 pb-2 border-b border-gray-100">
                          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Recent Chats</h3>
                      </div>
                      <div class="space-y-2">
                        {#each recentChats.slice(0, 5) as chat}
                          <button 
                            onclick={() => goToChat(chat)}
                            class="group flex items-center w-full p-3 -mx-3 text-left rounded-lg transition-colors duration-200 hover:bg-gray-50"
                          >
                            <div class="flex items-center justify-center w-8 h-8 mr-3 text-gray-400 bg-white border border-gray-200 rounded-md shadow-sm group-hover:border-gray-300 group-hover:text-gray-600 transition-all">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                            </div>
                            <div class="flex-1 min-w-0">
                              <h4 class="text-[15px] font-medium text-gray-900 truncate group-hover:text-gray-900">{chat.title}</h4>
                              <p class="text-xs text-gray-500 mt-0.5 truncate">{chat.project_name} · {relativeTime(chat.updated_at)}</p>
                            </div>
                            <svg class="w-4 h-4 text-gray-300 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5l7 7-7 7"></path></svg>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
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

        <div class="flex-1 overflow-y-auto p-4 md:p-0 space-y-6 scroll-smooth" bind:this={messagesContainer}>

        <div class="max-w-3xl mx-auto w-full md:pt-10 space-y-8 pb-64">

            {#if currentMessages.length === 0 && !$session.sessionId}

                <div class="flex flex-col items-center justify-center text-center min-h-[70vh] animate-in fade-in duration-500">

                  <h2 class="text-2xl font-serif font-medium text-gray-900 mb-1">Start a conversation</h2>
                  <p class="text-sm text-gray-500 mb-8">in <span class="font-medium text-gray-700">{currentProject.name}</span></p>

                  <!-- Centered Input Box -->
                  <div class="w-full max-w-xl mb-6">
                    <div class="relative group bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200 transition-shadow focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-gray-300">
                      <textarea
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

            {:else if currentMessages.length === 0}
                <div class="flex flex-col items-center justify-center text-gray-400 space-y-4 min-h-[40vh] animate-in fade-in duration-500">
                  <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                    <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                  </div>
                  <p class="text-sm">Continue the conversation...</p>
                </div>
            {/if}



            {#each getMainMessages() as msg (msg.id)}

                <div class={`group flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                   <!-- User Message -->

                   {#if msg.role === 'user'}

                        <div class="relative max-w-[85%]">
                          <div class="bg-gray-100 text-gray-900 px-5 py-3 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed">
                            <div class="whitespace-pre-wrap break-words">{formatContent(msg.content)}</div>
                          </div>
                          <div class="absolute -top-8 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5">
                            <button onclick={() => copyMessageContent(msg.id)} class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Copy">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                            <button onclick={() => editAsNewMessage(msg.id)} class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Edit as new message">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                            <button onclick={() => forkFromMessage(msg.id)} class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Fork from here">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                            </button>
                          </div>
                        </div>

                        <span class="text-[10px] text-gray-400 mt-1.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">

                            {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}

                        </span>

                   

                   <!-- System Message -->

                   {:else if msg.role === 'system'}
                        {@const isError = typeof msg.content === 'string' && msg.content.startsWith('Error:')}
                        <div class="w-full {isError ? 'bg-red-50 border-red-100 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-500'} border rounded-lg px-4 py-2.5 text-xs break-all">
                             {formatContent(msg.content)}
                        </div>



                   <!-- Assistant Message -->

                   {:else}

                        <div class="flex gap-4 w-full pr-4 md:pr-0 relative">

                             <div class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center shadow-sm text-gray-900 font-bold text-xs select-none">C</div>

                             <!-- svelte-ignore a11y_click_events_have_key_events -->
                             <!-- svelte-ignore a11y_no_static_element_interactions -->
                             <div class="flex-1 min-w-0 space-y-2 relative" onclick={handleMessageClick}>
                                 
                                 <div class="absolute -top-6 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5">
                                   <button onclick={() => copyMessageContent(msg.id)} class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Copy">
                                     <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                   </button>
                                   <button onclick={() => forkFromMessage(msg.id)} class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Fork from here">
                                     <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                                   </button>
                                 </div>

                                 <div class="text-[15px] leading-7 text-gray-800 markdown-body">

                                    {@html renderMarkdown(formatContent(msg.content))}

                                 </div>

                                 

                                 <!-- Tool History (Collapsible) -->
                                 {#if msg.contentHistory && getHistoryToolCalls(msg.contentHistory).length > 0}
                                    <div class="mt-3">
                                      <button
                                        onclick={() => {
                                          const newSet = new Set(expandedHistories);
                                          if (newSet.has(msg.id)) {
                                            newSet.delete(msg.id);
                                          } else {
                                            newSet.add(msg.id);
                                          }
                                          expandedHistories = newSet;
                                        }}
                                        class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                                      >
                                        <svg class={`w-3 h-3 transition-transform ${expandedHistories.has(msg.id) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                        <span>{getHistoryToolCalls(msg.contentHistory).length} previous tool {getHistoryToolCalls(msg.contentHistory).length === 1 ? 'call' : 'calls'}</span>
                                      </button>
                                      {#if expandedHistories.has(msg.id)}
                                        <div class="mt-2 space-y-1 pl-4 border-l-2 border-gray-200 opacity-70">
                                          {#each getHistoryToolCalls(msg.contentHistory) as histTool, idx}
                                            <ToolRenderer tool={histTool} compact={true} index={idx} onPreview={openPreview} />
                                          {/each}
                                        </div>
                                      {/if}
                                    </div>
                                 {/if}

                                 <!-- Tool Calls -->

                                 {#each getToolCalls(msg.content) as tool}
                                    {#if isTaskTool(tool)}
                                      <SubagentBlock
                                        toolUseId={tool.id}
                                        description={tool.input.description || tool.input.prompt?.slice(0, 100) || "Subagent task"}
                                        subagentType={tool.input.subagent_type || "general-purpose"}
                                        messages={getSubagentMessages(tool.id)}
                                        isActive={activeSubagents.has(tool.id)}
                                        elapsedTime={activeSubagents.get(tool.id)?.elapsed}
                                        {renderMarkdown}
                                        onMessageClick={handleMessageClick}
                                      />
                                    {:else}
                                      <ToolRenderer {tool} onPreview={openPreview} />
                                    {/if}

                                 {/each}

                             </div>

                        </div>

                   {/if}

                </div>

            {/each}



            {#if $session.sessionId && $loadingSessions.has($session.sessionId)}

                <div class="flex gap-4">

                    <div class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center shadow-sm">

                        <div class="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>

                    </div>

                    <div class="flex items-center gap-1.5 pt-2">

                        <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>

                        <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>

                        <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>

                    </div>

                </div>

            {/if}

        </div>

        </div>



        <!-- Input Area (hidden on project home via CSS) -->
        <div class="absolute bottom-0 left-0 right-0 p-6 pointer-events-none flex justify-center bg-gradient-to-t from-white via-white to-transparent {currentMessages.length === 0 && !$session.sessionId ? 'hidden' : ''}">

            <div class="w-full max-w-3xl pointer-events-auto">

                <div class="relative group bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200 transition-shadow focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-gray-300">

                    <textarea
                        bind:value={inputText}
                        onkeydown={handleKeydown}
                        placeholder={currentSessionLoading ? (queuedCount > 0 ? `${queuedCount} message${queuedCount > 1 ? 's' : ''} queued...` : "Type to queue message...") : "Type a message to Claude..."}
                        disabled={!$isConnected}
                        class="w-full bg-transparent text-gray-900 placeholder-gray-400 border-none rounded-xl pl-4 pr-24 py-3.5 focus:outline-none focus:ring-0 resize-none max-h-48 min-h-[56px] text-[15px] disabled:opacity-50"
                        rows="1"
                    ></textarea>
                    
                    <div class="absolute right-2 bottom-2 flex items-center gap-1">
                      <AudioRecorder 
                        onTranscript={(text) => { inputText = inputText ? inputText + " " + text : text; }}
                        disabled={!$isConnected}
                      />
                      {#if currentSessionLoading}
                        {#if queuedCount > 0}
                          <span class="text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg font-medium">
                            {queuedCount} queued
                          </span>
                        {/if}
                        <button
                            onclick={stopGeneration}
                            class="p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-all"
                            title="Stop generation"
                        >
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
                        </button>
                      {:else}
                        <button
                            onclick={sendMessage}
                            disabled={!$isConnected || !inputText.trim()}
                            class="p-1.5 text-gray-400 bg-transparent rounded-lg hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                        >
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"></path></svg>
                        </button>
                      {/if}
                    </div>

                </div>

                <div class="text-center mt-2">

                    <span class="text-[10px] text-gray-400">Claude can make mistakes. Please verify important information.</span>

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
      class="w-1 bg-transparent hover:bg-blue-500 cursor-col-resize z-30 transition-colors flex flex-col justify-center items-center group relative -mr-[1px]"
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

                <h3 class="font-serif text-2xl text-gray-900">Create New Project</h3>

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
                        <label class="text-xs font-medium text-gray-700">Project Name</label>
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

                        <label class="text-xs font-medium text-gray-700">Project Directory</label>

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

                <button onclick={createProject} class="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-black text-white rounded-lg shadow-sm transition-all active:scale-95">Create Project</button>

            </div>

        </div>

    </div>

  {/if}

  <Modal open={!!editingProject} onClose={() => editingProject = null} title="Edit Project">
    {#snippet children()}
      <div class="space-y-5">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-gray-700">Project Name</label>
          <input 
            type="text" 
            bind:value={editProjectName}
            class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-0 transition-colors"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-gray-700">Project Path</label>
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

  <Modal open={showDeleteConfirm} onClose={() => { showDeleteConfirm = false; projectToDelete = null; }} title="Delete Project">
    {#snippet children()}
      <p class="text-sm text-gray-600">
        Are you sure you want to delete <span class="font-semibold text-gray-900">{projectToDelete?.name}</span>? This will also delete all associated chats and messages. This action cannot be undone.
      </p>
    {/snippet}
    {#snippet footer()}
      <button onclick={() => { showDeleteConfirm = false; projectToDelete = null; }} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
      <button onclick={deleteProject} class="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition-all active:scale-95">Delete Project</button>
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

</div>



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

  :global(.markdown-body a::after) {
    content: " ↗";
    font-size: 0.75em;
    opacity: 0.6;
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
