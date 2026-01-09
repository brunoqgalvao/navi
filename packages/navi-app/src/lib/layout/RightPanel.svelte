<script lang="ts">
  /**
   * RightPanel - Layout component for the right side panel
   *
   * Pure layout concerns:
   * - Panel tabs (Files+Preview, Browser, Git, Terminal, Kanban)
   * - Resize handle
   * - Content switching
   * - Split view for Files + Preview (collapsible file list)
   *
   * Delegates workspace logic to WorkspacePanel
   */
  import FileBrowser from "../FileBrowser.svelte";
  import Preview from "../Preview.svelte";
  import { GitPanel } from "../features/git";
  import { KanbanPanel } from "../features/kanban";
  import WorkspacePanel from "../components/WorkspacePanel.svelte";
  import BackgroundProcessPanel from "../components/BackgroundProcessPanel.svelte";
  import PreviewPanel from "../components/PreviewPanel.svelte";
  import { ExtensionTabs, ExtensionSettingsModal } from "../features/extensions";

  type PanelMode = "files" | "preview" | "browser" | "git" | "terminal" | "processes" | "kanban" | "preview-unified";

  interface Props {
    mode: PanelMode;
    width: number;
    projectId: string | null;
    sessionId: string | null;
    projectPath: string | null;
    worktreePath?: string | null;  // Use this for git operations when in a worktree
    worktreeBranch?: string | null;  // Current branch for container preview
    previewSource: string | null;
    containerPreviewUrl?: string | null;  // URL for container preview
    browserUrl: string;
    isResizing: boolean;
    terminalInitialCommand?: string;
    onModeChange: (mode: PanelMode) => void;
    onClose: () => void;
    onStartResize: (e: MouseEvent) => void;
    onFileSelect: (path: string) => void;
    onBrowserUrlChange: (url: string) => void;
    onTerminalRef?: (ref: { pasteCommand: (cmd: string) => void; runCommand: (cmd: string) => void } | null) => void;
    onTerminalSendToClaude?: (context: string) => void;
    onNavigateToSession?: (sessionId: string, prompt?: string) => void;
    /** Callback when preview panel wants to ask Claude for help */
    onPreviewAskClaude?: (message: string) => void;
  }

  let {
    mode,
    width,
    projectId,
    sessionId,
    projectPath,
    worktreePath = null,
    worktreeBranch = null,
    previewSource,
    containerPreviewUrl = null,
    browserUrl,
    isResizing,
    terminalInitialCommand = "",
    onModeChange,
    onClose,
    onStartResize,
    onFileSelect,
    onBrowserUrlChange,
    onTerminalRef,
    onTerminalSendToClaude,
    onNavigateToSession,
    onPreviewAskClaude,
  }: Props = $props();

  // Use worktree path for git if available, otherwise use project path
  let effectiveGitPath = $derived(worktreePath || projectPath);

  // Extension settings modal
  let showExtensionSettings = $state(false);

  // File list resizable width and collapse state
  const MIN_FILE_LIST_WIDTH = 180;
  const MAX_FILE_LIST_WIDTH = 500;
  const DEFAULT_FILE_LIST_WIDTH = 280;
  let fileListWidth = $state(DEFAULT_FILE_LIST_WIDTH);
  let fileListCollapsed = $state(false);
  let isResizingFileList = $state(false);

  // Handle initial command for terminal - use $state so $effect reacts to changes
  let terminalRef = $state<{ pasteCommand: (cmd: string) => void; runCommand: (cmd: string) => void } | null>(null);

  function handleTerminalRef(ref: typeof terminalRef) {
    terminalRef = ref;
    onTerminalRef?.(ref);
  }

  $effect(() => {
    if (terminalInitialCommand && mode === "terminal" && terminalRef) {
      terminalRef.runCommand(terminalInitialCommand);
    }
  });

  // Show split view when in files or preview mode
  let showSplitView = $derived(mode === "files" || mode === "preview");

  // File list resize handling
  const COLLAPSE_THRESHOLD = 40; // Collapse immediately if dragged below this width

  function startFileListResize(e: MouseEvent) {
    e.preventDefault();
    isResizingFileList = true;

    const startX = e.clientX;
    const startWidth = fileListWidth;

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      const rawWidth = startWidth + delta;

      // Collapse immediately if dragged below threshold
      if (rawWidth < COLLAPSE_THRESHOLD) {
        fileListCollapsed = true;
        fileListWidth = DEFAULT_FILE_LIST_WIDTH; // Reset for when expanded again
        isResizingFileList = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      } else {
        fileListWidth = Math.min(MAX_FILE_LIST_WIDTH, Math.max(MIN_FILE_LIST_WIDTH, rawWidth));
      }
    }

    function onMouseUp() {
      isResizingFileList = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }
</script>

<!-- Resizer Handle -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="w-1 bg-transparent hover:bg-gray-400 dark:hover:bg-gray-600 cursor-col-resize z-30 transition-colors flex flex-col justify-center items-center group relative -mr-[1px] {isResizing ? 'bg-gray-400 dark:bg-gray-600' : ''}"
  onmousedown={onStartResize}
>
  <div class="w-[1px] h-full bg-gray-200 dark:bg-gray-700 group-hover:bg-transparent"></div>
</div>

<div style="width: {width}px" class="flex flex-col border-l border-gray-200 dark:border-gray-700 min-w-[400px]">
  <!-- Panel Header with Extension Tabs -->
  <div class="h-10 px-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-1 bg-gray-50/50 dark:bg-gray-800 shrink-0">
    <ExtensionTabs
      {projectId}
      currentMode={mode}
      onModeChange={(m) => onModeChange(m as PanelMode)}
      onOpenSettings={() => showExtensionSettings = true}
    />
    <button onclick={onClose} class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0" title="Close">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
  </div>

  <!-- Extension Settings Modal -->
  {#if projectId}
    <ExtensionSettingsModal
      open={showExtensionSettings}
      onClose={() => showExtensionSettings = false}
      {projectId}
    />
  {/if}

  <!-- Panel Content -->
  <div class="flex-1 overflow-hidden flex flex-col relative">
    {#if showSplitView && projectPath}
      <!-- Split view for Files + Preview -->
      <div class="flex-1 flex overflow-hidden relative">
        <!-- File list (full width when no preview, resizable when preview open, collapsible) -->
        <div
          class="flex flex-col bg-white dark:bg-gray-900 shrink-0 overflow-hidden transition-all duration-200 {previewSource && !fileListCollapsed ? 'border-r border-gray-200 dark:border-gray-700' : ''}"
          style="width: {fileListCollapsed ? '0px' : (previewSource ? `${fileListWidth}px` : '100%')}"
        >
          {#if !fileListCollapsed}
            <FileBrowser rootPath={projectPath} onPreview={onFileSelect} />
          {/if}
        </div>

        {#if previewSource}
          <!-- Collapse/expand toggle button -->
          <button
            onclick={() => fileListCollapsed = !fileListCollapsed}
            class="absolute top-1/2 -translate-y-1/2 z-30 w-5 h-10 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-r flex items-center justify-center transition-all duration-200 shadow-sm"
            style="left: {fileListCollapsed ? '0px' : `${fileListWidth}px`}"
            title={fileListCollapsed ? 'Show file list' : 'Hide file list'}
          >
            <svg
              class="w-3 h-3 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              style="transform: rotate({fileListCollapsed ? '0deg' : '180deg'})"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>

          {#if !fileListCollapsed}
            <!-- Resize handle for file list -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="w-1 bg-transparent hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize z-20 transition-colors flex-shrink-0 {isResizingFileList ? 'bg-blue-400 dark:bg-blue-500' : ''}"
              onmousedown={startFileListResize}
            ></div>
          {/if}

          <!-- Preview area -->
          <div class="flex-1 flex flex-col overflow-hidden min-w-[200px]">
            <Preview source={previewSource} />
          </div>
        {/if}
      </div>
    {:else if mode === "browser"}
      <!-- Browser panel - full width -->
      <div class="flex-1 flex flex-col w-full">
        <WorkspacePanel
          mode="browser"
          {projectId}
          {projectPath}
          {browserUrl}
          onBrowserUrlChange={onBrowserUrlChange}
          {isResizing}
        />
      </div>
    {:else if mode === "git" && effectiveGitPath}
      <!-- Git panel - full width -->
      <div class="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
        <GitPanel rootPath={effectiveGitPath} />
      </div>
    {:else if mode === "terminal"}
      <!-- Terminal panel - full width -->
      <div class="flex-1 flex flex-col w-full">
        <WorkspacePanel
          mode="terminal"
          {projectId}
          {projectPath}
          onTerminalRef={handleTerminalRef}
          onTerminalSendToClaude={onTerminalSendToClaude}
        />
      </div>
    {:else if mode === "processes"}
      <!-- Processes panel - full width -->
      <div class="flex-1 flex flex-col w-full overflow-hidden">
        <BackgroundProcessPanel
          {projectId}
          {sessionId}
          onOpenPreview={(url) => {
            onBrowserUrlChange(url);
            onModeChange("browser");
          }}
        />
      </div>
    {:else if mode === "kanban" && projectId}
      <!-- Kanban panel - full width -->
      <div class="flex-1 flex flex-col w-full overflow-hidden">
        <KanbanPanel
          {projectId}
          {onNavigateToSession}
        />
      </div>
    {:else if mode === "preview-unified"}
      <!-- Unified Preview panel - full width -->
      <div class="flex-1 flex flex-col w-full overflow-hidden">
        <PreviewPanel
          {projectId}
          {sessionId}
          branch={worktreeBranch}
          previewUrl={containerPreviewUrl}
          onAskClaude={onPreviewAskClaude}
        />
      </div>
    {/if}
  </div>
</div>
