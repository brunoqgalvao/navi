<script lang="ts">
  import { onMount } from "svelte";
  import { getServerUrl } from "../api";

  // Types matching server definitions
  type IntegrationProvider = "google" | "github" | "notion" | "slack";
  type IntegrationService = "gmail" | "sheets" | "drive" | "calendar" | "repos" | "issues" | "prs" | "pages" | "databases" | "channels" | "messages";

  interface ServiceInfo {
    id: IntegrationService;
    name: string;
    description: string;
    icon: string;
  }

  interface ProviderInfo {
    id: IntegrationProvider;
    name: string;
    icon: string;
    services: ServiceInfo[];
    hasCredentials: boolean;
  }

  interface Integration {
    id: string;
    provider: IntegrationProvider;
    account_id: string;
    account_label: string;
    services: IntegrationService[];
    scopes: string[];
    expires_at?: number;
    has_refresh_token: boolean;
    created_at: number;
    updated_at: number;
    last_used_at?: number;
  }

  let providers = $state<ProviderInfo[]>([]);
  let integrations = $state<Integration[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Connect flow
  let connectingProvider = $state<IntegrationProvider | null>(null);

  const API_BASE = () => getServerUrl();

  async function loadData() {
    loading = true;
    error = null;
    try {
      const [providersRes, integrationsRes] = await Promise.all([
        fetch(`${API_BASE()}/api/integrations/providers`),
        fetch(`${API_BASE()}/api/integrations`),
      ]);

      if (!providersRes.ok || !integrationsRes.ok) {
        throw new Error("Failed to load integrations data");
      }

      providers = await providersRes.json();
      integrations = await integrationsRes.json();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading = false;
    }
  }

  async function startConnect(provider: IntegrationProvider, services?: IntegrationService[]) {
    connectingProvider = provider;
    const servicesToConnect = services || providers.find(p => p.id === provider)?.services.map(s => s.id) || [];

    try {
      const res = await fetch(
        `${API_BASE()}/api/integrations/oauth/start?provider=${provider}&services=${servicesToConnect.join(",")}`
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to start OAuth flow");
      }

      const { authUrl } = await res.json();
      const popup = window.open(authUrl, "oauth-popup", "width=600,height=700");

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "oauth-callback") {
          window.removeEventListener("message", handleMessage);
          connectingProvider = null;
          loadData();
        }
      };
      window.addEventListener("message", handleMessage);

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          connectingProvider = null;
        }
      }, 500);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to start connection";
      connectingProvider = null;
    }
  }

  async function disconnectIntegration(id: string) {
    if (!confirm("Disconnect this integration? You'll need to reconnect to use it again.")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE()}/api/integrations/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to disconnect");
      await loadData();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to disconnect";
    }
  }

  function getProviderIcon(provider: IntegrationProvider): string {
    const icons: Record<IntegrationProvider, string> = {
      google: "M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z",
      github: "M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z",
      notion: "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.046-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.448-1.632z",
      slack: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
    };
    return icons[provider];
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  function getProviderColor(provider: IntegrationProvider): string {
    const colors: Record<IntegrationProvider, string> = {
      google: "text-blue-600 dark:text-blue-400",
      github: "text-gray-900 dark:text-gray-100",
      notion: "text-gray-900 dark:text-gray-100",
      slack: "text-purple-600 dark:text-purple-400",
    };
    return colors[provider];
  }

  // Compute connected vs available providers
  let connectedProviders = $derived(
    providers.filter(p => integrations.some(i => i.provider === p.id))
  );

  let availableProviders = $derived(
    providers.filter(p => !integrations.some(i => i.provider === p.id))
  );

  onMount(loadData);
</script>

<div class="space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <svg class="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  {:else if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400 flex items-center justify-between">
      <span>{error}</span>
      <button class="text-red-600 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline text-sm" onclick={() => loadData()}>Retry</button>
    </div>
  {:else}
    <!-- Connected Accounts Section -->
    {#if connectedProviders.length > 0}
      <section>
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Connected</h3>
        <div class="space-y-3">
          {#each integrations as integration}
            {@const provider = providers.find(p => p.id === integration.provider)}
            {#if provider}
              <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-start gap-4">
                  <!-- Provider Icon -->
                  <div class="shrink-0 w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <svg class="w-5 h-5 {getProviderColor(integration.provider)}" viewBox="0 0 24 24" fill="currentColor">
                      <path d={getProviderIcon(integration.provider)} />
                    </svg>
                  </div>

                  <!-- Account Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900 dark:text-gray-100">{integration.account_label}</span>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Connected
                      </span>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{integration.account_id}</p>

                    <!-- Services as pills -->
                    <div class="flex flex-wrap gap-1.5 mt-3">
                      {#each integration.services as service}
                        <span class="px-2 py-1 rounded-md text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 capitalize">
                          {service}
                        </span>
                      {/each}
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="shrink-0 flex items-center gap-2">
                    {#if integration.last_used_at}
                      <span class="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                        Used {formatDate(integration.last_used_at)}
                      </span>
                    {/if}
                    <button
                      class="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Disconnect"
                      onclick={() => disconnectIntegration(integration.id)}
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </section>
    {/if}

    <!-- Available Providers Section -->
    {#if availableProviders.length > 0}
      <section>
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          {connectedProviders.length > 0 ? "Available" : "Connect a Service"}
        </h3>
        <div class="space-y-3">
          {#each availableProviders as provider}
            <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <div class="shrink-0 w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <svg class="w-5 h-5 {getProviderColor(provider.id)}" viewBox="0 0 24 24" fill="currentColor">
                      <path d={getProviderIcon(provider.id)} />
                    </svg>
                  </div>
                  <div>
                    <span class="font-medium text-gray-900 dark:text-gray-100">{provider.name}</span>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {provider.services.map(s => s.name).join(" · ")}
                    </p>
                  </div>
                </div>

                {#if provider.hasCredentials}
                  <button
                    class="px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    disabled={connectingProvider === provider.id}
                    onclick={() => startConnect(provider.id)}
                  >
                    {#if connectingProvider === provider.id}
                      <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Connecting...</span>
                    {:else}
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span>Connect</span>
                    {/if}
                  </button>
                {:else}
                  <span class="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-full">
                    Coming Soon
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Empty State -->
    {#if providers.length === 0}
      <div class="text-center py-12">
        <div class="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <svg class="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <p class="text-gray-500 dark:text-gray-400">No integrations available</p>
      </div>
    {/if}

    <!-- Usage Hint -->
    {#if integrations.length > 0}
      <section class="border-t border-gray-200 dark:border-gray-700 pt-5">
        <div class="flex items-start gap-3 text-sm">
          <div class="shrink-0 w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-gray-700 dark:text-gray-300 font-medium">How to use integrations</p>
            <p class="text-gray-500 dark:text-gray-400 mt-1">
              Agents can access your connected services using the <code class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs border border-gray-200 dark:border-gray-700">integrations</code> skill.
              Try asking: "Read my latest emails" or "List my Google Drive files".
            </p>
          </div>
        </div>
      </section>
    {/if}
  {/if}
</div>

