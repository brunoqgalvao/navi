<script lang="ts">
  import { currentSession as session, isConnected, availableModels, projectStatus, sessionStatus, costStore, showArchivedWorkspaces } from "../../stores";
  import { api, type Project, type Session, type WorkspaceFolder } from "../../api";
  import { getApiBase } from "../../config";
  import ModelSelector from "../ModelSelector.svelte";
  import StarButton from "../StarButton.svelte";
  import TitleSuggestion from "../TitleSuggestion.svelte";
  import RelativeTime from "../RelativeTime.svelte";
  import EditableText from "../EditableText.svelte";
  import type { ChatMessage } from "../../stores";

  interface Props {
    projects: Project[];
    sessions: Session[];
    recentChats: Session[];
    currentProject: Project | null;
    currentMessages: ChatMessage[];
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    modelSelection: string;
    folders: WorkspaceFolder[];
    onSelectProject: (project: Project) => void;
    onSelectSession: (session: Session) => void;
    onCreateNewChat: () => void;
    onGoToChat: (chat: Session) => void;
    onNewProjectModal: () => void;
    onSettings: () => void;
    onSearchModal: () => void;
    onHotkeysHelp: () => void;
    onFeedback: () => void;
    onProjectSettings: () => void;
    onEditProject: (project: Project, e: Event) => void;
    onDeleteProject: (project: Project, e: Event) => void;
    onToggleProjectPin: (project: Project, e: Event) => void;
    onToggleProjectArchive: (project: Project, e: Event) => void;
    onProjectPermissions: (project: Project) => void;
    onEditSession: (session: Session, e: Event) => void;
    onRenameSession: (sessionId: string, newTitle: string) => void;
    onDeleteSession: (e: Event, id: string) => void;
    onDuplicateSession: (session: Session, e: Event) => void;
    onToggleSessionFavorite: (session: Session, e: Event) => void;
    onToggleSessionArchive: (session: Session, e: Event) => void;
    onProjectReorder: (order: string[]) => void;
    onSessionReorder: (order: string[]) => void;
    onModelSelect: (model: string) => void;
    onTitleApply: (title: string) => void;
    onStartResizing: (e: MouseEvent) => void;
    isResizing?: boolean;
    onCollapseToggle: () => void;
    onBackToWorkspaces: () => void;
    onFolderCreate: (name: string) => Promise<WorkspaceFolder>;
    onFolderUpdate: (id: string, name: string) => void;
    onFolderDelete: (id: string) => void;
    onFolderToggleCollapse: (id: string, collapsed: boolean) => void;
    onProjectSetFolder: (projectId: string, folderId: string | null) => void;
    onFolderReorder: (order: string[]) => void;
    onToggleFolderPin: (folder: WorkspaceFolder, e: Event) => void;
    titleSuggestionRef?: TitleSuggestion | null;
  }

  let {
    projects,
    sessions,
    recentChats,
    currentProject,
    currentMessages,
    sidebarCollapsed,
    sidebarWidth,
    modelSelection = $bindable(),
    folders,
    onSelectProject,
    onSelectSession,
    onCreateNewChat,
    onGoToChat,
    onNewProjectModal,
    onSettings,
    onSearchModal,
    onHotkeysHelp,
    onFeedback,
    onProjectSettings,
    onEditProject,
    onDeleteProject,
    onToggleProjectPin,
    onToggleProjectArchive,
    onProjectPermissions,
    onEditSession,
    onRenameSession,
    onDeleteSession,
    onDuplicateSession,
    onToggleSessionFavorite,
    onToggleSessionArchive,
    onProjectReorder,
    onSessionReorder,
    onModelSelect,
    onTitleApply,
    onStartResizing,
    isResizing = false,
    onCollapseToggle,
    onBackToWorkspaces,
    onFolderCreate,
    onFolderUpdate,
    onFolderDelete,
    onFolderToggleCollapse,
    onProjectSetFolder,
    onFolderReorder,
    onToggleFolderPin,
    titleSuggestionRef = $bindable(null),
  }: Props = $props();

  let sidebarSearchQuery = $state("");
  let filteredSessions = $derived(
    (sidebarSearchQuery.trim()
      ? sessions.filter(s => s.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
      : sessions
    ).toSorted((a, b) => {
      // Starred/favorited chats always come first
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return 0;
    })
  );

  let draggedProjectId = $state<string | null>(null);
  let draggedProjectFolderId = $state<string | null>(null);
  let dragOverProjectId = $state<string | null>(null);
  let dragOverFolderId = $state<string | null>(null);
  let isDraggingToRoot = $state(false);
  let draggedSessionId = $state<string | null>(null);
  let dragOverSessionId = $state<string | null>(null);
  let draggedFolderId = $state<string | null>(null);
  let sessionMenuId = $state<string | null>(null);
  let projectMenuId = $state<string | null>(null);
  let folderMenuId = $state<string | null>(null);

  let showNewFolderInput = $state(false);
  let newFolderName = $state("");
  let editingFolderId = $state<string | null>(null);
  let editingFolderName = $state("");
  let showOpenInMenu = $state(false);

  async function openInFinder() {
    if (!currentProject) return;
    try {
      await fetch(`${getApiBase()}/fs/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentProject.path })
      });
    } catch (e) {
      console.error("Failed to open in Finder:", e);
    }
    showOpenInMenu = false;
  }

  async function openInTerminal() {
    if (!currentProject) return;
    try {
      await fetch(`${getApiBase()}/fs/open-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentProject.path, editor: "terminal" })
      });
    } catch (e) {
      console.error("Failed to open terminal:", e);
    }
    showOpenInMenu = false;
  }

  async function openInVSCode() {
    if (!currentProject) return;
    try {
      await fetch(`${getApiBase()}/fs/open-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentProject.path, editor: "code" })
      });
    } catch (e) {
      console.error("Failed to open in VS Code:", e);
    }
    showOpenInMenu = false;
  }

  async function openInCursor() {
    if (!currentProject) return;
    try {
      await fetch(`${getApiBase()}/fs/open-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentProject.path, editor: "cursor" })
      });
    } catch (e) {
      console.error("Failed to open in Cursor:", e);
    }
    showOpenInMenu = false;
  }

  async function copyPath() {
    if (!currentProject) return;
    try {
      await navigator.clipboard.writeText(currentProject.path);
    } catch (e) {
      console.error("Failed to copy path:", e);
    }
    showOpenInMenu = false;
  }

  function handleProjectDragStart(e: DragEvent, proj: Project) {
    draggedProjectId = proj.id;
    draggedProjectFolderId = proj.folder_id || null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", proj.id);
      e.dataTransfer.setData("type", "project");
    }
  }

  function handleProjectDragOver(e: DragEvent, projId: string) {
    e.preventDefault();
    if (draggedProjectId && draggedProjectId !== projId) {
      dragOverProjectId = projId;
    }
  }

  function handleFolderDragOver(e: DragEvent, folderId: string) {
    e.preventDefault();
    if (draggedProjectId) {
      dragOverFolderId = folderId;
    }
  }

  function handleProjectDragLeave(e: DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
      dragOverProjectId = null;
    }
  }

  function handleFolderDragLeave(e: DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
      dragOverFolderId = null;
    }
  }

  function handleRootDragOver(e: DragEvent) {
    e.preventDefault();
    if (draggedProjectId && draggedProjectFolderId !== null) {
      isDraggingToRoot = true;
    }
  }

  function handleRootDragLeave(e: DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
      isDraggingToRoot = false;
    }
  }

  function handleRootDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (draggedProjectId && draggedProjectFolderId !== null) {
      onProjectSetFolder(draggedProjectId, null);
    }
    resetDragState();
  }

  async function handleProjectDrop(e: DragEvent, targetProj: Project) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedProjectId || draggedProjectId === targetProj.id) {
      resetDragState();
      return;
    }

    const draggedProj = projects.find(p => p.id === draggedProjectId);
    if (!draggedProj) {
      resetDragState();
      return;
    }

    const sameFolderOrBothRoot = (draggedProj.folder_id || null) === (targetProj.folder_id || null);
    
    if (sameFolderOrBothRoot) {
      const relevantProjects = projects.filter(p => (p.folder_id || null) === (targetProj.folder_id || null));
      const draggedIndex = relevantProjects.findIndex(p => p.id === draggedProjectId);
      const targetIndex = relevantProjects.findIndex(p => p.id === targetProj.id);

      if (draggedIndex === -1 || targetIndex === -1) {
        resetDragState();
        return;
      }

      const newRelevant = [...relevantProjects];
      const [removed] = newRelevant.splice(draggedIndex, 1);
      newRelevant.splice(targetIndex, 0, removed);
      
      const otherProjects = projects.filter(p => (p.folder_id || null) !== (targetProj.folder_id || null));
      const allProjects = [...otherProjects, ...newRelevant];
      onProjectReorder(allProjects.map(p => p.id));
    } else {
      onProjectSetFolder(draggedProjectId, targetProj.folder_id || null);
    }
    resetDragState();
  }

  async function handleFolderDrop(e: DragEvent, folderId: string | null) {
    e.preventDefault();
    if (draggedProjectId) {
      onProjectSetFolder(draggedProjectId, folderId);
    }
    resetDragState();
  }

  function handleProjectDragEnd() {
    resetDragState();
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
    if (!draggedSessionId || draggedSessionId === targetSess.id) {
      resetDragState();
      return;
    }

    const draggedIndex = sessions.findIndex(s => s.id === draggedSessionId);
    const targetIndex = sessions.findIndex(s => s.id === targetSess.id);

    if (draggedIndex === -1 || targetIndex === -1) {
      resetDragState();
      return;
    }

    const newSessions = [...sessions];
    const [removed] = newSessions.splice(draggedIndex, 1);
    newSessions.splice(targetIndex, 0, removed);
    onSessionReorder(newSessions.map(s => s.id));
    resetDragState();
  }

  function handleSessionDragEnd() {
    resetDragState();
  }

  function resetDragState() {
    draggedProjectId = null;
    draggedProjectFolderId = null;
    dragOverProjectId = null;
    dragOverFolderId = null;
    isDraggingToRoot = false;
    draggedSessionId = null;
    dragOverSessionId = null;
    draggedFolderId = null;
    dragOverFolderForReorder = null;
  }

  // Folder drag for reordering
  let dragOverFolderForReorder = $state<string | null>(null);

  function handleFolderDragStart(e: DragEvent, folder: WorkspaceFolder) {
    if (folder.pinned) return;
    draggedFolderId = folder.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", folder.id);
      e.dataTransfer.setData("type", "folder");
    }
  }

  function handleFolderReorderDragOver(e: DragEvent, targetFolderId: string) {
    e.preventDefault();
    if (draggedFolderId && draggedFolderId !== targetFolderId) {
      dragOverFolderForReorder = targetFolderId;
    }
  }

  function handleFolderReorderDragLeave(e: DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
      dragOverFolderForReorder = null;
    }
  }

  function handleFolderReorderDrop(e: DragEvent, targetFolder: WorkspaceFolder) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedFolderId || draggedFolderId === targetFolder.id) {
      resetDragState();
      return;
    }

    const draggedIndex = folders.findIndex(f => f.id === draggedFolderId);
    const targetIndex = folders.findIndex(f => f.id === targetFolder.id);

    if (draggedIndex === -1 || targetIndex === -1) {
      resetDragState();
      return;
    }

    const newFolders = [...folders];
    const [removed] = newFolders.splice(draggedIndex, 1);
    newFolders.splice(targetIndex, 0, removed);
    onFolderReorder(newFolders.map(f => f.id));
    resetDragState();
  }

  function handleFolderDragEnd() {
    resetDragState();
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    await onFolderCreate(newFolderName.trim());
    newFolderName = "";
    showNewFolderInput = false;
  }

  async function saveEditingFolder() {
    if (!editingFolderId || !editingFolderName.trim()) return;
    onFolderUpdate(editingFolderId, editingFolderName.trim());
    editingFolderId = null;
    editingFolderName = "";
  }

  function startEditFolder(folder: WorkspaceFolder, e: Event) {
    e.stopPropagation();
    editingFolderId = folder.id;
    editingFolderName = folder.name;
    folderMenuId = null;
  }

  function getProjectsInFolder(folderId: string | null): Project[] {
    return projects.filter(p => (p.folder_id || null) === folderId);
  }

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

  function handleGlobalClick() {
    sessionMenuId = null;
    projectMenuId = null;
    folderMenuId = null;
    showOpenInMenu = false;
  }
</script>

<svelte:document onclick={handleGlobalClick} />

<aside style={sidebarCollapsed ? 'width: 56px' : `width: ${sidebarWidth}px`} class="bg-gray-50/50 border-r border-gray-200 flex flex-col hidden md:flex shrink-0 relative">
  {#if !sidebarCollapsed}
    <div 
      class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-gray-400/50 transition-colors z-10 {isResizing ? 'bg-gray-400' : ''}"
      onmousedown={onStartResizing}
    ></div>
  {/if}

  <div class="h-14 px-2 border-b border-gray-100 flex items-center justify-between">
    {#if sidebarCollapsed}
      <button onclick={onCollapseToggle} class="w-10 h-10 mx-auto flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all" title="Expand sidebar">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
      </button>
    {:else}
      <button onclick={onBackToWorkspaces} class="flex items-center gap-2.5 px-2 hover:opacity-70 transition-opacity">
        <img src="/logo.png" alt="Logo" class="w-6 h-6" />
        <span class="font-medium text-sm tracking-tight text-gray-900">Navi</span>
      </button>
      <div class="flex items-center gap-0.5">
        {#if currentProject}
          <button onclick={onCreateNewChat} class="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all duration-200" title="New Chat">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
          </button>
        {/if}
        <button onclick={onCollapseToggle} class="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all duration-200" title="Collapse sidebar">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
        </button>
      </div>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto min-h-0 flex flex-col py-2">
    {#if sidebarCollapsed}
      <div class="flex flex-col items-center gap-1 px-2">
        <button onclick={onCollapseToggle} class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all" title="Workspaces">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
        </button>
        {#if currentProject}
          <button onclick={onCreateNewChat} class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-200/50 rounded transition-all" title="New chat">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
          </button>
        {/if}
      </div>
    {:else if !currentProject}
      <div class="px-3" data-tour="workspaces">
        <div class="flex items-center justify-between mb-2 mt-2 px-2">
          <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Workspaces</h3>
          <div class="flex items-center gap-1">
            <button onclick={() => showNewFolderInput = true} class="text-[10px] font-medium text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded transition-colors" title="New folder">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
            </button>
            <button onclick={onNewProjectModal} class="text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded transition-colors border border-gray-200" data-tour="new-workspace">
              + New
            </button>
          </div>
        </div>

        {#if showNewFolderInput}
          <div class="mb-2 px-2">
            <div class="flex items-center gap-1">
              <input
                type="text"
                bind:value={newFolderName}
                placeholder="Folder name..."
                class="flex-1 text-xs px-2 py-1 bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
                onkeydown={(e) => e.key === 'Enter' && createFolder()}
              />
              <button onclick={createFolder} class="p-1 text-gray-600 hover:text-gray-900">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              </button>
              <button onclick={() => { showNewFolderInput = false; newFolderName = ""; }} class="p-1 text-gray-400 hover:text-gray-600">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          </div>
        {/if}

        {#if projects.length === 0 && folders.length === 0}
          <div class="text-xs text-gray-400 italic text-center py-4">No workspaces yet</div>
        {:else}
          <div class="space-y-1">
            {#each folders as folder}
              {@const folderPinned = !!folder.pinned}
              {@const isDragOverForReorder = dragOverFolderForReorder === folder.id}
              {@const isDragging = draggedFolderId === folder.id}
              <div
                class="group relative {isDragOverForReorder ? 'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-blue-400' : ''} {isDragging ? 'opacity-50' : ''}"
                draggable={!folderPinned}
                ondragstart={(e) => handleFolderDragStart(e, folder)}
                ondragend={handleFolderDragEnd}
              >
                <div
                  class="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-100 cursor-pointer {dragOverFolderId === folder.id ? 'bg-gray-100 border border-gray-300' : ''} {!folderPinned ? 'cursor-grab active:cursor-grabbing' : ''}"
                  ondragover={(e) => { handleFolderDragOver(e, folder.id); handleFolderReorderDragOver(e, folder.id); }}
                  ondragleave={(e) => { handleFolderDragLeave(e); handleFolderReorderDragLeave(e); }}
                  ondrop={(e) => { handleFolderDrop(e, folder.id); handleFolderReorderDrop(e, folder); }}
                  onclick={() => editingFolderId !== folder.id && onFolderToggleCollapse(folder.id, !folder.collapsed)}
                >
                  <div class="p-0.5 text-gray-400">
                    <svg class="w-3 h-3 transition-transform {folder.collapsed ? '' : 'rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                  </div>
                  {#if editingFolderId === folder.id}
                    <input
                      type="text"
                      bind:value={editingFolderName}
                      class="flex-1 text-xs px-1 py-0.5 bg-white border border-gray-300 rounded focus:outline-none"
                      onkeydown={(e) => e.key === 'Enter' && saveEditingFolder()}
                      onblur={saveEditingFolder}
                      onclick={(e) => e.stopPropagation()}
                    />
                  {:else}
                    <span class="flex-1 text-[12px] font-medium text-gray-600 truncate">{folder.name}</span>
                  {/if}
                  <span class="text-[10px] text-gray-400">{getProjectsInFolder(folder.id).length}</span>
                  <StarButton active={folderPinned} onclick={(e) => onToggleFolderPin(folder, e)} size="sm" />
                  <div class="relative">
                    <button
                      onclick={(e) => { e.stopPropagation(); folderMenuId = folderMenuId === folder.id ? null : folder.id; }}
                      class="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
                    </button>
                    {#if folderMenuId === folder.id}
                      <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px] z-50">
                        <button onclick={(e) => startEditFolder(folder, e)} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                          Rename
                        </button>
                        <button onclick={(e) => { e.stopPropagation(); onFolderDelete(folder.id); folderMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          Delete
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
                {#if !folder.collapsed}
                  <div class="ml-4 space-y-0.5">
                    {#each getProjectsInFolder(folder.id) as proj}
                      <div 
                        class="group/proj relative {dragOverProjectId === proj.id && !proj.pinned ? 'border-t-2 border-gray-400' : ''} {draggedProjectId === proj.id ? 'opacity-50' : ''}"
                        role="listitem"
                        draggable={!proj.pinned}
                        ondragstart={(e) => !proj.pinned && handleProjectDragStart(e, proj)}
                        ondragover={(e) => !proj.pinned && handleProjectDragOver(e, proj.id)}
                        ondragleave={(e) => handleProjectDragLeave(e)}
                        ondrop={(e) => !proj.pinned && handleProjectDrop(e, proj)}
                        ondragend={handleProjectDragEnd}
                      >
                        <button 
                          onclick={() => onSelectProject(proj)}
                          class="w-full text-left px-2.5 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all sidebar-item-glow {proj.pinned ? '' : 'cursor-grab active:cursor-grabbing'}"
                        >
                          <div class="flex items-center gap-2">
                            <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                            <span class="text-[12px] font-medium truncate {proj.archived ? 'text-gray-400' : ''}">{proj.name}</span>
                            {#if proj.archived}
                              <span class="shrink-0 text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Archived</span>
                            {:else if $projectStatus.get(proj.id) === "attention"}
                              <span class="shrink-0 w-2 h-2 bg-purple-500 rounded-full animate-pulse" title="Needs attention"></span>
                            {:else if $projectStatus.get(proj.id) === "active"}
                              <span class="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full" title="Active"></span>
                            {/if}
                          </div>
                        </button>
                        <div class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-20">
                          <StarButton active={!!proj.pinned} onclick={(e) => onToggleProjectPin(proj, e)} size="sm" />
                          <button 
                            onclick={(e) => { e.stopPropagation(); onProjectSetFolder(proj.id, null); }}
                            class="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover/proj:opacity-100 transition-opacity"
                            title="Remove from folder"
                          >
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}

            {#if draggedProjectId && draggedProjectFolderId !== null}
              <div 
                class="mt-2 pt-2 border-t border-gray-100 {isDraggingToRoot ? 'bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg' : ''}"
                ondragover={handleRootDragOver}
                ondragleave={handleRootDragLeave}
                ondrop={handleRootDrop}
              >
                <div class="text-[10px] text-gray-400 text-center py-2">Drop here to remove from folder</div>
              </div>
            {/if}

            <div class="{folders.length > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}">
              {#each getProjectsInFolder(null) as proj}
                <div 
                  class="group relative {dragOverProjectId === proj.id && !proj.pinned ? 'border-t-2 border-gray-400' : ''} {draggedProjectId === proj.id ? 'opacity-50' : ''}"
                  role="listitem"
                  draggable={!proj.pinned}
                  ondragstart={(e) => !proj.pinned && handleProjectDragStart(e, proj)}
                  ondragover={(e) => !proj.pinned && handleProjectDragOver(e, proj.id)}
                  ondragleave={(e) => handleProjectDragLeave(e)}
                  ondrop={(e) => !proj.pinned && handleProjectDrop(e, proj)}
                  ondragend={handleProjectDragEnd}
                >
                  <button 
                    onclick={() => onSelectProject(proj)}
                    class="w-full text-left px-2.5 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all sidebar-item-glow {proj.pinned ? '' : 'cursor-grab active:cursor-grabbing'}"
                  >
                    <div class="flex items-center gap-2">
                      <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                      <span class="text-[13px] font-medium truncate {proj.archived ? 'text-gray-400' : ''}">{proj.name}</span>
                      {#if proj.archived}
                        <span class="shrink-0 text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded" title="Archived">Archived</span>
                      {:else if $projectStatus.get(proj.id) === "attention"}
                        <span class="shrink-0 w-2 h-2 bg-purple-500 rounded-full animate-pulse" title="Needs attention"></span>
                      {:else if $projectStatus.get(proj.id) === "active"}
                        <span class="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full" title="Active"></span>
                      {/if}
                    </div>
                  </button>
                  <div class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-20">
                    <StarButton active={!!proj.pinned} onclick={(e) => onToggleProjectPin(proj, e)} size="sm" />
                    <div class="relative">
                      <button 
                        onclick={(e) => { e.stopPropagation(); projectMenuId = projectMenuId === proj.id ? null : proj.id; }}
                        class="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        data-tour="project-menu"
                      >
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
                      </button>
                      {#if projectMenuId === proj.id}
                        <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] z-50">
                          <button onclick={(e) => { onEditProject(proj, e); projectMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            Rename
                          </button>
                          {#if folders.length > 0}
                            <div class="border-t border-gray-100 my-1"></div>
                            <div class="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase">Move to folder</div>
                            {#each folders as folder}
                              <button onclick={(e) => { e.stopPropagation(); onProjectSetFolder(proj.id, folder.id); projectMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                                {folder.name}
                              </button>
                            {/each}
                            <div class="border-t border-gray-100 my-1"></div>
                          {/if}
                          <button onclick={(e) => { e.stopPropagation(); onProjectPermissions(proj); projectMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                            Permissions
                          </button>
                          <button onclick={(e) => { onToggleProjectArchive(proj, e); projectMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                            {proj.archived ? 'Unarchive' : 'Archive'}
                          </button>
                          <div class="border-t border-gray-100 my-1"></div>
                          <button onclick={(e) => { onDeleteProject(proj, e); projectMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            Delete
                          </button>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if recentChats.length > 0}
          <div class="mt-4">
            <h3 class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">Recent Chats</h3>
            <div class="space-y-0">
              {#each recentChats.slice(0, 5) as chat}
                <button onclick={() => onGoToChat(chat)} class="w-full text-left px-2 py-1 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors flex items-center gap-1.5">
                  <svg class="w-2.5 h-2.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                  <span class="text-[11px] truncate flex-1">{chat.title}</span>
                  {#if $sessionStatus.get(chat.id)?.status === "running"}
                    <svg class="w-3.5 h-3.5 text-gray-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  {:else if $sessionStatus.get(chat.id)?.status === "permission"}
                    <span class="w-2 h-2 bg-[#D97706] rounded-full animate-pulse shrink-0" title="Permission required"></span>
                  {:else if $sessionStatus.get(chat.id)?.status === "unread"}
                    <span class="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" title="New results"></span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="px-3 flex-1 flex flex-col min-h-0 overflow-hidden">
        <button onclick={onBackToWorkspaces} class="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800 mb-4 px-1 py-1 -ml-1 transition-colors">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7"></path></svg>
          Back to Workspaces
        </button>

        <div class="mb-6 flex items-start gap-2 min-w-0">
          <button onclick={() => onSelectSession(sessions[0] || {} as Session)} class="flex-1 min-w-0 px-1 text-left hover:bg-gray-100 rounded-lg py-2 -my-2 transition-colors group">
            <h2 class="text-sm font-semibold text-gray-900 truncate flex items-center gap-2 group-hover:text-gray-700">
              <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
              <span class="truncate">{currentProject.name}</span>
            </h2>
            <p class="text-[11px] text-gray-400 truncate mt-0.5 pl-6 max-w-full" title={currentProject.path}>{currentProject.path}</p>
          </button>
          <div class="relative">
            <button
              onclick={(e) => { e.stopPropagation(); showOpenInMenu = !showOpenInMenu; }}
              class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-0.5"
              title="Open in..."
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </button>
            {#if showOpenInMenu}
              <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] z-50">
                <button onclick={openInFinder} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                  Finder
                </button>
                <button onclick={openInTerminal} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  Terminal
                </button>
                <button onclick={openInVSCode} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.583 2.207L11.1 7.896 5.98 3.652 4 4.613v14.774l1.98.961 5.12-4.244 6.483 5.689L22 19.958V4.042l-4.417-1.835zm-.417 14.438l-4.583-4.02 4.583-4.019v8.039zM5.98 15.792V8.208L10.563 12 5.98 15.792z"/></svg>
                  VS Code
                </button>
                <button onclick={openInCursor} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  Cursor
                </button>
                <div class="border-t border-gray-100 my-1"></div>
                <button onclick={copyPath} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                  Copy Path
                </button>
              </div>
            {/if}
          </div>
          <button onclick={onProjectSettings} class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-0.5" title="Project Settings">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
        </div>

        <div class="flex items-center justify-between mb-2 px-1">
          <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Chats</h3>
          <div class="flex items-center gap-1">
            <button
              onclick={() => showArchivedWorkspaces.toggle()}
              class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors {$showArchivedWorkspaces ? 'bg-gray-200 text-gray-600' : ''}"
              title={$showArchivedWorkspaces ? 'Hide archived' : 'Show archived'}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
            </button>
            <button onclick={onCreateNewChat} class="text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 rounded transition-colors border border-gray-200">+ New</button>
          </div>
        </div>

        <div class="mb-2 px-1">
          <div class="relative">
            <svg class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              bind:value={sidebarSearchQuery}
              placeholder="Filter chats..."
              class="w-full text-xs pl-7 pr-2 py-1.5 bg-gray-100 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-400"
            />
            {#if sidebarSearchQuery}
              <button onclick={() => sidebarSearchQuery = ""} class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            {/if}
          </div>
        </div>

        <div class="flex-1 overflow-y-auto space-y-0.5">
          {#if sessions.length === 0}
            <div class="text-xs text-gray-400 italic text-center py-8">No chats yet</div>
          {:else if filteredSessions.length === 0}
            <div class="text-xs text-gray-400 italic text-center py-4">No matching chats</div>
          {:else}
            {#each filteredSessions as sess}
              <div 
                data-session-item={sess.id}
                class="group relative {dragOverSessionId === sess.id && !sess.pinned ? 'border-t-2 border-gray-400' : ''} {draggedSessionId === sess.id ? 'opacity-50' : ''}"
                role="listitem"
                draggable={!sess.pinned}
                ondragstart={(e) => !sess.pinned && handleSessionDragStart(e, sess)}
                ondragover={(e) => !sess.pinned && handleSessionDragOver(e, sess.id)}
                ondragleave={handleSessionDragLeave}
                ondrop={(e) => !sess.pinned && handleSessionDrop(e, sess)}
                ondragend={handleSessionDragEnd}
              >
                <button 
                  onclick={() => onSelectSession(sess)}
                  class={`w-full text-left px-2.5 py-2 rounded-lg text-[13px] transition-all border sidebar-item-glow ${sess.pinned ? '' : 'cursor-grab active:cursor-grabbing'} ${$session.sessionId === sess.id ? 'bg-white border-gray-200 shadow-sm text-gray-900 z-10 relative' : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                >
                  <div class="truncate pr-20 font-medium flex items-center gap-1.5">
                    <EditableText
                        value={sess.title}
                        onSave={(newTitle) => onRenameSession(sess.id, newTitle)}
                        class="truncate {sess.archived ? 'text-gray-400' : ''}"
                        inputClass="w-full text-[13px]"
                      />
                    {#if sess.archived}
                      <span class="shrink-0 text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Archived</span>
                    {/if}
                    {#if $session.sessionId === sess.id}
                      <TitleSuggestion
                        bind:this={titleSuggestionRef}
                        sessionId={$session.sessionId}
                        currentTitle={sess.title}
                        messages={currentMessages}
                        onApply={onTitleApply}
                      />
                    {/if}
                  </div>
                  <div class="text-[10px] opacity-60 mt-0.5 flex justify-between">
                    <RelativeTime timestamp={sess.updated_at} />
                  </div>
                </button>

                <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 {sessionMenuId === sess.id ? 'z-[70]' : 'z-20'}">
                  {#if $sessionStatus.get(sess.id)?.status === "running"}
                    <svg class="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  {:else if $sessionStatus.get(sess.id)?.status === "permission"}
                    <span class="w-2.5 h-2.5 bg-[#D97706] rounded-full animate-pulse" title="Permission required"></span>
                  {:else if $sessionStatus.get(sess.id)?.status === "unread"}
                    <span class="w-2 h-2 bg-gray-400 rounded-full" title="New results"></span>
                  {/if}
                  
                  <StarButton active={!!sess.favorite} onclick={(e) => onToggleSessionFavorite(sess, e)} />

                  <div class="relative">
                    <button 
                      onclick={(e) => { e.stopPropagation(); sessionMenuId = sessionMenuId === sess.id ? null : sess.id; }}
                      class="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
                    </button>
                    {#if sessionMenuId === sess.id}
                      <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] z-[60]">
                        <button onclick={(e) => { onEditSession(sess, e); sessionMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                          Rename
                        </button>
                        <button onclick={(e) => { onDuplicateSession(sess, e); sessionMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                          Duplicate
                        </button>
                        {#if $session.sessionId === sess.id && titleSuggestionRef}
                          <button onclick={(e) => { e.stopPropagation(); sessionMenuId = null; titleSuggestionRef?.triggerSuggestion(); }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                            Suggest title
                          </button>
                        {/if}
                        <button onclick={(e) => { onToggleSessionArchive(sess, e); sessionMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                          {sess.archived ? 'Unarchive' : 'Archive'}
                        </button>
                        <button onclick={(e) => { onDeleteSession(e, sess.id); sessionMenuId = null; }} class="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          Delete
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class={`${sidebarCollapsed ? 'px-2' : 'px-4'} py-3 border-t border-gray-200 bg-gray-50/50 space-y-2`}>
    {#if $session.sessionId && !sidebarCollapsed}
      <ModelSelector 
        models={$availableModels} 
        bind:selectedModel={modelSelection}
        onSelect={onModelSelect}
      />
    {/if}

    {#if $session.inputTokens > 0 && !sidebarCollapsed}
      {@const contextWindow = currentProject?.context_window || 200000}
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
        <button onclick={onSearchModal} class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Search (Cmd+K)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </button>
        <button onclick={onHotkeysHelp} class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Keyboard shortcuts (?)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </button>
        <button onclick={onFeedback} class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Send Feedback">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
        </button>
        <button onclick={onSettings} class="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Settings">
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
          {#if $session.sessionId && $session.costUsd > 0}
            <span class="text-gray-600 font-mono bg-gray-200/50 px-1.5 py-0.5 rounded border border-gray-200" title="Session cost">${$session.costUsd.toFixed(4)}</span>
          {:else if $session.projectId}
            {@const projectCost = $costStore.projectCosts.get($session.projectId)}
            {#if projectCost}
              <button 
                onclick={() => costStore.setViewMode($costStore.viewMode === 'ever' ? 'today' : 'ever')}
                class="text-gray-600 font-mono bg-gray-200/50 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-300/50 transition-colors"
                title="Project cost ({$costStore.viewMode === 'ever' ? 'all time' : 'today'}) - click to toggle"
              >
                ${($costStore.viewMode === 'ever' ? projectCost.ever : projectCost.today).toFixed(4)}
              </button>
            {/if}
          {:else if $costStore.totalEver > 0}
            <button 
              onclick={() => costStore.setViewMode($costStore.viewMode === 'ever' ? 'today' : 'ever')}
              class="text-gray-600 font-mono bg-gray-200/50 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-300/50 transition-colors"
              title="Total cost ({$costStore.viewMode === 'ever' ? 'all time' : 'today'}) - click to toggle"
            >
              ${($costStore.viewMode === 'ever' ? $costStore.totalEver : $costStore.totalToday).toFixed(4)}
            </button>
          {/if}
          <button onclick={onSearchModal} class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Search (Cmd+K)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </button>
          <button onclick={onHotkeysHelp} class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Keyboard shortcuts (?)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>
          <button onclick={onFeedback} class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Send Feedback">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
          </button>
          <button onclick={onSettings} class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Settings" data-tour="settings">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
        </div>
      </div>
    {/if}
  </div>
</aside>
