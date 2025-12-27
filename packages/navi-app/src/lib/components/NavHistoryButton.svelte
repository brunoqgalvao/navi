<script lang="ts">
  import { navHistory, type NavHistoryEntry } from "../stores";

  interface Props {
    onNavigate: (entry: NavHistoryEntry) => void;
  }

  let { onNavigate }: Props = $props();

  let showBackDropdown = $state(false);
  let showForwardDropdown = $state(false);

  // Subscribe to store for reactivity
  let historyState = $derived($navHistory);
  let canGoBack = $derived(historyState.currentIndex > 0);
  let canGoForward = $derived(historyState.currentIndex < historyState.entries.length - 1);

  // Get back entries (before current)
  let backEntries = $derived(() => {
    return historyState.entries.slice(0, historyState.currentIndex).map((entry, idx) => ({
      ...entry,
      originalIndex: idx,
    }));
  });

  // Get forward entries (after current)
  let forwardEntries = $derived(() => {
    return historyState.entries.slice(historyState.currentIndex + 1).map((entry, idx) => ({
      ...entry,
      originalIndex: historyState.currentIndex + 1 + idx,
    }));
  });

  function handleBack() {
    const entry = navHistory.goBack();
    if (entry) {
      onNavigate(entry);
    }
  }

  function handleForward() {
    const entry = navHistory.goForward();
    if (entry) {
      onNavigate(entry);
    }
  }

  function handleBackContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (canGoBack) {
      showBackDropdown = true;
      showForwardDropdown = false;
    }
  }

  function handleForwardContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (canGoForward) {
      showForwardDropdown = true;
      showBackDropdown = false;
    }
  }

  function handleDropdownSelect(originalIndex: number) {
    const entry = navHistory.goToIndex(originalIndex);
    if (entry) {
      onNavigate(entry);
    }
    closeDropdowns();
  }

  function closeDropdowns() {
    showBackDropdown = false;
    showForwardDropdown = false;
  }

  function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  function handleKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl + [ for back, Cmd/Ctrl + ] for forward
    if ((e.metaKey || e.ctrlKey) && e.key === "[") {
      e.preventDefault();
      handleBack();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "]") {
      e.preventDefault();
      handleForward();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if showBackDropdown || showForwardDropdown}
  <div class="fixed inset-0 z-40" onclick={closeDropdowns}></div>
{/if}

<div class="nav-history-container relative flex items-center gap-0.5">
  <!-- Back Button -->
  <div class="relative">
    <button
      onclick={handleBack}
      oncontextmenu={handleBackContextMenu}
      disabled={!canGoBack}
      class="p-1.5 rounded transition-all {canGoBack
        ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        : 'text-gray-300 cursor-not-allowed'}"
      title="Go back (Cmd+[) • Right-click for history"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    {#if showBackDropdown && backEntries().length > 0}
      <div class="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
        <div class="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Back History</span>
        </div>
        <div class="max-h-80 overflow-y-auto">
          {#each backEntries().reverse() as entry}
            <button
              onclick={() => handleDropdownSelect(entry.originalIndex)}
              class="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
            >
              <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-900 truncate">
                  {entry.chatTitle || "Untitled Chat"}
                </div>
                <div class="text-[10px] text-gray-400 truncate">
                  {entry.projectName}
                </div>
              </div>
              <span class="text-[10px] text-gray-400 whitespace-nowrap">
                {formatTime(entry.visitedAt)}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Forward Button -->
  <div class="relative">
    <button
      onclick={handleForward}
      oncontextmenu={handleForwardContextMenu}
      disabled={!canGoForward}
      class="p-1.5 rounded transition-all {canGoForward
        ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        : 'text-gray-300 cursor-not-allowed'}"
      title="Go forward (Cmd+]) • Right-click for history"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>

    {#if showForwardDropdown && forwardEntries().length > 0}
      <div class="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
        <div class="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Forward History</span>
        </div>
        <div class="max-h-80 overflow-y-auto">
          {#each forwardEntries() as entry}
            <button
              onclick={() => handleDropdownSelect(entry.originalIndex)}
              class="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
            >
              <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-900 truncate">
                  {entry.chatTitle || "Untitled Chat"}
                </div>
                <div class="text-[10px] text-gray-400 truncate">
                  {entry.projectName}
                </div>
              </div>
              <span class="text-[10px] text-gray-400 whitespace-nowrap">
                {formatTime(entry.visitedAt)}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .nav-history-container {
    user-select: none;
  }
</style>
