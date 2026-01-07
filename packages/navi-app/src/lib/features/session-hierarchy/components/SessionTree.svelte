<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SessionTreeNode, HierarchySession, AgentStatus } from "../types";
  import { sessionHierarchyApi } from "../api";
  import { isActiveStatus } from "../types";
  import SessionTreeNodeComponent from "./SessionTreeNode.svelte";

  interface Props {
    rootSessionId: string;
    currentSessionId: string | null;
    onSelectSession: (session: HierarchySession) => void;
    onResolveEscalation?: (sessionId: string) => void;
    compact?: boolean;
  }

  let {
    rootSessionId,
    currentSessionId,
    onSelectSession,
    onResolveEscalation,
    compact = false,
  }: Props = $props();

  let tree = $state<SessionTreeNode | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Stats derived from tree
  let stats = $derived(() => {
    if (!tree) return { total: 0, active: 0, blocked: 0 };

    function countNodes(node: SessionTreeNode): { total: number; active: number; blocked: number } {
      let total = 1;
      let active = isActiveStatus(node.agent_status) ? 1 : 0;
      let blocked = node.agent_status === "blocked" ? 1 : 0;

      for (const child of node.children || []) {
        const childStats = countNodes(child);
        total += childStats.total;
        active += childStats.active;
        blocked += childStats.blocked;
      }

      return { total, active, blocked };
    }

    return countNodes(tree);
  });

  async function loadTree() {
    try {
      tree = await sessionHierarchyApi.getSessionTree(rootSessionId);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load session tree";
    } finally {
      loading = false;
    }
  }

  function handleSelectSession(node: SessionTreeNode) {
    onSelectSession(node);
  }

  onMount(() => {
    loadTree();
    // Refresh tree periodically to catch status updates
    refreshInterval = setInterval(loadTree, 5000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  // Reload when rootSessionId changes
  $effect(() => {
    if (rootSessionId) {
      loading = true;
      loadTree();
    }
  });
</script>

<div class="session-tree {compact ? 'compact' : ''}">
  {#if loading && !tree}
    <div class="flex items-center justify-center py-4 text-gray-400 text-sm">
      <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Loading...
    </div>
  {:else if error}
    <div class="text-red-500 text-sm p-2">
      {error}
      <button onclick={loadTree} class="ml-2 text-red-600 underline">Retry</button>
    </div>
  {:else if tree}
    <!-- Header with stats -->
    {#if !compact}
      <div class="flex items-center justify-between px-2 py-1.5 mb-2 bg-gray-50 rounded-md text-[11px] text-gray-500">
        <span class="font-medium">Session Tree</span>
        <div class="flex items-center gap-2">
          {#if stats().blocked > 0}
            <span class="flex items-center gap-1 text-orange-500">
              <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              {stats().blocked} blocked
            </span>
          {/if}
          <span class="flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            {stats().active} active
          </span>
          <span class="text-gray-400">/ {stats().total} total</span>
        </div>
      </div>
    {/if}

    <!-- Tree -->
    <div class="tree-content">
      <SessionTreeNodeComponent
        node={tree}
        {currentSessionId}
        depth={0}
        onSelectSession={handleSelectSession}
        {onResolveEscalation}
      />
    </div>
  {:else}
    <div class="text-gray-400 text-sm text-center py-4">
      No session tree found
    </div>
  {/if}
</div>

<style>
  .session-tree {
    font-size: 13px;
  }

  .session-tree.compact {
    font-size: 12px;
  }

  .session-tree.compact :global(.children) {
    margin-left: 8px;
  }

  .tree-content {
    max-height: 300px;
    overflow-y: auto;
  }

  .session-tree:not(.compact) .tree-content {
    max-height: none;
  }
</style>
