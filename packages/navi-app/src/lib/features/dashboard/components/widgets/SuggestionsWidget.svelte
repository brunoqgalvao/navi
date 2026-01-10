<script lang="ts">
  /**
   * SuggestionsWidget - AI-powered suggestions for what to work on next
   *
   * Note: This is a placeholder. Full implementation would call Claude
   * to analyze the codebase and generate suggestions.
   */
  import type { SuggestionsWidgetConfig } from "../../types";

  interface Props {
    config: SuggestionsWidgetConfig;
    projectPath: string;
  }

  let { config, projectPath }: Props = $props();

  // Placeholder suggestions - in a full implementation,
  // this would call an API endpoint that uses Claude to analyze the project
  const placeholderSuggestions = [
    "Ask Claude to analyze your codebase for improvement suggestions",
    "Try: 'What should I work on next?'",
    "Try: 'Are there any bugs or issues to fix?'",
  ];

  let loading = $state(false);
  let suggestions = $state<string[]>(placeholderSuggestions);
</script>

<div class="bg-gradient-to-br from-accent-50 to-purple-50 dark:from-accent-900/20 dark:to-purple-900/20 rounded-lg border border-accent-200 dark:border-accent-800 overflow-hidden">
  <div class="px-4 py-2 bg-accent-100/50 dark:bg-accent-900/30 border-b border-accent-200 dark:border-accent-800 flex items-center justify-between">
    <span class="text-sm font-medium text-accent-700 dark:text-accent-300">💡 Suggestions</span>
  </div>

  <div class="p-4">
    {#if loading}
      <div class="text-center py-4">
        <span class="text-sm text-gray-500">Analyzing project...</span>
      </div>
    {:else}
      <ul class="space-y-2">
        {#each suggestions as suggestion}
          <li class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span class="text-accent-500 mt-0.5">→</span>
            <span>{suggestion}</span>
          </li>
        {/each}
      </ul>

      <p class="mt-4 text-xs text-gray-500 dark:text-gray-400 italic">
        Full AI suggestions coming soon. Use the chat to ask Claude directly!
      </p>
    {/if}
  </div>
</div>
