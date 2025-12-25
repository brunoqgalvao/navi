<script lang="ts">
  import { onMount } from "svelte";
  import { html as diff2html } from "diff2html";

  interface Props {
    rootPath: string;
  }

  interface GitStatus {
    branch: string;
    staged: { path: string; status: string }[];
    modified: { path: string; status: string }[];
    untracked: { path: string }[];
    ahead: number;
    behind: number;
  }

  interface GitCommit {
    hash: string;
    shortHash: string;
    author: string;
    email: string;
    date: string;
    message: string;
  }

  interface GitBranches {
    current: string;
    local: string[];
    remote: string[];
  }

  let { rootPath }: Props = $props();

  let activeTab = $state<"changes" | "history">("changes");
  let status = $state<GitStatus | null>(null);
  let commits = $state<GitCommit[]>([]);
  let branches = $state<GitBranches | null>(null);
  let loading = $state(false);
  let error = $state("");
  let showBranchDropdown = $state(false);
  let selectedFile = $state<string | null>(null);
  let fileDiff = $state<string | null>(null);
  let loadingDiff = $state(false);
  let selectedCommit = $state<GitCommit | null>(null);
  let commitDiff = $state<string | null>(null);
  let expandedSections = $state<Set<string>>(new Set(["staged", "modified", "untracked"]));

  const statusLabels: Record<string, string> = {
    M: "Modified",
    A: "Added",
    D: "Deleted",
    R: "Renamed",
    C: "Copied",
    U: "Updated",
    "?": "Untracked",
  };

  const statusColors: Record<string, string> = {
    M: "text-yellow-600 bg-yellow-50",
    A: "text-green-600 bg-green-50",
    D: "text-red-600 bg-red-50",
    R: "text-blue-600 bg-blue-50",
    C: "text-purple-600 bg-purple-50",
    U: "text-orange-600 bg-orange-50",
    "?": "text-gray-600 bg-gray-50",
  };

  async function fetchStatus() {
    if (!rootPath) return;
    loading = true;
    error = "";
    try {
      const res = await fetch(`http://localhost:3001/api/git/status?path=${encodeURIComponent(rootPath)}`);
      const data = await res.json();
      if (data.error) {
        error = data.error;
        status = null;
      } else {
        status = data;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch status";
    } finally {
      loading = false;
    }
  }

  async function fetchCommits() {
    if (!rootPath) return;
    try {
      const res = await fetch(`http://localhost:3001/api/git/log?path=${encodeURIComponent(rootPath)}&limit=50`);
      const data = await res.json();
      if (!data.error) {
        commits = data.commits;
      }
    } catch (e) {
      console.error("Failed to fetch commits:", e);
    }
  }

  async function fetchBranches() {
    if (!rootPath) return;
    try {
      const res = await fetch(`http://localhost:3001/api/git/branches?path=${encodeURIComponent(rootPath)}`);
      const data = await res.json();
      if (!data.error) {
        branches = data;
      }
    } catch (e) {
      console.error("Failed to fetch branches:", e);
    }
  }

  async function fetchFileDiff(file: string, staged: boolean = false) {
    loadingDiff = true;
    try {
      const params = new URLSearchParams({
        path: rootPath,
        file,
        staged: staged.toString(),
      });
      const res = await fetch(`http://localhost:3001/api/git/diff?${params}`);
      const data = await res.json();
      if (!data.error) {
        fileDiff = data.diff;
      }
    } catch (e) {
      console.error("Failed to fetch diff:", e);
    } finally {
      loadingDiff = false;
    }
  }

  async function fetchCommitDiff(commit: string) {
    loadingDiff = true;
    try {
      const res = await fetch(`http://localhost:3001/api/git/diff-commit?path=${encodeURIComponent(rootPath)}&commit=${commit}`);
      const data = await res.json();
      if (!data.error) {
        commitDiff = data.diff;
      }
    } catch (e) {
      console.error("Failed to fetch commit diff:", e);
    } finally {
      loadingDiff = false;
    }
  }

  async function checkoutBranch(branch: string) {
    try {
      const res = await fetch("http://localhost:3001/api/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: rootPath, branch }),
      });
      const data = await res.json();
      if (data.success) {
        showBranchDropdown = false;
        refresh();
      }
    } catch (e) {
      console.error("Failed to checkout:", e);
    }
  }

  async function stageFile(file: string) {
    try {
      const res = await fetch("http://localhost:3001/api/git/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: rootPath, files: [file] }),
      });
      if ((await res.json()).success) {
        fetchStatus();
      }
    } catch (e) {
      console.error("Failed to stage:", e);
    }
  }

  async function unstageFile(file: string) {
    try {
      const res = await fetch("http://localhost:3001/api/git/unstage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: rootPath, files: [file] }),
      });
      if ((await res.json()).success) {
        fetchStatus();
      }
    } catch (e) {
      console.error("Failed to unstage:", e);
    }
  }

  function refresh() {
    fetchStatus();
    fetchCommits();
    fetchBranches();
  }

  function toggleSection(section: string) {
    if (expandedSections.has(section)) {
      expandedSections.delete(section);
    } else {
      expandedSections.add(section);
    }
    expandedSections = new Set(expandedSections);
  }

  function selectFile(file: string, staged: boolean = false) {
    selectedFile = file;
    selectedCommit = null;
    commitDiff = null;
    fetchFileDiff(file, staged);
  }

  function selectCommit(commit: GitCommit) {
    selectedCommit = commit;
    selectedFile = null;
    fileDiff = null;
    fetchCommitDiff(commit.hash);
  }

  function getFileName(path: string): string {
    return path.split("/").pop() || path;
  }

  function getDiffHtml(diff: string): string {
    if (!diff) return "";
    return diff2html(diff, {
      drawFileList: false,
      outputFormat: "line-by-line",
      matching: "lines",
    });
  }

  $effect(() => {
    if (rootPath) {
      refresh();
    }
  });

  onMount(() => {
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  });
</script>

<div class="h-full flex flex-col bg-white">
  <!-- Header with branch selector -->
  <div class="h-10 px-3 border-b border-gray-200 flex items-center gap-2 bg-gray-50/50 shrink-0">
    {#if status}
      <div class="relative">
        <button
          onclick={() => (showBranchDropdown = !showBranchDropdown)}
          class="flex items-center gap-1.5 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span class="truncate max-w-[120px]">{status.branch}</span>
          <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if showBranchDropdown && branches}
          <div class="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-auto">
            <div class="p-1">
              <div class="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Local Branches</div>
              {#each branches.local as branch}
                <button
                  onclick={() => checkoutBranch(branch)}
                  class="w-full px-2 py-1.5 text-sm text-left hover:bg-gray-50 rounded flex items-center gap-2 {branch === branches.current ? 'text-blue-600 font-medium' : 'text-gray-700'}"
                >
                  {#if branch === branches.current}
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  {:else}
                    <span class="w-3"></span>
                  {/if}
                  {branch}
                </button>
              {/each}
              {#if branches.remote.length > 0}
                <div class="border-t border-gray-100 mt-1 pt-1">
                  <div class="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Remote</div>
                  {#each branches.remote.slice(0, 10) as branch}
                    <button
                      onclick={() => checkoutBranch(branch)}
                      class="w-full px-2 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50 rounded flex items-center gap-2"
                    >
                      <span class="w-3"></span>
                      {branch}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      {#if status.ahead > 0 || status.behind > 0}
        <div class="flex items-center gap-1 text-xs text-gray-500">
          {#if status.ahead > 0}
            <span class="flex items-center gap-0.5">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              {status.ahead}
            </span>
          {/if}
          {#if status.behind > 0}
            <span class="flex items-center gap-0.5">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              {status.behind}
            </span>
          {/if}
        </div>
      {/if}
    {/if}

    <div class="flex-1"></div>

    <button
      onclick={refresh}
      class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
      title="Refresh"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Tabs -->
  <div class="flex border-b border-gray-200 shrink-0">
    <button
      onclick={() => (activeTab = "changes")}
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'changes' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'}"
    >
      Changes
      {#if status && (status.staged.length + status.modified.length + status.untracked.length) > 0}
        <span class="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
          {status.staged.length + status.modified.length + status.untracked.length}
        </span>
      {/if}
    </button>
    <button
      onclick={() => (activeTab = "history")}
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'history' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'}"
    >
      History
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden flex">
    <!-- Left: File list or commit list -->
    <div class="w-1/2 border-r border-gray-200 overflow-auto">
      {#if loading && !status}
        <div class="flex items-center justify-center py-8">
          <svg class="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
      {:else if error}
        <div class="p-4 text-center text-sm text-gray-500">
          <svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      {:else if activeTab === "changes" && status}
        <div class="p-2 space-y-1">
          <!-- Staged Changes -->
          {#if status.staged.length > 0}
            <div>
              <button
                onclick={() => toggleSection("staged")}
                class="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded"
              >
                <svg class="w-3 h-3 transition-transform {expandedSections.has('staged') ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="text-green-600">Staged Changes</span>
                <span class="text-gray-400">({status.staged.length})</span>
              </button>
              {#if expandedSections.has("staged")}
                <div class="ml-4 space-y-px">
                  {#each status.staged as file}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      onclick={() => selectFile(file.path, true)}
                      class="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded group cursor-pointer {selectedFile === file.path ? 'bg-blue-50' : ''}"
                    >
                      <span class="px-1 text-[10px] font-mono rounded {statusColors[file.status] || 'text-gray-600 bg-gray-50'}">
                        {file.status}
                      </span>
                      <span class="truncate flex-1 text-left text-gray-700">{getFileName(file.path)}</span>
                      <button
                        onclick={(e) => { e.stopPropagation(); unstageFile(file.path); }}
                        class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600"
                        title="Unstage"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Modified Files -->
          {#if status.modified.length > 0}
            <div>
              <button
                onclick={() => toggleSection("modified")}
                class="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded"
              >
                <svg class="w-3 h-3 transition-transform {expandedSections.has('modified') ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="text-yellow-600">Changes</span>
                <span class="text-gray-400">({status.modified.length})</span>
              </button>
              {#if expandedSections.has("modified")}
                <div class="ml-4 space-y-px">
                  {#each status.modified as file}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      onclick={() => selectFile(file.path, false)}
                      class="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded group cursor-pointer {selectedFile === file.path ? 'bg-blue-50' : ''}"
                    >
                      <span class="px-1 text-[10px] font-mono rounded {statusColors[file.status] || 'text-gray-600 bg-gray-50'}">
                        {file.status}
                      </span>
                      <span class="truncate flex-1 text-left text-gray-700">{getFileName(file.path)}</span>
                      <button
                        onclick={(e) => { e.stopPropagation(); stageFile(file.path); }}
                        class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600"
                        title="Stage"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Untracked Files -->
          {#if status.untracked.length > 0}
            <div>
              <button
                onclick={() => toggleSection("untracked")}
                class="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded"
              >
                <svg class="w-3 h-3 transition-transform {expandedSections.has('untracked') ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="text-gray-500">Untracked</span>
                <span class="text-gray-400">({status.untracked.length})</span>
              </button>
              {#if expandedSections.has("untracked")}
                <div class="ml-4 space-y-px">
                  {#each status.untracked as file}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      onclick={() => selectFile(file.path, false)}
                      class="w-full flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded group cursor-pointer {selectedFile === file.path ? 'bg-blue-50' : ''}"
                    >
                      <span class="px-1 text-[10px] font-mono rounded text-gray-500 bg-gray-50">?</span>
                      <span class="truncate flex-1 text-left text-gray-600">{getFileName(file.path)}</span>
                      <button
                        onclick={(e) => { e.stopPropagation(); stageFile(file.path); }}
                        class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600"
                        title="Stage"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if status.staged.length === 0 && status.modified.length === 0 && status.untracked.length === 0}
            <div class="text-center py-8 text-sm text-gray-400">
              <svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Working tree clean
            </div>
          {/if}
        </div>
      {:else if activeTab === "history"}
        <div class="divide-y divide-gray-100">
          {#each commits as commit}
            <button
              onclick={() => selectCommit(commit)}
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

    <!-- Right: Diff viewer -->
    <div class="w-1/2 overflow-auto bg-gray-50">
      {#if loadingDiff}
        <div class="flex items-center justify-center py-8">
          <svg class="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
      {:else if fileDiff}
        <div class="diff-viewer text-xs">
          {@html getDiffHtml(fileDiff)}
        </div>
      {:else if commitDiff}
        <div class="diff-viewer text-xs">
          <div class="p-3 border-b border-gray-200 bg-white">
            <p class="font-medium text-gray-900">{selectedCommit?.message}</p>
            <p class="text-gray-500 text-xs mt-1">
              {selectedCommit?.author} · {selectedCommit?.date}
            </p>
          </div>
          {@html getDiffHtml(commitDiff)}
        </div>
      {:else}
        <div class="flex items-center justify-center h-full text-sm text-gray-400">
          Select a file or commit to view diff
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Click outside to close dropdown -->
{#if showBranchDropdown}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-40" onclick={() => (showBranchDropdown = false)}></div>
{/if}

<style>
  :global(.diff-viewer .d2h-wrapper) {
    margin: 0;
  }

  :global(.diff-viewer .d2h-file-wrapper) {
    border: none;
    margin: 0;
  }

  :global(.diff-viewer .d2h-file-header) {
    background: #f9fafb;
    padding: 8px 12px;
    border-bottom: 1px solid #e5e7eb;
  }

  :global(.diff-viewer .d2h-file-name) {
    font-size: 12px;
  }

  :global(.diff-viewer .d2h-diff-table) {
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  :global(.diff-viewer .d2h-code-line) {
    padding: 0 8px;
  }

  :global(.diff-viewer .d2h-code-line-ctn) {
    white-space: pre-wrap;
    word-break: break-all;
  }

  :global(.diff-viewer .d2h-ins) {
    background-color: #dcfce7;
  }

  :global(.diff-viewer .d2h-del) {
    background-color: #fee2e2;
  }

  :global(.diff-viewer .d2h-ins .d2h-code-line-ctn) {
    background-color: #bbf7d0;
  }

  :global(.diff-viewer .d2h-del .d2h-code-line-ctn) {
    background-color: #fecaca;
  }

  :global(.diff-viewer .d2h-code-linenumber) {
    width: 36px;
    min-width: 36px;
    color: #9ca3af;
    background-color: #f9fafb;
    border-right: 1px solid #e5e7eb;
  }

  :global(.diff-viewer .d2h-ins .d2h-code-linenumber) {
    background-color: #bbf7d0;
    color: #166534;
  }

  :global(.diff-viewer .d2h-del .d2h-code-linenumber) {
    background-color: #fecaca;
    color: #991b1b;
  }

  :global(.diff-viewer .d2h-info) {
    background-color: #eff6ff;
    color: #2563eb;
    padding: 4px 8px;
    font-size: 11px;
  }
</style>
