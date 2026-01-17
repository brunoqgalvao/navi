<script lang="ts">
  /**
   * ProjectCapabilitiesWidget - Shows available commands, skills, agents, hooks, MCPs
   *
   * Commands are clickable and get inserted into the chat input.
   * Other items are informational.
   */
  import { onMount } from "svelte";
  import { getProjectCapabilities, type ProjectCapabilities } from "../../api";
  import { chatInputValue } from "$lib/stores/chat";

  interface Props {
    projectPath: string;
  }

  let { projectPath }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let capabilities = $state<ProjectCapabilities | null>(null);
  let expandedSections = $state<Set<string>>(new Set());

  async function loadCapabilities() {
    loading = true;
    error = null;
    try {
      capabilities = await getProjectCapabilities(projectPath);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load capabilities";
    } finally {
      loading = false;
    }
  }

  function toggleSection(section: string) {
    if (expandedSections.has(section)) {
      expandedSections.delete(section);
    } else {
      expandedSections.add(section);
    }
    expandedSections = new Set(expandedSections);
  }

  function handleCommandClick(commandName: string) {
    // Insert the command into the chat input
    chatInputValue.set(`/${commandName} `);
    focusChatInput();
  }

  function handleSkillClick(skillName: string, description: string) {
    // Generate a prompt based on the skill's purpose
    // Extract keywords from description to create a natural prompt
    let prompt = "";

    // Common skill prompt mappings
    if (skillName.includes("stock") || description.toLowerCase().includes("stock")) {
      prompt = "Compare AAPL and MSFT stock performance over 6 months";
    } else if (skillName.includes("browser") || description.toLowerCase().includes("browse")) {
      prompt = "Browse to ";
    } else if (skillName.includes("playwright") || description.toLowerCase().includes("screenshot")) {
      prompt = "Take a screenshot of ";
    } else if (skillName.includes("canvas") || skillName.includes("design")) {
      prompt = "Create a design for ";
    } else if (skillName.includes("image") || description.toLowerCase().includes("image")) {
      prompt = "Generate an image of ";
    } else {
      // Generic fallback - use the skill description as a hint
      prompt = `Use the ${skillName} skill to `;
    }

    chatInputValue.set(prompt);
    focusChatInput();
  }

  function focusChatInput() {
    // Focus the chat input
    const input = document.querySelector('[data-chat-input]') as HTMLTextAreaElement;
    if (input) {
      input.focus();
    }
  }

  function getSourceBadgeClass(source: string): string {
    return source === "project"
      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";
  }

  function getAgentTypeIcon(type?: string): string {
    switch (type) {
      case "browser": return "🌐";
      case "coding": return "🔧";
      case "runner": return "▶️";
      case "research": return "🔍";
      case "planning": return "📋";
      case "reviewer": return "👀";
      default: return "🤖";
    }
  }

  onMount(() => {
    loadCapabilities();
  });

  $effect(() => {
    if (projectPath) {
      loadCapabilities();
    }
  });

  const hasAnyCapabilities = $derived(
    capabilities &&
    (capabilities.commands.length > 0 ||
     capabilities.skills.length > 0 ||
     capabilities.agents.length > 0 ||
     capabilities.hooks.length > 0 ||
     capabilities.mcpServers.length > 0)
  );
</script>

<div class="space-y-3">
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-500"></div>
    </div>
  {:else if error}
    <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
    </div>
  {:else if !hasAnyCapabilities}
    <div class="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
      <p>No custom commands, skills, or agents found.</p>
      <p class="mt-1 text-xs">
        Add them to <code class="px-1 bg-gray-100 dark:bg-gray-800 rounded">.claude/</code> directory
      </p>
    </div>
  {:else if capabilities}
    <!-- Commands Section -->
    {#if capabilities.commands.length > 0}
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onclick={() => toggleSection("commands")}
        >
          <span class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <span>⌘</span>
            Commands
            <span class="text-xs text-gray-500 dark:text-gray-400">({capabilities.commands.length})</span>
          </span>
          <span class="text-gray-400">{expandedSections.has("commands") ? "▼" : "▶"}</span>
        </button>
        {#if expandedSections.has("commands")}
          <div class="p-2 space-y-1">
            {#each capabilities.commands as cmd}
              <button
                class="w-full flex items-start gap-2 p-2 rounded-md hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-colors text-left group"
                onclick={() => handleCommandClick(cmd.name)}
              >
                <span class="text-accent-600 dark:text-accent-400 font-mono text-sm">/{cmd.name}</span>
                <span class="flex-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{cmd.description}</span>
                <span class={`text-[10px] px-1.5 py-0.5 rounded ${getSourceBadgeClass(cmd.source)}`}>
                  {cmd.source}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Skills Section -->
    {#if capabilities.skills.length > 0}
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onclick={() => toggleSection("skills")}
        >
          <span class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <span>🛠️</span>
            Skills
            <span class="text-xs text-gray-500 dark:text-gray-400">({capabilities.skills.length})</span>
          </span>
          <span class="text-gray-400">{expandedSections.has("skills") ? "▼" : "▶"}</span>
        </button>
        {#if expandedSections.has("skills")}
          <div class="p-2 space-y-1">
            {#each capabilities.skills as skill}
              <button
                class="w-full flex items-start gap-2 p-2 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-left group"
                onclick={() => handleSkillClick(skill.name, skill.description)}
              >
                <span class="font-medium text-sm text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300">{skill.name}</span>
                <span class="flex-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{skill.description}</span>
                <span class={`text-[10px] px-1.5 py-0.5 rounded ${getSourceBadgeClass(skill.source)}`}>
                  {skill.source}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Agents Section -->
    {#if capabilities.agents.length > 0}
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onclick={() => toggleSection("agents")}
        >
          <span class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <span>🤖</span>
            Agents
            <span class="text-xs text-gray-500 dark:text-gray-400">({capabilities.agents.length})</span>
          </span>
          <span class="text-gray-400">{expandedSections.has("agents") ? "▼" : "▶"}</span>
        </button>
        {#if expandedSections.has("agents")}
          <div class="p-2 space-y-1">
            {#each capabilities.agents as agent}
              <div class="flex items-start gap-2 p-2 rounded-md">
                <span class="text-lg">{getAgentTypeIcon(agent.type)}</span>
                <div class="flex-1 min-w-0">
                  <span class="font-medium text-sm text-gray-900 dark:text-gray-100">{agent.name}</span>
                  {#if agent.type}
                    <span class="ml-1 text-xs text-gray-500">({agent.type})</span>
                  {/if}
                  <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{agent.description}</p>
                </div>
                <span class={`text-[10px] px-1.5 py-0.5 rounded ${getSourceBadgeClass(agent.source)}`}>
                  {agent.source}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Hooks Section -->
    {#if capabilities.hooks.length > 0}
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onclick={() => toggleSection("hooks")}
        >
          <span class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <span>🪝</span>
            Hooks
            <span class="text-xs text-gray-500 dark:text-gray-400">({capabilities.hooks.length})</span>
          </span>
          <span class="text-gray-400">{expandedSections.has("hooks") ? "▼" : "▶"}</span>
        </button>
        {#if expandedSections.has("hooks")}
          <div class="p-2 space-y-1">
            {#each capabilities.hooks as hook}
              <div class="flex items-center gap-2 p-2 rounded-md">
                <span class="text-xs font-mono bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                  {hook.event}
                </span>
                <span class="flex-1 text-xs text-gray-600 dark:text-gray-400 font-mono truncate">
                  {hook.command}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- MCP Servers Section -->
    {#if capabilities.mcpServers.length > 0}
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onclick={() => toggleSection("mcp")}
        >
          <span class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <span>🔌</span>
            MCP Servers
            <span class="text-xs text-gray-500 dark:text-gray-400">({capabilities.mcpServers.length})</span>
          </span>
          <span class="text-gray-400">{expandedSections.has("mcp") ? "▼" : "▶"}</span>
        </button>
        {#if expandedSections.has("mcp")}
          <div class="p-2 space-y-1">
            {#each capabilities.mcpServers as server}
              <div class="flex items-center gap-2 p-2 rounded-md">
                <span class={`w-2 h-2 rounded-full ${server.enabled ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <span class="font-medium text-sm text-gray-900 dark:text-gray-100">{server.name}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">{server.type}</span>
                <span class={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${getSourceBadgeClass(server.source)}`}>
                  {server.source}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
