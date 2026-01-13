<!--
  Worktree Header Component

  Displays worktree status and provides preview functionality.
  Supports two preview modes:
  - Container: Uses Colima/Docker containers with Traefik routing (recommended)
  - Native: Uses native process spawning (fallback)
-->
<script lang="ts">
  import { worktreeApi, containerPreviewApi, type WorktreeInfo, type ContainerPreviewStatus } from "../api";
  import WorktreeBadge from "./WorktreeBadge.svelte";

  interface Props {
    sessionId: string;
    branch: string;
    baseBranch: string;
    onMergeClick: () => void;
    onSyncClick?: () => void;
    /** Callback when preview URL is available (for embedded preview) */
    onPreviewUrlChange?: (url: string | null) => void;
  }

  let {
    sessionId,
    branch,
    baseBranch,
    onMergeClick,
    onSyncClick,
    onPreviewUrlChange,
  }: Props = $props();

  let status = $state<WorktreeInfo | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Preview state
  type PreviewMode = "container" | "native" | "none";
  let previewMode = $state<PreviewMode>("none");
  let previewStatus = $state<"stopped" | "starting" | "running" | "paused" | "error">("stopped");
  let previewUrl = $state<string | null>(null);
  let previewPorts = $state<number[]>([]);
  let previewLoading = $state(false);
  let previewError = $state<string | null>(null);
  let containerRuntimeAvailable = $state<boolean | null>(null);

  async function loadStatus() {
    try {
      loading = true;
      error = null;
      status = await worktreeApi.getStatus(sessionId);

      // Check container preview status first
      try {
        const containerStatus = await containerPreviewApi.getStatus(sessionId);
        if (containerStatus.running || containerStatus.status === "starting" || containerStatus.status === "paused") {
          previewMode = "container";
          previewStatus = containerStatus.status as any || "running";
          previewUrl = containerStatus.url || null;
          containerRuntimeAvailable = true;
          onPreviewUrlChange?.(previewUrl);
          return;
        }
      } catch {
        // Container preview not available or not running
      }

      // Fall back to native preview status
      try {
        const nativeStatus = await worktreeApi.getPreviewStatus(sessionId);
        if (nativeStatus.running) {
          previewMode = "native";
          previewStatus = "running";
          previewPorts = nativeStatus.ports || [];
          previewUrl = previewPorts.length > 0 ? `http://localhost:${previewPorts[0]}` : null;
          onPreviewUrlChange?.(previewUrl);
          return;
        }
      } catch {
        // Native preview not running
      }

      // Nothing running
      previewMode = "none";
      previewStatus = "stopped";
      previewUrl = null;
      onPreviewUrlChange?.(null);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // Check container runtime availability on mount
  async function checkContainerRuntime() {
    try {
      const systemStatus = await containerPreviewApi.getSystemStatus();
      containerRuntimeAvailable = systemStatus.runtime.runtime !== "none";
    } catch {
      containerRuntimeAvailable = false;
    }
  }

  // Load status on mount and periodically
  $effect(() => {
    checkContainerRuntime();
    loadStatus();
    const interval = setInterval(loadStatus, 10000); // Refresh every 10s when preview running
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

  const isPreviewActive = $derived(
    previewStatus === "running" || previewStatus === "starting" || previewStatus === "paused"
  );

  async function startContainerPreview() {
    previewLoading = true;
    previewError = null;
    try {
      const result = await containerPreviewApi.start(sessionId);
      if (result.success && result.preview) {
        previewMode = "container";
        previewStatus = result.preview.status as any || "starting";
        previewUrl = result.preview.url;
        onPreviewUrlChange?.(previewUrl);
      } else if (result.error) {
        previewError = result.error;
        // If container runtime not available, suggest native mode
      }
      }
    } catch (e: any) {
      previewError = e.message;
    } finally {
      previewLoading = false;
    }
  }

  async function startNativePreview() {
    previewLoading = true;
    previewError = null;
    try {
      const result = await worktreeApi.startPreview(sessionId);
      previewMode = "native";
      previewStatus = "running";
      previewPorts = result.ports || [];
      if (result.frontendPort) {
        previewPorts = [result.frontendPort];
      }
      previewUrl = previewPorts.length > 0 ? `http://localhost:${previewPorts[0]}` : null;
      onPreviewUrlChange?.(previewUrl);
    } catch (e: any) {
      previewError = e.message;
    } finally {
      previewLoading = false;
    }
  }

  async function stopPreview() {
    previewLoading = true;
    previewError = null;
    try {
      if (previewMode === "container") {
        await containerPreviewApi.stop(sessionId);
      } else if (previewMode === "native") {
        await worktreeApi.stopPreview(sessionId);
      }
      previewMode = "none";
      previewStatus = "stopped";
      previewUrl = null;
      previewPorts = [];
      onPreviewUrlChange?.(null);
    } catch (e: any) {
      previewError = e.message;
    } finally {
      previewLoading = false;
    }
  }

  async function togglePreview() {
    if (isPreviewActive) {
      await stopPreview();
    } else {
      // Try container preview first, fall back to native if it fails
      if (containerRuntimeAvailable) {
        try {
          await startContainerPreview();
          // If container preview failed (no image, network issue, etc.), fall back to native
          if (previewError) {
            previewError = null;
            await startNativePreview();
          }
        } catch {
          // Fall back to native on any error
          await startNativePreview();
        }
      } else {
        // No container runtime, use native directly
        await startNativePreview();
      }
    }
  }

  function openPreview() {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    }
  }

  // Preview button tooltip
  const previewTooltip = $derived(() => {
    if (previewLoading) return "Loading...";
    if (previewStatus === "running") {
      return previewMode === "container"
        ? `Container preview at ${previewUrl}`
        : `Preview running on port ${previewPorts[0] || "..."}`;
    }
    if (previewStatus === "starting") return "Starting preview server...";
    if (previewStatus === "paused") return "Preview paused (click to resume)";
    if (previewStatus === "error") return previewError || "Preview failed";

    return containerRuntimeAvailable
      ? "Start containerized preview (recommended)"
      : "Start native preview server";
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
    <!-- Preview button -->
    <button
      class="action-button preview"
      class:active={isPreviewActive}
      class:starting={previewStatus === "starting"}
      class:paused={previewStatus === "paused"}
      class:error={previewStatus === "error"}
      class:container={previewMode === "container"}
      onclick={togglePreview}
      disabled={previewLoading}
      title={previewTooltip()}
    >
      {#if previewLoading}
        <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
        </svg>
      {:else if previewStatus === "starting"}
        <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
        </svg>
      {:else if isPreviewActive}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      {/if}
      {#if previewStatus === "starting"}
        Starting...
      {:else if previewStatus === "paused"}
        Paused
      {:else if isPreviewActive}
        Stop
      {:else}
        Preview
      {/if}
      {#if previewMode === "container" && isPreviewActive}
        <span class="mode-badge">🐳</span>
      {/if}
    </button>

    <!-- Open preview button -->
    {#if isPreviewActive && previewUrl}
      <button
        class="action-button open-preview"
        onclick={openPreview}
        title="Open preview in new tab"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {#if previewMode === "native" && previewPorts.length > 0}
          :{previewPorts[0]}
        {:else}
          Open
        {/if}
      </button>
    {/if}

    <!-- Sync button -->
    {#if status?.status.behind && status.status.behind > 0 && onSyncClick}
      <button class="action-button sync" onclick={onSyncClick} title="Pull latest from {baseBranch}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Sync
      </button>
    {/if}

    <!-- Merge button -->
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

{#if previewError}
  <div class="preview-error">
    <span class="error-icon">⚠️</span>
    <span class="error-text">{previewError}</span>
    <button class="dismiss" onclick={() => previewError = null}>×</button>
  </div>
{/if}

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

  /* Preview button styles */
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

  .action-button.preview.starting {
    background: #f5f3ff;
    color: #7c3aed;
    border-color: #c4b5fd;
  }

  .action-button.preview.paused {
    background: #fef3c7;
    color: #d97706;
    border-color: #fcd34d;
  }

  .action-button.preview.error {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
  }

  .action-button.preview.container.active {
    background: #0891b2;
    border-color: #0891b2;
  }

  .action-button.preview.container.active:hover:not(:disabled) {
    background: #0e7490;
    border-color: #0e7490;
  }

  .mode-badge {
    font-size: 0.625rem;
    margin-left: 0.125rem;
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

  /* Error banner */
  .preview-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #fef2f2;
    border-bottom: 1px solid #fecaca;
    font-size: 0.75rem;
    color: #dc2626;
  }

  .preview-error .error-icon {
    flex-shrink: 0;
  }

  .preview-error .error-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-error .dismiss {
    flex-shrink: 0;
    padding: 0.125rem 0.375rem;
    background: transparent;
    border: none;
    color: #dc2626;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
  }

  .preview-error .dismiss:hover {
    background: #fecaca;
    border-radius: 4px;
  }
</style>
