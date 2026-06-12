<script lang="ts">
  /**
   * ProjectLanding - Default view when no session is active
   *
   * Shows dashboard if .claude/dashboard.md exists AND dashboard feature is enabled,
   * otherwise falls back to ProjectEmptyState.
   */
  import { onMount } from "svelte";
  import type { Session, Workflow } from "$lib/api";
  import ProjectEmptyState from "./ProjectEmptyState.svelte";
  import DashboardView from "$lib/features/dashboard/components/DashboardView.svelte";
  import { getDashboard } from "$lib/features/dashboard";
  import { dashboardEnabled } from "$lib/stores";

  interface Props {
    projectId: string;
    projectPath: string;
    projectName: string;
    sessions: Session[];
    workflows: Workflow[];
    projectDescription?: string | null;
    claudeMdContent: string | null;
    projectContext: { summary: string; suggestions: string[] } | null;
    onSuggestionClick?: (suggestion: string) => void;
    onSelectSession?: (session: Session) => void;
    onOpenSession?: (sessionId: string) => void;
    onNewSession?: () => void;
    onPreviewFile?: (path: string) => void;
    onOpenFiles?: () => void;
    onShowClaudeMd: () => void;
  }

  let {
    projectId,
    projectPath,
    projectName,
    sessions,
    workflows,
    projectDescription = null,
    claudeMdContent,
    projectContext,
    onSuggestionClick,
    onSelectSession,
    onOpenSession,
    onNewSession,
    onPreviewFile,
    onOpenFiles,
    onShowClaudeMd,
  }: Props = $props();

  let checkingDashboard = $state(true);
  let hasDashboard = $state(false);

  async function checkDashboard() {
    // Skip dashboard check if feature is disabled
    if (!$dashboardEnabled) {
      hasDashboard = false;
      checkingDashboard = false;
      return;
    }

    if (!projectPath) {
      hasDashboard = false;
      checkingDashboard = false;
      return;
    }

    try {
      const response = await getDashboard(projectPath);
      hasDashboard = response.exists;
    } catch {
      hasDashboard = false;
    } finally {
      checkingDashboard = false;
    }
  }

  onMount(() => {
    checkDashboard();
  });

  // Re-check when project changes or dashboard feature toggles
  $effect(() => {
    if (projectPath) {
      checkingDashboard = true;
      checkDashboard();
    }
  });

  // Also re-check when dashboard feature is toggled
  $effect(() => {
    $dashboardEnabled;
    checkDashboard();
  });
</script>

<div class="flex h-full flex-col pt-4">
  <div class="px-4 pr-52 pt-1 md:px-6 md:pr-56">
    <div class="flex w-full flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-semibold text-gray-900">{projectName}</h1>
          <span class="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">
            Workspace
          </span>
        </div>
      </div>

    </div>
  </div>

  <div class="flex-1 min-h-0">
    {#if checkingDashboard}
      <div class="flex h-48 items-center justify-center">
        <div class="animate-pulse text-sm text-gray-400">Loading...</div>
      </div>
    {:else if hasDashboard}
      <DashboardView {projectPath} {projectName} />
    {:else}
      <ProjectEmptyState
        {projectName}
        {projectDescription}
        {claudeMdContent}
        {projectContext}
        {onSuggestionClick}
        {onShowClaudeMd}
      />
    {/if}
  </div>
</div>
