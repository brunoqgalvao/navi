<script lang="ts">
  import { onMount } from "svelte";
  import { pluginApi, type Plugin } from "../api";
  import { currentProject } from "$lib/stores/projects";
  import { showError, showSuccess } from "$lib/errorHandler";
  import PluginInstallModal from "./PluginInstallModal.svelte";

  let plugins: Plugin[] = $state([]);
  let loading = $state(true);
  let expandedPluginId: string | null = $state(null);
  let expandedSection: string | null = $state(null);
  let showInstallModal = $state(false);
  let uninstalling: string | null = $state(null);
  let togglingPlugin: string | null = $state(null); // Track which plugin is being toggled

  async function loadPlugins() {
    if (!$currentProject?.path) {
      plugins = [];
      loading = false;
      return;
    }

    loading = true;
    try {
      plugins = await pluginApi.list($currentProject.path);
    } catch (err) {
      showError({
        title: "Failed to load plugins",
        message: err instanceof Error ? err.message : String(err),
      });
      plugins = [];
    } finally {
      loading = false;
    }
  }

  // Reload plugins when project changes
  $effect(() => {
    const projectPath = $currentProject?.path;
    loadPlugins();
  });

  async function togglePlugin(plugin: Plugin, scope: "user" | "project") {
    if (!$currentProject?.path || togglingPlugin) return;

    const currentEnabled = scope === "project" ? plugin.enabledInProject : plugin.enabledInUser;
    const newEnabled = !currentEnabled;

    togglingPlugin = plugin.id;
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
        `${plugin.name} ${newEnabled ? "enabled" : "disabled"} ${scope === "project" ? "for this project" : "globally"}`
      );
    } catch (err) {
      showError({
        title: "Failed to toggle plugin",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      togglingPlugin = null;
    }
  }

  async function uninstallPlugin(plugin: Plugin) {
    if (!confirm(`Uninstall ${plugin.name}? This cannot be undone.`)) return;

    uninstalling = plugin.id;
    try {
      await pluginApi.uninstall(plugin.id);
      plugins = plugins.filter(p => p.id !== plugin.id);
      showSuccess("Plugin uninstalled", `${plugin.name} has been removed`);
    } catch (err) {
      showError({
        title: "Failed to uninstall",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      uninstalling = null;
    }
  }

  function toggleExpanded(pluginId: string) {
    expandedPluginId = expandedPluginId === pluginId ? null : pluginId;
    expandedSection = null;
  }

  function toggleSection(section: string) {
    expandedSection = expandedSection === section ? null : section;
  }

  function handleInstalled() {
    loadPlugins();
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-base font-medium text-gray-900 dark:text-gray-100">Plugins</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
        Extend Claude with custom commands, agents, skills, and hooks
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        onclick={loadPlugins}
        class="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Refresh
      </button>
      <button
        onclick={() => showInstallModal = true}
        class="px-3 py-1.5 text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-black dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Install Plugin
      </button>
    </div>
  </div>

  {#if loading}
    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
      <svg class="w-6 h-6 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Loading plugins...
    </div>
  {:else if plugins.length === 0}
    <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
      <div class="w-12 h-12 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
        <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <p class="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">No plugins installed</p>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Install plugins from git repositories to extend functionality</p>
      <button
        onclick={() => showInstallModal = true}
        class="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-black dark:hover:bg-gray-600 transition-colors"
      >
        Install your first plugin
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each plugins as plugin}
        {@const isExpanded = expandedPluginId === plugin.id}
        {@const isEnabled = plugin.enabledInProject || plugin.enabledInUser}
        {@const isToggling = togglingPlugin === plugin.id}
        <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <!-- Header -->
          <div class="p-4">
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-medium text-gray-900 dark:text-gray-100 truncate">{plugin.name}</h4>
                  <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">v{plugin.version}</span>
                  {#if isEnabled}
                    <span class="text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                      Enabled
                    </span>
                  {/if}
                </div>
                {#if plugin.description}
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{plugin.description}</p>
                {/if}
                {#if plugin.author}
                  <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">by {plugin.author}</p>
                {/if}
              </div>

              <button
                onclick={() => toggleExpanded(plugin.id)}
                class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors ml-2"
                title={isExpanded ? "Collapse" : "Expand"}
                aria-expanded={isExpanded}
                aria-controls="plugin-details-{plugin.id}"
                aria-label={isExpanded ? `Collapse ${plugin.name} details` : `Expand ${plugin.name} details`}
              >
                <svg
                  class="w-5 h-5 transition-transform {isExpanded ? 'rotate-180' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            <!-- Component badges -->
            <div class="flex items-center gap-2 mt-3 flex-wrap">
              {#if plugin.componentCounts.commands > 0}
                <span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  {plugin.componentCounts.commands} command{plugin.componentCounts.commands !== 1 ? 's' : ''}
                </span>
              {/if}
              {#if plugin.componentCounts.agents > 0}
                <span class="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                  {plugin.componentCounts.agents} agent{plugin.componentCounts.agents !== 1 ? 's' : ''}
                </span>
              {/if}
              {#if plugin.componentCounts.skills > 0}
                <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                  {plugin.componentCounts.skills} skill{plugin.componentCounts.skills !== 1 ? 's' : ''}
                </span>
              {/if}
              {#if plugin.componentCounts.hooks > 0}
                <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  {plugin.componentCounts.hooks} hook{plugin.componentCounts.hooks !== 1 ? 's' : ''}
                </span>
              {/if}
              {#if plugin.componentCounts.mcpServers > 0}
                <span class="text-xs px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400">
                  {plugin.componentCounts.mcpServers} MCP server{plugin.componentCounts.mcpServers !== 1 ? 's' : ''}
                </span>
              {/if}
            </div>

            <!-- Toggle control - only show "Enable globally" in global settings -->
            <div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <label class="flex items-center gap-3 cursor-pointer {isToggling ? 'opacity-60 pointer-events-none' : ''}">
                <button
                  onclick={() => togglePlugin(plugin, "user")}
                  disabled={isToggling}
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-wait {plugin.enabledInUser ? 'bg-gray-900 dark:bg-gray-600' : 'bg-gray-300 dark:bg-gray-600'}"
                  role="switch"
                  aria-checked={plugin.enabledInUser}
                  aria-label="Enable {plugin.name} globally"
                  aria-busy={isToggling}
                >
                  {#if isToggling}
                    <span class="absolute inset-0 flex items-center justify-center">
                      <svg class="w-3 h-3 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                    </span>
                  {:else}
                    <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform {plugin.enabledInUser ? 'translate-x-4' : 'translate-x-1'}"></span>
                  {/if}
                </button>
                <span class="text-sm text-gray-700 dark:text-gray-300">Enable globally</span>
              </label>

              <button
                onclick={() => uninstallPlugin(plugin)}
                disabled={uninstalling === plugin.id || isToggling}
                class="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-busy={uninstalling === plugin.id}
              >
                {uninstalling === plugin.id ? "Uninstalling..." : "Uninstall"}
              </button>
            </div>
          </div>

          <!-- Expanded details -->
          {#if isExpanded}
            <div id="plugin-details-{plugin.id}" class="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50">
              <!-- Commands -->
              {#if plugin.commands.length > 0}
                <div class="border-b border-gray-200 dark:border-gray-700">
                  <button
                    onclick={() => toggleSection('commands')}
                    class="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span class="text-sm font-medium text-blue-600 dark:text-blue-400">Commands ({plugin.commands.length})</span>
                    <svg
                      class="w-4 h-4 text-gray-400 transition-transform {expandedSection === 'commands' ? 'rotate-180' : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {#if expandedSection === 'commands'}
                    <div class="px-4 pb-3 space-y-2">
                      {#each plugin.commands as cmd}
                        <div class="flex items-start gap-3 text-sm">
                          <code class="text-blue-600 dark:text-blue-400 font-mono text-xs bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">/{cmd.fullName}</code>
                          {#if cmd.description}
                            <span class="text-gray-600 dark:text-gray-400">{cmd.description}</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Agents -->
              {#if plugin.agents.length > 0}
                <div class="border-b border-gray-200 dark:border-gray-700">
                  <button
                    onclick={() => toggleSection('agents')}
                    class="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span class="text-sm font-medium text-purple-600 dark:text-purple-400">Agents ({plugin.agents.length})</span>
                    <svg
                      class="w-4 h-4 text-gray-400 transition-transform {expandedSection === 'agents' ? 'rotate-180' : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {#if expandedSection === 'agents'}
                    <div class="px-4 pb-3 space-y-2">
                      {#each plugin.agents as agent}
                        <div class="flex items-start gap-3 text-sm">
                          <span class="text-purple-600 dark:text-purple-400 font-medium">{agent.name}</span>
                          {#if agent.description}
                            <span class="text-gray-600 dark:text-gray-400">{agent.description}</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Skills -->
              {#if plugin.skills.length > 0}
                <div class="border-b border-gray-200 dark:border-gray-700">
                  <button
                    onclick={() => toggleSection('skills')}
                    class="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span class="text-sm font-medium text-emerald-600 dark:text-emerald-400">Skills ({plugin.skills.length})</span>
                    <svg
                      class="w-4 h-4 text-gray-400 transition-transform {expandedSection === 'skills' ? 'rotate-180' : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {#if expandedSection === 'skills'}
                    <div class="px-4 pb-3 space-y-2">
                      {#each plugin.skills as skill}
                        <div class="flex items-start gap-3 text-sm">
                          <span class="text-emerald-600 dark:text-emerald-400 font-medium">{skill.name}</span>
                          {#if skill.description}
                            <span class="text-gray-600 dark:text-gray-400">{skill.description}</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Hooks -->
              {#if plugin.hooks.length > 0}
                <div class="border-b border-gray-200 dark:border-gray-700">
                  <button
                    onclick={() => toggleSection('hooks')}
                    class="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span class="text-sm font-medium text-amber-600 dark:text-amber-400">Hooks ({plugin.hooks.length})</span>
                    <svg
                      class="w-4 h-4 text-gray-400 transition-transform {expandedSection === 'hooks' ? 'rotate-180' : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {#if expandedSection === 'hooks' && plugin.hooksDetail}
                    <div class="px-4 pb-3 space-y-2">
                      {#each Object.entries(plugin.hooksDetail.hooks) as [hookType, entries]}
                        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                          <div class="text-sm font-medium text-amber-600 dark:text-amber-400">{hookType}</div>
                          {#each entries as entry}
                            <div class="ml-3 mt-1 text-xs">
                              {#if entry.matcher}
                                <div class="text-gray-500 dark:text-gray-400">
                                  Matcher: <code class="text-orange-600 dark:text-orange-400">{entry.matcher}</code>
                                </div>
                              {/if}
                              <div class="space-y-1 mt-1">
                                {#each entry.hooks as hook}
                                  <div class="flex items-start gap-2">
                                    <span class="text-gray-500 dark:text-gray-400">{hook.type}:</span>
                                    <code class="text-xs text-gray-700 dark:text-gray-300 flex-1 break-all">{hook.command}</code>
                                    {#if hook.timeout}
                                      <span class="text-gray-400">{hook.timeout}ms</span>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- MCP Servers -->
              {#if plugin.mcpServers.length > 0}
                <div class="border-b border-gray-200 dark:border-gray-700">
                  <button
                    onclick={() => toggleSection('mcp')}
                    class="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span class="text-sm font-medium text-cyan-600 dark:text-cyan-400">MCP Servers ({plugin.mcpServers.length})</span>
                    <svg
                      class="w-4 h-4 text-gray-400 transition-transform {expandedSection === 'mcp' ? 'rotate-180' : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {#if expandedSection === 'mcp'}
                    <div class="px-4 pb-3 space-y-2">
                      {#each Object.entries(plugin.mcpServersDetail) as [name, config]}
                        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                          <div class="text-sm font-medium text-cyan-600 dark:text-cyan-400">{name}</div>
                          <code class="text-xs text-gray-600 dark:text-gray-400 block mt-1">
                            {config.command} {config.args?.join(' ') || ''}
                          </code>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Install path (footer) -->
              <div class="px-4 py-2 bg-gray-100 dark:bg-gray-900/30">
                <p class="text-xs text-gray-500 dark:text-gray-500 font-mono truncate" title={plugin.installPath}>
                  {plugin.installPath}
                </p>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<PluginInstallModal
  bind:open={showInstallModal}
  onInstalled={handleInstalled}
/>
