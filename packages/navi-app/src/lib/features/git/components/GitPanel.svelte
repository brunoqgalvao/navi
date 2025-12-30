<script lang="ts">
  import { onMount } from "svelte";
  import type { GitStatus, GitCommit, GitBranches } from "../types";
  import { STATUS_COLORS } from "../types";
  import * as gitApi from "../api";
  import GitDiffViewer from "./GitDiffViewer.svelte";
  import GitCommitModal from "./GitCommitModal.svelte";

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

  async function refresh() {
    await fetchStatus();
    // Only fetch commits and branches if it's a git repo
    if (status?.isGitRepo) {
      fetchCommits();
      fetchBranches();
    } else {
      commits = [];
      branches = null;
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

  // Semantic diff analysis - extracts meaningful feature descriptions
  interface SemanticPattern {
    pattern: RegExp;
    extract: (match: RegExpMatchArray, file: string) => string | null;
    category: string;
  }

  const semanticPatterns: SemanticPattern[] = [
    // New component/module detection
    {
      pattern: /^\+.*export\s+(default\s+)?(function|const|class)\s+(\w+)/gm,
      extract: (m, file) => {
        const name = m[3];
        if (file.endsWith(".svelte")) return `New component: ${name}`;
        if (file.includes("store")) return `New store: ${name}`;
        if (file.includes("api")) return `New API: ${name}`;
        return `New export: ${name}`;
      },
      category: "additions"
    },
    // New interface/type
    {
      pattern: /^\+.*export\s+(interface|type)\s+(\w+)/gm,
      extract: (m) => `New type: ${m[2]}`,
      category: "types"
    },
    // New function
    {
      pattern: /^\+\s*(async\s+)?function\s+(\w+)/gm,
      extract: (m) => `New function: ${m[2]}`,
      category: "additions"
    },
    // Event handler additions
    {
      pattern: /^\+.*on(\w+)\s*[=:]\s*(?:\(\)|{|async|\()/gm,
      extract: (m) => `Added ${m[1].toLowerCase()} handler`,
      category: "handlers"
    },
    // Import additions (grouped)
    {
      pattern: /^\+\s*import\s+.*from\s+["']([^"']+)["']/gm,
      extract: (m) => {
        const pkg = m[1];
        if (pkg.startsWith(".")) return null; // Skip relative imports
        return `Added dependency: ${pkg}`;
      },
      category: "dependencies"
    },
    // State additions
    {
      pattern: /^\+.*let\s+(\w+)\s*=\s*\$state/gm,
      extract: (m) => `New state: ${m[1]}`,
      category: "state"
    },
    // Store additions
    {
      pattern: /^\+.*(?:writable|readable|derived)\s*[<(]/gm,
      extract: () => `New reactive store`,
      category: "state"
    },
    // API endpoint additions
    {
      pattern: /^\+.*(?:fetch|axios|get|post|put|delete)\s*\(\s*[`"']([^`"']*)/gm,
      extract: (m) => {
        const url = m[1];
        if (url.includes("${")) return null; // Skip template strings
        return `API call: ${url.split("/").pop() || url}`;
      },
      category: "api"
    },
    // Error handling
    {
      pattern: /^\+.*catch\s*\(/gm,
      extract: () => `Added error handling`,
      category: "robustness"
    },
    // Feature flags / conditions
    {
      pattern: /^\+.*if\s*\(\s*(\w+(?:\.\w+)*)\s*(?:===?|!==?|&&|\|\|)/gm,
      extract: (m) => {
        const condition = m[1];
        if (condition.includes("error") || condition.includes("Error")) return "Added error check";
        if (condition.includes("loading")) return "Added loading state handling";
        if (condition.includes("auth") || condition.includes("user")) return "Added auth check";
        return null;
      },
      category: "logic"
    },
  ];

  function analyzeFileDiff(diff: string, filePath: string): string[] {
    const insights: string[] = [];
    const fileName = filePath.split("/").pop() || filePath;
    const seenInsights = new Set<string>();

    // Check for new file
    if (diff.includes("new file mode") || diff.startsWith("diff --git a/") && !diff.includes("---")) {
      if (filePath.endsWith(".svelte")) {
        insights.push(`New component: ${fileName.replace(".svelte", "")}`);
      } else if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
        insights.push(`New module: ${fileName}`);
      } else {
        insights.push(`New file: ${fileName}`);
      }
      return insights;
    }

    // Apply semantic patterns
    for (const { pattern, extract, category } of semanticPatterns) {
      pattern.lastIndex = 0; // Reset regex state
      let match;
      while ((match = pattern.exec(diff)) !== null) {
        const insight = extract(match, filePath);
        if (insight && !seenInsights.has(insight)) {
          seenInsights.add(insight);
          insights.push(insight);
        }
      }
    }

    // If no semantic insights, provide file-level summary
    if (insights.length === 0) {
      const addedLines = (diff.match(/^\+[^+]/gm) || []).length;
      const removedLines = (diff.match(/^-[^-]/gm) || []).length;

      if (addedLines > 0 || removedLines > 0) {
        const parts: string[] = [];
        if (addedLines > 0) parts.push(`+${addedLines}`);
        if (removedLines > 0) parts.push(`-${removedLines}`);
        insights.push(`${fileName}: ${parts.join("/")}`);
      }
    }

    return insights;
  }

  function groupAndDedupeInsights(allInsights: string[]): string[] {
    // Group by semantic category
    const categories: Record<string, Set<string>> = {
      components: new Set(),
      features: new Set(),
      state: new Set(),
      handlers: new Set(),
      types: new Set(),
      api: new Set(),
      other: new Set(),
    };

    for (const insight of allInsights) {
      if (insight.includes("component") || insight.includes("Component")) {
        categories.components.add(insight);
      } else if (insight.includes("function") || insight.includes("handler") || insight.includes("Handler")) {
        categories.handlers.add(insight);
      } else if (insight.includes("state") || insight.includes("store")) {
        categories.state.add(insight);
      } else if (insight.includes("type") || insight.includes("interface")) {
        categories.types.add(insight);
      } else if (insight.includes("API") || insight.includes("api") || insight.includes("fetch")) {
        categories.api.add(insight);
      } else {
        categories.other.add(insight);
      }
    }

    // Build final summary - prioritize semantic over file-level
    const result: string[] = [];

    if (categories.components.size > 0) {
      result.push(...Array.from(categories.components).slice(0, 3));
    }
    if (categories.handlers.size > 0) {
      if (categories.handlers.size <= 3) {
        result.push(...Array.from(categories.handlers));
      } else {
        result.push(`Added ${categories.handlers.size} new handlers/functions`);
      }
    }
    if (categories.state.size > 0) {
      if (categories.state.size <= 2) {
        result.push(...Array.from(categories.state));
      } else {
        result.push(`Added ${categories.state.size} new state variables`);
      }
    }
    if (categories.types.size > 0) {
      if (categories.types.size <= 2) {
        result.push(...Array.from(categories.types));
      } else {
        result.push(`Added ${categories.types.size} new types`);
      }
    }
    if (categories.api.size > 0) {
      result.push(...Array.from(categories.api).slice(0, 2));
    }
    if (categories.other.size > 0 && result.length < 8) {
      result.push(...Array.from(categories.other).slice(0, 8 - result.length));
    }

    return result;
  }

  async function handleSummarizeChanges() {
    if (!status) return;

    summarizing = true;
    changeSummary = null;

    try {
      // Get all changed files
      const allFiles = [
        ...status.staged.map(f => ({ path: f.path, staged: true })),
        ...status.modified.map(f => ({ path: f.path, staged: false })),
      ];

      if (allFiles.length === 0 && status.untracked.length > 0) {
        // Only untracked files - show file-based summary
        const untrackedSummary = status.untracked.map(f => {
          const fileName = f.path.split("/").pop() || f.path;
          if (f.path.endsWith(".svelte")) return `New component: ${fileName.replace(".svelte", "")}`;
          if (f.path.endsWith(".ts") || f.path.endsWith(".js")) return `New module: ${fileName}`;
          return `New file: ${fileName}`;
        });
        changeSummary = { type: "semantic", items: untrackedSummary.slice(0, 8) };
        return;
      }

      // Fetch diffs and analyze semantically
      const allInsights: string[] = [];

      // Fetch diff for all changes at once (more efficient)
      const fullDiff = await gitApi.getDiff(rootPath);

      // Split by file and analyze each
      const fileDiffs = fullDiff.split(/(?=^diff --git)/m);

      for (const fileDiff of fileDiffs) {
        if (!fileDiff.trim()) continue;

        // Extract file path from diff header
        const pathMatch = fileDiff.match(/^diff --git a\/(.+?) b\//m);
        if (!pathMatch) continue;

        const filePath = pathMatch[1];
        const insights = analyzeFileDiff(fileDiff, filePath);
        allInsights.push(...insights);
      }

      // Add untracked files
      for (const f of status.untracked) {
        const fileName = f.path.split("/").pop() || f.path;
        if (f.path.endsWith(".svelte")) allInsights.push(`New component: ${fileName.replace(".svelte", "")}`);
        else if (f.path.endsWith(".ts") || f.path.endsWith(".js")) allInsights.push(`New module: ${fileName}`);
        else allInsights.push(`New file: ${fileName}`);
      }

      // Group and dedupe
      const summary = groupAndDedupeInsights(allInsights);

      // If still empty, fall back to file count
      if (summary.length === 0) {
        const total = status.staged.length + status.modified.length + status.untracked.length;
        summary.push(`${total} files changed`);
      }

      changeSummary = { type: "semantic", items: summary };
    } catch (e) {
      console.error("Failed to generate semantic summary:", e);
      // Fall back to simple file-based summary
      changeSummary = {
        type: "file",
        items: [`${status.staged.length + status.modified.length + status.untracked.length} files changed`]
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
  <!-- Not a git repo state -->
  {#if status && !status.isGitRepo}
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
      <div class="flex-1 min-h-0 flex flex-col">
        <!-- File List -->
        <div class="flex-1 overflow-y-auto">
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
