<script lang="ts">
  import type { Session } from "../../api";
  import RelativeTime from "../RelativeTime.svelte";
  import SessionStatusBadge from "../SessionStatusBadge.svelte";
  import { sessionStatus } from "../../stores";
  import { currentSession as session } from "../../stores";

  interface Props {
    children: Session[];
    onSelectSession: (session: Session) => void;
    parentId: string;
  }

  let { children, onSelectSession, parentId }: Props = $props();

  // Separate forks from agents (only show sessions with proper session_type)
  const forks = $derived(children.filter(c => c.session_type === "fork"));
  const agents = $derived(children.filter(c => c.session_type === "agent"));

  // Combined list of displayable children (only forks + agents, not 'root' typed sessions)
  const displayableChildren = $derived([...forks, ...agents]);

  // Track expanded state
  let expanded = $state(false);

  // Auto-expand if any displayable child is active
  const hasActiveChild = $derived(
    displayableChildren.some(c => {
      const status = $sessionStatus.get(c.id)?.status;
      return status && status !== "idle";
    })
  );

  // Auto-expand when there are active children
  $effect(() => {
    if (hasActiveChild) {
      expanded = true;
    }
  });
</script>

{#if forks.length > 0 || agents.length > 0}
  <div class="ml-4 mt-0.5">
    <button
      onclick={() => expanded = !expanded}
      class="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors py-0.5 w-full focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-300 rounded"
    >
      <svg
        class="w-3 h-3 transition-transform {expanded ? 'rotate-90' : ''}"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
      </svg>
      <span>
        {#if forks.length > 0 && agents.length > 0}
          {forks.length} fork{forks.length !== 1 ? 's' : ''}, {agents.length} agent{agents.length !== 1 ? 's' : ''}
        {:else if forks.length > 0}
          {forks.length} fork{forks.length !== 1 ? 's' : ''}
        {:else}
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        {/if}
      </span>
      {#if hasActiveChild}
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-1"></span>
      {/if}
    </button>

    {#if expanded}
      <div class="border-l border-gray-200 ml-1.5 pl-2 mt-1 space-y-0.5">
        {#each displayableChildren as child (child.id)}
          {@const statusValue = $sessionStatus.get(child.id)?.status}
          {@const hasActiveStatus = statusValue && statusValue !== "idle"}
          <button
            onclick={() => onSelectSession(child)}
            class="w-full text-left px-2 py-1.5 rounded text-[11px] flex items-center gap-2 transition-colors {$session.sessionId === child.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
          >
            <!-- Type indicator -->
            {#if child.session_type === "fork"}
              <svg class="w-3 h-3 shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            {:else}
              <svg class="w-3 h-3 shrink-0 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            {/if}

            <!-- Title -->
            <span class="truncate flex-1">
              {child.title}
              {#if child.role}
                <span class="text-gray-400">({child.role})</span>
              {/if}
            </span>

            <!-- Status badge or time -->
            {#if hasActiveStatus}
              <SessionStatusBadge status={statusValue} size="sm" />
            {:else if child.agent_status === "delivered"}
              <span class="text-[9px] text-emerald-500">✓</span>
            {:else if child.agent_status === "blocked"}
              <span class="text-[9px] text-orange-500">!</span>
            {:else}
              <span class="text-[9px] text-gray-400">
                <RelativeTime timestamp={child.updated_at} />
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
