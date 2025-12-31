<script lang="ts">
  import { agentLibrary, skillLibraryForBuilder, isLoading, loadError } from "../stores";
  import type { AgentDefinition } from "../types";

  interface Props {
    onSelectAgent?: (agent: AgentDefinition) => void;
    onCreateNew?: (type: "agent" | "skill") => void;
  }

  let { onSelectAgent, onCreateNew }: Props = $props();

  let filter = $state<"all" | "agents" | "skills">("all");
  let searchQuery = $state("");

  // Combined and filtered list
  let filteredItems = $derived(() => {
    let items: AgentDefinition[] = [];

    if (filter === "all" || filter === "agents") {
      items = [...items, ...$agentLibrary];
    }
    if (filter === "all" || filter === "skills") {
      items = [...items, ...$skillLibraryForBuilder];
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      );
    }

    return items;
  });

  function handleSelect(item: AgentDefinition) {
    // Just call the callback - parent component handles opening via stores
    onSelectAgent?.(item);
  }
</script>

<div class="h-full flex flex-col bg-gray-50">
  <!-- Header -->
  <div class="px-6 py-4 bg-white border-b border-gray-200">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Agent Builder</h1>
        <p class="text-sm text-gray-500">Create and manage agents and skills</p>
      </div>
      <div class="flex gap-2">
        <button
          onclick={() => onCreateNew?.("skill")}
          class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          New Skill
        </button>
        <button
          onclick={() => onCreateNew?.("agent")}
          class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Agent
        </button>
      </div>
    </div>

    <!-- Search and filter -->
    <div class="flex gap-3">
      <div class="flex-1 relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search agents and skills..."
          class="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
        />
      </div>
      <div class="flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          onclick={() => (filter = "all")}
          class="px-3 py-2 text-sm {filter === 'all' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}"
        >
          All
        </button>
        <button
          onclick={() => (filter = "agents")}
          class="px-3 py-2 text-sm border-l border-gray-200 {filter === 'agents' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}"
        >
          Agents
        </button>
        <button
          onclick={() => (filter = "skills")}
          class="px-3 py-2 text-sm border-l border-gray-200 {filter === 'skills' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}"
        >
          Skills
        </button>
      </div>
    </div>
  </div>

  <!-- Grid -->
  <div class="flex-1 overflow-y-auto p-6">
    {#if $isLoading}
      <div class="flex items-center justify-center py-12">
        <svg class="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
    {:else if $loadError}
      <div class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-2xl flex items-center justify-center">
          <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-sm font-medium text-gray-900 mb-1">Failed to load</h3>
        <p class="text-xs text-gray-500">{$loadError}</p>
      </div>
    {:else if filteredItems().length === 0}
      <div class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 class="text-sm font-medium text-gray-900 mb-1">No {filter === "all" ? "items" : filter} found</h3>
        <p class="text-xs text-gray-500">
          {#if searchQuery}
            Try a different search term
          {:else}
            Create your first {filter === "skills" ? "skill" : "agent"} to get started
          {/if}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filteredItems() as item}
          <button
            onclick={() => handleSelect(item)}
            class="text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group"
          >
            <div class="flex items-start gap-3">
              <div class="p-2 rounded-lg {item.type === 'skill' ? 'bg-amber-100' : 'bg-indigo-100'}">
                {#if item.type === "skill"}
                  <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                {:else}
                  <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                  {item.name}
                </h3>
                <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">
                  {item.description || "No description"}
                </p>
                <div class="flex items-center gap-2 mt-2">
                  <span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {item.type}
                  </span>
                  {#if item.tools.length > 0}
                    <span class="text-xs text-gray-400">
                      {item.tools.length} tool{item.tools.length !== 1 ? "s" : ""}
                    </span>
                  {/if}
                </div>
              </div>
              <svg class="w-5 h-5 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
