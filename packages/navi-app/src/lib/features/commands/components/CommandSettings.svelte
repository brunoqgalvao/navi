<script lang="ts">
  import { onMount } from "svelte";
  import { commandStore, type ResolvedCommand, type CommandScope } from "../index";
  import { currentProject } from "$lib/stores";

  // State
  let loading = $state(true);
  let commands = $state<ResolvedCommand[]>([]);
  let activeScope: "all" | "global" | "workspace" = $state("all");
  let searchQuery = $state("");
  let draggedCommand: ResolvedCommand | null = $state(null);

  // Get commands from store
  $effect(() => {
    const unsubscribe = commandStore.subscribe(state => {
      loading = state.loading;
      commands = state.commands;
    });
    return unsubscribe;
  });

  // Load commands when project changes
  $effect(() => {
    const projectPath = $currentProject?.path;
    const projectId = $currentProject?.id;
    commandStore.load(projectPath, projectId);
  });

  // Filtered commands based on scope and search
  const filteredCommands = $derived(() => {
    let filtered = commands;

    // Filter by scope
    if (activeScope === "global") {
      filtered = filtered.filter(cmd => cmd.source === "global");
    } else if (activeScope === "workspace") {
      filtered = filtered.filter(cmd => cmd.source === "project");
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        cmd =>
          cmd.name.toLowerCase().includes(query) ||
          cmd.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  });

  // Stats
  const stats = $derived(() => {
    const enabled = commands.filter(cmd => cmd.enabled).length;
    const total = commands.length;
    const global = commands.filter(cmd => cmd.source === "global").length;
    const workspace = commands.filter(cmd => cmd.source === "project").length;
    return { enabled, total, global, workspace };
  });

  // Toggle command enabled status
  async function handleToggle(cmd: ResolvedCommand) {
    const newScope: CommandScope = cmd.source === "project" ? "workspace" : "global";
    await commandStore.toggle(cmd.name, newScope, !cmd.enabled);
  }

  // Drag and drop handlers
  function handleDragStart(e: DragEvent, cmd: ResolvedCommand) {
    draggedCommand = cmd;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", cmd.name);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  async function handleDrop(e: DragEvent, targetCmd: ResolvedCommand) {
    e.preventDefault();
    if (!draggedCommand || draggedCommand.name === targetCmd.name) {
      draggedCommand = null;
      return;
    }

    const scope: CommandScope = activeScope === "workspace" ? "workspace" : "global";
    const currentOrder = filteredCommands().map(c => c.name);
    const draggedIndex = currentOrder.indexOf(draggedCommand.name);
    const targetIndex = currentOrder.indexOf(targetCmd.name);

    // Remove from current position
    currentOrder.splice(draggedIndex, 1);
    // Insert at new position
    currentOrder.splice(targetIndex, 0, draggedCommand.name);

    await commandStore.reorder(scope, currentOrder);
    draggedCommand = null;
  }

  function handleDragEnd() {
    draggedCommand = null;
  }

  // Open command file location
  function getCommandPath(cmd: ResolvedCommand): string {
    return cmd.path;
  }

  onMount(() => {
    const projectPath = $currentProject?.path;
    const projectId = $currentProject?.id;
    commandStore.load(projectPath, projectId);
  });
</script>

<div class="space-y-6">
  <!-- Header with stats -->
  <div class="flex items-center justify-between">
    <div>
      <h4 class="text-lg font-semibold text-gray-900 mb-1">Commands</h4>
      <p class="text-sm text-gray-500">
        Manage slash commands available in chat. Commands can be global or workspace-specific.
      </p>
    </div>
    <div class="flex items-center gap-2 text-sm">
      <span class="px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-medium">
        {stats().enabled} enabled
      </span>
      <span class="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">
        {stats().total} total
      </span>
    </div>
  </div>

  <!-- Scope tabs and search -->
  <div class="flex items-center gap-4">
    <div class="flex items-center bg-gray-100 rounded-lg p-1">
      <button
        onclick={() => (activeScope = "all")}
        class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {activeScope === 'all'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        All ({stats().total})
      </button>
      <button
        onclick={() => (activeScope = "global")}
        class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {activeScope === 'global'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        Global ({stats().global})
      </button>
      <button
        onclick={() => (activeScope = "workspace")}
        class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {activeScope === 'workspace'
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        Workspace ({stats().workspace})
      </button>
    </div>

    <div class="flex-1 relative">
      <svg
        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search commands..."
        class="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-gray-900 focus:outline-none transition-colors"
      />
    </div>
  </div>

  <!-- Commands list -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
    </div>
  {:else if filteredCommands().length === 0}
    <div class="text-center py-12 text-gray-500">
      {#if searchQuery}
        <p>No commands match "{searchQuery}"</p>
      {:else if activeScope === "workspace" && !$currentProject}
        <p>Select a workspace to see workspace-specific commands</p>
      {:else}
        <p>No commands found</p>
        <p class="text-sm mt-2">
          Add commands by creating <code class="bg-gray-100 px-1.5 py-0.5 rounded">.md</code> files in
          <code class="bg-gray-100 px-1.5 py-0.5 rounded">~/.claude/commands/</code>
        </p>
      {/if}
    </div>
  {:else}
    <div class="space-y-2">
      {#each filteredCommands() as cmd (cmd.name)}
        <div
          draggable="true"
          ondragstart={(e) => handleDragStart(e, cmd)}
          ondragover={handleDragOver}
          ondrop={(e) => handleDrop(e, cmd)}
          ondragend={handleDragEnd}
          class="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-all cursor-move {draggedCommand?.name === cmd.name
            ? 'opacity-50'
            : ''} {!cmd.enabled ? 'opacity-60' : ''}"
        >
          <div class="flex items-start gap-4">
            <!-- Drag handle -->
            <div class="shrink-0 pt-0.5 text-gray-300 group-hover:text-gray-400 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 8h16M4 16h16"
                />
              </svg>
            </div>

            <!-- Command info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-mono text-sm font-medium text-gray-900">/{cmd.name}</span>
                {#if cmd.argsHint}
                  <span class="text-xs text-gray-400 font-mono">{cmd.argsHint}</span>
                {/if}
                <span
                  class="text-xs px-1.5 py-0.5 rounded {cmd.source === 'global'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'}"
                >
                  {cmd.source}
                </span>
              </div>
              <p class="text-sm text-gray-600 truncate">{cmd.description}</p>
              <p class="text-xs text-gray-400 mt-1 truncate" title={cmd.path}>
                {cmd.path}
              </p>
            </div>

            <!-- Toggle -->
            <button
              onclick={() => handleToggle(cmd)}
              class="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors {cmd.enabled
                ? 'bg-green-500'
                : 'bg-gray-300'}"
              title={cmd.enabled ? 'Disable command' : 'Enable command'}
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {cmd.enabled
                  ? 'translate-x-6'
                  : 'translate-x-1'}"
              ></span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Help text -->
  <div class="bg-gray-50 rounded-xl border border-gray-200 p-4">
    <h5 class="font-medium text-gray-900 mb-2">Adding Commands</h5>
    <ul class="text-sm text-gray-600 space-y-1">
      <li>
        <span class="font-medium">Global:</span> Create
        <code class="bg-gray-200 px-1.5 py-0.5 rounded text-xs">~/.claude/commands/my-command.md</code>
      </li>
      <li>
        <span class="font-medium">Workspace:</span> Create
        <code class="bg-gray-200 px-1.5 py-0.5 rounded text-xs"
          >.claude/commands/my-command.md</code
        >
        in your project
      </li>
    </ul>
    <p class="text-xs text-gray-500 mt-3">
      Commands are markdown files. Add frontmatter with <code class="bg-gray-200 px-1 rounded"
        >description</code
      >
      and <code class="bg-gray-200 px-1 rounded">args</code> fields.
    </p>
  </div>
</div>
