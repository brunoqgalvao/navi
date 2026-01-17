<script lang="ts">
  /**
   * DashboardView - Main dashboard container
   *
   * Fetches and renders the project's .claude/dashboard.md
   * Falls back to project capabilities if no dashboard exists.
   */
  import { onMount } from "svelte";
  import type { Dashboard, DashboardResponse } from "../types";
  import { getDashboard, createDefaultDashboard } from "../api";
  import { parseDashboard } from "../parser";
  import DashboardRenderer from "./DashboardRenderer.svelte";
  import ProjectCapabilitiesWidget from "./widgets/ProjectCapabilitiesWidget.svelte";

  interface Props {
    projectPath: string;
    projectName: string;
  }

  let { projectPath, projectName }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let dashboard = $state<Dashboard | null>(null);
  let dashboardExists = $state(false);

  async function loadDashboard() {
    loading = true;
    error = null;

    try {
      const response: DashboardResponse = await getDashboard(projectPath);
      dashboardExists = response.exists;

      if (response.exists && response.dashboard) {
        dashboard = parseDashboard(response.dashboard.raw);
      } else {
        dashboard = null;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load dashboard";
    } finally {
      loading = false;
    }
  }

  async function handleCreateDashboard() {
    try {
      await createDefaultDashboard(projectPath, projectName);
      await loadDashboard();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create dashboard";
    }
  }

  onMount(() => {
    loadDashboard();
  });

  // Reload when project changes
  $effect(() => {
    if (projectPath) {
      loadDashboard();
    }
  });
</script>

<div class="h-full overflow-y-auto bg-white dark:bg-gray-900">
  {#if loading}
    <div class="flex items-center justify-center h-48">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
    </div>
  {:else if error}
    <div class="p-6">
      <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p class="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button
          onclick={loadDashboard}
          class="mt-2 text-sm text-red-600 hover:text-red-800 dark:text-red-400 underline"
        >
          Retry
        </button>
      </div>
    </div>
  {:else if dashboard}
    <DashboardRenderer {dashboard} {projectPath} onRefresh={loadDashboard} />
  {:else}
    <!-- No dashboard exists - show project capabilities -->
    <div class="p-6 max-w-2xl mx-auto">
      <div class="mb-6">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {projectName}
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Start chatting or use one of the commands below
        </p>
      </div>

      <!-- Project Capabilities -->
      <div class="mb-8">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <span>🧰</span>
          Available Capabilities
        </h3>
        <ProjectCapabilitiesWidget {projectPath} />
      </div>

      <!-- Option to create custom dashboard -->
      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">
          Want a custom dashboard? Create one with quick actions and widgets.
        </p>
        <button
          onclick={handleCreateDashboard}
          class="text-xs text-accent-600 hover:text-accent-700 dark:text-accent-400 hover:underline"
        >
          Create custom dashboard →
        </button>
      </div>
    </div>
  {/if}
</div>
