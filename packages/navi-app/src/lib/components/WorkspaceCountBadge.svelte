<script lang="ts">
  /**
   * WorkspaceCountBadge - Round notification count badge for workspaces
   */

  interface Props {
    /** Number of sessions needing attention (permission/awaiting input) */
    attentionCount: number;
    /** Number of running sessions */
    runningCount: number;
    size?: "sm" | "md";
  }

  let { attentionCount, runningCount, size = "sm" }: Props = $props();

  const totalCount = $derived(attentionCount + runningCount);
  const hasAttention = $derived(attentionCount > 0);

  // Round badge - fixed size circle, expands slightly for 2+ digits
  const badgeSize = $derived(
    size === "sm"
      ? totalCount > 9 ? "min-w-[14px] h-[14px] text-[9px]" : "w-[14px] h-[14px] text-[9px]"
      : totalCount > 9 ? "min-w-[16px] h-[16px] text-[10px]" : "w-[16px] h-[16px] text-[10px]"
  );
</script>

{#if totalCount > 0}
  <span
    class="inline-flex items-center justify-center font-semibold rounded-full shrink-0 {badgeSize}
      {hasAttention ? 'bg-amber-500 text-white' : 'bg-indigo-500 text-white'}"
    title="{attentionCount > 0 ? `${attentionCount} need attention` : ''}{attentionCount > 0 && runningCount > 0 ? ', ' : ''}{runningCount > 0 ? `${runningCount} running` : ''}"
  >
    {totalCount > 9 ? "9+" : totalCount}
  </span>
{/if}
