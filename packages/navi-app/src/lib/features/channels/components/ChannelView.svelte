<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    currentChannel,
    currentChannelId,
    currentThreadId,
    threads,
    currentThreads,
    channelMessages,
    type Channel,
    type ChannelThread,
    type ChannelMessage,
  } from "../";
  import { agents } from "$lib/stores/agents";
  import RelativeTime from "$lib/components/RelativeTime.svelte";
  import ThreadReplies from "./ThreadReplies.svelte";

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  let inputValue = $state("");
  let messagesContainer: HTMLDivElement | null = $state(null);
  let sending = $state(false);
  let expandedThreadId = $state<string | null>(null);

  // Load threads when channel changes
  $effect(() => {
    if ($currentChannelId) {
      threads.loadForChannel($currentChannelId);
    }
  });

  // Load messages for expanded thread
  $effect(() => {
    if ($currentChannelId && expandedThreadId) {
      channelMessages.loadForThread($currentChannelId, expandedThreadId);
    }
  });

  // Auto-scroll to bottom when threads change
  $effect(() => {
    if ($currentThreads.length > 0 && messagesContainer) {
      tick().then(() => {
        messagesContainer?.scrollTo({ top: messagesContainer.scrollHeight, behavior: "smooth" });
      });
    }
  });

  async function sendMessage() {
    if (!$currentChannelId || !inputValue.trim() || sending) return;

    sending = true;
    try {
      // Create a new thread with this message as the first
      const thread = await threads.create($currentChannelId, inputValue.trim().slice(0, 100));

      // Add the message to the thread
      await channelMessages.create(
        $currentChannelId,
        thread.id,
        "user",
        "user",
        "You",
        inputValue.trim(),
        []
      );

      inputValue = "";
    } catch (e) {
      console.error("Failed to send message:", e);
    } finally {
      sending = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function toggleThread(threadId: string) {
    if (expandedThreadId === threadId) {
      expandedThreadId = null;
    } else {
      expandedThreadId = threadId;
    }
  }

  function getFirstMessage(thread: ChannelThread): string {
    return thread.title || "Message";
  }
</script>

<div class="flex flex-col h-full bg-white dark:bg-gray-900">
  <!-- Channel Header -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
    {#if onClose}
      <button
        onclick={onClose}
        class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    {/if}
    <div class="flex items-center gap-2">
      <span class="text-purple-500 dark:text-purple-400 text-xl font-semibold">#</span>
      <div>
        <h2 class="font-semibold text-gray-900 dark:text-gray-100">
          {$currentChannel?.name || "Channel"}
        </h2>
        {#if $currentChannel?.description}
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {$currentChannel.description}
          </p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Messages (Threads as top-level messages) -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto"
  >
    {#if $currentThreads.length === 0}
      <div class="flex items-center justify-center h-full">
        <div class="text-center text-gray-400 dark:text-gray-500 px-4">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <span class="text-3xl">#</span>
          </div>
          <h3 class="font-medium text-gray-600 dark:text-gray-300 mb-1">
            Welcome to #{$currentChannel?.name}
          </h3>
          <p class="text-sm">
            This is the beginning of the channel. Send a message to start a conversation.
          </p>
        </div>
      </div>
    {:else}
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        {#each $currentThreads as thread (thread.id)}
          <div class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <!-- Main message (thread starter) -->
            <div class="px-4 py-3">
              <div class="flex gap-3">
                <!-- Avatar -->
                <div class="flex-shrink-0">
                  <div class="w-9 h-9 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-600 dark:text-gray-300">
                    👤
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2">
                    <span class="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      You
                    </span>
                    <span class="text-xs text-gray-400 dark:text-gray-500">
                      <RelativeTime timestamp={thread.created_at} />
                    </span>
                  </div>
                  <p class="mt-0.5 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {thread.title}
                  </p>

                  <!-- Thread replies indicator -->
                  {#if thread.message_count && thread.message_count > 1}
                    <button
                      onclick={() => toggleThread(thread.id)}
                      class="mt-2 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>{thread.message_count - 1} {thread.message_count === 2 ? 'reply' : 'replies'}</span>
                      <svg class="w-3 h-3 transition-transform {expandedThreadId === thread.id ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  {:else}
                    <button
                      onclick={() => toggleThread(thread.id)}
                      class="mt-2 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      <span>Reply</span>
                    </button>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Expanded thread replies -->
            {#if expandedThreadId === thread.id}
              <div class="bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                <ThreadReplies
                  channelId={$currentChannelId!}
                  threadId={thread.id}
                  onClose={() => expandedThreadId = null}
                />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Input -->
  <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
    <div class="flex gap-2 items-end">
      <div class="flex-1 relative">
        <textarea
          bind:value={inputValue}
          placeholder="Message #{$currentChannel?.name || 'channel'}..."
          class="w-full px-4 py-3 text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:bg-white dark:focus:bg-gray-700 transition-colors"
          rows="1"
          onkeydown={handleKeydown}
          oninput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 150) + 'px';
          }}
        ></textarea>
      </div>
      <button
        onclick={sendMessage}
        disabled={!inputValue.trim() || sending}
        class="p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {#if sending}
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {:else}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        {/if}
      </button>
    </div>
    <p class="text-xs text-gray-400 dark:text-gray-500 mt-2 px-1">
      Press Enter to send. Use @agent to call an agent (e.g., @coder, @img3d)
    </p>
  </div>
</div>
