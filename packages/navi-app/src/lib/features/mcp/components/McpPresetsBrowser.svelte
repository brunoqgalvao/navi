<script lang="ts">
  import { onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { mcpApi, type MCPServerPreset } from "../api";
  import { showError, showSuccess } from "$lib/errorHandler";
  import { currentProject } from "$lib/stores/projects";
  import McpSetupWizard from "./McpSetupWizard.svelte";
  import type { WizardResult } from "./McpSetupWizard.svelte";

  let presets: MCPServerPreset[] = $state([]);
  let loading = $state(true);
  let adding = $state<string | null>(null);
  let selectedCategory = $state<string | null>(null);
  let selectedPreset = $state<MCPServerPreset | null>(null);
  let showWizard = $state(false);

  const dispatch = createEventDispatcher();

  // Get current project path
  let projectPath = $derived($currentProject?.path);

  const categories = [
    { id: "popular", label: "Popular", icon: "⭐" },
    { id: "ai", label: "AI & Search", icon: "🔮" },
    { id: "development", label: "Development", icon: "🛠️" },
    { id: "data", label: "Web & Tools", icon: "🌐" },
    { id: "search", label: "Maps & Location", icon: "🗺️" },
  ];

  async function loadPresets() {
    loading = true;
    try {
      presets = await mcpApi.getPresets();
    } catch (err) {
      showError({
        title: "Failed to load presets",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      loading = false;
    }
  }

  function openWizard(preset: MCPServerPreset) {
    if (!projectPath) {
      showError({
        title: "No project selected",
        message: "Select a project to add MCP servers",
      });
      return;
    }
    selectedPreset = preset;
    showWizard = true;
  }

  function closeWizard() {
    selectedPreset = null;
    showWizard = false;
  }

  async function handleWizardComplete(result: WizardResult) {
    if (!projectPath || !selectedPreset) return;

    adding = selectedPreset.id;
    try {
      // Create the server with the wizard result
      // Credentials are stored securely (encrypted in DB), not in .mcp.json
      await mcpApi.create({
        name: selectedPreset.id,
        type: result.type,
        command: result.command,
        args: result.args,
        url: result.url,
        env: result.env,
        credentials: result.credentials,  // Stored encrypted, referenced in .mcp.json
        scope: "project",
        projectPath,
      });

      const hasCredentials = result.credentials && Object.keys(result.credentials).length > 0;
      showSuccess(
        "Server added",
        hasCredentials
          ? `${selectedPreset.name} is connected. Credentials stored securely.`
          : `${selectedPreset.name} is connected and ready to use.`
      );

      closeWizard();
      dispatch("presetAdded");
    } catch (err) {
      showError({
        title: "Failed to add server",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      adding = null;
    }
  }

  const filteredPresets = $derived(
    selectedCategory
      ? presets.filter(p => p.category === selectedCategory)
      : presets
  );

  // Check if preset needs setup wizard
  function needsSetup(preset: MCPServerPreset): boolean {
    return !!(preset.setupSteps && preset.setupSteps.length > 0);
  }

  // Get button text based on preset state
  function getButtonText(preset: MCPServerPreset): string {
    if (adding === preset.id) return "Adding...";
    if (needsSetup(preset)) return "Setup →";
    return "+ Add";
  }

  onMount(() => {
    loadPresets();
  });
</script>

{#if showWizard && selectedPreset}
  <!-- Wizard Modal Overlay -->
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto p-6">
      <McpSetupWizard
        preset={selectedPreset}
        onComplete={handleWizardComplete}
        onCancel={closeWizard}
      />
    </div>
  </div>
{:else}
  <div class="space-y-4">
    <!-- Category Filter -->
    <div class="flex gap-2 flex-wrap">
      <button
        onclick={() => selectedCategory = null}
        class="px-3 py-1.5 text-sm rounded-lg transition-colors {selectedCategory === null ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
      >
        All
      </button>
      {#each categories as cat}
        <button
          onclick={() => selectedCategory = cat.id}
          class="px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 {selectedCategory === cat.id ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
        >
          <span>{cat.icon}</span>
          {cat.label}
        </button>
      {/each}
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-12">
        <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    {:else if filteredPresets.length === 0}
      <div class="text-center py-8 text-gray-500 dark:text-gray-400">
        <p class="text-sm">No presets found for this category</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each filteredPresets as preset}
          {@const isAdding = adding === preset.id}
          {@const hasSetup = needsSetup(preset)}
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 flex-1 min-w-0">
                <span class="text-2xl flex-shrink-0">{preset.icon}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-medium text-gray-900 dark:text-gray-100 truncate">{preset.name}</h4>
                    {#if !hasSetup}
                      <span class="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                        Ready
                      </span>
                    {:else if preset.type === "sse"}
                      <span class="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                        Remote
                      </span>
                    {/if}
                    {#if preset.authType === "oauth"}
                      <span class="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                        OAuth
                      </span>
                    {:else if preset.authType === "mcp_oauth"}
                      <span class="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                        OAuth on first use
                      </span>
                    {/if}
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {preset.description}
                  </p>
                </div>
              </div>

              <button
                onclick={() => openWizard(preset)}
                disabled={isAdding || !projectPath}
                class="flex-shrink-0 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={!projectPath ? "Select a project first" : hasSetup ? "Configure and add" : "Add this server"}
              >
                {getButtonText(preset)}
              </button>
            </div>
          </div>
        {/each}
      </div>

      {#if selectedCategory === "popular"}
        <div class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p class="text-sm text-blue-700 dark:text-blue-300">
            Click "Setup →" to configure servers with API keys. Servers marked "Ready" work immediately!
          </p>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
