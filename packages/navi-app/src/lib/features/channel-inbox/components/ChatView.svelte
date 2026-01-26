<script lang="ts">
  /**
   * Chat View
   *
   * Displays messages for a selected external chat and allows sending replies.
   */
  import { onMount, tick } from "svelte";
  import type { ExternalChat, ExternalMessage } from "../types";
  import { PROVIDER_CONFIGS } from "../types";
  import { messages, selectedChatMessages, channelInboxApi } from "../";
  import RelativeTime from "$lib/components/RelativeTime.svelte";

  interface Props {
    chat: ExternalChat & { connectionId: string };
    onBack: () => void;
  }

  let { chat, onBack }: Props = $props();

  let inputValue = $state("");
  let messagesContainer: HTMLDivElement | null = $state(null);
  let sending = $state(false);
  let loading = $state(true);

  onMount(async () => {
    await messages.loadForChat(chat.id);
    loading = false;
    await tick();
    scrollToBottom();
  });

  // Scroll to bottom when new messages arrive
  $effect(() => {
    if ($selectedChatMessages.length > 0 && messagesContainer) {
      tick().then(scrollToBottom);
    }
  });

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  async function sendMessage() {
    if (!inputValue.trim() || sending) return;

    const content = inputValue.trim();
    inputValue = "";
    sending = true;

    try {
      // Record the outbound message
      const message = await channelInboxApi.sendMessage(chat.id, content, chat.provider);
      messages.addMessage(chat.id, message);

      // Note: Actual WhatsApp/Telegram sending happens via MCP tools
      // This just queues the message and Claude will pick it up
    } catch (e) {
      console.error("[channels] Failed to send message:", e);
      // Restore the input
      inputValue = content;
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

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
</script>

<div class="flex flex-col h-full">
  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto px-4 py-3 space-y-3"
  >
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
      </div>
    {:else if $selectedChatMessages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <div class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
          <span class="text-2xl">{PROVIDER_CONFIGS[chat.provider]?.icon || "💬"}</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          No messages yet. Start the conversation!
        </p>
      </div>
    {:else}
      {#each $selectedChatMessages as message (message.id)}
        <div class="flex {message.fromMe ? 'justify-end' : 'justify-start'}">
          <div
            class="max-w-[80%] rounded-2xl px-4 py-2
              {message.fromMe
                ? 'bg-purple-600 text-white rounded-br-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'}"
          >
            {#if !message.fromMe && chat.isGroup}
              <p class="text-xs font-medium mb-1 opacity-70">
                {message.senderName}
              </p>
            {/if}
            <p class="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
            <p class="text-[10px] mt-1 opacity-60 text-right">
              {formatTime(message.timestamp)}
            </p>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Input -->
  <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
    <div class="flex gap-2 items-end">
      <div class="flex-1 relative">
        <textarea
          bind:value={inputValue}
          placeholder="Type a message..."
          class="w-full px-4 py-3 text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-2xl resize-none focus:ring-2 focus:ring-purple-500 focus:bg-white dark:focus:bg-gray-700 transition-colors"
          rows="1"
          onkeydown={handleKeydown}
          oninput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 120) + "px";
          }}
        ></textarea>
      </div>
      <button
        onclick={sendMessage}
        disabled={!inputValue.trim() || sending}
        class="p-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      Messages sent here will be delivered via {chat.provider}
    </p>
  </div>
</div>
