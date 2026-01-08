<!--
  ⚠️ EXPERIMENTAL: Worktree Preview Feature
  Added 2026-01-08

  To revert preview functionality from this component:
  1. Remove preview state variables (previewRunning, previewPorts, previewLoading)
  2. Remove preview status check in loadStatus()
  3. Remove togglePreview() and openPreview() functions
  4. Remove preview button and open-preview button from template
  5. Remove .preview and .open-preview CSS classes

  See server/routes/worktree-preview.ts for full feature revert instructions.
-->
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

  // ⚠️ EXPERIMENTAL: Preview server state - remove to revert
  let previewRunning = $state(false);
  let previewPorts = $state<number[]>([]);
  let previewLoading = $state(false);

  async function loadStatus() {
    try {
      loading = true;
      error = null;
      status = await worktreeApi.getStatus(sessionId);

      // Also check preview status
      try {
        const previewStatus = await worktreeApi.getPreviewStatus(sessionId);
        previewRunning = previewStatus.running;
        previewPorts = previewStatus.ports || [];
      } catch {
        previewRunning = false;
        previewPorts = [];
      }
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

  async function togglePreview() {
    previewLoading = true;
    try {
      if (previewRunning) {
        await worktreeApi.stopPreview(sessionId);
        previewRunning = false;
        previewPorts = [];
      } else {
        const result = await worktreeApi.startPreview(sessionId);
        previewRunning = true;
        previewPorts = result.ports || [];
        if (result.frontendPort) {
          previewPorts = [result.frontendPort];
        }
        // Open in new tab after a short delay for server startup
        if (previewPorts.length > 0) {
          setTimeout(() => {
            window.open(`http://localhost:${previewPorts[0]}`, "_blank");
          }, 2000);
        }
      }
    } catch (e: any) {
      console.error("Preview toggle failed:", e);
    } finally {
      previewLoading = false;
    }
  }

  function openPreview() {
    if (previewPorts.length > 0) {
      window.open(`http://localhost:${previewPorts[0]}`, "_blank");
    }
  }
</script>

<div class="worktree-header">
  <div class="header-left">
    <WorktreeBadge {branch} {baseBranch} changesCount={totalChanges} size="md" />
    {#if !loading}
      <span class="status-text">{statusText()}</span>
    {/if}
  </div>

  <div class="header-actions">
    <!-- ⚠️ EXPERIMENTAL: Preview button - remove to revert -->
    <button
      class="action-button preview"
      class:active={previewRunning}
      onclick={togglePreview}
      disabled={previewLoading}
      title={previewRunning
        ? `Preview running on port ${previewPorts[0] || '...'}`
        : "[Experimental] Start dev server for this branch. Works best with simple projects that have a 'dev' script."}
    >
      {#if previewLoading}
        <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
        </svg>
      {:else if previewRunning}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      {/if}
      {#if previewRunning}
        Stop Preview
      {:else}
        Preview
      {/if}
    </button>

    <!-- ⚠️ EXPERIMENTAL: Open preview button - remove to revert -->
    {#if previewRunning && previewPorts.length > 0}
      <button
        class="action-button open-preview"
        onclick={openPreview}
        title="Open preview in new tab"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        :{previewPorts[0]}
      </button>
    {/if}

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

  /* ⚠️ EXPERIMENTAL: Preview button styles - remove to revert */
  .action-button.preview {
    background: white;
    color: #7c3aed;
    border: 1px solid #c4b5fd;
  }

  .action-button.preview:hover:not(:disabled) {
    background: #f5f3ff;
    border-color: #a78bfa;
  }

  .action-button.preview.active {
    background: #7c3aed;
    color: white;
    border-color: #7c3aed;
  }

  .action-button.preview.active:hover:not(:disabled) {
    background: #6d28d9;
    border-color: #6d28d9;
  }

  .action-button.open-preview {
    background: #f5f3ff;
    color: #7c3aed;
    border: 1px solid #c4b5fd;
    font-family: monospace;
  }

  .action-button.open-preview:hover {
    background: #ede9fe;
    border-color: #a78bfa;
  }
  /* ⚠️ END EXPERIMENTAL preview styles */

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

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
