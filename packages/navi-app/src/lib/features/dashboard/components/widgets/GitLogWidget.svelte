<script lang="ts">
  /**
   * GitLogWidget - Shows recent git commits
   */
  import { onMount } from "svelte";
  import type { GitLogWidgetConfig } from "../../types";
  import { getLog } from "$lib/features/git/api";
  import type { GitCommit } from "$lib/features/git/types";

  interface Props {
    config: GitLogWidgetConfig;
    projectPath: string;
  }

  let { config, projectPath }: Props = $props();

  let loading = $state(true);
  let commits = $state<GitCommit[]>([]);
  let error = $state<string | null>(null);

  const limit = config.limit || 5;

  async function loadCommits() {
    loading = true;
    error = null;

    try {
      commits = await getLog(projectPath, limit);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load commits";
      commits = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadCommits();
  });
</script>

<div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
  <div class="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Commits</span>
    <button
      onclick={loadCommits}
      class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      title="Refresh"
    >
      ↻
    </button>
  </div>

  {#if loading}
    <div class="p-4 text-center">
      <span class="text-sm text-gray-500">Loading...</span>
    </div>
  {:else if error}
    <div class="p-4 text-center">
      <span class="text-sm text-red-500">{error}</span>
    </div>
  {:else if commits.length === 0}
    <div class="p-4 text-center">
      <span class="text-sm text-gray-500">No commits found</span>
    </div>
  {:else}
    <div class="divide-y divide-gray-200 dark:divide-gray-700">
      {#each commits as commit}
        <div class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
          <div class="flex items-start gap-2">
            <span class="shrink-0 px-1.5 py-0.5 text-[10px] font-mono text-gray-500 bg-gray-200 dark:bg-gray-700 rounded">
              {commit.shortHash}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-800 dark:text-gray-200 truncate">{commit.message}</p>
              <p class="text-xs text-gray-500 mt-0.5">
                {commit.author} · {commit.date}
              </p>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
