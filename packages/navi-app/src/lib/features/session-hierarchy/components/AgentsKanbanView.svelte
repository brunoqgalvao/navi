<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { HierarchySession } from "../types";
  import { sessionHierarchyApi } from "../api";
  import ChildSessionCard from "./ChildSessionCard.svelte";

  interface Props {
    parentSessionId: string;
    onSelectSession?: (session: HierarchySession) => void;
    onResolveEscalation?: (sessionId: string) => void;
    refreshMs?: number;
  }

  let {
    parentSessionId,
    onSelectSession,
    onResolveEscalation,
    refreshMs = 3000,
  }: Props = $props();

  let loading = $state(true);
  let children = $state<HierarchySession[]>([]);
  let stopping = $state(false);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  function isAttention(session: HierarchySession): boolean {
    return (
      session.agent_status === "blocked" ||
      session.agent_status === "pending_review" ||
      session.agent_status === "clarification_requested" ||
      !!session.isWaitingForInput
    );
  }

  function isCompleted(session: HierarchySession): boolean {
    return ["delivered", "failed", "archived"].includes(session.agent_status);
  }

  const agentChildren = $derived(children.filter((c) => c.session_type !== "fork"));
  const attentionAgents = $derived(agentChildren.filter(isAttention));
  const workingAgents = $derived(agentChildren.filter((c) => c.agent_status === "working"));
  const waitingAgents = $derived(
    agentChildren.filter((c) => c.agent_status === "waiting" && !c.isWaitingForInput)
  );
  const completedAgents = $derived(agentChildren.filter(isCompleted));
  const activeCount = $derived(
    attentionAgents.length + workingAgents.length + waitingAgents.length
  );

  async function loadChildren() {
    if (!parentSessionId) return;
    try {
      loading = true;
      children = await sessionHierarchyApi.getChildren(parentSessionId);
    } catch (e) {
      console.error("Failed to load agents board:", e);
    } finally {
      loading = false;
    }
  }

  async function stopAllActive() {
    if (!parentSessionId || stopping) return;
    stopping = true;
    try {
      await sessionHierarchyApi.cancelChildren(parentSessionId);
      await loadChildren();
    } catch (e) {
      console.error("Failed to stop child agents:", e);
    } finally {
      stopping = false;
    }
  }

  function startPolling() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadChildren, refreshMs);
  }

  onMount(() => {
    loadChildren();
    startPolling();
  });

  onDestroy(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  $effect(() => {
    if (!parentSessionId) return;
    loadChildren();
    startPolling();
    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };
  });
</script>

<div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
  <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">Agents</span>
        <span class="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
          {agentChildren.length}
        </span>
      </div>
      {#if activeCount > 0}
        <button
          onclick={stopAllActive}
          disabled={stopping}
          class="text-[11px] px-2.5 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
          title="Stop all active child agents"
        >
          {stopping ? "Stopping..." : "Stop Active"}
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">Loading agents...</div>
  {:else if agentChildren.length === 0}
    <div class="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">No child agents yet.</div>
  {:else}
    <div class="p-3 overflow-x-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 min-w-[720px]">
        <div class="rounded-lg border border-orange-200 bg-orange-50/40 p-2">
          <div class="px-1 pb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-orange-700 uppercase tracking-wide">Needs Attention</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{attentionAgents.length}</span>
          </div>
          <div class="space-y-2">
            {#if attentionAgents.length === 0}
              <div class="text-[11px] text-orange-500/80 px-1 py-2">None</div>
            {:else}
              {#each attentionAgents as agent (agent.id)}
                <ChildSessionCard
                  session={agent}
                  onSelect={() => onSelectSession?.(agent)}
                  onResolveEscalation={() => onResolveEscalation?.(agent.id)}
                />
              {/each}
            {/if}
          </div>
        </div>

        <div class="rounded-lg border border-green-200 bg-green-50/40 p-2">
          <div class="px-1 pb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-green-700 uppercase tracking-wide">Working</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">{workingAgents.length}</span>
          </div>
          <div class="space-y-2">
            {#if workingAgents.length === 0}
              <div class="text-[11px] text-green-500/80 px-1 py-2">None</div>
            {:else}
              {#each workingAgents as agent (agent.id)}
                <ChildSessionCard session={agent} onSelect={() => onSelectSession?.(agent)} />
              {/each}
            {/if}
          </div>
        </div>

        <div class="rounded-lg border border-yellow-200 bg-yellow-50/40 p-2">
          <div class="px-1 pb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Waiting</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">{waitingAgents.length}</span>
          </div>
          <div class="space-y-2">
            {#if waitingAgents.length === 0}
              <div class="text-[11px] text-yellow-600/80 px-1 py-2">None</div>
            {:else}
              {#each waitingAgents as agent (agent.id)}
                <ChildSessionCard session={agent} onSelect={() => onSelectSession?.(agent)} />
              {/each}
            {/if}
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 bg-gray-50/70 p-2">
          <div class="px-1 pb-2 flex items-center justify-between">
            <span class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Completed</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{completedAgents.length}</span>
          </div>
          <div class="space-y-2">
            {#if completedAgents.length === 0}
              <div class="text-[11px] text-gray-500/80 px-1 py-2">None</div>
            {:else}
              {#each completedAgents as agent (agent.id)}
                <ChildSessionCard session={agent} onSelect={() => onSelectSession?.(agent)} />
              {/each}
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
