<script lang="ts">
  // CommentIndicator - Small icon/badge that shows a message has comments
  // @experimental
  import type { CommentThread } from "../types";

  interface Props {
    threads: CommentThread[];
    onclick?: () => void;
  }

  let { threads, onclick }: Props = $props();

  const unresolvedCount = $derived(threads.filter(t => t.resolved === 0).length);
  const totalCount = $derived(threads.length);
</script>

{#if totalCount > 0}
  <button
    onclick={onclick}
    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium transition-colors
      {unresolvedCount > 0
        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50'
        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'}"
    title="{unresolvedCount} unresolved, {totalCount - unresolvedCount} resolved"
  >
    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
    </svg>
    {#if unresolvedCount > 0}
      <span>{unresolvedCount}</span>
    {:else}
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
      </svg>
    {/if}
  </button>
{/if}
