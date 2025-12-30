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
  let expandedFiles = $state<Set<string>>(new Set());

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
      return fullPath.slice(projectPath.length + 1) || fullPath;
    }
    return fullPath;
  }

  function toggleFileExpand(path: string) {
    const newSet = new Set(expandedFiles);
    if (newSet.has(path)) {
      newSet.delete(path);
    } else {
      newSet.add(path);
    }
    expandedFiles = newSet;
  }

  function getToolColor(name: string): string {
    const colors: Record<string, string> = {
      Read: "bg-blue-100 text-blue-800",
      Write: "bg-green-100 text-green-800",
      Edit: "bg-amber-100 text-amber-800",
      MultiEdit: "bg-orange-100 text-orange-800",
      Bash: "bg-purple-100 text-purple-800",
      Grep: "bg-cyan-100 text-cyan-800",
      Glob: "bg-teal-100 text-teal-800",
      Task: "bg-pink-100 text-pink-800",
      WebSearch: "bg-indigo-100 text-indigo-800",
      WebFetch: "bg-sky-100 text-sky-800",
      TodoWrite: "bg-yellow-100 text-yellow-800",
    };
    return colors[name] || "bg-gray-100 text-gray-800";
  }

  function getAccessPercentage(file: FileAccess, total: number): number {
    return Math.round(((file.reads + file.writes + file.edits) / total) * 100);
  }
</script>

<div class="h-full overflow-y-auto">
  <div class="max-w-4xl mx-auto p-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-semibold text-gray-900">File Access Analytics</h2>
        <p class="text-sm text-gray-500 mt-1">
          Track which files Claude reads, writes, and edits in this project
        </p>
      </div>
      <div class="flex items-center gap-3">
        <select
          bind:value={days}
          onchange={() => loadAnalytics()}
          class="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button
          onclick={() => loadAnalytics()}
          disabled={loading}
          class="px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
    </div>

    {#if loading && !analytics}
      <div class="flex items-center justify-center h-64">
        <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    {:else if error}
      <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <svg class="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-red-700">{error}</p>
        <button
          onclick={() => loadAnalytics()}
          class="mt-4 px-4 py-2 text-sm font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    {:else if analytics}
      <!-- Summary Stats -->
      <div class="grid grid-cols-4 gap-4 mb-8">
        <div class="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p class="text-2xl font-bold text-gray-900">{analytics.analyzedSessions}</p>
          <p class="text-sm text-gray-500">Sessions analyzed</p>
          <p class="text-xs text-gray-400 mt-1">of {analytics.totalSessions} total</p>
        </div>
        <div class="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p class="text-2xl font-bold text-blue-900">{formatNumber(analytics.totalReads)}</p>
          <p class="text-sm text-blue-700">File reads</p>
        </div>
        <div class="bg-green-50 rounded-xl p-4 border border-green-200">
          <p class="text-2xl font-bold text-green-900">{formatNumber(analytics.totalWrites)}</p>
          <p class="text-sm text-green-700">File writes</p>
        </div>
        <div class="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <p class="text-2xl font-bold text-amber-900">{formatNumber(analytics.totalEdits)}</p>
          <p class="text-sm text-amber-700">File edits</p>
        </div>
      </div>

      {#if analytics.dateRange}
        <p class="text-xs text-gray-500 mb-6">
          Data from {formatDate(analytics.dateRange.start)} to {formatDate(analytics.dateRange.end)}
        </p>
      {/if}

      <!-- Tool Usage -->
      <div class="mb-8">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Tool Usage</h3>
        <div class="flex flex-wrap gap-2">
          {#each analytics.toolUsage as tool}
            <span class="{getToolColor(tool.name)} px-3 py-1.5 rounded-lg text-sm font-medium">
              {tool.name}: {formatNumber(tool.count)}
            </span>
          {/each}
        </div>
      </div>

      <!-- Top Files -->
      <div class="mb-8">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Most Accessed Files</h3>
        {#if analytics.topFiles.length === 0}
          <div class="bg-gray-50 rounded-xl p-6 text-center border border-gray-200">
            <p class="text-gray-500">No file access data found for this period</p>
          </div>
        {:else}
          <div class="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div class="divide-y divide-gray-200">
              {#each analytics.topFiles.slice(0, 20) as file}
                {@const total = analytics.totalReads + analytics.totalWrites + analytics.totalEdits}
                {@const percentage = getAccessPercentage(file, total)}
                <div class="p-4 hover:bg-gray-100/50 transition-colors">
                  <div class="flex items-center justify-between">
                    <button
                      onclick={() => toggleFileExpand(file.path)}
                      class="flex items-center gap-2 text-left min-w-0 flex-1"
                    >
                      <svg
                        class="w-4 h-4 text-gray-400 shrink-0 transition-transform {expandedFiles.has(file.path) ? 'rotate-90' : ''}"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                      <code class="text-sm text-gray-700 truncate" title={file.path}>
                        {getRelativePath(file.path)}
                      </code>
                    </button>
                    <div class="flex items-center gap-4 shrink-0 ml-4">
                      <div class="flex items-center gap-3 text-xs">
                        {#if file.reads > 0}
                          <span class="text-blue-600">{file.reads} reads</span>
                        {/if}
                        {#if file.writes > 0}
                          <span class="text-green-600">{file.writes} writes</span>
                        {/if}
                        {#if file.edits > 0}
                          <span class="text-amber-600">{file.edits} edits</span>
                        {/if}
                      </div>
                      <div class="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          class="h-2 rounded-full bg-gradient-to-r from-blue-500 via-green-500 to-amber-500"
                          style="width: {Math.min(percentage * 2, 100)}%"
                        ></div>
                      </div>
                      <span class="text-xs text-gray-500 w-8 text-right">{percentage}%</span>
                    </div>
                  </div>
                  {#if expandedFiles.has(file.path) && file.lineRanges.length > 0}
                    <div class="mt-3 ml-6 text-xs text-gray-500">
                      <p class="font-medium mb-1">Accessed line ranges:</p>
                      <div class="flex flex-wrap gap-1">
                        {#each file.lineRanges.slice(0, 10) as range}
                          <span class="bg-gray-200 px-2 py-0.5 rounded">
                            {range.offset ?? 0}-{(range.offset ?? 0) + (range.limit ?? 100)}
                          </span>
                        {/each}
                        {#if file.lineRanges.length > 10}
                          <span class="text-gray-400">+{file.lineRanges.length - 10} more</span>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          {#if analytics.topFiles.length > 20}
            <p class="text-sm text-gray-500 mt-2 text-center">
              Showing top 20 of {analytics.topFiles.length} files
            </p>
          {/if}
        {/if}
      </div>

      <!-- Hotspots -->
      {#if analytics.hotspots.length > 0}
        <div>
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            Hotspots
            <span class="text-sm font-normal text-gray-500">(frequently accessed regions)</span>
          </h3>
          <div class="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <div class="space-y-2">
              {#each analytics.hotspots.slice(0, 10) as hotspot}
                <div class="flex items-center justify-between text-sm">
                  <code class="text-gray-700 truncate flex-1" title={hotspot.file}>
                    {getRelativePath(hotspot.file)}:<span class="text-amber-700">{hotspot.range}</span>
                  </code>
                  <span class="text-amber-700 font-medium ml-4">{hotspot.accessCount}x</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <div class="bg-gray-50 rounded-xl p-12 text-center border border-gray-200">
        <svg class="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No Analytics Data</h3>
        <p class="text-gray-500 max-w-md mx-auto">
          Start using Claude in this project to generate file access analytics.
          Data is parsed from session transcripts stored locally.
        </p>
      </div>
    {/if}
  </div>
</div>
