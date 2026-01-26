<script lang="ts">
  import { api, type SearchResult } from "../api";

  let { isOpen = $bindable(false), projectId = null as string | null, onNavigate = (sessionId: string, projectId: string) => {}, onNavigateProject = (projectId: string) => {} } = $props();

  let searchQuery = $state("");
  let results = $state<SearchResult[]>([]);
  let isLoading = $state(false);
  let selectedIndex = $state(0);
  let inputRef: HTMLInputElement | null = $state(null);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let groupedResults = $derived(() => {
    const projects = results.filter(r => r.entity_type === 'project');
    const sessions = results.filter(r => r.entity_type === 'session');
    const messages = results.filter(r => r.entity_type === 'message');
    return { projects, sessions, messages };
  });

  let flatResults = $derived(() => {
    const { projects, sessions, messages } = groupedResults();
    // Order: projects first, messages second, sessions last
    return [...projects, ...messages, ...sessions];
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      isOpen = false;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const flat = flatResults();
      selectedIndex = Math.min(selectedIndex + 1, flat.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const flat = flatResults();
      if (flat[selectedIndex]) {
        selectResult(flat[selectedIndex]);
      }
    }
  }

  async function performSearch(query: string) {
    if (!query.trim()) {
      results = [];
      return;
    }

    isLoading = true;
    try {
      results = await api.search.query(query, { projectId: projectId || undefined, limit: 30 });
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
    if (result.entity_type === 'project' && result.project_id) {
      onNavigateProject(result.project_id);
      isOpen = false;
    } else if (result.session_id && result.project_id) {
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

  function highlightMatch(text: string, query: string): string {
    if (!query.trim() || !text) return text || "";
    const escapedTerms = query.toLowerCase().split(/\s+/).map(t => 
      t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    let result = text;
    for (const term of escapedTerms) {
      if (term) {
        const regex = new RegExp(`(${term})`, "gi");
        result = result.replace(regex, '<mark class="bg-amber-100 text-amber-800 rounded px-0.5">$1</mark>');
      }
    }
    return result;
  }

  function getGlobalIndex(result: SearchResult): number {
    return flatResults().indexOf(result);
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
    class="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[12vh]"
    onclick={() => isOpen = false}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
  >
    <div 
      class="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-gray-200 overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div class="p-4 border-b border-gray-200">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            bind:this={inputRef}
            type="text"
            value={searchQuery}
            oninput={handleInput}
            placeholder={projectId ? "Search in project..." : "Search projects and chats..."}
            class="flex-1 bg-transparent text-gray-900 text-lg outline-none placeholder-gray-400"
          />
          {#if isLoading}
            <div class="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
          {:else if searchQuery}
            <button 
              onclick={() => { searchQuery = ""; results = []; }}
              class="text-gray-400 hover:text-gray-600"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <div class="max-h-[55vh] overflow-y-auto">
        {#if results.length > 0}
          {@const grouped = groupedResults()}
          
          {#if grouped.projects.length > 0}
            <div class="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Projects</span>
            </div>
            {#each grouped.projects as result}
              {@const globalIdx = getGlobalIndex(result)}
              <button
                class="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 border-b border-gray-100 transition-colors {selectedIndex === globalIdx ? 'bg-blue-50' : ''}"
                onclick={() => selectResult(result)}
                onmouseenter={() => selectedIndex = globalIdx}
              >
                <span class="text-lg mt-0.5">📁</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-gray-900 font-medium">
                      {@html highlightMatch(result.preview || result.project_name || "Untitled", searchQuery)}
                    </span>
                    <span class="text-xs text-gray-400">{formatTime(result.updated_at)}</span>
                  </div>
                </div>
              </button>
            {/each}
          {/if}

          {#if grouped.messages.length > 0}
            <div class="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Messages</span>
            </div>
            {#each grouped.messages as result}
              {@const globalIdx = getGlobalIndex(result)}
              <button
                class="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 border-b border-gray-100 transition-colors {selectedIndex === globalIdx ? 'bg-blue-50' : ''}"
                onclick={() => selectResult(result)}
                onmouseenter={() => selectedIndex = globalIdx}
              >
                <span class="text-lg mt-0.5">📝</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-gray-700 font-medium truncate">{result.session_title || "Untitled"}</span>
                    <span class="text-xs text-gray-400">{formatTime(result.updated_at)}</span>
                  </div>
                  {#if result.preview}
                    <p class="text-sm text-gray-500 truncate mt-0.5">
                      {@html highlightMatch(result.preview.slice(0, 120), searchQuery)}
                    </p>
                  {/if}
                  {#if result.project_name}
                    <span class="text-xs text-gray-400 mt-0.5 inline-block">{result.project_name}</span>
                  {/if}
                </div>
              </button>
            {/each}
          {/if}

          {#if grouped.sessions.length > 0}
            <div class="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Chats</span>
            </div>
            {#each grouped.sessions as result}
              {@const globalIdx = getGlobalIndex(result)}
              <button
                class="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 border-b border-gray-100 transition-colors {selectedIndex === globalIdx ? 'bg-blue-50' : ''}"
                onclick={() => selectResult(result)}
                onmouseenter={() => selectedIndex = globalIdx}
              >
                <span class="text-lg mt-0.5">💬</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-gray-900 font-medium truncate">
                      {@html highlightMatch(result.session_title || "Untitled", searchQuery)}
                    </span>
                    <span class="text-xs text-gray-400">{formatTime(result.updated_at)}</span>
                  </div>
                  {#if result.project_name}
                    <span class="text-xs text-gray-400 mt-0.5 inline-block">
                      {@html highlightMatch(result.project_name, searchQuery)}
                    </span>
                  {/if}
                </div>
              </button>
            {/each}
          {/if}
        {:else if searchQuery && !isLoading}
          <div class="px-4 py-8 text-center text-gray-500">
            No results found for "{searchQuery}"
          </div>
        {:else if !searchQuery}
          <div class="px-4 py-8 text-center text-gray-400">
            <p class="text-sm">Start typing to search your projects and chats</p>
            <p class="text-xs mt-2 text-gray-400">Tip: Use Cmd+K to open search anytime</p>
          </div>
        {/if}
      </div>

      <div class="px-4 py-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
        <div class="flex gap-4">
          <span><kbd class="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">↑↓</kbd> navigate</span>
          <span><kbd class="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">↵</kbd> select</span>
          <span><kbd class="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">esc</kbd> close</span>
        </div>
        {#if results.length > 0}
          <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
        {/if}
      </div>
    </div>
  </div>
{/if}
