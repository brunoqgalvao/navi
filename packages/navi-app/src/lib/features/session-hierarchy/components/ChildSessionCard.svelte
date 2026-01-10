<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { HierarchySession, AgentStatus } from "../types";
  import { getStatusIcon, getStatusColor, isActiveStatus, parseEscalation, parseDeliverable } from "../types";
  import { sessionHierarchyApi } from "../api";
  import AgentStatusBadge from "./AgentStatusBadge.svelte";

  interface Props {
    session: HierarchySession;
    onSelect?: () => void;
    onResolveEscalation?: () => void;
  }

  let { session, onSelect, onResolveEscalation }: Props = $props();

  let expanded = $state(false);
  let latestMessage = $state<string | null>(null);

  const escalation = $derived(parseEscalation(session.escalation));
  const deliverable = $derived(parseDeliverable(session.deliverable));
  const isWorking = $derived(session.agent_status === "working");
  const isBlocked = $derived(session.agent_status === "blocked");
  const isDelivered = $derived(session.agent_status === "delivered");
</script>

<div class="child-session-card border rounded-lg overflow-hidden {isBlocked ? 'border-orange-300 bg-orange-50' : isDelivered ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}">
  <!-- Header -->
  <button
    onclick={() => { expanded = !expanded; onSelect?.(); }}
    class="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
  >
    <AgentStatusBadge status={session.agent_status} pulse={isWorking} />

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        {#if session.role}
          <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide shrink-0">
            {session.role}
          </span>
        {/if}
        <span class="text-sm font-medium text-gray-800 truncate">
          {session.title || session.task || "Child Agent"}
        </span>
      </div>
      {#if session.task && session.task !== session.title}
        <div class="text-xs text-gray-500 truncate mt-0.5">{session.task}</div>
      {/if}
    </div>

    <svg
      class="w-4 h-4 text-gray-400 transition-transform shrink-0 {expanded ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Content (when expanded) -->
  {#if expanded}
    <div class="border-t border-gray-100 px-3 py-2 space-y-2">
      <!-- Escalation -->
      {#if isBlocked && escalation}
        <div class="p-2 bg-orange-100 rounded text-sm">
          <div class="font-medium text-orange-800 text-xs uppercase tracking-wide mb-1">
            {escalation.type.replace("_", " ")}
          </div>
          <div class="text-orange-700">{escalation.summary}</div>
          {#if onResolveEscalation}
            <button
              onclick={onResolveEscalation}
              class="mt-2 text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Respond
            </button>
          {/if}
        </div>
      {/if}

      <!-- Deliverable -->
      {#if isDelivered && deliverable}
        <div class="p-2 bg-green-100 rounded text-sm">
          <div class="font-medium text-green-800 text-xs uppercase tracking-wide mb-1">
            Completed
          </div>
          <div class="text-green-700">{deliverable.summary}</div>
          {#if deliverable.artifacts && deliverable.artifacts.length > 0}
            <div class="mt-1 text-xs text-green-600">
              {deliverable.artifacts.length} artifact{deliverable.artifacts.length > 1 ? 's' : ''} created
            </div>
          {/if}
        </div>
      {/if}

      <!-- Working indicator -->
      {#if isWorking}
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          Working on task...
        </div>
      {/if}

      <!-- View session button -->
      <button
        onclick={onSelect}
        class="w-full text-center text-xs text-gray-500 hover:text-gray-700 py-1"
      >
        View full session →
      </button>
    </div>
  {/if}
</div>

<style>
  .child-session-card {
    transition: all 0.2s ease;
  }
</style>
