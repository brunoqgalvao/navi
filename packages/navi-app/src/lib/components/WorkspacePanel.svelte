<script lang="ts">
  /**
   * WorkspacePanel - Session-aware container for terminal tabs and browser
   *
   * Handles:
   * - Session workspace state (terminals, browser)
   * - Terminal tab management
   * - Browser navigation state
   * - Terminal reconnection
   */
  import { currentSession, sessionWorkspaces } from "../stores/session";
  import type { TerminalTab, SessionWorkspace } from "../stores/types";
  import SafeTerminal from "./SafeTerminal.svelte";
  import Preview from "../Preview.svelte";

  interface Props {
    mode: "terminal" | "browser";
    projectPath: string | null;
    browserUrl?: string;
    onBrowserUrlChange?: (url: string) => void;
    onTerminalRef?: (ref: { pasteCommand: (cmd: string) => void; runCommand: (cmd: string) => void } | null) => void;
    onTerminalSendToClaude?: (context: string) => void;
  }

  let {
    mode,
    projectPath,
    browserUrl = "",
    onBrowserUrlChange,
    onTerminalRef,
    onTerminalSendToClaude,
  }: Props = $props();

  // Get current session ID reactively
  let sessionId = $derived($currentSession.sessionId);

  // Get workspace for current session reactively
  let workspace = $derived(sessionId ? $sessionWorkspaces.get(sessionId) : null);

  // Derived terminal state from workspace
  let terminalTabs = $derived(workspace?.terminalTabs ?? [{ id: "term-1", name: "Terminal 1" }]);
  let activeTerminalId = $derived(workspace?.activeTerminalId ?? "term-1");

  // Terminal refs
  let terminalRefs: Record<string, SafeTerminal | null> = {};

  // Initialize workspace when session changes
  $effect(() => {
    if (sessionId && !workspace) {
      sessionWorkspaces.getOrCreate(sessionId);
    }
  });

  // Expose the active terminal's methods
  $effect(() => {
    if (onTerminalRef) {
      const activeRef = terminalRefs[activeTerminalId];
      onTerminalRef(activeRef || null);
    }
  });

  // NOTE: Removed browser URL sync effect - was causing infinite loop.
  // Preview handles navigation via onUrlChange callback which goes through
  // the parent's onBrowserUrlChange, which should update the store directly.

  // Terminal tab actions
  function addTerminalTab() {
    if (!sessionId) return;
    sessionWorkspaces.addTerminalTab(sessionId, { cwd: projectPath || undefined });
  }

  function closeTerminalTab(tabId: string) {
    if (!sessionId || terminalTabs.length <= 1) return;
    delete terminalRefs[tabId];
    sessionWorkspaces.removeTerminalTab(sessionId, tabId);
  }

  function setActiveTerminal(tabId: string) {
    if (!sessionId) return;
    sessionWorkspaces.setActiveTerminal(sessionId, tabId);
  }

  function handleTerminalIdChange(tabId: string, newTerminalId: string | null) {
    if (!sessionId) return;
    sessionWorkspaces.updateTerminalTab(sessionId, tabId, { terminalId: newTerminalId || undefined });
  }

  // Browser actions
  function handleBrowserBack() {
    if (sessionId) sessionWorkspaces.browserBack(sessionId);
  }

  function handleBrowserForward() {
    if (sessionId) sessionWorkspaces.browserForward(sessionId);
  }

  function handleBrowserGoToIndex(index: number) {
    if (sessionId) sessionWorkspaces.browserGoToIndex(sessionId, index);
  }

  function handleBrowserUrlChange(url: string) {
    // Update session store with new URL
    if (sessionId && url && url !== workspace?.browser.url) {
      sessionWorkspaces.navigateBrowser(sessionId, url);
    }
    // Also notify parent if needed
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
  <div class="flex-1 overflow-hidden flex flex-col">
    {#each terminalTabs as tab (tab.id)}
      <div class="flex-1 {activeTerminalId === tab.id ? '' : 'hidden'}">
        <SafeTerminal
          bind:this={terminalRefs[tab.id]}
          cwd={tab.cwd || projectPath || undefined}
          initialCommand={tab.initialCommand}
          sessionId={sessionId || undefined}
          existingTerminalId={tab.terminalId}
          onSendToClaude={onTerminalSendToClaude}
          onTerminalIdChange={(newId) => handleTerminalIdChange(tab.id, newId)}
        />
      </div>
    {/each}
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
  />
{/if}
