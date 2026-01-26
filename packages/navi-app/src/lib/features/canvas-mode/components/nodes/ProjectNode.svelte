<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import type { ProjectNodeData } from "../../types";
  import { NODE_COLORS, NODE_DIMENSIONS, STATUS_COLORS } from "../../constants";

  interface Props {
    data: ProjectNodeData;
    selected?: boolean;
  }

  let { data, selected = false }: Props = $props();

  const colors = NODE_COLORS.project;
  const dimensions = NODE_DIMENSIONS.project;

  // Format cost
  const formattedCost = $derived(
    data.totalCost > 0 ? `$${data.totalCost.toFixed(2)}` : null
  );

  // Get status indicator
  const hasActiveWork = $derived(data.activeCount > 0);
</script>

<div
  class="rounded-lg border-2 shadow-sm transition-all duration-200 {colors.bg} {colors.border} {selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''}"
  style="width: {dimensions.width}px; min-height: {dimensions.height}px;"
>
  <div class="p-3">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-1">
      <div class="w-6 h-6 rounded flex items-center justify-center bg-blue-100 dark:bg-blue-800">
        <svg class="w-4 h-4 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>
      <span class="font-semibold text-sm truncate flex-1 {colors.text}">{data.label}</span>
      {#if hasActiveWork}
        <span class="w-2 h-2 rounded-full {STATUS_COLORS.working.bg} animate-pulse"></span>
      {/if}
    </div>

    <!-- Path (truncated) -->
    <p class="text-xs text-blue-600/60 dark:text-blue-400/60 truncate mb-2" title={data.projectPath}>
      {data.projectPath.split("/").slice(-2).join("/")}
    </p>

    <!-- Stats -->
    <div class="flex items-center justify-between text-xs">
      <span class="text-blue-600/80 dark:text-blue-400/80">
        {data.sessionCount} session{data.sessionCount !== 1 ? "s" : ""}
      </span>
      {#if formattedCost}
        <span class="text-blue-500 dark:text-blue-400 font-medium">{formattedCost}</span>
      {/if}
    </div>

    {#if data.activeCount > 0}
      <div class="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
        <span class="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          {data.activeCount} active
        </span>
      </div>
    {/if}
  </div>

  <!-- Input handle (left side) -->
  <Handle type="target" position={Position.Left} class="!bg-blue-400 !w-3 !h-3" />
  <!-- Output handle (right side) -->
  <Handle type="source" position={Position.Right} class="!bg-blue-400 !w-3 !h-3" />
</div>
