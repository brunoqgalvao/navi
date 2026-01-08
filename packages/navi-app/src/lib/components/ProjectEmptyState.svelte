<script lang="ts">
  import { advancedMode, isConnected } from "../stores";

  interface Props {
    projectName: string;
    claudeMdContent: string | null;
    projectContext: { summary: string; suggestions: string[] } | null;
    inputText: string;
    inputRef?: HTMLTextAreaElement | undefined;
    onInputChange: (text: string) => void;
    onSendMessage: () => void;
    onKeydown: (e: KeyboardEvent) => void;
    onShowClaudeMd: () => void;
  }

  let {
    projectName,
    claudeMdContent,
    projectContext,
    inputText,
    inputRef = $bindable(),
    onInputChange,
    onSendMessage,
    onKeydown,
    onShowClaudeMd,
  }: Props = $props();
</script>

<div class="flex flex-col min-h-[calc(100vh-120px)] animate-in fade-in duration-500">
  <!-- Top section: Project context -->
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

      {#if projectContext?.summary}
        <p class="text-sm text-gray-500 leading-relaxed max-w-lg mx-auto">{projectContext.summary}</p>
      {/if}
    </div>
  </div>

  <!-- Middle section: Title and Input (vertically centered) -->
  <div class="flex-1 flex flex-col items-center justify-center px-4">
    <div class="w-full max-w-xl text-center">
      <h2 class="text-2xl font-serif font-medium text-gray-900 mb-1">Start a conversation</h2>
      <p class="text-sm text-gray-500 mb-8">in <span class="font-medium text-gray-700">{projectName}</span></p>

      <div class="w-full mb-8">
        <div class="relative group bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200 transition-shadow focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-gray-300">
          <textarea
            bind:this={inputRef}
            value={inputText}
            oninput={(e) => onInputChange(e.currentTarget.value)}
            onkeydown={onKeydown}
            placeholder="Type a message to Claude..."
            disabled={!$isConnected}
            class="w-full bg-transparent text-gray-900 placeholder-gray-400 border-none rounded-xl pl-4 pr-14 py-3.5 focus:outline-none focus:ring-0 resize-none max-h-48 min-h-[56px] text-[15px] disabled:opacity-50"
            rows="1"
          ></textarea>
          <div class="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              onclick={onSendMessage}
              disabled={!$isConnected || !inputText.trim()}
              class="p-1.5 text-gray-400 bg-transparent rounded-lg hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Suggestions below input -->
      {#if projectContext?.suggestions && projectContext.suggestions.length > 0}
        <div class="flex flex-wrap gap-2 justify-center">
          {#each projectContext.suggestions as suggestion}
            <button
              onclick={() => onInputChange(suggestion)}
              class="text-sm text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 rounded-full px-4 py-2 transition-all border border-gray-200 hover:border-gray-300 hover:shadow-sm"
            >
              {suggestion}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Bottom spacer to ensure proper centering -->
  <div class="flex-shrink-0 h-24"></div>
</div>
