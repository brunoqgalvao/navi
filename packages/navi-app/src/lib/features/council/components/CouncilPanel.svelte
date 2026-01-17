<script lang="ts">
  import { onMount } from "svelte";
  import Markdown from "$lib/components/Markdown.svelte";
  import { councilStore, activeConversation, selectedMembers } from "../stores";
  import type { CouncilMessage, CouncilConversation } from "../stores";
  import type { CouncilMember, CouncilResponse } from "../types";

  interface Props {
    onClose: () => void;
    onAdoptResponse?: (text: string) => void;
  }

  let { onClose, onAdoptResponse }: Props = $props();

  let inputValue = $state("");
  let inputRef = $state<HTMLTextAreaElement | null>(null);
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let showMemberSelector = $state(false);
  let showHistory = $state(false);
  let expandedResponseId = $state<string | null>(null);

  // Load members on mount
  onMount(() => {
    councilStore.loadMembers();
  });

  // Auto-scroll to bottom when messages change
  $effect(() => {
    if ($activeConversation?.messages && messagesContainer) {
      requestAnimationFrame(() => {
        messagesContainer?.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  });

  async function handleSubmit() {
    const prompt = inputValue.trim();
    if (!prompt || $councilStore.isLoading) return;

    inputValue = "";
    await councilStore.sendMessage(prompt);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
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

  function getMemberInfo(memberId: string): CouncilMember | undefined {
    return $councilStore.availableMembers.find(m => m.id === memberId);
  }

  function toggleExpandResponse(responseId: string) {
    expandedResponseId = expandedResponseId === responseId ? null : responseId;
  }

  function handleAdopt(text: string) {
    onAdoptResponse?.(text);
  }

  function startNewConversation() {
    councilStore.newConversation();
    showHistory = false;
  }

  function selectConversation(conv: CouncilConversation) {
    councilStore.selectConversation(conv.id);
    showHistory = false;
  }
</script>

<div class="flex flex-col h-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
    <div class="flex items-center gap-2">
      <span class="text-lg">🏛️</span>
      <h3 class="font-semibold text-sm text-gray-900 dark:text-gray-100">Council</h3>
      {#if $activeConversation}
        <span class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
          — {$activeConversation.title}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-1">
      <!-- History button -->
      <button
        onclick={() => showHistory = !showHistory}
        class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        title="Conversation history"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      <!-- New conversation -->
      <button
        onclick={startNewConversation}
        class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        title="New conversation"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <!-- Member selector toggle -->
      <button
        onclick={() => showMemberSelector = !showMemberSelector}
        class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        title="Select models"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>

      <!-- Close button -->
      <button
        onclick={onClose}
        class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        title="Close panel"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Member selector dropdown -->
  {#if showMemberSelector}
    <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <div class="flex flex-wrap gap-1.5">
        {#each $councilStore.availableMembers as member}
          <button
            onclick={() => councilStore.toggleMember(member.id)}
            disabled={!member.available}
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-full border transition-colors {$councilStore.selectedMemberIds.has(member.id)
              ? 'bg-accent-100 dark:bg-accent-900/30 border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300'
              : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'} {!member.available ? 'opacity-40 cursor-not-allowed' : ''}"
          >
            <span>{member.icon}</span>
            <span>{member.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- History dropdown -->
  {#if showHistory}
    <div class="absolute left-0 right-0 top-[41px] z-10 max-h-[300px] overflow-auto bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg">
      {#if $councilStore.conversations.length === 0}
        <div class="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No conversations yet
        </div>
      {:else}
        {#each $councilStore.conversations as conv}
          <button
            onclick={() => selectConversation(conv)}
            class="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between group {$activeConversation?.id === conv.id ? 'bg-gray-100 dark:bg-gray-700' : ''}"
          >
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {conv.title}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {conv.messages.length} messages • {new Date(conv.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onclick={(e) => { e.stopPropagation(); councilStore.deleteConversation(conv.id); }}
              class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </button>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Messages -->
  <div bind:this={messagesContainer} class="flex-1 overflow-auto p-4 space-y-4">
    {#if !$activeConversation || $activeConversation.messages.length === 0}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <div class="text-4xl mb-3">🏛️</div>
        <p class="text-sm font-medium">Council Chamber</p>
        <p class="text-xs mt-1 text-center max-w-[250px]">
          Ask a question to get perspectives from multiple AI models simultaneously
        </p>
        {#if $selectedMembers.length > 0}
          <div class="flex gap-1 mt-3">
            {#each $selectedMembers as member}
              <span class="text-lg" title={member.name}>{member.icon}</span>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      {#each $activeConversation.messages as msg (msg.id)}
        {#if msg.role === "user"}
          <!-- User message -->
          <div class="flex justify-end">
            <div class="max-w-[85%] bg-accent-100 dark:bg-accent-900/30 rounded-lg px-3 py-2">
              <p class="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        {:else if msg.role === "council"}
          <!-- Council responses -->
          {#if msg.isLoading}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {#each $selectedMembers as member}
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden animate-pulse">
                  <div class="px-2 py-1.5 flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-700" style="background-color: {member.color}15">
                    <span class="text-sm">{member.icon}</span>
                    <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{member.name}</span>
                  </div>
                  <div class="p-2 space-y-1.5">
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else if msg.responses}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {#each msg.responses as response (response.memberId)}
                {@const member = getMemberInfo(response.memberId)}
                {@const isExpanded = expandedResponseId === `${msg.id}-${response.memberId}`}
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex flex-col">
                  <!-- Header -->
                  <button
                    onclick={() => toggleExpandResponse(`${msg.id}-${response.memberId}`)}
                    class="w-full px-2 py-1.5 flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    style="background-color: {member?.color || '#888'}15"
                  >
                    <span class="text-sm">{member?.icon || "🤖"}</span>
                    <span class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1 text-left truncate">
                      {response.memberName}
                    </span>
                    <span class="text-[10px] {getStatusColor(response)}">
                      {formatLatency(response.latencyMs)}
                    </span>
                    <svg class="w-3 h-3 text-gray-400 transition-transform {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <!-- Content -->
                  <div class="p-2 text-xs overflow-hidden {isExpanded ? '' : 'max-h-[100px]'}">
                    {#if response.error}
                      <div class="text-red-500 dark:text-red-400">{response.error}</div>
                    {:else}
                      <div class="prose prose-xs dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-1">
                        <Markdown content={response.response} />
                      </div>
                    {/if}
                  </div>

                  <!-- Actions (shown when expanded) -->
                  {#if isExpanded && !response.error}
                    <div class="px-2 py-1.5 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-1">
                      <button
                        onclick={() => navigator.clipboard.writeText(response.response)}
                        class="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        Copy
                      </button>
                      {#if onAdoptResponse}
                        <button
                          onclick={() => handleAdopt(response.response)}
                          class="px-2 py-0.5 text-[10px] text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 hover:bg-accent-50 dark:hover:bg-accent-900/20 rounded transition-colors"
                        >
                          Use in chat
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      {/each}
    {/if}
  </div>

  <!-- Input -->
  <div class="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
    <div class="flex gap-2">
      <textarea
        bind:this={inputRef}
        bind:value={inputValue}
        onkeydown={handleKeydown}
        placeholder="Ask the council..."
        disabled={$councilStore.isLoading}
        rows="1"
        class="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500 resize-none disabled:opacity-50"
      ></textarea>
      <button
        onclick={handleSubmit}
        disabled={!inputValue.trim() || $councilStore.isLoading || $councilStore.selectedMemberIds.size === 0}
        class="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
      >
        {#if $councilStore.isLoading}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        {/if}
      </button>
    </div>
    {#if $councilStore.selectedMemberIds.size === 0}
      <p class="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
        Select at least one model to ask the council
      </p>
    {/if}
  </div>
</div>
