<script lang="ts">
  import { channelMessages, type ChannelMessage } from "../";
  import RelativeTime from "$lib/components/RelativeTime.svelte";

  interface Props {
    channelId: string;
    threadId: string;
    onClose?: () => void;
  }

  let { channelId, threadId, onClose }: Props = $props();

  let inputValue = $state("");
  let sending = $state(false);
  let messagesDiv: HTMLDivElement | null = $state(null);
  let messages = $state<ChannelMessage[]>([]);

  // Subscribe to store changes
  $effect(() => {
    const unsubscribe = channelMessages.subscribe((map) => {
      const all = map.get(threadId) || [];
      // Skip the first message (thread starter is shown in parent)
      messages = all.slice(1);
    });
    return unsubscribe;
  });

  // Load messages on mount
  $effect(() => {
    channelMessages.loadForThread(channelId, threadId);
  });

  async function sendReply() {
    if (!inputValue.trim() || sending) return;

    sending = true;
    try {
      await channelMessages.create(
        channelId,
        threadId,
        "user",
        "user",
        "You",
        inputValue.trim(),
        []
      );
      inputValue = "";

      // Scroll to bottom
      setTimeout(() => {
        messagesDiv?.scrollTo({ top: messagesDiv.scrollHeight, behavior: "smooth" });
      }, 100);
    } catch (e) {
      console.error("Failed to send reply:", e);
    } finally {
      sending = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }
</script>

<div class="max-h-80 flex flex-col">
  <!-- Replies -->
  <div bind:this={messagesDiv} class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
    {#if messages.length === 0}
      <p class="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
        No replies yet. Be the first to reply!
      </p>
    {:else}
      {#each messages as message (message.id)}
        <div class="flex gap-2">
          <!-- Avatar -->
          <div class="flex-shrink-0">
            {#if message.sender_type === "agent"}
              <div class="w-7 h-7 rounded-md bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-xs">
                🤖
              </div>
            {:else}
              <div class="w-7 h-7 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-600 dark:text-gray-300">
                👤
              </div>
            {/if}
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-medium text-xs {message.sender_type === 'agent' ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-gray-100'}">
                {message.sender_type === "agent" ? `@${message.sender_id}` : message.sender_name}
              </span>
              <span class="text-[10px] text-gray-400 dark:text-gray-500">
                <RelativeTime timestamp={message.created_at} />
              </span>
            </div>
            <p class="mt-0.5 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Reply Input -->
  <div class="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={inputValue}
        placeholder="Reply..."
        class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        onkeydown={handleKeydown}
      />
      <button
        onclick={sendReply}
        disabled={!inputValue.trim() || sending}
        class="px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {sending ? "..." : "Reply"}
      </button>
    </div>
  </div>
</div>
