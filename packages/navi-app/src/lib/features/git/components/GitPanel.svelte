<script lang="ts">
  import { onMount } from "svelte";
  import type { GitStatus, GitCommit, GitBranches } from "../types";
  import { STATUS_COLORS } from "../types";
  import * as gitApi from "../api";
  import GitDiffViewer from "./GitDiffViewer.svelte";

  interface Props {
    rootPath: string;
  }

  let { rootPath }: Props = $props();

  // Data state
  let status = $state<GitStatus | null>(null);
  let commits = $state<GitCommit[]>([]);
  let branches = $state<GitBranches | null>(null);
  let loading = $state(false);
  let error = $state("");

  // UI state
  let showBranchDropdown = $state(false);
  let activeTab = $state<"changes" | "history">("changes");
  let selectedFile = $state<string | null>(null);
  let selectedCommit = $state<GitCommit | null>(null);
  let fileDiff = $state<string | null>(null);
  let commitDiff = $state<string | null>(null);
  let loadingDiff = $state(false);
  let showDiff = $state(false);

  // Commit form state
  let commitMessage = $state("");
  let committing = $state(false);
  let generating = $state(false);
  let commitError = $state("");

  // Computed
  let totalChanges = $derived(
    status ? status.staged.length + status.modified.length + status.untracked.length : 0
  );
  let currentDiff = $derived(fileDiff || commitDiff);

  async function fetchStatus() {
    if (!rootPath) return;
    loading = true;
    error = "";
    try {
      status = await gitApi.getStatus(rootPath);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch status";
      status = null;
    } finally {
      loading = false;
    }
  }

  async function fetchCommits() {
    if (!rootPath) return;
    try {
      commits = await gitApi.getLog(rootPath, 50);
    } catch (e) {
      console.error("Failed to fetch commits:", e);
    }
  }

  async function fetchBranches() {
    if (!rootPath) return;
    try {
      branches = await gitApi.getBranches(rootPath);
    } catch (e) {
      console.error("Failed to fetch branches:", e);
    }
  }

  async function fetchFileDiff(file: string, staged = false) {
    loadingDiff = true;
    showDiff = true;
    try {
      fileDiff = await gitApi.getDiff(rootPath, file, staged);
      commitDiff = null;
    } catch (e) {
      console.error("Failed to fetch diff:", e);
    } finally {
      loadingDiff = false;
    }
  }

  async function fetchCommitDiff(commit: string) {
    loadingDiff = true;
    showDiff = true;
    try {
      commitDiff = await gitApi.getCommitDiff(rootPath, commit);
      fileDiff = null;
    } catch (e) {
      console.error("Failed to fetch commit diff:", e);
    } finally {
      loadingDiff = false;
    }
  }

  async function checkoutBranch(branch: string) {
    try {
      await gitApi.checkout(rootPath, branch);
      showBranchDropdown = false;
      refresh();
    } catch (e) {
      console.error("Failed to checkout:", e);
    }
  }

  function refresh() {
    fetchStatus();
    fetchCommits();
    fetchBranches();
  }

  function handleSelectFile(file: string, staged: boolean) {
    selectedFile = file;
    selectedCommit = null;
    fetchFileDiff(file, staged);
  }

  function handleSelectCommit(commit: GitCommit) {
    selectedCommit = commit;
    selectedFile = null;
    fetchCommitDiff(commit.hash);
  }

  function closeDiff() {
    showDiff = false;
    selectedFile = null;
    selectedCommit = null;
    fileDiff = null;
    commitDiff = null;
  }

  function getFileName(path: string): string {
    const parts = path.split("/");
    if (parts.length <= 2) return path;
    return parts.slice(-2).join("/");
  }

  // Commit actions
  async function stageFile(file: string) {
    try {
      await gitApi.stageFiles(rootPath, [file]);
      refresh();
    } catch (e) {
      console.error("Failed to stage:", e);
    }
  }

  async function unstageFile(file: string) {
    try {
      await gitApi.unstageFiles(rootPath, [file]);
      refresh();
    } catch (e) {
      console.error("Failed to unstage:", e);
    }
  }

  async function handleStageAll() {
    try {
      await gitApi.stageAll(rootPath);
      refresh();
    } catch (e) {
      console.error("Failed to stage all:", e);
    }
  }

  async function handleCommit() {
    if (!commitMessage.trim() || !status?.staged.length) return;
    committing = true;
    commitError = "";
    try {
      await gitApi.commit(rootPath, commitMessage.trim());
      commitMessage = "";
      refresh();
    } catch (e) {
      commitError = e instanceof Error ? e.message : "Commit failed";
    } finally {
      committing = false;
    }
  }

  async function handleGenerateMessage() {
    if (!status?.staged.length) return;
    generating = true;
    commitError = "";
    try {
      const message = await gitApi.generateCommitMessage(rootPath);
      commitMessage = message;
    } catch (e) {
      commitError = e instanceof Error ? e.message : "Failed to generate message";
    } finally {
      generating = false;
    }
  }

  $effect(() => {
    if (rootPath) {
      refresh();
    }
  });

  onMount(() => {
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  });
</script>

<div class="h-full flex flex-col bg-white">
  <!-- Header -->
  <div class="h-10 px-3 border-b border-gray-200 flex items-center gap-2 bg-gray-50/50 shrink-0">
    {#if status}
      <!-- Branch selector -->
      <div class="relative">
        <button
          onclick={() => (showBranchDropdown = !showBranchDropdown)}
          class="flex items-center gap-1.5 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12M6 9a3 3 0 103 3M18 9a3 3 0 10-3 3m3-3v9m0 0a3 3 0 01-3-3" />
          </svg>
          <span class="truncate max-w-[100px]">{status.branch}</span>
          <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if showBranchDropdown && branches}
          <div class="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-auto">
            <div class="p-1">
              <div class="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Branches</div>
              {#each branches.local as branch}
                <button
                  onclick={() => checkoutBranch(branch)}
                  class="w-full px-2 py-1.5 text-sm text-left hover:bg-gray-50 rounded flex items-center gap-2 {branch === branches.current ? 'text-blue-600 font-medium' : 'text-gray-700'}"
                >
                  {#if branch === branches.current}
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  {:else}
                    <span class="w-3"></span>
                  {/if}
                  {branch}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Ahead/behind -->
      {#if status.ahead > 0 || status.behind > 0}
        <div class="flex items-center gap-1 text-xs text-gray-500">
          {#if status.ahead > 0}
            <span class="flex items-center gap-0.5">↑{status.ahead}</span>
          {/if}
          {#if status.behind > 0}
            <span class="flex items-center gap-0.5">↓{status.behind}</span>
          {/if}
        </div>
      {/if}
    {/if}

    <div class="flex-1"></div>

    <button onclick={refresh} class="p-1 text-gray-400 hover:text-gray-600" title="Refresh">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Tabs -->
  <div class="flex border-b border-gray-200 shrink-0">
    <button
      onclick={() => { activeTab = "changes"; closeDiff(); }}
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'changes' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'}"
    >
      Changes
      {#if totalChanges > 0}
        <span class="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">{totalChanges}</span>
      {/if}
    </button>
    <button
      onclick={() => { activeTab = "history"; closeDiff(); }}
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'history' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'}"
    >
      History
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
    {#if loading && !status}
      <div class="flex-1 flex items-center justify-center">
        <svg class="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
    {:else if error}
      <div class="flex-1 flex items-center justify-center p-4 text-center text-sm text-gray-500">
        {error}
      </div>
    {:else if showDiff}
      <!-- Diff View (full panel) -->
      <div class="flex-1 min-h-0 flex flex-col">
        <div class="h-8 px-3 flex items-center gap-2 border-b border-gray-200 bg-gray-50 shrink-0">
          <button onclick={closeDiff} class="p-1 text-gray-400 hover:text-gray-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="text-xs font-mono text-gray-600 truncate">
            {selectedFile || selectedCommit?.message || "Diff"}
          </span>
        </div>
        <div class="flex-1 min-h-0">
          <GitDiffViewer
            diff={currentDiff}
            loading={loadingDiff}
            {selectedCommit}
            {selectedFile}
          />
        </div>
      </div>
    {:else if activeTab === "changes"}
      <!-- Changes Tab -->
      <div class="flex-1 min-h-0 flex flex-col">
        <!-- Commit Form -->
        {#if status && status.staged.length > 0}
          <div class="px-3 py-2 border-b border-gray-200 bg-white shrink-0">
            <div class="flex gap-1.5">
              <input
                type="text"
                bind:value={commitMessage}
                placeholder="Commit message..."
                class="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                onkeydown={(e) => e.key === "Enter" && handleCommit()}
                disabled={committing || generating}
              />
              <button
                onclick={handleGenerateMessage}
                disabled={generating || committing}
                class="px-2 py-1.5 text-gray-500 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                title="Generate with AI"
              >
                {#if generating}
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {/if}
              </button>
              <button
                onclick={handleCommit}
                disabled={!commitMessage.trim() || committing}
                class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Commit
              </button>
            </div>
            {#if commitError}
              <p class="text-xs text-red-500 mt-1">{commitError}</p>
            {/if}
          </div>
        {:else if status && (status.modified.length > 0 || status.untracked.length > 0)}
          <div class="px-3 py-2 border-b border-gray-200 shrink-0">
            <button onclick={handleStageAll} class="w-full px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200">
              Stage All
            </button>
          </div>
        {/if}

        <!-- File List -->
        <div class="flex-1 overflow-y-auto">
          {#if status}
            <!-- Staged -->
            {#if status.staged.length > 0}
              <div class="px-3 py-2">
                <div class="text-xs font-medium text-green-600 mb-1">Staged ({status.staged.length})</div>
                {#each status.staged as file}
                  <div class="flex items-center gap-2 py-1 hover:bg-gray-50 rounded px-1 group cursor-pointer" onclick={() => handleSelectFile(file.path, true)}>
                    <span class="text-[10px] font-mono px-1 rounded {STATUS_COLORS[file.status]}">{file.status}</span>
                    <span class="flex-1 text-sm text-gray-700 truncate" title={file.path}>{getFileName(file.path)}</span>
                    <button onclick={(e) => { e.stopPropagation(); unstageFile(file.path); }} class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600" title="Unstage">−</button>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Modified -->
            {#if status.modified.length > 0}
              <div class="px-3 py-2">
                <div class="text-xs font-medium text-yellow-600 mb-1">Modified ({status.modified.length})</div>
                {#each status.modified as file}
                  <div class="flex items-center gap-2 py-1 hover:bg-gray-50 rounded px-1 group cursor-pointer" onclick={() => handleSelectFile(file.path, false)}>
                    <span class="text-[10px] font-mono px-1 rounded {STATUS_COLORS[file.status]}">{file.status}</span>
                    <span class="flex-1 text-sm text-gray-700 truncate" title={file.path}>{getFileName(file.path)}</span>
                    <button onclick={(e) => { e.stopPropagation(); stageFile(file.path); }} class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600" title="Stage">+</button>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Untracked -->
            {#if status.untracked.length > 0}
              <div class="px-3 py-2">
                <div class="text-xs font-medium text-gray-500 mb-1">Untracked ({status.untracked.length})</div>
                {#each status.untracked as file}
                  <div class="flex items-center gap-2 py-1 hover:bg-gray-50 rounded px-1 group cursor-pointer" onclick={() => handleSelectFile(file.path, false)}>
                    <span class="text-[10px] font-mono px-1 rounded text-gray-500 bg-gray-100">?</span>
                    <span class="flex-1 text-sm text-gray-600 truncate" title={file.path}>{getFileName(file.path)}</span>
                    <button onclick={(e) => { e.stopPropagation(); stageFile(file.path); }} class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600" title="Stage">+</button>
                  </div>
                {/each}
              </div>
            {/if}

            {#if totalChanges === 0}
              <div class="flex-1 flex items-center justify-center text-sm text-gray-400 py-8">
                Working tree clean
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {:else}
      <!-- History Tab -->
      <div class="flex-1 overflow-y-auto">
        {#each commits as commit}
          <button
            onclick={() => handleSelectCommit(commit)}
            class="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100"
          >
            <div class="flex items-start gap-2">
              <span class="shrink-0 text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{commit.shortHash}</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-gray-900 truncate">{commit.message}</p>
                <p class="text-xs text-gray-500">{commit.author} · {commit.date}</p>
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showBranchDropdown}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-40" onclick={() => (showBranchDropdown = false)}></div>
{/if}
