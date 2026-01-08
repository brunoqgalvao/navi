<script lang="ts">
  import { advancedMode, isConnected } from "../stores";

  interface Props {
    projectName: string;
    projectDescription?: string | null;
    claudeMdContent: string | null;
    projectContext: { summary: string; suggestions: string[] } | null;
    inputText: string;
    inputRef?: HTMLTextAreaElement | undefined;
    isGitRepo?: boolean;
    onInputChange: (text: string) => void;
    onSendMessage: () => void;
    onKeydown: (e: KeyboardEvent) => void;
    onShowClaudeMd: () => void;
  }

  let {
    projectName,
    projectDescription = null,
    claudeMdContent,
    projectContext,
    inputText,
    inputRef = $bindable(),
    isGitRepo = false,
    onInputChange,
    onSendMessage,
    onKeydown,
    onShowClaudeMd,
  }: Props = $props();

  // Input capabilities hints
  const capabilities = [
    { icon: "image", label: "Paste images", hint: "⌘V" },
    { icon: "file", label: "@file", hint: "Reference files" },
    { icon: "terminal", label: "@terminal", hint: "Terminal output" },
    { icon: "command", label: "/commands", hint: "Slash commands" },
  ];
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
    </div>
  </div>

  <!-- Middle section: Title and Input (vertically centered) -->
  <div class="flex-1 flex flex-col items-center justify-center px-4">
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
        <div class="flex flex-wrap gap-2 justify-center mb-6">
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

      <!-- Capabilities hints -->
      <div class="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-400">
        {#each capabilities as cap}
          <div class="flex items-center gap-1.5">
            {#if cap.icon === "image"}
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"></path>
              </svg>
            {:else if cap.icon === "file"}
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path>
              </svg>
            {:else if cap.icon === "terminal"}
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"></path>
              </svg>
            {:else if cap.icon === "command"}
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5"></path>
              </svg>
            {/if}
            <span>{cap.label}</span>
            <span class="text-gray-300">{cap.hint}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Bottom spacer to ensure proper centering -->
  <div class="flex-shrink-0 h-16"></div>
</div>
