<script lang="ts">
  /**
   * Channels Panel
   *
   * Main sidebar panel for the channel inbox extension.
   * Shows unified inbox across WhatsApp, Telegram, Email, etc.
   */
  import { onMount } from "svelte";
  import {
    providers,
    connections,
    inbox,
    selectedChatId,
    selectedChat,
    totalUnreadCount,
    type ChannelConnection,
    type ExternalChat,
    PROVIDER_CONFIGS,
  } from "../";
  import ChatList from "./ChatList.svelte";
  import ChatView from "./ChatView.svelte";
  import ConnectProvider from "./ConnectProvider.svelte";
  import RelativeTime from "$lib/components/RelativeTime.svelte";

  let view: "inbox" | "chat" | "connect" = $state("inbox");
  let loading = $state(true);

  onMount(async () => {
    await Promise.all([
      providers.load(),
      connections.load(),
      inbox.load(),
    ]);
    loading = false;
  });

  function openChat(chat: ExternalChat & { connectionId: string }) {
    selectedChatId.set(chat.id);
    view = "chat";
  }

  function backToInbox() {
    selectedChatId.set(null);
    view = "inbox";
  }

  function openConnect() {
    view = "connect";
  }

  // Get connected providers count
  const connectedCount = $derived(
    $connections.filter((c) => c.status === "connected").length
  );
</script>

<div class="flex flex-col h-full bg-white dark:bg-gray-900">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
    {#if view === "chat" && $selectedChat}
      <button
        onclick={backToInbox}
        class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="flex items-center gap-2 flex-1 ml-2">
        <span class="text-lg">{PROVIDER_CONFIGS[$selectedChat.provider]?.icon || "💬"}</span>
        <div class="min-w-0">
          <h2 class="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
            {$selectedChat.name}
          </h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {$selectedChat.provider}
          </p>
        </div>
      </div>
    {:else if view === "connect"}
      <button
        onclick={backToInbox}
        class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 class="font-semibold text-gray-900 dark:text-gray-100 ml-2">
        Connect Channel
      </h2>
    {:else}
      <div class="flex items-center gap-2">
        <span class="text-lg">📬</span>
        <h2 class="font-semibold text-gray-900 dark:text-gray-100">
          Inbox
        </h2>
        {#if $totalUnreadCount > 0}
          <span class="px-1.5 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-full">
            {$totalUnreadCount}
          </span>
        {/if}
      </div>
      <button
        onclick={openConnect}
        class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
        title="Connect a channel"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden">
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    {:else if view === "connect"}
      <ConnectProvider onBack={backToInbox} />
    {:else if view === "chat" && $selectedChat}
      <ChatView chat={$selectedChat} onBack={backToInbox} />
    {:else}
      <!-- Inbox View -->
      {#if $connections.length === 0}
        <div class="flex flex-col items-center justify-center h-full px-4 text-center">
          <div class="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
            <span class="text-3xl">📱</span>
          </div>
          <h3 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
            No Channels Connected
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Connect WhatsApp, Telegram, or other messaging apps to chat with Navi from anywhere.
          </p>
          <button
            onclick={openConnect}
            class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Connect Channel
          </button>
        </div>
      {:else}
        <!-- Connected channels bar -->
        <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex gap-2 overflow-x-auto">
          {#each $connections as connection}
            <div
              class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs
                {connection.status === 'connected'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : connection.status === 'error'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}"
            >
              <span>{PROVIDER_CONFIGS[connection.provider]?.icon || "💬"}</span>
              <span class="capitalize">{connection.provider}</span>
              {#if connection.status === "connected"}
                <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              {:else if connection.status === "connecting"}
                <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
              {:else if connection.status === "error"}
                <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Chat list -->
        <ChatList chats={$inbox} onSelect={openChat} />
      {/if}
    {/if}
  </div>
</div>
