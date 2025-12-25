<script lang="ts">
  import type { GitCommit } from "../types";

  interface Props {
    commits: GitCommit[];
    selectedCommit: GitCommit | null;
    onSelectCommit: (commit: GitCommit) => void;
  }

  let { commits, selectedCommit, onSelectCommit }: Props = $props();
</script>

<div class="h-full overflow-y-auto">
  {#if commits.length === 0}
    <div class="text-center py-8 text-sm text-gray-400">
      No commits found
    </div>
  {:else}
    <div class="divide-y divide-gray-100">
      {#each commits as commit}
        <button
          onclick={() => onSelectCommit(commit)}
          ondblclick={() => onSelectCommit(commit)}
          class="w-full p-3 text-left hover:bg-gray-50 transition-colors {selectedCommit?.hash === commit.hash ? 'bg-blue-50' : ''}"
        >
          <div class="flex items-start gap-2">
            <span class="shrink-0 px-1.5 py-0.5 text-[10px] font-mono text-gray-500 bg-gray-100 rounded">
              {commit.shortHash}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-900 truncate">{commit.message}</p>
              <p class="text-xs text-gray-500 mt-0.5">
                {commit.author} · {commit.date}
              </p>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
