<script lang="ts">
  import type { SessionTreeNode, AgentStatus } from "../types";
  import { getStatusIcon, getStatusColor, isActiveStatus, parseEscalation } from "../types";
  import Self from "./SessionTreeNode.svelte";

  interface Props {
    node: SessionTreeNode;
    currentSessionId: string | null;
    depth?: number;
    onSelectSession: (session: SessionTreeNode) => void;
    onResolveEscalation?: (sessionId: string) => void;
  }

  let {
    node,
    currentSessionId,
    depth = 0,
    onSelectSession,
    onResolveEscalation,
  }: Props = $props();

  let expanded = $state(true);
  let hasChildren = $derived(node.children && node.children.length > 0);
  let isActive = $derived(isActiveStatus(node.agent_status));
  let isSelected = $derived(currentSessionId === node.id);
  let escalation = $derived(parseEscalation(node.escalation));

  function toggleExpand(e: Event) {
    e.stopPropagation();
    expanded = !expanded;
  }

  function handleSelect() {
    onSelectSession(node);
  }

  function handleResolve(e: Event) {
    e.stopPropagation();
    onResolveEscalation?.(node.id);
  }

  // Indentation based on depth
  const indent = $derived(`${depth * 12}px`);
</script>

<div class="select-none">
  <!-- Session Node Row -->
  <div
    class="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] transition-colors
      {isSelected ? 'bg-accent/10 text-accent-foreground border border-accent/30' : 'hover:bg-gray-100 text-gray-600'}
      {!isActive ? 'opacity-60' : ''}"
    style="padding-left: calc(8px + {indent})"
  >
    <!-- Expand/collapse toggle -->
    {#if hasChildren}
      <button
        onclick={toggleExpand}
        class="p-0.5 -ml-1 hover:bg-gray-200 rounded shrink-0"
        aria-label={expanded ? "Collapse" : "Expand"}
      >
        <svg
          class="w-3 h-3 transition-transform {expanded ? 'rotate-90' : ''}"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
        </svg>
      </button>
    {:else}
      <span class="w-4 shrink-0"></span>
    {/if}

    <!-- Clickable session area -->
    <button
      onclick={handleSelect}
      class="flex-1 flex items-center gap-1.5 text-left"
    >
      <!-- Status indicator -->
      <span class="{getStatusColor(node.agent_status)} text-[10px] shrink-0" title={node.agent_status}>
        {getStatusIcon(node.agent_status)}
      </span>

      <!-- Role badge -->
      {#if node.role && depth > 0}
        <span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0 uppercase tracking-wide">
          {node.role}
        </span>
      {/if}

      <!-- Title -->
      <span class="truncate font-medium {node.agent_status === 'archived' ? 'text-gray-400' : ''}">
        {node.title || node.task || "Untitled"}
      </span>
    </button>

    <!-- Blocked indicator -->
    {#if node.agent_status === "blocked" && escalation}
      <button
        onclick={handleResolve}
        class="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors"
        title="Click to respond to escalation"
      >
        Needs input
      </button>
    {/if}

    <!-- Child count badge -->
    {#if hasChildren && !expanded}
      <span class="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
        {node.children.length}
      </span>
    {/if}
  </div>

  <!-- Escalation preview (when blocked) -->
  {#if node.agent_status === "blocked" && escalation && isSelected}
    <div
      class="ml-4 mt-1 mb-2 p-2 rounded-md bg-orange-50 border border-orange-200 text-[11px]"
      style="margin-left: calc(16px + {indent})"
    >
      <div class="font-medium text-orange-700 mb-1">
        {escalation.type === "question" ? "Question" : escalation.type === "decision_needed" ? "Decision needed" : escalation.type === "blocker" ? "Blocked" : "Permission needed"}
      </div>
      <div class="text-orange-600">{escalation.summary}</div>
      {#if escalation.options && escalation.options.length > 0}
        <div class="mt-1.5 flex flex-wrap gap-1">
          {#each escalation.options as option}
            <span class="px-1.5 py-0.5 bg-orange-100 rounded text-orange-700">{option}</span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Children (recursive) -->
  {#if hasChildren && expanded}
    <div class="children">
      {#each node.children as child (child.id)}
        <Self
          node={child}
          {currentSessionId}
          depth={depth + 1}
          {onSelectSession}
          {onResolveEscalation}
        />
      {/each}
    </div>
  {/if}
</div>
