<script lang="ts">
  import { onMount } from "svelte";
  import { pluginApi, type Plugin } from "../api";
  import { currentProject } from "$lib/stores/projects";
  import { showError, showSuccess } from "$lib/errorHandler";

  let plugins: Plugin[] = $state([]);
  let loading = $state(true);
  let expandedPluginId: string | null = $state(null);

  async function loadPlugins() {
    if (!$currentProject?.path) return;

    loading = true;
    try {
      plugins = await pluginApi.list($currentProject.path);
    } catch (err) {
      showError({
        title: "Failed to load plugins",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      loading = false;
    }
  }

  async function togglePlugin(plugin: Plugin, scope: "user" | "project") {
    if (!$currentProject?.path) return;

    const currentEnabled = scope === "project" ? plugin.enabledInProject : plugin.enabledInUser;
    const newEnabled = !currentEnabled;

    try {
      await pluginApi.toggle(plugin.id, newEnabled, scope, $currentProject.path);

      // Update local state
      const idx = plugins.findIndex(p => p.id === plugin.id);
      if (idx !== -1) {
        if (scope === "project") {
          plugins[idx].enabledInProject = newEnabled;
        } else {
          plugins[idx].enabledInUser = newEnabled;
        }
      }

      showSuccess(
        "Plugin updated",
        `${plugin.name} ${newEnabled ? "enabled" : "disabled"} for ${scope}`
      );
    } catch (err) {
      showError({
        title: "Failed to toggle plugin",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function toggleExpanded(pluginId: string) {
    expandedPluginId = expandedPluginId === pluginId ? null : pluginId;
  }

  onMount(() => {
    loadPlugins();
  });
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-medium">Plugins</h3>
      <p class="text-sm text-gray-400 mt-1">
        Manage Claude Code plugins and their hooks
      </p>
    </div>
    <button
      onclick={loadPlugins}
      class="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
    >
      Refresh
    </button>
  </div>

  {#if loading}
    <div class="text-center py-8 text-gray-400">
      Loading plugins...
    </div>
  {:else if plugins.length === 0}
    <div class="text-center py-8 text-gray-400">
      No plugins installed
    </div>
  {:else}
    <div class="space-y-3">
      {#each plugins as plugin}
        <div class="border border-gray-700 rounded-lg p-4 bg-gray-800/50">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3">
                <h4 class="font-medium">{plugin.name}</h4>
                <span class="text-xs text-gray-400">v{plugin.version}</span>
                {#if plugin.scope === "project"}
                  <span class="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                    Project
                  </span>
                {:else}
                  <span class="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                    User
                  </span>
                {/if}
              </div>
              {#if plugin.description}
                <p class="text-sm text-gray-400 mt-1">{plugin.description}</p>
              {/if}
              {#if plugin.author}
                <p class="text-xs text-gray-500 mt-1">by {plugin.author}</p>
              {/if}
            </div>

            <div class="flex items-center gap-3">
              {#if plugin.hooks.length > 0}
                <button
                  onclick={() => toggleExpanded(plugin.id)}
                  class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  title="View hooks"
                >
                  {plugin.hooks.length} hook{plugin.hooks.length !== 1 ? "s" : ""}
                </button>
              {/if}
            </div>
          </div>

          <div class="flex items-center gap-4 mt-3 pt-3 border-t border-gray-700">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={plugin.enabledInProject ?? false}
                onchange={() => togglePlugin(plugin, "project")}
                class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
              />
              <span>Enable for project</span>
            </label>

            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={plugin.enabledInUser ?? false}
                onchange={() => togglePlugin(plugin, "user")}
                class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
              />
              <span>Enable globally</span>
            </label>
          </div>

          {#if expandedPluginId === plugin.id && plugin.hooksDetail}
            <div class="mt-3 pt-3 border-t border-gray-700">
              <h5 class="text-sm font-medium mb-2">Registered Hooks</h5>
              <div class="space-y-2">
                {#each Object.entries(plugin.hooksDetail.hooks) as [hookType, entries]}
                  <div class="bg-gray-900/50 rounded p-2">
                    <div class="text-sm font-medium text-blue-400">{hookType}</div>
                    {#each entries as entry}
                      <div class="ml-3 mt-1 text-xs">
                        {#if entry.matcher}
                          <div class="text-gray-400">Matcher: <code class="text-yellow-400">{entry.matcher}</code></div>
                        {/if}
                        <div class="space-y-1 mt-1">
                          {#each entry.hooks as hook}
                            <div class="flex items-start gap-2">
                              <span class="text-gray-500">{hook.type}:</span>
                              <code class="text-xs text-gray-300 flex-1 break-all">{hook.command}</code>
                              {#if hook.timeout}
                                <span class="text-gray-500 text-xs">{hook.timeout}ms</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
