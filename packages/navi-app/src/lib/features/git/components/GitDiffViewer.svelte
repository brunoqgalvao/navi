<script lang="ts">
  import GitUnifiedDiff from "../../../components/GitUnifiedDiff.svelte";
  import type { GitCommit } from "../types";

  interface Props {
    diff: string | null;
    loading: boolean;
    selectedCommit?: GitCommit | null;
    selectedFile?: string | null;
  }

  let { diff, loading, selectedCommit, selectedFile }: Props = $props();
</script>

<div class="h-full overflow-y-auto bg-gray-50">
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <svg class="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  {:else if diff}
    <div class="p-3">
      {#if selectedCommit}
        <div class="mb-3 p-3 bg-white border border-gray-200 rounded-lg">
          <p class="font-medium text-gray-900 text-sm">{selectedCommit.message}</p>
          <p class="text-gray-500 text-xs mt-1">
            {selectedCommit.author} · {selectedCommit.date}
          </p>
        </div>
      {/if}
      {#if selectedFile}
        <div class="mb-3 p-2 bg-white border border-gray-200 rounded">
          <p class="text-xs font-mono text-gray-600 truncate" title={selectedFile}>{selectedFile}</p>
        </div>
      {/if}
      <GitUnifiedDiff {diff} />
    </div>
  {:else}
    <div class="flex items-center justify-center h-full text-sm text-gray-400">
      Select a file or commit to view diff
    </div>
  {/if}
</div>

