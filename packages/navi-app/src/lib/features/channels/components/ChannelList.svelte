<script lang="ts">
  import { onMount } from "svelte";
  import { channels, currentChannelId, type Channel } from "../";

  interface Props {
    onSelectChannel?: (channel: Channel) => void;
    onCreateChannel?: () => void;
  }

  let { onSelectChannel, onCreateChannel }: Props = $props();

  onMount(() => {
    channels.load();
  });

  function handleSelect(channel: Channel) {
    currentChannelId.set(channel.id);
    onSelectChannel?.(channel);
  }
</script>

<div class="flex flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2">
    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
      Channels
    </span>
    <button
      onclick={onCreateChannel}
      class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
      title="Create channel"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>

  <!-- Channel List -->
  <div class="space-y-0.5 px-2">
    {#each $channels as channel}
      <button
        onclick={() => handleSelect(channel)}
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors
          {$currentChannelId === channel.id
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
      >
        <span class="text-gray-400 dark:text-gray-500">#</span>
        <span class="truncate text-sm">{channel.name}</span>
      </button>
    {/each}

    {#if $channels.length === 0}
      <div class="px-2 py-4 text-center">
        <p class="text-sm text-gray-500 dark:text-gray-400">No channels yet</p>
        <button
          onclick={onCreateChannel}
          class="mt-2 text-sm text-purple-600 dark:text-purple-400 hover:underline"
        >
          Create your first channel
        </button>
      </div>
    {/if}
  </div>
</div>
