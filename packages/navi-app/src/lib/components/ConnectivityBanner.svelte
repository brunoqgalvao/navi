<script lang="ts">
  import { connectionStatus, checkConnectivity, type ConnectionStatus } from "$lib/stores";
  import { slide } from "svelte/transition";

  let checking = $state(false);

  const statusConfig: Record<ConnectionStatus, { message: string; icon: string; color: string; textColor: string }> = {
    online: { message: "", icon: "", color: "", textColor: "" },
    offline: {
      message: "No internet connection",
      icon: "wifi-off",
      color: "bg-red-100 border-b border-red-200",
      textColor: "text-red-700",
    },
    "server-down": {
      message: "Can't reach Navi server",
      icon: "server-off",
      color: "bg-amber-100 border-b border-amber-200",
      textColor: "text-amber-700",
    },
    checking: {
      message: "Checking connection...",
      icon: "loader",
      color: "bg-gray-100 border-b border-gray-200",
      textColor: "text-gray-600",
    },
  };

  const status = $derived($connectionStatus);
  const config = $derived(statusConfig[status]);
  const show = $derived(status !== "online");

  async function retry() {
    checking = true;
    await checkConnectivity();
    checking = false;
  }
</script>

{#if show}
  <div
    class="fixed top-0 left-0 right-0 z-50 {config.color} {config.textColor} px-4 py-2 flex items-center justify-center gap-3 text-sm"
    transition:slide={{ duration: 200 }}
  >
    <div class="flex items-center gap-2">
      {#if config.icon === "wifi-off"}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      {:else if config.icon === "server-off"}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
          />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18" />
        </svg>
      {:else if config.icon === "loader"}
        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      {/if}
      <span class="font-medium">{config.message}</span>
    </div>

    {#if status !== "checking"}
      <button
        onclick={retry}
        disabled={checking}
        class="px-3 py-1 bg-black/10 hover:bg-black/15 rounded text-xs font-medium transition-colors disabled:opacity-50"
      >
        {#if checking}
          Checking...
        {:else}
          Retry
        {/if}
      </button>
    {/if}
  </div>
{/if}
