<script lang="ts">
  /**
   * ProjectLanding - Default view when no session is active
   *
   * Shows dashboard if .claude/dashboard.md exists,
   * otherwise falls back to ProjectEmptyState.
   */
  import { onMount } from "svelte";
  import ProjectEmptyState from "./ProjectEmptyState.svelte";
  import DashboardView from "$lib/features/dashboard/components/DashboardView.svelte";
  import { getDashboard } from "$lib/features/dashboard";

  interface Props {
    projectPath: string;
    projectName: string;
    projectDescription?: string | null;
    claudeMdContent: string | null;
    projectContext: { summary: string; suggestions: string[] } | null;
    onSuggestionClick?: (suggestion: string) => void;
    onShowClaudeMd: () => void;
  }

  let {
    projectPath,
    projectName,
    projectDescription = null,
    claudeMdContent,
    projectContext,
    onSuggestionClick,
    onShowClaudeMd,
  }: Props = $props();

  let checkingDashboard = $state(true);
  let hasDashboard = $state(false);

  async function checkDashboard() {
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

  // Re-check when project changes
  $effect(() => {
    if (projectPath) {
      checkingDashboard = true;
      checkDashboard();
    }
  });
</script>

{#if checkingDashboard}
  <!-- Brief loading state while checking for dashboard -->
  <div class="flex items-center justify-center h-48">
    <div class="animate-pulse text-gray-400 text-sm">Loading...</div>
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
