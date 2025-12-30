<script lang="ts">
  interface ContextReductionOption {
    id: string;
    name: string;
    description: string;
    icon: string;
    action: () => void;
  }

  interface Props {
    usagePercent: number;
    inputTokens: number;
    contextWindow: number;
    isPruned?: boolean;
    isCompacting?: boolean;
    onPruneToolResults: () => void;
    onSDKCompact?: () => void;
    onStartNewChat: () => void;
  }

  let {
    usagePercent,
    inputTokens,
    contextWindow,
    isPruned = false,
    isCompacting = false,
    onPruneToolResults,
    onSDKCompact,
    onStartNewChat,
  }: Props = $props();

  let showOptions = $state(false);

  const options: ContextReductionOption[] = [
    {
      id: "prune-tool-results",
      name: "Prune tool outputs",
      description: "Truncate old file reads & bash outputs to save tokens",
      icon: "✂️",
      action: () => {
        onPruneToolResults();
        showOptions = false;
      },
    },
    {
      id: "sdk-compact",
      name: "Compact context",
      description: "Let Claude intelligently summarize the conversation",
      icon: "🧠",
      action: () => {
        onSDKCompact?.();
        showOptions = false;
      },
    },
    {
      id: "new-chat-summary",
      name: "Start fresh with summary",
      description: "Create a new chat with a summary of this conversation",
      icon: "📝",
      action: () => {
        onStartNewChat();
        showOptions = false;
      },
    },
  ].filter(opt => opt.id !== "sdk-compact" || onSDKCompact);

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".context-warning-container")) {
      showOptions = false;
    }
  }

  $effect(() => {
    if (showOptions) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
    return undefined;
  });
</script>

{#if isCompacting}
  <!-- Compacting indicator -->
  <div class="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
    <svg class="w-4 h-4 text-purple-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
    <span>Compacting context...</span>
    <span class="text-purple-500 text-xs">Claude is summarizing</span>
  </div>
{:else if isPruned}
  <!-- Pruned context indicator -->
  <div class="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
    <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span>Using pruned context</span>
    <span class="text-emerald-500 text-xs">({usagePercent}%)</span>
  </div>
{:else if usagePercent >= 80}
  <div class="context-warning-container relative">
    <button
      onclick={() => showOptions = !showOptions}
      class="flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-sm text-amber-800 transition-colors shadow-sm"
    >
      <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>Context {usagePercent}% full</span>
      <svg class="w-3 h-3 text-amber-600 transition-transform {showOptions ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if showOptions}
      <div class="absolute bottom-full left-0 mb-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div class="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <p class="text-xs font-medium text-gray-600">Reduce context usage</p>
          <p class="text-[10px] text-gray-400 mt-0.5">
            {(inputTokens / 1000).toFixed(1)}k / {(contextWindow / 1000).toFixed(0)}k tokens used
          </p>
        </div>
        <div class="py-1">
          {#each options as option}
            <button
              onclick={option.action}
              class="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-start gap-3"
            >
              <span class="text-lg">{option.icon}</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-700">{option.name}</p>
                <p class="text-xs text-gray-500 mt-0.5">{option.description}</p>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
