<script lang="ts">
  import { onMount } from "svelte";
  import { mcpApi, type McpServer, type CreateMcpServerRequest } from "../api";
  import { showError, showSuccess } from "$lib/errorHandler";
  import { currentProject } from "$lib/stores/projects";
  import McpPresetsBrowser from "./McpPresetsBrowser.svelte";
  import McpSetupWizard from "./McpSetupWizard.svelte";
  import type { WizardResult } from "./McpSetupWizard.svelte";

  let servers: McpServer[] = $state([]);
  let loading = $state(true);
  let toggling = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let showBuiltinServers = $state(false);
  let showAddForm = $state(false);
  let creating = $state(false);
  let activeTab = $state<"browse" | "custom">("browse");
  let showCustomWizard = $state(false);

  // Handle preset added event
  function handlePresetAdded() {
    loadServers();
  }

  // Form state (legacy - keeping for fallback)
  let newServerName = $state("");
  let newServerType = $state<"stdio" | "sse" | "streamable-http">("stdio");
  let newServerCommand = $state("");
  let newServerArgs = $state("");
  let newServerUrl = $state("");
  let newServerScope = $state<"project" | "global">("project");
  let newServerEnvKey = $state("");
  let newServerEnvValue = $state("");
  let newServerEnv = $state<Record<string, string>>({});

  // Get current project path for loading project-specific MCP servers
  let projectPath = $derived($currentProject?.path);

  async function loadServers() {
    loading = true;
    try {
      servers = await mcpApi.list(projectPath);
    } catch (err) {
      showError({
        title: "Failed to load MCP servers",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      loading = false;
    }
  }

  async function toggleServer(server: McpServer) {
    if (!projectPath) {
      showError({
        title: "No project selected",
        message: "Select a project to manage MCP servers",
      });
      return;
    }

    toggling = server.name;
    try {
      await mcpApi.toggle(server.name, !server.enabled, projectPath, server.isBuiltIn);
      // Update local state
      const idx = servers.findIndex(s => s.name === server.name);
      if (idx !== -1) {
        servers[idx] = { ...servers[idx], enabled: !server.enabled };
      }
      showSuccess(
        "MCP server updated",
        `${server.name} ${!server.enabled ? "enabled" : "disabled"}`
      );
    } catch (err) {
      showError({
        title: "Failed to toggle MCP server",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      toggling = null;
    }
  }

  async function deleteServer(server: McpServer) {
    if (server.isBuiltIn) return;

    const scope = server.source === "project-mcp" ? "project" : "global";
    if (scope === "project" && !projectPath) {
      showError({
        title: "No project selected",
        message: "Select a project to delete project-specific servers",
      });
      return;
    }

    if (!confirm(`Delete MCP server "${server.name}" from ${scope === "project" ? ".mcp.json" : "~/.mcp.json"}?`)) {
      return;
    }

    deleting = server.name;
    try {
      await mcpApi.delete(server.name, scope, projectPath);
      await loadServers();
      showSuccess("Server deleted", `${server.name} removed from ${scope === "project" ? ".mcp.json" : "~/.mcp.json"}`);
    } catch (err) {
      showError({
        title: "Failed to delete server",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      deleting = null;
    }
  }

  async function createServer() {
    if (!newServerName.trim()) {
      showError({ title: "Validation error", message: "Server name is required" });
      return;
    }

    if (newServerType === "stdio" && !newServerCommand.trim()) {
      showError({ title: "Validation error", message: "Command is required for stdio servers" });
      return;
    }

    if ((newServerType === "sse" || newServerType === "streamable-http") && !newServerUrl.trim()) {
      showError({ title: "Validation error", message: "URL is required for SSE/HTTP servers" });
      return;
    }

    if (newServerScope === "project" && !projectPath) {
      showError({ title: "No project selected", message: "Select a project to add project-specific servers" });
      return;
    }

    creating = true;
    try {
      const data: CreateMcpServerRequest = {
        name: newServerName.trim(),
        type: newServerType,
        scope: newServerScope,
        projectPath: newServerScope === "project" ? projectPath : undefined,
      };

      if (newServerType === "stdio") {
        data.command = newServerCommand.trim();
        if (newServerArgs.trim()) {
          data.args = newServerArgs.split(/\s+/).filter(Boolean);
        }
      } else {
        data.url = newServerUrl.trim();
      }

      if (Object.keys(newServerEnv).length > 0) {
        data.env = newServerEnv;
      }

      await mcpApi.create(data);
      await loadServers();
      showSuccess("Server created", `${newServerName} added to ${newServerScope === "project" ? ".mcp.json" : "~/.mcp.json"}`);

      // Reset form
      resetForm();
      showAddForm = false;
    } catch (err) {
      showError({
        title: "Failed to create server",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      creating = false;
    }
  }

  function resetForm() {
    newServerName = "";
    newServerType = "stdio";
    newServerCommand = "";
    newServerArgs = "";
    newServerUrl = "";
    newServerScope = "project";
    newServerEnv = {};
    newServerEnvKey = "";
    newServerEnvValue = "";
  }

  // Custom wizard handlers
  function openCustomWizard() {
    if (!projectPath) {
      showError({
        title: "No project selected",
        message: "Select a project to add MCP servers",
      });
      return;
    }
    showCustomWizard = true;
  }

  function closeCustomWizard() {
    showCustomWizard = false;
  }

  async function handleCustomWizardComplete(result: WizardResult) {
    if (!projectPath) return;

    creating = true;
    try {
      await mcpApi.create({
        name: result.name,
        type: result.type,
        command: result.command,
        args: result.args,
        url: result.url,
        env: result.env,
        scope: "project",
        projectPath,
      });

      showSuccess("Server created", `${result.name} added to .mcp.json`);
      closeCustomWizard();
      showAddForm = false;
      await loadServers();
    } catch (err) {
      showError({
        title: "Failed to create server",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      creating = false;
    }
  }

  function addEnvVar() {
    if (newServerEnvKey.trim() && newServerEnvValue.trim()) {
      newServerEnv = { ...newServerEnv, [newServerEnvKey.trim()]: newServerEnvValue.trim() };
      newServerEnvKey = "";
      newServerEnvValue = "";
    }
  }

  function removeEnvVar(key: string) {
    const { [key]: _, ...rest } = newServerEnv;
    newServerEnv = rest;
  }

  async function reloadFromFilesystem() {
    try {
      await mcpApi.reload();
      await loadServers();
      showSuccess("MCP settings reloaded", "Refreshed from filesystem configs");
    } catch (err) {
      showError({
        title: "Failed to reload",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function getServerIcon(server: McpServer): string {
    if (server.isBuiltIn) {
      switch (server.name) {
        case "user-interaction": return "💬";
        case "navi-context": return "📊";
        case "multi-session": return "🤖";
        default: return "🔌";
      }
    }
    switch (server.type) {
      case "sse": return "🌐";
      case "streamable-http": return "🔗";
      case "stdio":
      default: return "⚡";
    }
  }

  function getServerDescription(server: McpServer): string {
    if (server.isBuiltIn) {
      switch (server.name) {
        case "user-interaction":
          return "Enables Claude to ask you questions with UI prompts";
        case "navi-context":
          return "Allows Claude to view running processes and terminal output";
        case "multi-session":
          return "Multi-agent coordination: spawn agents, share context, escalate";
        default:
          return "Built-in Navi server";
      }
    }
    if (server.url) {
      return server.url;
    }
    if (server.command) {
      const args = server.args?.join(" ") || "";
      return `${server.command}${args ? " " + args : ""}`;
    }
    return "External MCP server";
  }

  function getSourceLabel(source?: string): { text: string; color: string } {
    switch (source) {
      case "builtin":
        return { text: "Built-in", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" };
      case "project-mcp":
        return { text: ".mcp.json", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" };
      case "global-mcp":
        return { text: "~/.mcp.json", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" };
      case "claude-json":
        return { text: "~/.claude.json", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" };
      default:
        return { text: "External", color: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" };
    }
  }

  function getTypeLabel(type?: string): string | null {
    switch (type) {
      case "sse": return "SSE";
      case "streamable-http": return "HTTP";
      case "stdio": return "stdio";
      default: return null;
    }
  }

  function canDelete(server: McpServer): boolean {
    return !server.isBuiltIn && (server.source === "project-mcp" || server.source === "global-mcp");
  }

  // Reload when project changes
  $effect(() => {
    if (projectPath !== undefined) {
      loadServers();
    }
  });

  onMount(() => {
    loadServers();
  });
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">MCP Servers</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Manage MCP servers. Changes take effect on new sessions.
      </p>
    </div>
    <div class="flex gap-2">
      <button
        onclick={reloadFromFilesystem}
        disabled={loading}
        class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
        title="Reload from .mcp.json files"
      >
        Sync
      </button>
      <button
        onclick={() => { showAddForm = !showAddForm; activeTab = "browse"; if (!showAddForm) resetForm(); }}
        class="px-3 py-1.5 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors"
      >
        {showAddForm ? "Close" : "+ Add Server"}
      </button>
    </div>
  </div>

  <!-- Add Server Panel -->
  {#if showAddForm}
    <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <!-- Tabs -->
      <div class="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onclick={() => activeTab = "browse"}
          class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'browse' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
        >
          Browse Presets
        </button>
        <button
          onclick={() => activeTab = "custom"}
          class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'custom' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
        >
          Custom Server
        </button>
      </div>

      <div class="p-4">
        {#if activeTab === "browse"}
          <svelte:component this={McpPresetsBrowser} on:presetAdded={handlePresetAdded} />
        {:else if showCustomWizard}
          <!-- Custom Server Wizard -->
          <McpSetupWizard
            customMode={true}
            onComplete={handleCustomWizardComplete}
            onCancel={closeCustomWizard}
          />
        {:else}
          <!-- Custom Add Options -->
          <div class="space-y-4">
            <div class="text-center py-8">
              <div class="text-4xl mb-4">🔌</div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">Add Custom MCP Server</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Configure a custom MCP server with step-by-step guidance
              </p>
              <button
                onclick={openCustomWizard}
                disabled={!projectPath}
                class="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium disabled:opacity-50"
              >
                Start Setup Wizard →
              </button>
              {#if !projectPath}
                <p class="text-sm text-amber-600 dark:text-amber-400 mt-2">
                  Select a project first to add servers
                </p>
              {/if}
            </div>

            <!-- Legacy form toggle (hidden by default) -->
            <details class="border-t border-gray-200 dark:border-gray-700 pt-4">
              <summary class="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                Advanced: Manual configuration form
              </summary>
    <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4 mt-4">
      <h4 class="font-medium text-gray-900 dark:text-gray-100">Add New MCP Server</h4>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
          <input
            type="text"
            bind:value={newServerName}
            placeholder="my-server"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
          <select
            bind:value={newServerType}
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="stdio">stdio (Command)</option>
            <option value="sse">SSE (Server-Sent Events)</option>
            <option value="streamable-http">HTTP (Streamable)</option>
          </select>
        </div>
      </div>

      {#if newServerType === "stdio"}
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Command *</label>
          <input
            type="text"
            bind:value={newServerCommand}
            placeholder="npx"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Arguments (space-separated)</label>
          <input
            type="text"
            bind:value={newServerArgs}
            placeholder="-y @modelcontextprotocol/server-filesystem /path"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      {:else}
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL *</label>
          <input
            type="url"
            bind:value={newServerUrl}
            placeholder="https://my-mcp-server.com/sse"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      {/if}

      <!-- Environment Variables -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Environment Variables</label>
        {#if Object.keys(newServerEnv).length > 0}
          <div class="flex flex-wrap gap-2 mb-2">
            {#each Object.entries(newServerEnv) as [key, value]}
              <span class="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs">
                <span class="font-mono">{key}={value.length > 10 ? value.slice(0, 10) + "..." : value}</span>
                <button onclick={() => removeEnvVar(key)} class="text-gray-500 hover:text-red-500">×</button>
              </span>
            {/each}
          </div>
        {/if}
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={newServerEnvKey}
            placeholder="KEY"
            class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            bind:value={newServerEnvValue}
            placeholder="value"
            class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onclick={addEnvVar}
            disabled={!newServerEnvKey.trim() || !newServerEnvValue.trim()}
            class="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Save to</label>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" bind:group={newServerScope} value="project" class="text-blue-500" />
            <span class="text-sm text-gray-700 dark:text-gray-300">.mcp.json (this project)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" bind:group={newServerScope} value="global" class="text-blue-500" />
            <span class="text-sm text-gray-700 dark:text-gray-300">~/.mcp.json (global)</span>
          </label>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button
          onclick={() => { showAddForm = false; resetForm(); }}
          class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={createServer}
          disabled={creating}
          class="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Server"}
        </button>
      </div>
    </div>
            </details>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  {:else}
    {@const builtinServers = servers.filter(s => s.isBuiltIn)}
    {@const externalServers = servers.filter(s => !s.isBuiltIn)}

    <!-- External Servers (shown first, more prominent) -->
    {#if externalServers.length > 0}
      <div class="space-y-3">
        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Your MCP Servers</h4>
        {#each externalServers as server}
          {@const isToggling = toggling === server.name}
          {@const isDeleting = deleting === server.name}
          {@const sourceLabel = getSourceLabel(server.source)}
          {@const typeLabel = getTypeLabel(server.type)}
          <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 transition-all {!server.enabled ? 'opacity-60' : ''}">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3 flex-1 min-w-0">
                <span class="text-2xl mt-0.5 flex-shrink-0">{getServerIcon(server)}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-medium text-gray-900 dark:text-gray-100">{server.name}</h4>
                    <span class="text-xs px-2 py-0.5 {sourceLabel.color} rounded-full">
                      {sourceLabel.text}
                    </span>
                    {#if typeLabel}
                      <span class="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                        {typeLabel}
                      </span>
                    {/if}
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all font-mono">
                    {getServerDescription(server)}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 flex-shrink-0">
                {#if canDelete(server)}
                  <button
                    onclick={() => deleteServer(server)}
                    disabled={isDeleting}
                    class="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete server"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                {/if}
                <button
                  onclick={() => toggleServer(server)}
                  disabled={isToggling}
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {server.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'} {isToggling ? 'opacity-50' : ''}"
                  title={server.enabled ? "Click to disable" : "Click to enable"}
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm {server.enabled ? 'translate-x-6' : 'translate-x-1'}"
                  ></span>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if !showAddForm}
      <div class="text-center py-8 text-gray-500 dark:text-gray-400">
        <div class="text-3xl mb-2">🔌</div>
        <p class="text-sm">No external MCP servers configured</p>
        <p class="text-xs mt-1">Click "+ Add Server" to add one</p>
      </div>
    {/if}

    <!-- Built-in Servers (collapsible) -->
    {#if builtinServers.length > 0}
      <div class="space-y-3 {externalServers.length > 0 ? 'mt-6' : ''}">
        <button
          onclick={() => showBuiltinServers = !showBuiltinServers}
          class="flex items-center gap-2 w-full text-left group"
        >
          <svg
            class="w-4 h-4 text-gray-400 transition-transform duration-200 {showBuiltinServers ? 'rotate-90' : ''}"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
            Navi Built-in Servers
          </h4>
          <span class="text-xs text-gray-400 dark:text-gray-500">
            ({builtinServers.filter(s => s.enabled).length}/{builtinServers.length} enabled)
          </span>
        </button>

        {#if showBuiltinServers}
          <div class="space-y-3 pl-6 border-l-2 border-gray-200 dark:border-gray-700">
            {#each builtinServers as server}
              {@const isToggling = toggling === server.name}
              {@const sourceLabel = getSourceLabel(server.source)}
              <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 transition-all {!server.enabled ? 'opacity-60' : ''}">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-start gap-3">
                    <span class="text-2xl mt-0.5">{getServerIcon(server)}</span>
                    <div>
                      <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="font-medium text-gray-900 dark:text-gray-100">{server.name}</h4>
                        <span class="text-xs px-2 py-0.5 {sourceLabel.color} rounded-full">
                          {sourceLabel.text}
                        </span>
                      </div>
                      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {getServerDescription(server)}
                      </p>
                      {#if server.toolCount !== undefined}
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">
                          {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""} available
                        </p>
                      {/if}
                    </div>
                  </div>

                  <button
                    onclick={() => toggleServer(server)}
                    disabled={isToggling}
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 {server.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'} {isToggling ? 'opacity-50' : ''}"
                    title={server.enabled ? "Click to disable" : "Click to enable"}
                  >
                    <span
                      class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm {server.enabled ? 'translate-x-6' : 'translate-x-1'}"
                    ></span>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
