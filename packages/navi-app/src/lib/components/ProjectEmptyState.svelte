<script lang="ts">
  import { advancedMode } from "../stores";

  interface Props {
    projectName: string;
    projectDescription?: string | null;
    claudeMdContent: string | null;
    projectContext: { summary: string; suggestions: string[] } | null;
    onSuggestionClick?: (suggestion: string) => void;
    onShowClaudeMd: () => void;
  }

  let {
    projectName,
    projectDescription = null,
    claudeMdContent,
    projectContext,
    onSuggestionClick,
    onShowClaudeMd,
  }: Props = $props();
</script>

<div class="flex flex-col h-full animate-in fade-in duration-500">
  <!-- Top section: CLAUDE.md badge -->
  <div class="flex-shrink-0 pt-8 px-4">
    <div class="max-w-xl mx-auto text-center">
      {#if $advancedMode && claudeMdContent}
        <button
          onclick={onShowClaudeMd}
          class="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors mb-4"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          <span>CLAUDE.md loaded</span>
          <span class="text-gray-400">({claudeMdContent.split('\n').length} lines)</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Middle section: Title and Context (vertically centered) -->
  <div class="flex-1 flex flex-col items-center justify-center px-4 pb-48">
    <div class="w-full max-w-xl text-center">
      <h2 class="text-2xl font-serif font-medium text-gray-900 mb-1">Start a conversation</h2>
      <p class="text-sm text-gray-500 mb-6">in <span class="font-medium text-gray-700">{projectName}</span></p>

      <!-- Project Description -->
      {#if projectDescription}
        <div class="mb-6 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-left">
          <p class="text-sm text-gray-600 leading-relaxed">{projectDescription}</p>
        </div>
      {:else if projectContext?.summary}
        <p class="text-sm text-gray-500 leading-relaxed max-w-lg mx-auto mb-6">{projectContext.summary}</p>
      {/if}

      <!-- Suggestions -->
      {#if projectContext?.suggestions && projectContext.suggestions.length > 0}
        <div class="flex flex-wrap gap-2 justify-center">
          {#each projectContext.suggestions as suggestion}
            <button
              onclick={() => onSuggestionClick?.(suggestion)}
              class="text-sm text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 rounded-full px-4 py-2 transition-all border border-gray-200 hover:border-gray-300 hover:shadow-sm"
            >
              {suggestion}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
