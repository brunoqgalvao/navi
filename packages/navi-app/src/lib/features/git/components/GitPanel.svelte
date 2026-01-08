<script lang="ts">
  import { onMount } from "svelte";
  import type { GitStatus, GitCommit, GitBranches } from "../types";
  import { STATUS_COLORS } from "../types";
  import * as gitApi from "../api";
  import GitDiffViewer from "./GitDiffViewer.svelte";
  import GitCommitModal from "./GitCommitModal.svelte";
  import GitBranchManager from "./GitBranchManager.svelte";

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
  let initializingRepo = $state(false);

  // UI state
  let showBranchDropdown = $state(false);
  let showBranchManager = $state(false);
  let activeTab = $state<"changes" | "history">("changes");
  let selectedFile = $state<string | null>(null);
  let selectedCommit = $state<GitCommit | null>(null);
  let fileDiff = $state<string | null>(null);
  let commitDiff = $state<string | null>(null);
  let loadingDiff = $state(false);
  let showDiff = $state(false);
  let showCommitModal = $state(false);
  let summarizing = $state(false);
  let changeSummary = $state<{ type: "semantic" | "file"; items: string[] } | null>(null);
  let quickCommitting = $state(false);
  let quickCommitError = $state("");

  // Remote state
  let remotes = $state<gitApi.GitRemote[]>([]);
  let pushing = $state(false);
  let pulling = $state(false);
  let syncError = $state("");
  let hasRemote = $derived(remotes.some(r => r.type === "push"));

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
      // Clear error if we get a valid response (even if not a git repo)
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch status";
      status = null;
    } finally {
      loading = false;
    }
  }

  async function handleInitRepo() {
    if (!rootPath) return;
    initializingRepo = true;
    error = "";
    try {
      await gitApi.initRepo(rootPath);
      refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to initialize repository";
    } finally {
      initializingRepo = false;
    }
  }

  async function fetchCommits() {
    if (!rootPath) return;
    // Only fetch if we know it's a git repo
    if (status && !status.isGitRepo) {
      commits = [];
      return;
    }
    try {
      commits = await gitApi.getLog(rootPath, 50);
    } catch (e) {
      console.error("Failed to fetch commits:", e);
      commits = [];
    }
  }

  async function fetchBranches() {
    if (!rootPath) return;
    // Only fetch if we know it's a git repo
    if (status && !status.isGitRepo) {
      branches = null;
      return;
    }
    try {
      branches = await gitApi.getBranches(rootPath);
    } catch (e) {
      console.error("Failed to fetch branches:", e);
      branches = null;
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

  async function fetchRemotes() {
    if (!rootPath) return;
    if (status && !status.isGitRepo) {
      remotes = [];
      return;
    }
    try {
      remotes = await gitApi.getRemotes(rootPath);
    } catch (e) {
      console.error("Failed to fetch remotes:", e);
      remotes = [];
    }
  }

  async function handlePush() {
    if (!rootPath || pushing) return;
    pushing = true;
    syncError = "";
    try {
      // If no upstream is set, push with -u flag
      const needsUpstream = status?.ahead === 0 && status?.behind === 0;
      await gitApi.push(rootPath, "origin", undefined, needsUpstream);
      refresh();
    } catch (e) {
      syncError = e instanceof Error ? e.message : "Push failed";
    } finally {
      pushing = false;
    }
  }

  async function handlePull() {
    if (!rootPath || pulling) return;
    pulling = true;
    syncError = "";
    try {
      await gitApi.pull(rootPath);
      refresh();
    } catch (e) {
      syncError = e instanceof Error ? e.message : "Pull failed";
    } finally {
      pulling = false;
    }
  }

  async function refresh() {
    await fetchStatus();
    // Only fetch commits and branches if it's a git repo
    if (status?.isGitRepo) {
      fetchCommits();
      fetchBranches();
      fetchRemotes();
    } else {
      commits = [];
      branches = null;
      remotes = [];
    }
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

  // Parse conventional commit type from message
  function getCommitType(message: string): { type: string; color: string } | null {
    const match = message.match(/^(feat|fix|refactor|docs|style|test|chore|perf|ci|build)(\(.+?\))?:/i);
    if (!match) return null;
    const type = match[1].toLowerCase();
    const colors: Record<string, string> = {
      feat: "bg-green-100 text-green-700",
      fix: "bg-red-100 text-red-700",
      refactor: "bg-purple-100 text-purple-700",
      docs: "bg-blue-100 text-blue-700",
      style: "bg-pink-100 text-pink-700",
      test: "bg-yellow-100 text-yellow-700",
      chore: "bg-gray-100 text-gray-600",
      perf: "bg-orange-100 text-orange-700",
      ci: "bg-cyan-100 text-cyan-700",
      build: "bg-amber-100 text-amber-700",
    };
    return { type, color: colors[type] || "bg-gray-100 text-gray-600" };
  }

  // Get commit message without type prefix
  function getCommitMessage(message: string): string {
    return message.replace(/^(feat|fix|refactor|docs|style|test|chore|perf|ci|build)(\(.+?\))?:\s*/i, "");
  }

  // Group commits by date
  function getDateGroup(dateStr: string): string {
    const lower = dateStr.toLowerCase();
    if (lower.includes("minute") || lower.includes("hour") || lower === "just now") return "Today";
    if (lower.includes("yesterday") || lower === "1 day ago") return "Yesterday";
    if (lower.includes("day") && !lower.includes("week") && !lower.includes("month")) {
      const days = parseInt(lower);
      if (days <= 7) return "This Week";
    }
    return "Older";
  }

  // Group commits by date category
  let groupedCommits = $derived(() => {
    const groups: Record<string, typeof commits> = {
      "Today": [],
      "Yesterday": [],
      "This Week": [],
      "Older": [],
    };
    for (const commit of commits) {
      const group = getDateGroup(commit.date);
      groups[group].push(commit);
    }
    return groups;
  });

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

async function handleQuickCommit() {
    if (!status || quickCommitting) return;

    quickCommitting = true;
    quickCommitError = "";

    try {
      await gitApi.stageAll(rootPath);
      const message = await gitApi.generateCommitMessage(rootPath);

      if (!message || !message.trim()) {
        throw new Error("Failed to generate commit message");
      }

      await gitApi.commit(rootPath, message);
      refresh();
    } catch (e) {
      console.error("Quick commit failed:", e);
      quickCommitError = e instanceof Error ? e.message : "Quick commit failed";
      setTimeout(() => quickCommitError = "", 5000);
    } finally {
      quickCommitting = false;
    }
  }
  async function handleSummarizeChanges() {
    if (!status) return;

    summarizing = true;
    changeSummary = null;

    try {
      // Use Claude to analyze the diff and generate feature descriptions
      const summary = await gitApi.summarizeChanges(rootPath);
      changeSummary = { type: "semantic", items: summary };
    } catch (e) {
      console.error("Failed to generate summary:", e);
      changeSummary = {
        type: "file",
        items: ["Failed to generate summary - check console for details"]
      };
    } finally {
      summarizing = false;
    }
  }

  function clearSummary() {
    changeSummary = null;
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
  <!-- Git not installed state -->
  {#if status?.gitNotInstalled}
    <div class="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div class="w-12 h-12 mb-4 rounded-full bg-red-50 flex items-center justify-center">
        <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 class="text-sm font-medium text-gray-900 mb-1">Git Not Installed</h3>
      <p class="text-xs text-gray-500 mb-4">Git is not available on this system.</p>
      <a
        href="https://git-scm.com/downloads"
        target="_blank"
        rel="noopener noreferrer"
        class="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download Git
      </a>
    </div>
  <!-- Not a git repo state -->
  {:else if status && !status.isGitRepo}
    <div class="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div class="w-12 h-12 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12M6 9a3 3 0 103 3M18 9a3 3 0 10-3 3m3-3v9m0 0a3 3 0 01-3-3" />
        </svg>
      </div>
      <h3 class="text-sm font-medium text-gray-900 mb-1">Not a Git Repository</h3>
      <p class="text-xs text-gray-500 mb-4">This folder is not tracked by Git.</p>
      <button
        onclick={handleInitRepo}
        disabled={initializingRepo}
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        {#if initializingRepo}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Initializing...
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Initialize Repository
        {/if}
      </button>
    </div>
  {:else}
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
              <div class="border-t border-gray-100 mt-1 pt-1">
                <button
                  onclick={() => { showBranchDropdown = false; showBranchManager = true; }}
                  class="w-full px-2 py-1.5 text-sm text-left text-blue-600 hover:bg-blue-50 rounded flex items-center gap-2"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage Branches...
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Ahead/behind with push/pull -->
      {#if hasRemote}
        <div class="flex items-center gap-1">
          {#if status.behind > 0}
            <button
              onclick={handlePull}
              disabled={pulling}
              class="flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
              title="Pull {status.behind} commit{status.behind > 1 ? 's' : ''}"
            >
              {#if pulling}
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              {:else}
                <span>↓{status.behind}</span>
              {/if}
            </button>
          {/if}
          {#if status.ahead > 0}
            <button
              onclick={handlePush}
              disabled={pushing}
              class="flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-green-600 bg-green-50 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
              title="Push {status.ahead} commit{status.ahead > 1 ? 's' : ''}"
            >
              {#if pushing}
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              {:else}
                <span>↑{status.ahead}</span>
              {/if}
            </button>
          {/if}
        </div>
      {:else if status.ahead > 0 || status.behind > 0}
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

    <!-- Sync buttons when remote exists -->
    {#if hasRemote}
      <button
        onclick={handlePull}
        disabled={pulling || status?.behind === 0}
        class="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Pull from remote"
      >
        {#if pulling}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        {/if}
      </button>
      <button
        onclick={handlePush}
        disabled={pushing || status?.ahead === 0}
        class="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Push to remote"
      >
        {#if pushing}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-8l-4-4m0 0L16 8m4-4v12" />
          </svg>
        {/if}
      </button>
    {/if}

    <button onclick={refresh} class="p-1 text-gray-400 hover:text-gray-600" title="Refresh">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Sync error message -->
  {#if syncError}
    <div class="px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600 flex items-center justify-between">
      <span class="truncate">{syncError}</span>
      <button onclick={() => syncError = ""} class="text-red-400 hover:text-red-600 ml-2">✕</button>
    </div>
  {/if}

  <!-- Summarize Section -->
  {#if totalChanges > 0}
    <div class="px-3 py-2 border-b border-gray-200 bg-gray-50/50">
      {#if summarizing}
        <div class="flex items-center gap-2 text-sm text-gray-500">
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span>Generating summary...</span>
        </div>
      {:else if changeSummary}
        <div class="space-y-1">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-medium text-gray-500 uppercase">
              {changeSummary.type === "semantic" ? "What Changed" : "Summary"}
            </span>
            <button
              onclick={clearSummary}
              class="text-xs text-gray-400 hover:text-gray-600"
              title="Close summary"
            >✕</button>
          </div>
          {#each changeSummary.items as bullet}
            <div class="flex items-start gap-2 text-sm text-gray-700">
              <span class="text-gray-400 mt-0.5">•</span>
              <span>{bullet}</span>
            </div>
          {/each}
        </div>
      {:else}
        <button
          onclick={handleSummarizeChanges}
          class="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span>Summarize Changes</span>
        </button>
      {/if}
    </div>
  {/if}

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
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <!-- File List -->
        <div class="flex-1 min-h-0 overflow-y-auto">
          {#if status}
            <!-- Staged -->
            {#if status.staged.length > 0}
              <div class="px-3 py-2">
                <div class="text-xs font-medium text-green-600 mb-1">Staged ({status.staged.length})</div>
                {#each status.staged as file}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
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
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
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
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
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
        {#each ["Today", "Yesterday", "This Week", "Older"] as group}
          {@const groupCommits = groupedCommits()[group]}
          {#if groupCommits.length > 0}
            <div class="sticky top-0 bg-gray-50 border-b border-gray-200 px-3 py-1.5 z-10">
              <span class="text-xs font-medium text-gray-500">{group}</span>
            </div>
            {#each groupCommits as commit}
              {@const commitType = getCommitType(commit.message)}
              <button
                onclick={() => handleSelectCommit(commit)}
                class="w-full px-3 py-2.5 text-left hover:bg-blue-50 border-b border-gray-100 transition-colors group"
              >
                <div class="flex items-start gap-2">
                  <span class="shrink-0 text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">{commit.shortHash}</span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      {#if commitType}
                        <span class="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded {commitType.color}">{commitType.type}</span>
                      {/if}
                      <p class="text-sm text-gray-900 truncate">{getCommitMessage(commit.message)}</p>
                    </div>
                    <p class="text-xs text-gray-400 mt-0.5">{commit.author} · {commit.date}</p>
                  </div>
                </div>
              </button>
            {/each}
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Quick commit error -->
  {#if quickCommitError}
    <div class="px-3 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600 flex items-center justify-between">
      <span>{quickCommitError}</span>
      <button onclick={() => quickCommitError = ""} class="text-red-400 hover:text-red-600">×</button>
    </div>
  {/if}

  <!-- Bottom Action Bar -->
  {#if status && status.isGitRepo && activeTab === "changes" && !showDiff}
    <div class="h-12 px-3 border-t border-gray-200 bg-gray-50 flex items-center gap-2 shrink-0">
      {#if status.modified.length > 0 || status.untracked.length > 0}
        <button
          onclick={handleStageAll}
          class="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Stage All
        </button>
      {/if}
      <div class="flex-1"></div>
      <!-- Quick Commit button - only show when there are changes -->
      {#if totalChanges > 0}
        <button
          onclick={handleQuickCommit}
          disabled={quickCommitting}
          class="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          title="Stage all, generate AI commit message, and commit"
        >
          {#if quickCommitting}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>Committing...</span>
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Quick Commit</span>
          {/if}
        </button>
      {/if}
      <button
        onclick={() => showCommitModal = true}
        disabled={status.staged.length === 0}
        class="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        Commit
        {#if status.staged.length > 0}
          <span class="px-1.5 py-0.5 text-[10px] bg-blue-500 rounded-full">{status.staged.length}</span>
        {/if}
      </button>
    </div>
  {/if}
  {/if}
</div>

{#if showBranchDropdown}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-40" onclick={() => (showBranchDropdown = false)}></div>
{/if}

{#if showCommitModal && status}
  <GitCommitModal
    {rootPath}
    {status}
    onClose={() => showCommitModal = false}
    onCommit={refresh}
  />
{/if}

{#if showBranchManager && status}
  <GitBranchManager
    {rootPath}
    {branches}
    currentBranch={status.branch}
    onRefresh={refresh}
    onClose={() => showBranchManager = false}
  />
{/if}
