<script lang="ts">
  import Modal from "./Modal.svelte";

  interface SlashCommand {
    name: string;
    description: string;
    argsHint?: string;
    isBuiltIn?: boolean;
    category?: string;
  }

  interface Props {
    open: boolean;
    onClose: () => void;
    commands?: SlashCommand[];
    onExecuteCommand?: (command: string) => void;
  }

  let { open = false, onClose, commands = [], onExecuteCommand }: Props = $props();

  // Built-in commands with categories
  const builtInCommands: SlashCommand[] = [
    // Session Management
    { name: "compact", description: "Summarize conversation to free up context space", category: "session", isBuiltIn: true },
    { name: "clear", description: "Clear the conversation history and start fresh", category: "session", isBuiltIn: true },

    // Information
    { name: "help", description: "Show this help menu", category: "info", isBuiltIn: true },
    { name: "status", description: "Show version info and connection status", category: "info", isBuiltIn: true },
    { name: "cost", description: "Show token usage and cost for this session", category: "info", isBuiltIn: true },

    // Settings
    { name: "config", description: "Open settings and configuration", category: "settings", isBuiltIn: true },
    { name: "model", description: "Switch to a different model", argsHint: "<model>", category: "settings", isBuiltIn: true },

    // Feedback
    { name: "bug", description: "Report a bug or issue", category: "feedback", isBuiltIn: true },
  ];

  // Merge with custom commands
  let allCommands = $derived([
    ...builtInCommands,
    ...commands.filter(cmd => !builtInCommands.some(b => b.name === cmd.name))
  ]);

  // Group by category
  interface CommandGroup {
    title: string;
    commands: SlashCommand[];
  }

  let groupedCommands = $derived.by(() => {
    const groups: Record<string, SlashCommand[]> = {
      session: [],
      info: [],
      settings: [],
      feedback: [],
      custom: [],
    };

    for (const cmd of allCommands) {
      const category = cmd.category || (cmd.isBuiltIn ? "info" : "custom");
      if (!groups[category]) groups[category] = [];
      groups[category].push(cmd);
    }

    return [
      { title: "Session", commands: groups.session },
      { title: "Information", commands: groups.info },
      { title: "Settings", commands: groups.settings },
      { title: "Feedback", commands: groups.feedback },
      { title: "Custom Commands", commands: groups.custom },
    ].filter(g => g.commands.length > 0);
  });

  function handleCommandClick(commandName: string) {
    onExecuteCommand?.(commandName);
    onClose();
  }
</script>

<Modal {open} {onClose} title="Commands" size="md">
  {#snippet children()}
    <div class="space-y-6">
      <!-- Quick tips -->
      <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 text-sm">
        <div class="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium mb-2">
          <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Quick Tips
        </div>
        <ul class="space-y-1 text-gray-600 dark:text-gray-400 text-xs">
          <li><kbd class="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px] font-mono">/</kbd> to open command picker</li>
          <li><kbd class="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px] font-mono">@</kbd> to reference files, terminals, or chats</li>
          <li><kbd class="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px] font-mono">!</kbd> to run shell commands directly</li>
        </ul>
      </div>

      <!-- Command groups -->
      {#each groupedCommands as group}
        <div>
          <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {group.title}
          </h3>
          <div class="space-y-1">
            {#each group.commands as cmd}
              <button
                onclick={() => handleCommandClick(cmd.name)}
                class="w-full px-3 py-2 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors group flex items-center gap-3"
              >
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 {cmd.isBuiltIn ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}">
                  {#if cmd.isBuiltIn}
                    <svg class="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg>
                  {:else}
                    <svg class="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm text-gray-900 dark:text-gray-100">/{cmd.name}</span>
                    {#if cmd.argsHint}
                      <span class="text-xs text-gray-400 dark:text-gray-500">{cmd.argsHint}</span>
                    {/if}
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{cmd.description}</p>
                </div>
                <svg class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </button>
            {/each}
          </div>
        </div>
      {/each}

      <!-- Custom commands location hint -->
      <div class="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
        <p class="mb-1">Add custom commands in:</p>
        <ul class="space-y-0.5 font-mono text-[11px]">
          <li><span class="text-purple-500">.claude/commands/</span> — project commands</li>
          <li><span class="text-blue-500">~/.claude/commands/</span> — global commands</li>
        </ul>
      </div>
    </div>
  {/snippet}
</Modal>
