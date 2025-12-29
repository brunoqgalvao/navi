<script lang="ts">
  /**
   * RightPanel - Layout component for the right side panel
   *
   * Pure layout concerns:
   * - Panel tabs (Files+Preview, Browser, Git, Terminal)
   * - Resize handle
   * - Content switching
   * - Split view for Files + Preview (collapsible file list)
   *
   * Delegates workspace logic to WorkspacePanel
   */
  import FileBrowser from "../FileBrowser.svelte";
  import Preview from "../Preview.svelte";
  import { GitPanel } from "../features/git";
  import WorkspacePanel from "../components/WorkspacePanel.svelte";

  type PanelMode = "files" | "preview" | "browser" | "git" | "terminal";

  interface Props {
    mode: PanelMode;
    width: number;
    projectId: string | null;
    projectPath: string | null;
    previewSource: string | null;
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
  }

  let {
    mode,
    width,
    projectId,
    projectPath,
    previewSource,
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
  }: Props = $props();

  // File list collapsed state for split view
  let fileListCollapsed = $state(false);
  const FILE_LIST_WIDTH = 240;

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
</script>

<!-- Resizer Handle -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="w-1 bg-transparent hover:bg-gray-400 cursor-col-resize z-30 transition-colors flex flex-col justify-center items-center group relative -mr-[1px] {isResizing ? 'bg-gray-400' : ''}"
  onmousedown={onStartResize}
>
  <div class="w-[1px] h-full bg-gray-200 group-hover:bg-transparent"></div>
</div>

<div style="width: {width}px" class="flex flex-col border-l border-gray-200 min-w-[400px]">
  <!-- Panel Header with Tabs -->
  <div class="h-10 px-2 border-b border-gray-200 flex items-center gap-1 bg-gray-50/50 shrink-0">
    <button
      onclick={() => onModeChange("files")}
      class={`px-3 py-1 text-xs font-medium rounded transition-colors ${showSplitView ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
    >
      Files
    </button>
    <button
      onclick={() => onModeChange("browser")}
      class={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${mode === 'browser' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
      Browser
    </button>
    <button
      onclick={() => onModeChange("git")}
      class={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${mode === 'git' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
      Git
    </button>
    <button
      onclick={() => onModeChange("terminal")}
      class={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${mode === 'terminal' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
      Terminal
    </button>
    <div class="flex-1"></div>
    <button onclick={onClose} class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Close">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
  </div>

  <!-- Panel Content -->
  <div class="flex-1 overflow-hidden flex flex-col relative">
    {#if showSplitView && projectPath}
      <!-- Split view for Files + Preview -->
      <div class="flex-1 flex overflow-hidden">
        <!-- File list (collapsible) -->
        <div
          class="flex flex-col border-r border-gray-200 bg-white shrink-0 transition-all duration-200 overflow-hidden"
          style="width: {fileListCollapsed ? '0px' : `${FILE_LIST_WIDTH}px`}"
        >
          {#if !fileListCollapsed}
            <FileBrowser rootPath={projectPath} onPreview={onFileSelect} />
          {/if}
        </div>

        <!-- Collapse/expand toggle button -->
        <button
          onclick={() => fileListCollapsed = !fileListCollapsed}
          class="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-4 h-12 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-r-md flex items-center justify-center transition-all duration-200"
          style="left: {fileListCollapsed ? '0px' : `${FILE_LIST_WIDTH}px`}"
          title={fileListCollapsed ? 'Show file list' : 'Hide file list'}
        >
          <svg
            class="w-3 h-3 text-gray-500 transition-transform duration-200"
            style="transform: rotate({fileListCollapsed ? '0deg' : '180deg'})"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>

        <!-- Preview area -->
        <div class="flex-1 flex flex-col overflow-hidden">
          {#if previewSource}
            <Preview source={previewSource} />
          {:else}
            <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">
              <div class="text-center">
                <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                <p>Select a file to preview</p>
              </div>
            </div>
          {/if}
        </div>
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
    {:else if mode === "git" && projectPath}
      <!-- Git panel - full width -->
      <div class="flex-1 flex flex-col w-full">
        <GitPanel rootPath={projectPath} />
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
    {/if}
  </div>
</div>
