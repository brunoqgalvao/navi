<!--
  Preview Button Component

  Toolbar button for containerized dev server previews.
  Branch-scoped: one preview per branch, shared across sessions.
  Clicking opens the preview panel in the sidebar.
-->
<script lang="ts">
  import { containerPreviewApi } from "../api";
  import { portsDiscovered } from "../config";

  interface Props {
    projectId: string | null;
    sessionId: string | null;
    branch: string | null; // Current branch (worktree or main)
    onOpenPreviewPanel: () => void;
    onPreviewUrlChange?: (url: string | null) => void;
  }

  let { projectId, sessionId, branch, onOpenPreviewPanel, onPreviewUrlChange }: Props = $props();

  // Preview state
  let previewStatus = $state<"stopped" | "starting" | "running" | "paused" | "error">("stopped");
  let previewUrl = $state<string | null>(null);
  let previewLoading = $state(false);

  const isPreviewActive = $derived(
    previewStatus === "running" || previewStatus === "starting" || previewStatus === "paused"
  );

  // The effective branch to check (worktree branch or "main")
  const effectiveBranch = $derived(branch || "main");

  // Check preview status when projectId or branch changes (only after ports discovered)
  $effect(() => {
    if (projectId && effectiveBranch && portsDiscovered) {
      checkPreviewStatus();
    } else if (!portsDiscovered) {
      // Wait for port discovery
      console.log("[PreviewButton] Waiting for port discovery...");
    } else {
      previewStatus = "stopped";
      previewUrl = null;
    }
  });

  async function checkPreviewStatus() {
    if (!projectId) return;
    try {
      const status = await containerPreviewApi.getStatusByBranch(projectId, effectiveBranch);
      if (status.exists && (status.running || status.status === "starting" || status.status === "paused")) {
        previewStatus = (status.status as any) || "running";
        previewUrl = status.url || null;
        onPreviewUrlChange?.(previewUrl);
      } else {
        previewStatus = "stopped";
        previewUrl = null;
      }
    } catch {
      previewStatus = "stopped";
    }
  }

  async function handleClick() {
    if (isPreviewActive) {
      // Preview already running - open panel to show it
      onOpenPreviewPanel();
    } else {
      // No preview - start one and open panel
      await startPreview();
    }
  }

  async function startPreview() {
    console.log("[PreviewButton] startPreview called", { sessionId, projectId, branch: effectiveBranch });
    if (!sessionId) {
      console.log("[PreviewButton] No sessionId, opening panel anyway");
      onOpenPreviewPanel();
      return;
    }

    previewLoading = true;
    try {
      console.log("[PreviewButton] Starting preview for session", sessionId);
      const result = await containerPreviewApi.start(sessionId);
      console.log("[PreviewButton] Start result:", result);
      if (result.success && result.preview) {
        previewStatus = (result.preview.status as any) || "starting";
        previewUrl = result.preview.url;
        onPreviewUrlChange?.(previewUrl);
        // Open panel to show loading/progress
        onOpenPreviewPanel();
        // Poll for status updates
        pollPreviewStatus();
      } else if (result.error) {
        // Show error in panel
        onOpenPreviewPanel();
      }
    } catch (e: any) {
      console.error("[PreviewButton] Start error:", e);
      onOpenPreviewPanel();
    } finally {
      previewLoading = false;
    }
  }

  function pollPreviewStatus() {
    if (!projectId) return;
    const interval = setInterval(async () => {
      try {
        const status = await containerPreviewApi.getStatusByBranch(projectId!, effectiveBranch);
        if (status.status === "running") {
          previewStatus = "running";
          previewUrl = status.url || null;
          onPreviewUrlChange?.(previewUrl);
          clearInterval(interval);
        } else if (status.status === "error" || (!status.running && status.exists)) {
          previewStatus = status.status as any || "error";
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    setTimeout(() => clearInterval(interval), 120000);
  }
</script>

{#if projectId}
  <button
    onclick={handleClick}
    disabled={previewLoading}
    class="p-2 border rounded-lg shadow-sm transition-all group
      {isPreviewActive
        ? 'bg-cyan-50 border-cyan-300 hover:bg-cyan-100'
        : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'}
      {previewLoading ? 'opacity-50 cursor-wait' : ''}"
    title={previewLoading ? 'Starting preview...' : isPreviewActive ? `Preview: ${previewUrl}` : 'Start Preview'}
  >
    {#if previewLoading || previewStatus === "starting"}
      <svg class="w-4 h-4 text-cyan-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" />
      </svg>
    {:else if isPreviewActive}
      <span class="text-base leading-none">🐳</span>
    {:else}
      <svg class="w-4 h-4 text-gray-400 group-hover:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5,3 19,12 5,21" />
      </svg>
    {/if}
  </button>
{/if}
