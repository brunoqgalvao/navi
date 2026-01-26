<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import type { WorkspaceNodeData } from "../../types";
  import { NODE_COLORS, NODE_DIMENSIONS } from "../../constants";

  interface Props {
    data: WorkspaceNodeData;
    selected?: boolean;
  }

  let { data, selected = false }: Props = $props();

  const colors = NODE_COLORS.workspace;
  const dimensions = NODE_DIMENSIONS.workspace;
</script>

<div
  class="rounded-lg border-2 shadow-sm transition-all duration-200 {colors.bg} {colors.border} {selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''}"
  style="width: {dimensions.width}px; min-height: {dimensions.height}px;"
>
  <div class="p-3">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <div class="w-6 h-6 rounded flex items-center justify-center bg-slate-200 dark:bg-slate-700">
        <svg class="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>
      <span class="font-semibold text-sm truncate {colors.text}">{data.label}</span>
    </div>

    <!-- Stats -->
    <div class="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
      <span class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        {data.projectCount} projects
      </span>
      <span class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {data.sessionCount} sessions
      </span>
    </div>
  </div>

  <!-- Output handle (right side) -->
  <Handle type="source" position={Position.Right} class="!bg-slate-400 !w-3 !h-3" />
</div>
