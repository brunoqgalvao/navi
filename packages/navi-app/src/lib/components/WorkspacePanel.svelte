<script lang="ts">
  /**
   * WorkspacePanel - Project-aware container for terminal tabs and browser
   *
   * Handles:
   * - Project workspace state (terminals, browser)
   * - Terminal tab management (per project, not per session)
   * - Browser navigation state
   * - Terminal reconnection from PTY server
   */
  import { onMount } from "svelte";
  import { currentSession, projectWorkspaces } from "../stores/session";
  import type { TerminalTab } from "../stores/types";
  import SafeTerminal from "./SafeTerminal.svelte";
  import Preview from "../Preview.svelte";
  import { ptyApi } from "../api";

  interface Props {
    mode: "terminal" | "browser";
    projectId: string | null;
    projectPath: string | null;
    browserUrl?: string;
    onBrowserUrlChange?: (url: string) => void;
    onTerminalRef?: (ref: { pasteCommand: (cmd: string) => void; runCommand: (cmd: string) => void } | null) => void;
    onTerminalSendToClaude?: (context: string) => void;
    isResizing?: boolean;
  }

  let {
    mode,
    projectId,
    projectPath,
    browserUrl = "",
    onBrowserUrlChange,
    onTerminalRef,
    onTerminalSendToClaude,
    isResizing = false,
  }: Props = $props();

  // Get workspace for current project reactively
  let workspace = $derived(projectId ? $projectWorkspaces.get(projectId) : null);

  // Derived terminal state from workspace
  let terminalTabs = $derived(workspace?.terminalTabs ?? []);
  let activeTerminalId = $derived(workspace?.activeTerminalId ?? "");

  // Terminal refs
  let terminalRefs: Record<string, SafeTerminal | null> = {};

  // Load terminals from PTY server when project changes
  let lastLoadedProjectId: string | null = null;

  $effect(() => {
    if (projectId && projectId !== lastLoadedProjectId) {
      lastLoadedProjectId = projectId;
      loadTerminalsFromServer(projectId);
    }
  });

  async function loadTerminalsFromServer(pid: string) {
    try {
      const terminals = await ptyApi.list(pid);
      if (terminals.length > 0) {
        projectWorkspaces.setTerminals(pid, terminals);
        console.log(`[WorkspacePanel] Loaded ${terminals.length} terminals for project ${pid}`);
      } else {
        // No terminals exist yet - create workspace with no tabs
        projectWorkspaces.getOrCreate(pid);
      }
    } catch (e) {
      console.warn("[WorkspacePanel] Failed to load terminals from PTY server:", e);
      // Create default workspace
      projectWorkspaces.getOrCreate(pid);
    }
  }

  // Expose the active terminal's methods
  $effect(() => {
    if (onTerminalRef) {
      const activeRef = terminalRefs[activeTerminalId];
      onTerminalRef(activeRef || null);
    }
  });

  // Terminal tab actions
  function addTerminalTab() {
    if (!projectId) return;
    projectWorkspaces.addTerminalTab(projectId, { cwd: projectPath || undefined });
  }

  function closeTerminalTab(tabId: string) {
    if (!projectId || terminalTabs.length <= 1) return;
    // Kill the terminal on the PTY server
    const tab = terminalTabs.find(t => t.id === tabId);
    if (tab?.terminalId) {
      const ref = terminalRefs[tabId];
      ref?.killTerminal?.();
    }
    delete terminalRefs[tabId];
    projectWorkspaces.removeTerminalTab(projectId, tabId);
  }

  function setActiveTerminal(tabId: string) {
    if (!projectId) return;
    projectWorkspaces.setActiveTerminal(projectId, tabId);
  }

  function handleTerminalIdChange(tabId: string, newTerminalId: string | null) {
    if (!projectId) return;
    projectWorkspaces.updateTerminalTab(projectId, tabId, { terminalId: newTerminalId || undefined });
  }

  // Browser actions
  function handleBrowserBack() {
    if (projectId) projectWorkspaces.browserBack(projectId);
  }

  function handleBrowserForward() {
    if (projectId) projectWorkspaces.browserForward(projectId);
  }

  function handleBrowserGoToIndex(index: number) {
    if (projectId) projectWorkspaces.browserGoToIndex(projectId, index);
  }

  function handleBrowserUrlChange(url: string) {
    if (projectId && url && url !== workspace?.browser.url) {
      projectWorkspaces.navigateBrowser(projectId, url);
    }
    onBrowserUrlChange?.(url);
  }
</script>

{#if mode === "terminal"}
  <!-- Terminal Tabs Header -->
  <div class="flex items-center gap-0.5 px-2 py-1 bg-[#1a1b26] border-b border-[#32344a] overflow-x-auto">
    {#each terminalTabs as tab (tab.id)}
      <button
        onclick={() => setActiveTerminal(tab.id)}
        class="group flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors {activeTerminalId === tab.id ? 'bg-[#24283b] text-[#c0caf5]' : 'text-[#565f89] hover:text-[#a9b1d6] hover:bg-[#24283b]/50'}"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <span>{tab.name}</span>
        {#if terminalTabs.length > 1}
          <button
            onclick={(e) => { e.stopPropagation(); closeTerminalTab(tab.id); }}
            class="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#32344a] transition-opacity"
            title="Close terminal"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        {/if}
      </button>
    {/each}
    <button
      onclick={addTerminalTab}
      class="p-1 text-[#565f89] hover:text-[#a9b1d6] hover:bg-[#24283b]/50 rounded transition-colors"
      title="New terminal"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
  </div>

  <!-- Terminal Content -->
  <div class="flex-1 overflow-hidden flex flex-col bg-[#1a1b26]">
    {#if terminalTabs.length === 0}
      <!-- No terminals yet - show placeholder with button -->
      <div class="flex-1 flex flex-col items-center justify-center gap-4 text-[#565f89] bg-[#1a1b26]">
        <svg class="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <p class="text-sm">No terminals open</p>
        <button
          onclick={addTerminalTab}
          class="px-3 py-1.5 text-sm bg-[#24283b] hover:bg-[#32344a] text-[#a9b1d6] rounded transition-colors"
        >
          Open Terminal
        </button>
      </div>
    {:else}
      {#each terminalTabs as tab (tab.id)}
        <div class="flex-1 {activeTerminalId === tab.id ? '' : 'hidden'}">
          <SafeTerminal
            bind:this={terminalRefs[tab.id]}
            cwd={tab.cwd || projectPath || undefined}
            initialCommand={tab.initialCommand}
            projectId={projectId || undefined}
            name={tab.name}
            existingTerminalId={tab.terminalId}
            onSendToClaude={onTerminalSendToClaude}
            onTerminalIdChange={(newId) => handleTerminalIdChange(tab.id, newId)}
          />
        </div>
      {/each}
    {/if}
  </div>
{:else if mode === "browser"}
  <Preview
    source={workspace?.browser.url || browserUrl}
    type="url"
    onUrlChange={handleBrowserUrlChange}
    browserHistory={workspace?.browser.history}
    browserHistoryIndex={workspace?.browser.historyIndex}
    onBrowserBack={handleBrowserBack}
    onBrowserForward={handleBrowserForward}
    onBrowserGoToIndex={handleBrowserGoToIndex}
    isParentResizing={isResizing}
  />
{/if}
