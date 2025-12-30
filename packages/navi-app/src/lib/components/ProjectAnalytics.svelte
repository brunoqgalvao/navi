<script lang="ts">
  import { onMount } from "svelte";
  import { analyticsApi, type ProjectAnalytics, type FileAccess } from "../api";

  interface Props {
    projectId: string;
    projectPath: string;
  }

  let { projectId, projectPath }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let analytics = $state<ProjectAnalytics | null>(null);
  let days = $state(30);
  let viewMode = $state<"files" | "tools">("files");

  async function loadAnalytics() {
    loading = true;
    error = null;
    try {
      analytics = await analyticsApi.getProjectAnalytics(projectId, days, 100);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load analytics";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadAnalytics();
  });

  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString();
  }

  function getRelativePath(fullPath: string): string {
    if (fullPath.startsWith(projectPath)) {
      const rel = fullPath.slice(projectPath.length + 1);
      return rel || fullPath;
    }
    return fullPath;
  }

  function getFileDirectory(path: string): string {
    const rel = getRelativePath(path);
    const lastSlash = rel.lastIndexOf("/");
    return lastSlash > 0 ? rel.substring(0, lastSlash) : "";
  }

  function getFileName(path: string): string {
    const rel = getRelativePath(path);
    const lastSlash = rel.lastIndexOf("/");
    return lastSlash > 0 ? rel.substring(lastSlash + 1) : rel;
  }

  // Group files by directory
  function groupFilesByDirectory(files: FileAccess[]): Map<string, FileAccess[]> {
    const groups = new Map<string, FileAccess[]>();
    for (const file of files) {
      const dir = getFileDirectory(file.path) || "(root)";
      if (!groups.has(dir)) {
        groups.set(dir, []);
      }
      groups.get(dir)!.push(file);
    }
    // Sort groups by total access count
    return new Map(
      [...groups.entries()].sort((a, b) => {
        const aTotal = a[1].reduce((sum, f) => sum + f.reads + f.writes + f.edits, 0);
        const bTotal = b[1].reduce((sum, f) => sum + f.reads + f.writes + f.edits, 0);
        return bTotal - aTotal;
      })
    );
  }

  function getMaxToolCount(): number {
    if (!analytics) return 1;
    return Math.max(...analytics.toolUsage.map(t => t.count), 1);
  }
</script>

<div class="h-full overflow-y-auto">
  <div class="max-w-4xl mx-auto p-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-xl font-semibold text-gray-900">Session Analytics</h2>
        <p class="text-sm text-gray-500 mt-1">
          File access patterns from Claude sessions
        </p>
      </div>
      <div class="flex items-center gap-2">
        <select
          bind:value={days}
          onchange={() => loadAnalytics()}
          class="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
        <button
          onclick={() => loadAnalytics()}
          disabled={loading}
          class="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>

    {#if loading && !analytics}
      <div class="flex items-center justify-center h-64">
        <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    {:else if error}
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p class="text-gray-600 mb-3">{error}</p>
        <button
          onclick={() => loadAnalytics()}
          class="text-sm text-gray-900 underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    {:else if analytics}
      <!-- Stats Row -->
      <div class="flex items-center gap-6 mb-8 text-sm">
        <div>
          <span class="text-gray-500">Sessions:</span>
          <span class="font-medium text-gray-900 ml-1">{analytics.analyzedSessions}</span>
          <span class="text-gray-400">/ {analytics.totalSessions}</span>
        </div>
        <div class="w-px h-4 bg-gray-200"></div>
        <div>
          <span class="text-gray-500">Reads:</span>
          <span class="font-medium text-gray-900 ml-1">{formatNumber(analytics.totalReads)}</span>
        </div>
        <div>
          <span class="text-gray-500">Writes:</span>
          <span class="font-medium text-gray-900 ml-1">{formatNumber(analytics.totalWrites)}</span>
        </div>
        <div>
          <span class="text-gray-500">Edits:</span>
          <span class="font-medium text-gray-900 ml-1">{formatNumber(analytics.totalEdits)}</span>
        </div>
        {#if analytics.dateRange}
          <div class="ml-auto text-gray-400 text-xs">
            {formatDate(analytics.dateRange.start)} – {formatDate(analytics.dateRange.end)}
          </div>
        {/if}
      </div>

      <!-- View Toggle -->
      <div class="flex items-center gap-1 mb-6 border-b border-gray-200">
        <button
          onclick={() => viewMode = "files"}
          class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors {viewMode === 'files' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}"
        >
          Files
        </button>
        <button
          onclick={() => viewMode = "tools"}
          class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors {viewMode === 'tools' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}"
        >
          Tools
        </button>
      </div>

      {#if viewMode === "files"}
        <!-- Files View -->
        {#if analytics.topFiles.length === 0}
          <div class="text-center py-12 text-gray-500">
            No file access data for this period
          </div>
        {:else}
          <div class="space-y-1">
            {#each analytics.topFiles.slice(0, 30) as file}
              {@const total = file.reads + file.writes + file.edits}
              <div class="flex items-center gap-3 py-2 group">
                <code class="text-sm text-gray-600 flex-1 truncate" title={file.path}>
                  {getRelativePath(file.path)}
                </code>
                <div class="flex items-center gap-3 text-xs text-gray-400">
                  {#if file.reads > 0}<span>R:{file.reads}</span>{/if}
                  {#if file.writes > 0}<span>W:{file.writes}</span>{/if}
                  {#if file.edits > 0}<span>E:{file.edits}</span>{/if}
                </div>
                <span class="text-xs text-gray-500 w-8 text-right">{total}</span>
              </div>
            {/each}
          </div>
          {#if analytics.topFiles.length > 30}
            <p class="text-xs text-gray-400 mt-4 text-center">
              Showing top 30 of {analytics.topFiles.length} files
            </p>
          {/if}
        {/if}
      {:else}
        <!-- Tools View -->
        <div class="space-y-3">
          {#each analytics.toolUsage as tool}
            {@const maxCount = getMaxToolCount()}
            {@const percentage = (tool.count / maxCount) * 100}
            <div class="flex items-center gap-3">
              <code class="text-sm text-gray-700 w-24 shrink-0">{tool.name}</code>
              <div class="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                <div
                  class="h-full bg-gray-300 transition-all duration-300"
                  style="width: {percentage}%"
                ></div>
              </div>
              <span class="text-sm text-gray-500 w-16 text-right">{formatNumber(tool.count)}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Hotspots (only show if we have them) -->
      {#if analytics.hotspots.length > 0}
        <div class="mt-10 pt-6 border-t border-gray-200">
          <h3 class="text-sm font-medium text-gray-700 mb-3">
            Frequently accessed regions
          </h3>
          <div class="space-y-1">
            {#each analytics.hotspots.slice(0, 5) as hotspot}
              <div class="flex items-center gap-2 text-sm">
                <code class="text-gray-600 truncate flex-1">
                  {getRelativePath(hotspot.file)}:{hotspot.range}
                </code>
                <span class="text-gray-400">{hotspot.accessCount}x</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <div class="text-center py-16">
        <svg class="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-gray-500">No analytics data yet</p>
        <p class="text-sm text-gray-400 mt-1">Start using Claude to see file access patterns</p>
      </div>
    {/if}
  </div>
</div>
