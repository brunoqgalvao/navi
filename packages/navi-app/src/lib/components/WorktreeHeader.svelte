<script lang="ts">
  import { worktreeApi, type WorktreeInfo } from "../api";
  import WorktreeBadge from "./WorktreeBadge.svelte";

  interface Props {
    sessionId: string;
    branch: string;
    baseBranch: string;
    onMergeClick: () => void;
    onSyncClick?: () => void;
  }

  let {
    sessionId,
    branch,
    baseBranch,
    onMergeClick,
    onSyncClick,
  }: Props = $props();

  let status = $state<WorktreeInfo | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function loadStatus() {
    try {
      loading = true;
      error = null;
      status = await worktreeApi.getStatus(sessionId);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // Load status on mount and periodically
  $effect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  });

  const totalChanges = $derived(
    status ? status.status.staged + status.status.modified + status.status.untracked : 0
  );

  const statusText = $derived(() => {
    if (!status) return "";
    const parts: string[] = [];
    if (status.commits.length > 0) {
      parts.push(`${status.commits.length} commit${status.commits.length > 1 ? "s" : ""}`);
    }
    if (totalChanges > 0) {
      parts.push(`${totalChanges} uncommitted`);
    }
    if (status.status.behind > 0) {
      parts.push(`${status.status.behind} behind ${baseBranch}`);
    }
    return parts.join(" · ") || "No changes";
  });
</script>

<div class="worktree-header">
  <div class="header-left">
    <WorktreeBadge {branch} {baseBranch} changesCount={totalChanges} size="md" />
    {#if !loading}
      <span class="status-text">{statusText()}</span>
    {/if}
  </div>

  <div class="header-actions">
    {#if status?.status.behind && status.status.behind > 0 && onSyncClick}
      <button class="action-button sync" onclick={onSyncClick} title="Pull latest from {baseBranch}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Sync
      </button>
    {/if}

    <button
      class="action-button merge"
      onclick={onMergeClick}
      disabled={loading}
      title="Merge changes to {baseBranch}"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
      Merge to {baseBranch}
    </button>
  </div>
</div>

<style>
  .worktree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 1rem;
    background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
    border-bottom: 1px solid #a7f3d0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .status-text {
    font-size: 0.75rem;
    color: #059669;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-button svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  .action-button.sync {
    background: white;
    color: #059669;
    border: 1px solid #a7f3d0;
  }

  .action-button.sync:hover {
    background: #ecfdf5;
    border-color: #34d399;
  }

  .action-button.merge {
    background: #10b981;
    color: white;
    border: 1px solid #10b981;
  }

  .action-button.merge:hover:not(:disabled) {
    background: #059669;
    border-color: #059669;
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
