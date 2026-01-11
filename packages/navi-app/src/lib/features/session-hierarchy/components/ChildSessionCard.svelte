<script lang="ts">
  import type { HierarchySession } from "../types";
  import { parseEscalation, parseDeliverable } from "../types";
  import AgentStatusBadge from "./AgentStatusBadge.svelte";
  import { getAgentDefinition, type AgentType } from "$lib/core";

  interface Props {
    session: HierarchySession;
    onSelect?: () => void;
    onResolveEscalation?: () => void;
  }

  let { session, onSelect, onResolveEscalation }: Props = $props();

  const escalation = $derived(parseEscalation(session.escalation));
  const deliverable = $derived(parseDeliverable(session.deliverable));
  const isWorking = $derived(session.agent_status === "working");
  const isBlocked = $derived(session.agent_status === "blocked");
  const isDelivered = $derived(session.agent_status === "delivered");
  const isWaiting = $derived(session.agent_status === "waiting" || session.isWaitingForInput);

  // Get agent type info for native UI
  const agentDef = $derived(
    session.agent_type
      ? getAgentDefinition(session.agent_type as AgentType)
      : null
  );

  // Format time ago
  function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
</script>

<div
  class="child-session-card border rounded-lg overflow-hidden cursor-pointer {isWaiting ? 'border-yellow-300 bg-yellow-50' : isBlocked ? 'border-orange-300 bg-orange-50' : isDelivered ? 'border-green-300 bg-green-50' : agentDef ? `border-${agentDef.color}-200 bg-${agentDef.color}-50/30` : 'border-gray-200 bg-white'}"
  onclick={onSelect}
  onkeydown={(e) => e.key === 'Enter' && onSelect?.()}
  role="button"
  tabindex="0"
>
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50/50 transition-colors">
    <!-- Agent type icon (if native UI) or status badge -->
    {#if agentDef}
      <span class="text-lg shrink-0" title={agentDef.displayName}>{agentDef.icon}</span>
    {:else}
      <AgentStatusBadge status={session.agent_status} pulse={isWorking} />
    {/if}

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        {#if agentDef}
          <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-{agentDef.color}-100 text-{agentDef.color}-700 uppercase tracking-wide shrink-0">
            {agentDef.type}
          </span>
        {:else if session.role}
          <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide shrink-0">
            {session.role}
          </span>
        {/if}
        <span class="text-sm font-medium text-gray-800 truncate">
          {session.title || session.task || "Child Agent"}
        </span>
        {#if isWaiting}
          <span class="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
            Needs Input
          </span>
        {:else if agentDef}
          <AgentStatusBadge status={session.agent_status} pulse={isWorking} size="sm" />
        {/if}
      </div>
      {#if session.task && session.task !== session.title}
        <div class="text-xs text-gray-500 truncate mt-0.5">{session.task}</div>
      {/if}
    </div>

    <!-- Arrow indicating clickable -->
    <svg class="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
  </div>

  <!-- Activity Preview (sneakpeak) -->
  {#if session.latestPreview && !isDelivered && !isBlocked}
    <div class="border-t border-gray-100 px-3 py-2 bg-gray-50/30">
      <div class="flex items-start gap-2">
        <span class="text-[10px] font-medium text-gray-400 uppercase shrink-0 mt-0.5">
          {session.latestPreview.role === "assistant" ? "AI" : "User"}
        </span>
        <div class="flex-1 min-w-0">
          <p class="text-xs text-gray-600 line-clamp-2 leading-relaxed">
            {session.latestPreview.preview || "..."}
          </p>
        </div>
        <span class="text-[10px] text-gray-400 shrink-0">
          {timeAgo(session.latestPreview.timestamp)}
        </span>
      </div>
    </div>
  {/if}

  <!-- Waiting for input banner -->
  {#if isWaiting && session.pendingQuestionType}
    <div class="border-t border-yellow-200 px-3 py-2 bg-yellow-100/50">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-yellow-700">⏳ Waiting for: {session.pendingQuestionType}</span>
        <button
          onclick={(e) => { e.stopPropagation(); onSelect?.(); }}
          class="ml-auto text-[10px] px-2 py-0.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 shrink-0"
        >
          Respond
        </button>
      </div>
    </div>
  {:else if isWaiting && !session.pendingQuestionType}
    <div class="border-t border-yellow-200 px-3 py-2 bg-yellow-100/50">
      <div class="flex items-center gap-2 text-xs text-yellow-700">
        <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
        Waiting for user input...
      </div>
    </div>
  <!-- Inline status info (always visible) -->
  {:else if isBlocked && escalation}
    <div class="border-t border-orange-200 px-3 py-2 bg-orange-100/50">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-orange-700 uppercase">{escalation.type.replace("_", " ")}</span>
        <span class="text-xs text-orange-600 truncate flex-1">{escalation.summary}</span>
        {#if onResolveEscalation}
          <button
            onclick={(e) => { e.stopPropagation(); onResolveEscalation?.(); }}
            class="text-[10px] px-2 py-0.5 bg-orange-500 text-white rounded hover:bg-orange-600 shrink-0"
          >
            Respond
          </button>
        {/if}
      </div>
    </div>
  {:else if isDelivered && deliverable}
    <div class="border-t border-green-200 px-3 py-2 bg-green-100/50">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-green-700">✓ Completed</span>
        <span class="text-xs text-green-600 truncate flex-1">{deliverable.summary}</span>
      </div>
    </div>
  {:else if isWorking && !session.latestPreview}
    <div class="border-t border-gray-100 px-3 py-1.5 bg-gray-50/50">
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
        Working...
      </div>
    </div>
  {/if}
</div>

<style>
  .child-session-card {
    transition: all 0.2s ease;
  }
</style>
