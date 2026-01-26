<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import type { AgentNodeData } from "../../types";
  import { NODE_DIMENSIONS, AGENT_TYPE_COLORS, STATUS_COLORS } from "../../constants";

  interface Props {
    data: AgentNodeData;
    selected?: boolean;
  }

  let { data, selected = false }: Props = $props();

  const dimensions = NODE_DIMENSIONS.agent;

  // Get agent type styling
  const agentStyle = $derived(
    AGENT_TYPE_COLORS[data.agentType || "general"] || AGENT_TYPE_COLORS.general
  );

  // Get status styling
  const statusStyle = $derived(STATUS_COLORS[data.status] || STATUS_COLORS.idle);

  // Truncate task
  const truncatedTask = $derived(
    data.task && data.task.length > 40
      ? data.task.slice(0, 40) + "..."
      : data.task
  );
</script>

<div
  class="rounded-lg border-2 shadow-sm transition-all duration-200 {agentStyle.bg} border-purple-200 dark:border-purple-700 {selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''}"
  style="width: {dimensions.width}px; min-height: {dimensions.height}px;"
>
  <div class="p-2.5">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-1.5">
      <span class="text-base">{agentStyle.icon}</span>
      <span class="font-medium text-xs truncate flex-1 {agentStyle.text}">
        {data.role || data.agentType || "Agent"}
      </span>
      <!-- Status indicator -->
      <span
        class="w-2 h-2 rounded-full {statusStyle.bg} {statusStyle.pulse ? 'animate-pulse' : ''}"
        title={data.status}
      ></span>
    </div>

    <!-- Task preview -->
    {#if truncatedTask}
      <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2" title={data.task}>
        {truncatedTask}
      </p>
    {/if}

    <!-- Agent type badge -->
    <div class="mt-1.5 flex items-center justify-between">
      <span class="text-[10px] px-1.5 py-0.5 rounded {agentStyle.bg} {agentStyle.text} border border-current/20">
        {data.agentType || "general"}
      </span>
      <span class="text-[10px] {statusStyle.text}">
        {data.status}
      </span>
    </div>
  </div>

  <!-- Input handle (left side) -->
  <Handle type="target" position={Position.Left} class="!bg-purple-400 !w-2.5 !h-2.5" />
  <!-- Output handle (right side, for nested agents) -->
  <Handle type="source" position={Position.Right} class="!bg-purple-400 !w-2.5 !h-2.5" />
</div>
