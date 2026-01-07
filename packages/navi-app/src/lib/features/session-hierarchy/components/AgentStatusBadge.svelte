<script lang="ts">
  import type { AgentStatus } from "../types";
  import { getStatusIcon, getStatusColor } from "../types";

  interface Props {
    status: AgentStatus;
    showLabel?: boolean;
    size?: "sm" | "md" | "lg";
    pulse?: boolean;
  }

  let {
    status,
    showLabel = false,
    size = "md",
    pulse = false,
  }: Props = $props();

  const sizeClasses = {
    sm: "text-[9px]",
    md: "text-[10px]",
    lg: "text-xs",
  };

  const dotSizes = {
    sm: "w-1 h-1",
    md: "w-1.5 h-1.5",
    lg: "w-2 h-2",
  };

  const bgColors: Record<AgentStatus, string> = {
    working: "bg-green-500",
    waiting: "bg-yellow-500",
    blocked: "bg-orange-500",
    delivered: "bg-blue-500",
    failed: "bg-red-500",
    archived: "bg-gray-400",
  };

  const labels: Record<AgentStatus, string> = {
    working: "Working",
    waiting: "Waiting",
    blocked: "Blocked",
    delivered: "Done",
    failed: "Failed",
    archived: "Archived",
  };

  const shouldPulse = $derived(pulse && (status === "working" || status === "blocked"));
</script>

<span
  class="inline-flex items-center gap-1 {sizeClasses[size]} {getStatusColor(status)}"
  title={labels[status]}
>
  <span class="relative flex items-center justify-center">
    <span class="{dotSizes[size]} rounded-full {bgColors[status]}"></span>
    {#if shouldPulse}
      <span class="absolute {dotSizes[size]} rounded-full {bgColors[status]} animate-ping opacity-75"></span>
    {/if}
  </span>
  {#if showLabel}
    <span class="font-medium">{labels[status]}</span>
  {/if}
</span>
