<script lang="ts">
  /**
   * Chat List
   *
   * Displays a list of chats from the unified inbox.
   */
  import type { ExternalChat } from "../types";
  import { PROVIDER_CONFIGS } from "../types";
  import RelativeTime from "$lib/components/RelativeTime.svelte";

  interface Props {
    chats: (ExternalChat & { connectionId: string })[];
    onSelect: (chat: ExternalChat & { connectionId: string }) => void;
  }

  let { chats, onSelect }: Props = $props();
</script>

<div class="flex-1 overflow-y-auto">
  {#if chats.length === 0}
    <div class="flex flex-col items-center justify-center h-full px-4 text-center">
      <div class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
        <span class="text-2xl">📭</span>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        No messages yet
      </p>
    </div>
  {:else}
    <div class="divide-y divide-gray-100 dark:divide-gray-800">
      {#each chats as chat (chat.id)}
        <button
          onclick={() => onSelect(chat)}
          class="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
        >
          <!-- Avatar -->
          <div class="relative flex-shrink-0">
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style="background-color: {PROVIDER_CONFIGS[chat.provider]?.color}20"
            >
              {chat.isGroup ? "👥" : PROVIDER_CONFIGS[chat.provider]?.icon || "💬"}
            </div>
            <!-- Provider badge -->
            <div
              class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
              style="background-color: {PROVIDER_CONFIGS[chat.provider]?.color}"
            >
              {PROVIDER_CONFIGS[chat.provider]?.icon || "💬"}
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                {chat.name}
              </span>
              {#if chat.lastMessage?.timestamp}
                <span class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  <RelativeTime timestamp={chat.lastMessage.timestamp} />
                </span>
              {/if}
            </div>
            {#if chat.lastMessage}
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {#if chat.lastMessage.fromMe}
                  <span class="text-purple-500">You: </span>
                {/if}
                {chat.lastMessage.content}
              </p>
            {/if}
          </div>

          <!-- Unread badge -->
          {#if chat.unreadCount > 0}
            <div class="flex-shrink-0">
              <span class="px-1.5 py-0.5 text-xs font-medium bg-purple-600 text-white rounded-full">
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
