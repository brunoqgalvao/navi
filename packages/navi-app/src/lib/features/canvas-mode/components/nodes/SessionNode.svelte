<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import type { SessionNodeData } from "../../types";
  import { NODE_COLORS, NODE_DIMENSIONS, STATUS_COLORS } from "../../constants";

  interface Props {
    data: SessionNodeData;
    selected?: boolean;
  }

  let { data, selected = false }: Props = $props();

  const colors = NODE_COLORS.session;
  const dimensions = NODE_DIMENSIONS.session;

  // Get status styling
  const statusStyle = $derived(STATUS_COLORS[data.status] || STATUS_COLORS.idle);

  // Format time ago
  const timeAgo = $derived(() => {
    const diff = Date.now() - data.updatedAt;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  });

  // Model display
  const modelDisplay = $derived(
    data.model
      ? data.model.replace("claude-", "").replace("-latest", "").split("-")[0]
      : "unknown"
  );
</script>

<div
  class="rounded-lg border-2 shadow-sm transition-all duration-200 {colors.bg} {colors.border} {selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''}"
  style="width: {dimensions.width}px; min-height: {dimensions.height}px;"
>
  <div class="p-3">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <div class="w-6 h-6 rounded flex items-center justify-center bg-emerald-100 dark:bg-emerald-800">
        <svg class="w-4 h-4 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <span class="font-medium text-sm truncate flex-1 {colors.text}">{data.label}</span>
      <!-- Status indicator -->
      <span
        class="w-2.5 h-2.5 rounded-full {statusStyle.bg} {statusStyle.pulse ? 'animate-pulse' : ''}"
        title={data.status}
      ></span>
    </div>

    <!-- Meta info -->
    <div class="flex items-center justify-between text-xs text-emerald-600/70 dark:text-emerald-400/70">
      <span class="flex items-center gap-1">
        <span class="px-1.5 py-0.5 rounded bg-emerald-200/50 dark:bg-emerald-700/50 text-emerald-700 dark:text-emerald-300">
          {modelDisplay}
        </span>
      </span>
      <span>{timeAgo()}</span>
    </div>

    <!-- Children indicator -->
    {#if data.childCount > 0}
      <div class="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-700">
        <span class="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {data.childCount} agent{data.childCount !== 1 ? "s" : ""} spawned
        </span>
      </div>
    {/if}
  </div>

  <!-- Input handle (left side) -->
  <Handle type="target" position={Position.Left} class="!bg-emerald-400 !w-3 !h-3" />
  <!-- Output handle (right side, for spawned agents) -->
  <Handle type="source" position={Position.Right} class="!bg-emerald-400 !w-3 !h-3" />
</div>
