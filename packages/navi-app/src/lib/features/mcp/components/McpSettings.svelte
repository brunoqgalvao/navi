<script lang="ts">
  import { onMount } from "svelte";
  import { mcpApi, type McpServer } from "../api";
  import { showError, showSuccess } from "$lib/errorHandler";
  import { currentProject } from "$lib/stores/projects";

  let servers: McpServer[] = $state([]);
  let loading = $state(true);
  let toggling = $state<string | null>(null);

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
        `${server.name} ${!server.enabled ? "enabled" : "disabled"} (saved to ~/.claude.json)`
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
    // Built-in servers
    if (server.isBuiltIn) {
      switch (server.name) {
        case "user-interaction": return "💬";
        case "navi-context": return "📊";
        case "multi-session": return "🤖";
        default: return "🔌";
      }
    }
    // External servers by type
    switch (server.type) {
      case "sse": return "🌐";
      case "streamable-http": return "🔗";
      case "stdio":
      default: return "⚡";
    }
  }

  function getServerDescription(server: McpServer): string {
    // Built-in servers
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
    // External servers - show connection info
    if (server.url) {
      return `SSE server at ${server.url}`;
    }
    if (server.command) {
      return `Command: ${server.command}`;
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
        Control which MCP (Model Context Protocol) servers are active. Synced with your Claude Code config files.
      </p>
    </div>
    <div class="flex gap-2">
      <button
        onclick={reloadFromFilesystem}
        disabled={loading}
        class="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50"
        title="Reload from .mcp.json and ~/.claude.json"
      >
        Sync
      </button>
      <button
        onclick={loadServers}
        disabled={loading}
        class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? "Loading..." : "Refresh"}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  {:else if servers.length === 0}
    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
      <div class="text-4xl mb-3">🔌</div>
      <p>No MCP servers found</p>
      <p class="text-sm mt-2">
        Add servers to <code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">.mcp.json</code> or <code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">~/.mcp.json</code>
      </p>
    </div>
  {:else}
    <!-- Built-in servers first -->
    {@const builtinServers = servers.filter(s => s.isBuiltIn)}
    {@const externalServers = servers.filter(s => !s.isBuiltIn)}

    {#if builtinServers.length > 0}
      <div class="space-y-3">
        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Built-in Servers</h4>
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

    {#if externalServers.length > 0}
      <div class="space-y-3 {builtinServers.length > 0 ? 'mt-6' : ''}">
        <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">External Servers</h4>
        {#each externalServers as server}
          {@const isToggling = toggling === server.name}
          {@const sourceLabel = getSourceLabel(server.source)}
          {@const typeLabel = getTypeLabel(server.type)}
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
                    {#if typeLabel}
                      <span class="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                        {typeLabel}
                      </span>
                    {/if}
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">
                    {getServerDescription(server)}
                  </p>
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

    <div class="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div class="flex items-start gap-3">
        <span class="text-amber-500 text-lg">⚠️</span>
        <div class="text-sm text-amber-700 dark:text-amber-300">
          <p class="font-medium">Changes take effect on new sessions</p>
          <p class="mt-1 text-amber-600 dark:text-amber-400">
            Disabling an MCP server will prevent Claude from using its tools in future conversations.
            External servers are loaded from <code class="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.mcp.json</code> and <code class="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">~/.claude.json</code>.
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>
