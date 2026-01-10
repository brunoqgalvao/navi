<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { HierarchySession } from "../types";
  import { sessionHierarchyApi } from "../api";
  import { isActiveStatus } from "../types";
  import ChildSessionCard from "./ChildSessionCard.svelte";

  interface Props {
    parentSessionId: string;
    onSelectSession?: (session: HierarchySession) => void;
    onResolveEscalation?: (sessionId: string) => void;
  }

  let { parentSessionId, onSelectSession, onResolveEscalation }: Props = $props();

  let children = $state<HierarchySession[]>([]);
  let loading = $state(true);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  const activeChildren = $derived(children.filter(c => isActiveStatus(c.agent_status)));
  const completedChildren = $derived(children.filter(c => !isActiveStatus(c.agent_status)));
  const hasBlockedChildren = $derived(children.some(c => c.agent_status === "blocked"));

  async function loadChildren() {
    try {
      children = await sessionHierarchyApi.getChildren(parentSessionId);
    } catch (e) {
      console.error("Failed to load children:", e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadChildren();
    // Refresh every 3 seconds while there are active children
    refreshInterval = setInterval(() => {
      if (activeChildren.length > 0) {
        loadChildren();
      }
    }, 3000);
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });

  // Reload when parent changes
  $effect(() => {
    if (parentSessionId) {
      loading = true;
      loadChildren();
    }
  });
</script>

{#if children.length > 0}
  <div class="child-sessions-panel my-4">
    <div class="flex items-center gap-2 mb-2">
      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Child Agents ({activeChildren.length} active)
      </span>
      {#if hasBlockedChildren}
        <span class="flex items-center gap-1 text-[10px] text-orange-500 bg-orange-100 px-1.5 py-0.5 rounded">
          <span class="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
          Needs input
        </span>
      {/if}
    </div>

    <div class="space-y-2">
      {#each activeChildren as child (child.id)}
        <ChildSessionCard
          session={child}
          onSelect={() => onSelectSession?.(child)}
          onResolveEscalation={() => onResolveEscalation?.(child.id)}
        />
      {/each}

      {#if completedChildren.length > 0}
        <details class="group">
          <summary class="cursor-pointer text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <svg class="w-3 h-3 transition-transform group-open:rotate-90" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            {completedChildren.length} completed
          </summary>
          <div class="mt-2 space-y-2 pl-4">
            {#each completedChildren as child (child.id)}
              <ChildSessionCard
                session={child}
                onSelect={() => onSelectSession?.(child)}
              />
            {/each}
          </div>
        </details>
      {/if}
    </div>
  </div>
{:else if loading}
  <div class="my-4 flex items-center gap-2 text-xs text-gray-400">
    <svg class="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
    </svg>
    Loading child agents...
  </div>
{/if}

<style>
  .child-sessions-panel {
    border-left: 2px solid #e5e7eb;
    padding-left: 12px;
  }
</style>
