<script lang="ts">
  import type { ExecutionMode } from "../stores";

  interface Props {
    mode: ExecutionMode;
    branch?: string;
    branches?: string[];
    isGitRepo?: boolean;
    disabled?: boolean;
    onModeChange: (mode: ExecutionMode) => void;
    onBranchChange?: (branch: string) => void;
  }

  let {
    mode = "local",
    branch = "main",
    branches = [],
    isGitRepo = false,
    disabled = false,
    onModeChange,
    onBranchChange,
  }: Props = $props();

  let showMenu = $state(false);

  function toggleMode() {
    const newMode = mode === "local" ? "cloud" : "local";
    onModeChange(newMode);
  }

  function handleBranchSelect(branchName: string) {
    onBranchChange?.(branchName);
    showMenu = false;
  }
</script>

<!-- Cloud Execution Toggle -->
<div class="relative">
  <button
    onclick={toggleMode}
    {disabled}
    class="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150
      {mode === 'cloud'
        ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 hover:bg-sky-200 dark:hover:bg-sky-900/50'
        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}
      {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
    title={mode === 'cloud' ? 'Cloud execution: ON - running in E2B sandbox' : 'Cloud execution: run in isolated cloud environment'}
  >
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
    </svg>
  </button>

  <!-- Branch selector dropdown (only show when cloud mode is active and it's a git repo) -->
  {#if mode === 'cloud' && isGitRepo}
    <button
      onclick={() => showMenu = !showMenu}
      class="ml-1 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
        bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300
        hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
      title="Select branch for cloud execution"
    >
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9"/>
      </svg>
      <span class="max-w-[80px] truncate">{branch || 'main'}</span>
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
      </svg>
    </button>
  {/if}

  <!-- Branch dropdown menu -->
  {#if showMenu && branches.length > 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-40"
      onclick={() => showMenu = false}
    ></div>
    <div class="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 z-50 max-h-64 overflow-y-auto">
      <div class="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
        Select Branch
      </div>
      {#each branches as b}
        <button
          onclick={() => handleBranchSelect(b)}
          class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2
            {b === branch ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300' : ''}"
        >
          <svg class="w-3.5 h-3.5 flex-shrink-0 {b === branch ? 'text-sky-500' : 'text-gray-400'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9"/>
          </svg>
          <span class="truncate">{b}</span>
          {#if b === branch}
            <svg class="w-3.5 h-3.5 ml-auto text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Cloud execution indicator animation */
  button:has(.cloud-active) {
    animation: cloud-pulse 2s ease-in-out infinite;
  }

  @keyframes cloud-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.4); }
    50% { box-shadow: 0 0 0 4px rgba(14, 165, 233, 0); }
  }
</style>
