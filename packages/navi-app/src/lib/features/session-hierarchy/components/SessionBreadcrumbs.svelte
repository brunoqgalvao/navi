<script lang="ts">
  import { onMount } from "svelte";
  import type { HierarchySession } from "../types";
  import { sessionHierarchyApi } from "../api";
  import { getStatusIcon, getStatusColor } from "../types";

  interface Props {
    sessionId: string;
    onSelectSession: (session: HierarchySession) => void;
  }

  let { sessionId, onSelectSession }: Props = $props();

  let ancestors = $state<HierarchySession[]>([]);
  let currentSession = $state<HierarchySession | null>(null);
  let loading = $state(true);

  async function loadAncestors() {
    loading = true;
    try {
      const [ancestorList, context] = await Promise.all([
        sessionHierarchyApi.getAncestors(sessionId),
        sessionHierarchyApi.getImmediateContext(sessionId),
      ]);
      ancestors = ancestorList.reverse(); // Root first

      // Try to get current session from context or API
      // For now, just use a minimal version
      if (context) {
        currentSession = {
          id: sessionId,
          title: context.task,
          role: context.role,
          task: context.task,
        } as HierarchySession;
      }
    } catch (e) {
      console.error("Failed to load ancestors:", e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadAncestors();
  });

  $effect(() => {
    if (sessionId) {
      loadAncestors();
    }
  });

  // Check if this session has a parent (is part of hierarchy)
  let hasHierarchy = $derived(ancestors.length > 0);
</script>

{#if loading}
  <div class="h-6"></div>
{:else if hasHierarchy}
  <div class="flex items-center gap-1 text-[11px] text-gray-500 px-2 py-1 bg-gray-50 rounded-md overflow-x-auto">
    <!-- Root indicator -->
    <span class="shrink-0 text-gray-400">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    </span>

    {#each ancestors as ancestor, i}
      <button
        onclick={() => onSelectSession(ancestor)}
        class="shrink-0 hover:text-gray-800 hover:underline flex items-center gap-1"
      >
        <span class="{getStatusColor(ancestor.agent_status)} text-[9px]">
          {getStatusIcon(ancestor.agent_status)}
        </span>
        {#if ancestor.role}
          <span class="font-medium">{ancestor.role}</span>
        {:else}
          <span>{ancestor.title || "Session"}</span>
        {/if}
      </button>

      <!-- Separator -->
      <span class="text-gray-300 shrink-0">/</span>
    {/each}

    <!-- Current session -->
    <span class="shrink-0 font-medium text-gray-700 flex items-center gap-1">
      {#if currentSession?.role}
        <span class="px-1 py-0.5 bg-accent/10 text-accent rounded text-[9px] uppercase tracking-wide">
          {currentSession.role}
        </span>
      {/if}
      <span class="truncate max-w-[200px]">
        {currentSession?.title || currentSession?.task || "Current"}
      </span>
    </span>

    <!-- Depth indicator -->
    <span class="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">
      depth {ancestors.length}
    </span>
  </div>
{/if}
