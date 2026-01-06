<script lang="ts">
  /**
   * SessionStatusBadge - Simple round dot indicator for chat session status
   */
  import type { SessionStatusType } from "../stores";

  interface Props {
    status: SessionStatusType | undefined;
    size?: "sm" | "md";
  }

  let { status, size = "sm" }: Props = $props();

  const dotSize = $derived(size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5");
</script>

{#if status === "running"}
  <span class="relative shrink-0 flex items-center justify-center" title="Processing...">
    <span class="{dotSize} bg-indigo-500 rounded-full"></span>
    <span class="absolute {dotSize} bg-indigo-400 rounded-full animate-ping opacity-75"></span>
  </span>
{:else if status === "permission"}
  <span class="relative shrink-0 flex items-center justify-center" title="Permission required">
    <span class="{dotSize} bg-amber-500 rounded-full"></span>
    <span class="absolute {dotSize} bg-amber-400 rounded-full animate-ping opacity-75"></span>
  </span>
{:else if status === "awaiting_input"}
  <span class="relative shrink-0 flex items-center justify-center" title="Waiting for input">
    <span class="{dotSize} bg-indigo-500 rounded-full"></span>
    <span class="absolute {dotSize} bg-indigo-400 rounded-full animate-pulse opacity-75"></span>
  </span>
{:else if status === "unread"}
  <span class="shrink-0 {dotSize} bg-gray-400 rounded-full" title="New results"></span>
{/if}
