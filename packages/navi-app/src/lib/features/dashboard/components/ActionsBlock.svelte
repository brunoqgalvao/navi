<script lang="ts">
  /**
   * ActionsBlock - Renders action buttons
   *
   * Executes commands when clicked, shows output/errors
   */
  import type { DashboardAction } from "../types";
  import { executeAction } from "../api";

  interface Props {
    actions: DashboardAction[];
    projectPath: string;
  }

  let { actions, projectPath }: Props = $props();

  let executing = $state<string | null>(null);
  let lastOutput = $state<{ action: string; output: string; success: boolean } | null>(null);

  async function handleAction(action: DashboardAction) {
    if (action.confirm) {
      const confirmed = confirm(`Run command: ${action.command}?`);
      if (!confirmed) return;
    }

    executing = action.name;
    lastOutput = null;

    try {
      const result = await executeAction(projectPath, action.command);
      lastOutput = {
        action: action.name,
        output: result.output || result.error || "Command completed",
        success: result.success,
      };
    } catch (e) {
      lastOutput = {
        action: action.name,
        output: e instanceof Error ? e.message : "Failed to execute",
        success: false,
      };
    } finally {
      executing = null;
    }
  }
</script>

<div class="space-y-3">
  <!-- Action buttons -->
  <div class="flex flex-wrap gap-2">
    {#each actions as action}
      <button
        onclick={() => handleAction(action)}
        disabled={executing !== null}
        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
          {executing === action.name
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-wait'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}
          disabled:opacity-50"
      >
        {#if executing === action.name}
          <span class="animate-spin">⏳</span>
        {/if}
        {action.name}
      </button>
    {/each}
  </div>

  <!-- Output display -->
  {#if lastOutput}
    <div
      class="p-3 rounded-lg text-sm font-mono overflow-x-auto
        {lastOutput.success
          ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'}"
    >
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-sans opacity-70">{lastOutput.action}</span>
        <button
          onclick={() => (lastOutput = null)}
          class="text-xs opacity-70 hover:opacity-100"
        >
          ✕
        </button>
      </div>
      <pre class="whitespace-pre-wrap text-xs">{lastOutput.output}</pre>
    </div>
  {/if}
</div>
