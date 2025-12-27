<script lang="ts">
  /**
   * RightPanel - Layout component for the right side panel
   *
   * Pure layout concerns:
   * - Panel tabs (Files, Preview, Browser, Git, Terminal)
   * - Resize handle
   * - Content switching
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

  // Handle initial command for terminal
  let terminalRef: { pasteCommand: (cmd: string) => void; runCommand: (cmd: string) => void } | null = null;

  function handleTerminalRef(ref: typeof terminalRef) {
    terminalRef = ref;
    onTerminalRef?.(ref);
  }

  $effect(() => {
    if (terminalInitialCommand && mode === "terminal" && terminalRef) {
      terminalRef.runCommand(terminalInitialCommand);
    }
  });
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
      class={`px-3 py-1 text-xs font-medium rounded transition-colors ${mode === 'files' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
    >
      Files
    </button>
    <button
      onclick={() => onModeChange("preview")}
      class={`px-3 py-1 text-xs font-medium rounded transition-colors ${mode === 'preview' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
    >
      Preview
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
  <div class="flex-1 overflow-hidden flex flex-col">
    {#if mode === "files" && projectPath}
      <FileBrowser rootPath={projectPath} onPreview={onFileSelect} />
    {:else if mode === "preview" && previewSource}
      <Preview source={previewSource} />
    {:else if mode === "browser"}
      <WorkspacePanel
        mode="browser"
        {projectId}
        {projectPath}
        {browserUrl}
        onBrowserUrlChange={onBrowserUrlChange}
      />
    {:else if mode === "git" && projectPath}
      <GitPanel rootPath={projectPath} />
    {:else if mode === "terminal"}
      <WorkspacePanel
        mode="terminal"
        {projectId}
        {projectPath}
        onTerminalRef={handleTerminalRef}
        onTerminalSendToClaude={onTerminalSendToClaude}
      />
    {/if}
  </div>
</div>
