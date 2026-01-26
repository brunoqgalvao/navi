<script lang="ts">
  /**
   * Connect Provider
   *
   * UI for connecting new messaging channels (WhatsApp, Telegram, etc.)
   */
  import { onMount } from "svelte";
  import {
    providers,
    connections,
    type ChannelProvider,
    type ChannelProviderType,
    PROVIDER_CONFIGS,
  } from "../";

  interface Props {
    onBack: () => void;
  }

  let { onBack }: Props = $props();

  let connecting = $state<ChannelProviderType | null>(null);
  let error = $state<string | null>(null);

  async function connect(provider: ChannelProvider) {
    connecting = provider.type;
    error = null;

    try {
      // Create the connection in the backend
      const connection = await connections.add(provider.type);

      // For WhatsApp, we need to tell the user to scan the QR code
      // that appears in the terminal where the MCP server is running
      if (provider.type === "whatsapp") {
        await connections.updateStatus(connection.id, {
          status: "connecting",
        });

        // Show instructions
        error = null;
        alert(
          "WhatsApp QR Code\n\n" +
          "A QR code has been displayed in your terminal.\n\n" +
          "1. Open WhatsApp on your phone\n" +
          "2. Go to Settings > Linked Devices > Link a Device\n" +
          "3. Scan the QR code in the terminal\n\n" +
          "After scanning, refresh to check connection status."
        );
      }

      // For other providers, show appropriate setup flow
      // (to be implemented per provider)

      onBack();
    } catch (e: any) {
      error = e.message || "Failed to connect";
    } finally {
      connecting = null;
    }
  }

  // Check if provider is already connected
  function isConnected(type: ChannelProviderType): boolean {
    return $connections.some(
      (c) => c.provider === type && c.status === "connected"
    );
  }

  // Check if provider has a pending connection
  function isPending(type: ChannelProviderType): boolean {
    return $connections.some(
      (c) => c.provider === type && c.status === "connecting"
    );
  }
</script>

<div class="p-4 space-y-4">
  {#if error}
    <div class="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm rounded-lg">
      {error}
    </div>
  {/if}

  <p class="text-sm text-gray-600 dark:text-gray-400">
    Connect a messaging channel to chat with Navi from your phone or other devices.
  </p>

  <div class="space-y-3">
    {#each $providers as provider}
      {@const connected = isConnected(provider.type)}
      {@const pending = isPending(provider.type)}
      <button
        onclick={() => connect(provider)}
        disabled={connecting !== null || connected}
        class="w-full p-4 rounded-xl border-2 transition-all text-left
          {connected
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
            : pending
              ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'}
          {connecting === provider.type ? 'opacity-50 cursor-wait' : ''}"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style="background-color: {PROVIDER_CONFIGS[provider.type]?.color}20"
          >
            {provider.icon}
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-gray-900 dark:text-gray-100">
                {provider.name}
              </span>
              {#if connected}
                <span class="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded-full">
                  Connected
                </span>
              {:else if pending}
                <span class="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 rounded-full animate-pulse">
                  Connecting...
                </span>
              {/if}
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {provider.description}
            </p>
          </div>
          {#if !connected && !pending}
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          {:else if connected}
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          {/if}
        </div>

        <!-- Capabilities -->
        {#if !connected}
          <div class="mt-3 flex flex-wrap gap-1.5">
            {#each provider.capabilities.slice(0, 4) as cap}
              <span class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                {cap.replace(/_/g, " ")}
              </span>
            {/each}
            {#if provider.capabilities.length > 4}
              <span class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                +{provider.capabilities.length - 4} more
              </span>
            {/if}
          </div>
        {/if}
      </button>
    {/each}
  </div>

  <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
    <p class="text-xs text-gray-500 dark:text-gray-400">
      <strong>Privacy note:</strong> Messages are processed locally and stored on your device.
      No data is sent to external servers beyond the messaging platform's own infrastructure.
    </p>
  </div>
</div>
