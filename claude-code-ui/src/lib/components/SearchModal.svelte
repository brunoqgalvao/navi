<script lang="ts">
  import { api, type SearchResult } from "../api";
  import { createEventDispatcher, onMount, onDestroy } from "svelte";

  let { isOpen = $bindable(false), projectId = null as string | null, onNavigate = (sessionId: string, projectId: string) => {} } = $props();

  const dispatch = createEventDispatcher();
  
  let searchQuery = $state("");
  let results = $state<SearchResult[]>([]);
  let isLoading = $state(false);
  let selectedIndex = $state(0);
  let inputRef: HTMLInputElement | null = $state(null);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen = false;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      selectResult(results[selectedIndex]);
    }
  }

  async function performSearch(query: string) {
    if (!query.trim()) {
      results = [];
      return;
    }

    isLoading = true;
    try {
      results = await api.search.query(query, { projectId: projectId || undefined, limit: 20 });
      selectedIndex = 0;
    } catch (e) {
      console.error("Search failed:", e);
      results = [];
    } finally {
      isLoading = false;
    }
  }

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchQuery = value;
    
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(value), 150);
  }

  function selectResult(result: SearchResult) {
    if (result.session_id && result.project_id) {
      onNavigate(result.session_id, result.project_id);
      isOpen = false;
    }
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getResultIcon(type: string): string {
    switch (type) {
      case "project": return "📁";
      case "session": return "💬";
      case "message": return "📝";
      default: return "📄";
    }
  }

  function highlightMatch(text: string, query: string): string {
    if (!query.trim()) return text;
    const terms = query.toLowerCase().split(/\s+/);
    let result = text;
    for (const term of terms) {
      const regex = new RegExp(`(${term})`, "gi");
      result = result.replace(regex, '<mark class="bg-yellow-300/50 text-yellow-100">$1</mark>');
    }
    return result;
  }

  $effect(() => {
    if (isOpen && inputRef) {
      setTimeout(() => inputRef?.focus(), 50);
    }
  });

  $effect(() => {
    if (!isOpen) {
      searchQuery = "";
      results = [];
      selectedIndex = 0;
    }
  });
</script>

{#if isOpen}
  <div 
    class="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[15vh]"
    onclick={() => isOpen = false}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
  >
    <div 
      class="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl border border-zinc-700 overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div class="p-4 border-b border-zinc-700">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            bind:this={inputRef}
            type="text"
            value={searchQuery}
            oninput={handleInput}
            placeholder={projectId ? "Search in project..." : "Search all chats..."}
            class="flex-1 bg-transparent text-white text-lg outline-none placeholder-zinc-500"
          />
          {#if isLoading}
            <div class="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin"></div>
          {:else if searchQuery}
            <button 
              onclick={() => { searchQuery = ""; results = []; }}
              class="text-zinc-400 hover:text-white"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <div class="max-h-[50vh] overflow-y-auto">
        {#if results.length > 0}
          {#each results as result, i}
            <button
              class="w-full text-left px-4 py-3 hover:bg-zinc-800 flex items-start gap-3 border-b border-zinc-800 last:border-0 transition-colors {selectedIndex === i ? 'bg-zinc-800' : ''}"
              onclick={() => selectResult(result)}
              onmouseenter={() => selectedIndex = i}
            >
              <span class="text-xl mt-0.5">{getResultIcon(result.entity_type)}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-white font-medium truncate">
                    {result.session_title || "Untitled"}
                  </span>
                  <span class="text-xs text-zinc-500">{formatTime(result.updated_at)}</span>
                </div>
                {#if result.preview}
                  <p class="text-sm text-zinc-400 truncate mt-1">
                    {@html highlightMatch(result.preview.slice(0, 100), searchQuery)}
                  </p>
                {/if}
                {#if result.project_name}
                  <span class="text-xs text-zinc-500 mt-1 inline-block">{result.project_name}</span>
                {/if}
              </div>
              <span class="text-xs text-zinc-600 uppercase">{result.entity_type}</span>
            </button>
          {/each}
        {:else if searchQuery && !isLoading}
          <div class="px-4 py-8 text-center text-zinc-500">
            No results found for "{searchQuery}"
          </div>
        {:else if !searchQuery}
          <div class="px-4 py-8 text-center text-zinc-500">
            <p class="text-sm">Start typing to search your chats</p>
            <p class="text-xs mt-2 text-zinc-600">Tip: Use Cmd+K to open search anytime</p>
          </div>
        {/if}
      </div>

      <div class="px-4 py-2 border-t border-zinc-700 flex items-center justify-between text-xs text-zinc-500">
        <div class="flex gap-4">
          <span><kbd class="bg-zinc-800 px-1.5 py-0.5 rounded">↑↓</kbd> navigate</span>
          <span><kbd class="bg-zinc-800 px-1.5 py-0.5 rounded">↵</kbd> select</span>
          <span><kbd class="bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd> close</span>
        </div>
        {#if results.length > 0}
          <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
        {/if}
      </div>
    </div>
  </div>
{/if}
