<!--
  PreviewPanel - Unified preview panel with hidden engine selector

  Wraps all three preview engines:
  - Native (⚡) - Fast, no Docker
  - Container (🐳) - Docker-based isolation
  - Port Manager (🔌) - Multi-instance with smart ports

  The engine selector is a very subtle dropdown that only appears on hover.
-->
<script lang="ts">
  import NativePreviewPanel, { type InspectedElement } from "./NativePreviewPanel.svelte";
  import ContainerPreviewPanel from "./ContainerPreviewPanel.svelte";
  import PortManagerPreviewPanel from "./PortManagerPreviewPanel.svelte";

  type PreviewEngine = "native" | "container" | "port-manager";

  interface Props {
    projectId: string | null;
    sessionId: string | null;
    branch: string | null;
    previewUrl?: string | null;
    /** Callback to ask Claude to fix an error */
    onAskClaude?: (message: string) => void;
    /** Callback when user inspects an element in the preview */
    onElementInspected?: (element: InspectedElement) => void;
  }

  let { projectId, sessionId, branch, previewUrl, onAskClaude, onElementInspected }: Props = $props();

  // Persist engine choice in localStorage per project
  const STORAGE_KEY = "navi:preview-engine";

  function getStoredEngine(): PreviewEngine {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ["native", "container", "port-manager"].includes(stored)) {
        return stored as PreviewEngine;
      }
    } catch {}
    return "native"; // Default to native (fastest)
  }

  function saveEngine(engine: PreviewEngine) {
    try {
      localStorage.setItem(STORAGE_KEY, engine);
    } catch {}
  }

  let currentEngine = $state<PreviewEngine>(getStoredEngine());
  let showEngineMenu = $state(false);
  let menuRef = $state<HTMLDivElement | null>(null);

  const engines: { id: PreviewEngine; name: string; icon: string; description: string }[] = [
    { id: "native", name: "Native", icon: "⚡", description: "Fast, no Docker" },
    { id: "container", name: "Container", icon: "🐳", description: "Docker isolation" },
    { id: "port-manager", name: "Port Manager", icon: "🔌", description: "Multi-instance" },
  ];

  function selectEngine(engine: PreviewEngine) {
    currentEngine = engine;
    saveEngine(engine);
    showEngineMenu = false;
  }

  function getCurrentEngineMeta() {
    return engines.find(e => e.id === currentEngine) || engines[0];
  }

  // Close menu on click outside
  $effect(() => {
    if (!showEngineMenu) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        showEngineMenu = false;
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  });
</script>

<div class="relative flex flex-col h-full">
  <!-- Hidden engine selector - appears as a tiny icon in the top-right corner -->
  <div
    bind:this={menuRef}
    class="absolute top-1 right-1 z-50"
  >
    <!-- Trigger button - very subtle -->
    <button
      onclick={(e) => { e.stopPropagation(); showEngineMenu = !showEngineMenu; }}
      class="p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all opacity-30 hover:opacity-100"
      title="Switch preview engine"
    >
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    </button>

    <!-- Dropdown menu -->
    {#if showEngineMenu}
      <div class="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
        <div class="px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          Preview Engine
        </div>
        {#each engines as engine}
          <button
            onclick={() => selectEngine(engine.id)}
            class="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors {currentEngine === engine.id ? 'bg-gray-50 dark:bg-gray-700/50' : ''}"
          >
            <span class="text-base">{engine.icon}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                {engine.name}
                {#if currentEngine === engine.id}
                  <svg class="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                {/if}
              </div>
              <div class="text-[10px] text-gray-400">{engine.description}</div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Render the selected preview panel -->
  <div class="flex-1 overflow-hidden">
    {#if currentEngine === "native"}
      <NativePreviewPanel
        {projectId}
        {sessionId}
        {branch}
        {previewUrl}
        {onAskClaude}
        {onElementInspected}
      />
    {:else if currentEngine === "container"}
      <ContainerPreviewPanel
        {projectId}
        {sessionId}
        {branch}
        previewUrl={previewUrl || null}
      />
    {:else if currentEngine === "port-manager"}
      <PortManagerPreviewPanel
        {projectId}
        {sessionId}
        {branch}
        {previewUrl}
      />
    {/if}
  </div>
</div>

<style>
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slide-in-from-top-1 {
    from { transform: translateY(-4px); }
    to { transform: translateY(0); }
  }
  .animate-in {
    animation: fade-in 150ms ease-out, slide-in-from-top-1 150ms ease-out;
  }
</style>
