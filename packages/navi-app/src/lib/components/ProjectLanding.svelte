<script lang="ts">
  /**
   * ProjectLanding - Default view when no session is active
   *
   * Shows dashboard if .claude/dashboard.md exists AND dashboard feature is enabled,
   * otherwise falls back to ProjectEmptyState.
   */
  import { onMount, onDestroy } from "svelte";
  import type { Session } from "$lib/api";
  import ProjectEmptyState from "./ProjectEmptyState.svelte";
  import DashboardView from "$lib/features/dashboard/components/DashboardView.svelte";
  import { getDashboard } from "$lib/features/dashboard";
  import { ProjectCanvasLanding } from "$lib/features/project-canvas";
  import { dashboardEnabled } from "$lib/stores";

  const LANDING_VIEW_KEY = "navi-project-landing-view";

  interface Props {
    projectId: string;
    projectPath: string;
    projectName: string;
    sessions: Session[];
    projectDescription?: string | null;
    claudeMdContent: string | null;
    projectContext: { summary: string; suggestions: string[] } | null;
    onSuggestionClick?: (suggestion: string) => void;
    onSelectSession?: (session: Session) => void;
    onNewSession?: () => void;
    onPreviewFile?: (path: string) => void;
    onOpenFiles?: () => void;
    onShowClaudeMd: () => void;
    onCanvasToggle?: (isCanvas: boolean) => void;
  }

  let {
    projectId,
    projectPath,
    projectName,
    sessions,
    projectDescription = null,
    claudeMdContent,
    projectContext,
    onSuggestionClick,
    onSelectSession,
    onNewSession,
    onPreviewFile,
    onOpenFiles,
    onShowClaudeMd,
    onCanvasToggle,
  }: Props = $props();

  let checkingDashboard = $state(true);
  let hasDashboard = $state(false);
  let landingView = $state<"overview" | "canvas">("canvas");

  function loadLandingView(): "overview" | "canvas" {
    if (typeof window === "undefined") return "canvas";
    return localStorage.getItem(LANDING_VIEW_KEY) === "overview" ? "overview" : "canvas";
  }

  function setLandingView(nextView: "overview" | "canvas") {
    landingView = nextView;
    if (typeof window !== "undefined") {
      localStorage.setItem(LANDING_VIEW_KEY, nextView);
    }
    onCanvasToggle?.(nextView === "canvas");
  }

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
    landingView = loadLandingView();
    onCanvasToggle?.(landingView === "canvas");
    checkDashboard();
  });

  onDestroy(() => {
    onCanvasToggle?.(false);
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

<div class="flex h-full flex-col">
  {#if landingView !== "canvas"}
    <div class="px-4 pr-52 pt-5 md:px-6 md:pr-56">
      <div class="flex w-full flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-semibold text-gray-900">{projectName}</h1>
            <span class="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">
              Workspace
            </span>
          </div>
        </div>

        <div class="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            class="rounded-full px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
            onclick={() => setLandingView("canvas")}
          >
            Canvas
          </button>
          <button
            type="button"
            class="rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors"
            onclick={() => setLandingView("overview")}
          >
            Overview
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="flex-1 min-h-0">
    {#if landingView === "canvas"}
      <ProjectCanvasLanding
        {projectId}
        {projectName}
        {projectPath}
        {sessions}
        {onSelectSession}
        {onNewSession}
        {onPreviewFile}
        {onOpenFiles}
        onSwitchView={() => setLandingView("overview")}
      />
    {:else if checkingDashboard}
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
