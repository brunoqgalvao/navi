<script lang="ts">
  import type { GitBranches } from "../types";
  import * as gitApi from "../api";

  interface Props {
    rootPath: string;
    branches: GitBranches | null;
    currentBranch: string;
    onRefresh: () => void;
    onClose: () => void;
  }

  let { rootPath, branches, currentBranch, onRefresh, onClose }: Props = $props();

  // UI state
  let activeTab = $state<"local" | "remote">("local");
  let searchQuery = $state("");
  let showCreateModal = $state(false);
  let showRenameModal = $state(false);
  let showMergeModal = $state(false);
  let showDeleteConfirm = $state(false);

  // Action state
  let loading = $state(false);
  let error = $state("");
  let success = $state("");

  // Form state
  let newBranchName = $state("");
  let checkoutAfterCreate = $state(true);
  let startPoint = $state("");
  let selectedBranch = $state<string | null>(null);
  let renameTo = $state("");
  let forceDelete = $state(false);
  let mergeBranch = $state("");
  let mergeNoFf = $state(false);
  let mergeSquash = $state(false);

  // Merge status
  let mergeStatus = $state<gitApi.MergeStatus | null>(null);

  // Filtered branches
  let filteredLocalBranches = $derived(
    (branches?.local || []).filter(b =>
      b.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let filteredRemoteBranches = $derived(
    (branches?.remote || []).filter(b =>
      b.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  async function checkMergeStatus() {
    try {
      mergeStatus = await gitApi.getMergeStatus(rootPath);
    } catch (e) {
      console.error("Failed to check merge status:", e);
    }
  }

  async function handleCheckout(branch: string) {
    if (branch === currentBranch) return;
    loading = true;
    error = "";
    try {
      await gitApi.checkout(rootPath, branch);
      success = `Switched to branch "${branch}"`;
      onRefresh();
      setTimeout(() => success = "", 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to checkout";
    } finally {
      loading = false;
    }
  }

  async function handleCreateBranch() {
    if (!newBranchName.trim()) return;
    loading = true;
    error = "";
    try {
      const created = await gitApi.createBranch(rootPath, newBranchName.trim(), {
        checkout: checkoutAfterCreate,
        startPoint: startPoint || undefined,
      });
      success = `Created branch "${created}"${checkoutAfterCreate ? " and switched to it" : ""}`;
      showCreateModal = false;
      newBranchName = "";
      startPoint = "";
      onRefresh();
      setTimeout(() => success = "", 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create branch";
    } finally {
      loading = false;
    }
  }

  async function handleDeleteBranch() {
    if (!selectedBranch) return;
    loading = true;
    error = "";
    try {
      const result = await gitApi.deleteBranch(rootPath, selectedBranch, forceDelete);
      if (result.needsForce && !forceDelete) {
        error = "Branch is not fully merged. Enable 'Force delete' to remove anyway.";
        return;
      }
      success = `Deleted branch "${selectedBranch}"`;
      showDeleteConfirm = false;
      selectedBranch = null;
      forceDelete = false;
      onRefresh();
      setTimeout(() => success = "", 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete branch";
    } finally {
      loading = false;
    }
  }

  async function handleRenameBranch() {
    if (!selectedBranch || !renameTo.trim()) return;
    loading = true;
    error = "";
    try {
      const newName = await gitApi.renameBranch(rootPath, selectedBranch, renameTo.trim());
      success = `Renamed branch to "${newName}"`;
      showRenameModal = false;
      selectedBranch = null;
      renameTo = "";
      onRefresh();
      setTimeout(() => success = "", 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to rename branch";
    } finally {
      loading = false;
    }
  }

  async function handleMergeBranch() {
    if (!mergeBranch) return;
    loading = true;
    error = "";
    try {
      const result = await gitApi.mergeBranch(rootPath, mergeBranch, {
        noFf: mergeNoFf,
        squash: mergeSquash,
      });
      if (result.hasConflicts) {
        error = "Merge conflicts detected. Please resolve them and commit.";
        checkMergeStatus();
      } else {
        success = `Successfully merged "${mergeBranch}" into "${currentBranch}"`;
        setTimeout(() => success = "", 3000);
      }
      showMergeModal = false;
      mergeBranch = "";
      onRefresh();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to merge";
    } finally {
      loading = false;
    }
  }

  async function handleAbortMerge() {
    loading = true;
    error = "";
    try {
      await gitApi.abortMerge(rootPath);
      success = "Merge aborted";
      mergeStatus = null;
      onRefresh();
      setTimeout(() => success = "", 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to abort merge";
    } finally {
      loading = false;
    }
  }

  async function handleFetch() {
    loading = true;
    error = "";
    try {
      await gitApi.fetchRemote(rootPath, { all: true, prune: true });
      success = "Fetched from all remotes";
      onRefresh();
      setTimeout(() => success = "", 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch";
    } finally {
      loading = false;
    }
  }

  function openDeleteConfirm(branch: string) {
    selectedBranch = branch;
    showDeleteConfirm = true;
    forceDelete = false;
  }

  function openRenameModal(branch: string) {
    selectedBranch = branch;
    renameTo = branch;
    showRenameModal = true;
  }

  function openMergeModal(branch: string) {
    mergeBranch = branch;
    mergeNoFf = false;
    mergeSquash = false;
    showMergeModal = true;
  }

  $effect(() => {
    checkMergeStatus();
  });
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
      <h2 class="text-lg font-semibold text-gray-900">Branch Manager</h2>
      <button onclick={onClose} class="p-1 text-gray-400 hover:text-gray-600 rounded">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Merge conflict warning -->
    {#if mergeStatus?.isMerging}
      <div class="px-4 py-2 bg-yellow-50 border-b border-yellow-100">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm text-yellow-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Merge in progress ({mergeStatus.conflictedFiles.length} conflicts)</span>
          </div>
          <button
            onclick={handleAbortMerge}
            disabled={loading}
            class="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded"
          >
            Abort Merge
          </button>
        </div>
      </div>
    {/if}

    <!-- Messages -->
    {#if error}
      <div class="px-4 py-2 bg-red-50 border-b border-red-100 text-sm text-red-600 flex items-center justify-between">
        <span>{error}</span>
        <button onclick={() => error = ""} class="text-red-400 hover:text-red-600">×</button>
      </div>
    {/if}
    {#if success}
      <div class="px-4 py-2 bg-green-50 border-b border-green-100 text-sm text-green-600 flex items-center justify-between">
        <span>{success}</span>
        <button onclick={() => success = ""} class="text-green-400 hover:text-green-600">×</button>
      </div>
    {/if}

    <!-- Actions bar -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
      <button
        onclick={() => { showCreateModal = true; newBranchName = ""; startPoint = ""; }}
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Branch
      </button>
      <button
        onclick={handleFetch}
        disabled={loading}
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
      >
        {#if loading}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        {/if}
        Fetch All
      </button>
      <div class="flex-1"></div>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search branches..."
        class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-40"
      />
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-200">
      <button
        onclick={() => activeTab = "local"}
        class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'local' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}"
      >
        Local ({branches?.local.length || 0})
      </button>
      <button
        onclick={() => activeTab = "remote"}
        class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'remote' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}"
      >
        Remote ({branches?.remote.length || 0})
      </button>
    </div>

    <!-- Branch list -->
    <div class="flex-1 overflow-y-auto">
      {#if activeTab === "local"}
        {#if filteredLocalBranches.length === 0}
          <div class="flex items-center justify-center h-32 text-sm text-gray-400">
            {searchQuery ? "No matching branches" : "No local branches"}
          </div>
        {:else}
          {#each filteredLocalBranches as branch}
            <div class="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b border-gray-100 group">
              <button
                onclick={() => handleCheckout(branch)}
                disabled={branch === currentBranch || loading}
                class="flex-1 flex items-center gap-2 text-left"
              >
                {#if branch === currentBranch}
                  <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                {:else}
                  <span class="w-4"></span>
                {/if}
                <span class="text-sm {branch === currentBranch ? 'font-semibold text-green-700' : 'text-gray-700'}">
                  {branch}
                </span>
                {#if branch === currentBranch}
                  <span class="px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-100 rounded">HEAD</span>
                {/if}
              </button>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {#if branch !== currentBranch}
                  <button
                    onclick={() => openMergeModal(branch)}
                    class="p-1 text-gray-400 hover:text-blue-600 rounded"
                    title="Merge into current branch"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                {/if}
                <button
                  onclick={() => openRenameModal(branch)}
                  class="p-1 text-gray-400 hover:text-yellow-600 rounded"
                  title="Rename branch"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {#if branch !== currentBranch}
                  <button
                    onclick={() => openDeleteConfirm(branch)}
                    class="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Delete branch"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      {:else}
        {#if filteredRemoteBranches.length === 0}
          <div class="flex items-center justify-center h-32 text-sm text-gray-400">
            {searchQuery ? "No matching branches" : "No remote branches. Try fetching."}
          </div>
        {:else}
          {#each filteredRemoteBranches as branch}
            <div class="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border-b border-gray-100 group">
              <span class="flex-1 text-sm text-gray-600">{branch}</span>
              <button
                onclick={() => { showCreateModal = true; newBranchName = branch.split("/").slice(1).join("/"); startPoint = branch; }}
                class="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-opacity"
              >
                Checkout
              </button>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>
</div>

<!-- Create Branch Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Create New Branch</h3>
      <div class="space-y-4">
        <div>
          <label for="branch-name" class="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
          <input
            id="branch-name"
            type="text"
            bind:value={newBranchName}
            placeholder="feature/my-feature"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onkeydown={(e) => e.key === "Enter" && handleCreateBranch()}
          />
        </div>
        <div>
          <label for="start-point" class="block text-sm font-medium text-gray-700 mb-1">Start From (optional)</label>
          <input
            id="start-point"
            type="text"
            bind:value={startPoint}
            placeholder="main, origin/main, commit hash..."
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={checkoutAfterCreate} class="rounded text-blue-600" />
          <span class="text-sm text-gray-700">Switch to new branch after creating</span>
        </label>
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button
          onclick={() => showCreateModal = false}
          class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onclick={handleCreateBranch}
          disabled={!newBranchName.trim() || loading}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Branch"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Rename Modal -->
{#if showRenameModal && selectedBranch}
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Rename Branch</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Current Name</label>
          <div class="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">{selectedBranch}</div>
        </div>
        <div>
          <label for="new-name" class="block text-sm font-medium text-gray-700 mb-1">New Name</label>
          <input
            id="new-name"
            type="text"
            bind:value={renameTo}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onkeydown={(e) => e.key === "Enter" && handleRenameBranch()}
          />
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button
          onclick={() => { showRenameModal = false; selectedBranch = null; }}
          class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onclick={handleRenameBranch}
          disabled={!renameTo.trim() || renameTo === selectedBranch || loading}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {loading ? "Renaming..." : "Rename"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && selectedBranch}
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
      <h3 class="text-lg font-semibold text-gray-900 mb-2">Delete Branch</h3>
      <p class="text-sm text-gray-600 mb-4">
        Are you sure you want to delete <span class="font-mono font-semibold">{selectedBranch}</span>?
      </p>
      <label class="flex items-center gap-2 cursor-pointer mb-4">
        <input type="checkbox" bind:checked={forceDelete} class="rounded text-red-600" />
        <span class="text-sm text-gray-700">Force delete (even if not merged)</span>
      </label>
      <div class="flex justify-end gap-2">
        <button
          onclick={() => { showDeleteConfirm = false; selectedBranch = null; }}
          class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onclick={handleDeleteBranch}
          disabled={loading}
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Merge Modal -->
{#if showMergeModal}
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Merge Branch</h3>
      <div class="space-y-4">
        <div class="flex items-center gap-2 text-sm">
          <span class="font-mono px-2 py-1 bg-gray-100 rounded">{mergeBranch}</span>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          <span class="font-mono px-2 py-1 bg-green-100 text-green-700 rounded">{currentBranch}</span>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={mergeNoFf} class="rounded text-blue-600" />
          <span class="text-sm text-gray-700">Create merge commit (--no-ff)</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={mergeSquash} class="rounded text-blue-600" />
          <span class="text-sm text-gray-700">Squash commits (--squash)</span>
        </label>
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button
          onclick={() => { showMergeModal = false; mergeBranch = ""; }}
          class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onclick={handleMergeBranch}
          disabled={loading}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {loading ? "Merging..." : "Merge"}
        </button>
      </div>
    </div>
  </div>
{/if}
