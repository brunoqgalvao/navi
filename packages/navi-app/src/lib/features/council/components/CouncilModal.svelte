<script lang="ts">
  import Modal from "$lib/components/Modal.svelte";
  import type { CouncilMember, CouncilResponse, CouncilResult } from "../types";
  import { councilApi } from "../api";
  import { onMount } from "svelte";
  import Markdown from "$lib/components/Markdown.svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
    initialPrompt?: string;
  }

  let { open, onClose, initialPrompt = "" }: Props = $props();

  let prompt = $state(initialPrompt);
  let members = $state<CouncilMember[]>([]);
  let selectedMembers = $state<Set<string>>(new Set());
  let loading = $state(false);
  let result = $state<CouncilResult | null>(null);
  let error = $state<string | null>(null);
  let showMemberSelector = $state(false);

  onMount(async () => {
    try {
      const data = await councilApi.getMembers();
      members = data.members;
      // Pre-select default council members that are available
      selectedMembers = new Set(
        data.defaultCouncil.filter((id) =>
          data.members.find((m) => m.id === id && m.available)
        )
      );
    } catch (e: any) {
      error = e.message;
    }
  });

  async function convene() {
    if (!prompt.trim() || selectedMembers.size === 0) return;

    loading = true;
    error = null;
    result = null;

    try {
      result = await councilApi.convene(prompt, Array.from(selectedMembers));
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function toggleMember(id: string) {
    const newSet = new Set(selectedMembers);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedMembers = newSet;
  }

  function formatLatency(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function getStatusColor(response: CouncilResponse): string {
    if (response.error) return "text-red-500";
    if (response.latencyMs < 2000) return "text-green-500";
    if (response.latencyMs < 5000) return "text-yellow-500";
    return "text-orange-500";
  }

  // Update prompt when initialPrompt changes
  $effect(() => {
    if (initialPrompt) {
      prompt = initialPrompt;
    }
  });
</script>

<Modal {open} {onClose} title="LLM Council" size="full">
  {#snippet children()}
    <div class="flex flex-col h-full gap-4">
      <!-- Prompt Input -->
      <div class="shrink-0">
        <div class="flex gap-2 items-end">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Question for the council
            </label>
            <textarea
              bind:value={prompt}
              placeholder="Ask something to get multiple perspectives..."
              class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500 resize-none"
              rows="3"
              disabled={loading}
            ></textarea>
          </div>
        </div>

        <!-- Member Selector Toggle -->
        <div class="flex items-center gap-2 mt-2">
          <button
            onclick={() => (showMemberSelector = !showMemberSelector)}
            class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
          >
            <svg
              class="w-4 h-4 transition-transform {showMemberSelector ? 'rotate-90' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            Select models ({selectedMembers.size} selected)
          </button>

          <div class="flex-1"></div>

          <button
            onclick={convene}
            disabled={loading || !prompt.trim() || selectedMembers.size === 0}
            class="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {#if loading}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Consulting...
            {:else}
              Convene Council
            {/if}
          </button>
        </div>

        <!-- Member Selector -->
        {#if showMemberSelector}
          <div class="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {#each members as member}
                <button
                  onclick={() => toggleMember(member.id)}
                  disabled={!member.available}
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors {selectedMembers.has(member.id)
                    ? 'bg-accent-100 dark:bg-accent-900/30 border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'} {!member.available ? 'opacity-50 cursor-not-allowed' : ''}"
                >
                  <span>{member.icon}</span>
                  <span class="truncate">{member.name}</span>
                  {#if !member.available}
                    <span class="text-xs text-red-500">(no key)</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Error -->
      {#if error}
        <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      {/if}

      <!-- Results -->
      {#if result}
        <div class="flex-1 min-h-0">
          <div class="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Total time: {formatLatency(result.totalLatencyMs)}</span>
            <span class="text-gray-300 dark:text-gray-600">|</span>
            <span>{result.responses.length} responses</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full overflow-auto">
            {#each result.responses as response}
              {@const member = members.find((m) => m.id === response.memberId)}
              <div
                class="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
              >
                <!-- Header -->
                <div
                  class="px-3 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700"
                  style="background-color: {member?.color}20"
                >
                  <span class="text-lg">{member?.icon || "🤖"}</span>
                  <span class="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {response.memberName}
                  </span>
                  <span class="flex-1"></span>
                  <span class="text-xs {getStatusColor(response)}">
                    {formatLatency(response.latencyMs)}
                  </span>
                  {#if response.tokenCount}
                    <span class="text-xs text-gray-400">
                      {response.tokenCount} tokens
                    </span>
                  {/if}
                </div>

                <!-- Response -->
                <div class="flex-1 p-3 overflow-auto text-sm">
                  {#if response.error}
                    <div class="text-red-500 dark:text-red-400">
                      Error: {response.error}
                    </div>
                  {:else}
                    <div class="prose prose-sm dark:prose-invert max-w-none">
                      <Markdown content={response.response} />
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if !loading}
        <!-- Empty State -->
        <div class="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
          <div class="text-center">
            <div class="text-4xl mb-2">🏛️</div>
            <p class="text-sm">Ask a question to convene the council</p>
            <p class="text-xs mt-1">Multiple AI models will answer simultaneously</p>
          </div>
        </div>
      {:else}
        <!-- Loading State -->
        <div class="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each Array.from(selectedMembers) as memberId}
            {@const member = members.find((m) => m.id === memberId)}
            <div
              class="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 animate-pulse"
            >
              <div
                class="px-3 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700"
                style="background-color: {member?.color}20"
              >
                <span class="text-lg">{member?.icon || "🤖"}</span>
                <span class="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {member?.name}
                </span>
                <span class="flex-1"></span>
                <span class="text-xs text-gray-400">thinking...</span>
              </div>
              <div class="flex-1 p-3 space-y-2">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</Modal>
