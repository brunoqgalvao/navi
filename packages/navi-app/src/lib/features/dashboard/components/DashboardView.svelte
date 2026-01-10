<script lang="ts">
  /**
   * DashboardView - Main dashboard container
   *
   * Fetches and renders the project's .claude/dashboard.md
   * Falls back to empty state if no dashboard exists.
   */
  import { onMount } from "svelte";
  import type { Dashboard, DashboardResponse } from "../types";
  import { getDashboard, createDefaultDashboard } from "../api";
  import { parseDashboard } from "../parser";
  import DashboardRenderer from "./DashboardRenderer.svelte";

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
    <!-- No dashboard exists - show prompt to create one -->
    <div class="p-6">
      <div class="max-w-md mx-auto text-center py-12">
        <div class="text-4xl mb-4">📊</div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No Dashboard Yet
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Create a dashboard to add quick actions, widgets, and project info.
          You can customize it anytime by editing <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded">.claude/dashboard.md</code>
        </p>
        <button
          onclick={handleCreateDashboard}
          class="px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
        >
          Create Dashboard
        </button>
      </div>
    </div>
  {/if}
</div>
