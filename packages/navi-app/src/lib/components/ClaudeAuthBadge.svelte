<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "../api";
  import { resourceMonitorEnabled } from "../stores";

  type ClaudeAuthStatus = {
    authMethod: "oauth" | "api_key" | null;
    hasOAuth: boolean;
  };

  const PROVIDER_AUTH_EVENT = "navi:provider-auth-updated";
  const REFRESH_INTERVAL_MS = 30000;

  let authStatus = $state<ClaudeAuthStatus | null>(null);
  let loaded = $state(false);

  async function refreshStatus() {
    try {
      const auth = await api.auth.status();
      authStatus = {
        authMethod: auth.authMethod,
        hasOAuth: auth.hasOAuth,
      };
    } catch {
      authStatus = null;
    } finally {
      loaded = true;
    }
  }

  function handleFocus() {
    refreshStatus();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      refreshStatus();
    }
  }

  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    refreshStatus();

    window.addEventListener(PROVIDER_AUTH_EVENT, handleFocus);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    refreshTimer = setInterval(refreshStatus, REFRESH_INTERVAL_MS);
  });

  onDestroy(() => {
    window.removeEventListener(PROVIDER_AUTH_EVENT, handleFocus);
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (refreshTimer) clearInterval(refreshTimer);
  });

  const showBadge = $derived(loaded && authStatus?.authMethod === "api_key");
  const subtitle = $derived(
    authStatus?.hasOAuth
      ? "Claude login is available, but billing is currently coming from your API key."
      : "Claude usage is currently billed directly to your Anthropic API key."
  );
</script>

{#if showBadge}
  <div class={`pointer-events-auto ${$resourceMonitorEnabled ? "mb-16" : ""}`}>
    <div class="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-white/95 px-4 py-3 shadow-xl shadow-amber-500/10 backdrop-blur">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 shadow-sm">
        <svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-7.938 4h15.876c1.45 0 2.354-1.57 1.627-2.823L13.627 4.823c-.725-1.252-2.53-1.252-3.255 0L2.435 16.177C1.708 17.43 2.612 19 4.062 19z" />
        </svg>
      </div>

      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700">API Key Active</span>
          <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Billing Alert</span>
        </div>
        <p class="mt-0.5 text-sm font-medium text-gray-900">Claude is using your Anthropic API key</p>
        <p class="mt-1 max-w-xs text-xs leading-relaxed text-gray-600">{subtitle}</p>
      </div>
    </div>
  </div>
{/if}
