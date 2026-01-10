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

  // OAuth credentials setup
  let showCredentialsSetup = $state(false);
  let setupProvider = $state<IntegrationProvider | null>(null);
  let clientIdInput = $state("");
  let clientSecretInput = $state("");
  let savingCredentials = $state(false);

  // Connect flow
  let connectingProvider = $state<IntegrationProvider | null>(null);
  let selectedServices = $state<IntegrationService[]>([]);

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

  async function saveCredentials() {
    if (!setupProvider || !clientIdInput || !clientSecretInput) return;

    savingCredentials = true;
    try {
      const res = await fetch(`${API_BASE()}/api/integrations/credentials/${setupProvider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientIdInput,
          clientSecret: clientSecretInput,
        }),
      });

      if (!res.ok) throw new Error("Failed to save credentials");

      // Refresh providers to update hasCredentials
      await loadData();
      showCredentialsSetup = false;
      setupProvider = null;
      clientIdInput = "";
      clientSecretInput = "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save credentials";
    } finally {
      savingCredentials = false;
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

      // Open OAuth popup
      const popup = window.open(authUrl, "oauth-popup", "width=600,height=700");

      // Listen for OAuth callback
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "oauth-callback") {
          window.removeEventListener("message", handleMessage);
          connectingProvider = null;
          loadData(); // Refresh integrations
        }
      };
      window.addEventListener("message", handleMessage);

      // Also poll for popup close (user cancelled)
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

  function getServiceIcon(service: IntegrationService): string {
    const icons: Record<IntegrationService, string> = {
      gmail: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
      sheets: "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
      drive: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
      calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      repos: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
      issues: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      prs: "M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4",
      pages: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      databases: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
      channels: "M7 20l4-16m2 16l4-16M6 9h14M4 15h14",
      messages: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
    };
    return icons[service] || "M12 6v6m0 0v6m0-6h6m-6 0H6";
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  onMount(loadData);
</script>

<div class="space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
    </div>
  {:else if error}
    <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
      {error}
      <button class="ml-2 underline" onclick={() => loadData()}>Retry</button>
    </div>
  {:else}
    <!-- Connected Integrations -->
    {#if integrations.length > 0}
      <div>
        <h3 class="text-lg font-medium text-zinc-100 mb-3">Connected Accounts</h3>
        <div class="space-y-3">
          {#each integrations as integration}
            <div class="bg-zinc-800/50 rounded-lg p-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <svg class="w-8 h-8 text-zinc-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d={getProviderIcon(integration.provider)} />
                </svg>
                <div>
                  <div class="text-zinc-100 font-medium">{integration.account_label}</div>
                  <div class="text-zinc-400 text-sm">
                    {integration.account_id} · {integration.services.join(", ")}
                  </div>
                  {#if integration.last_used_at}
                    <div class="text-zinc-500 text-xs">Last used: {formatDate(integration.last_used_at)}</div>
                  {/if}
                </div>
              </div>
              <button
                class="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
                onclick={() => disconnectIntegration(integration.id)}
              >
                Disconnect
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Available Providers -->
    <div>
      <h3 class="text-lg font-medium text-zinc-100 mb-3">
        {integrations.length > 0 ? "Add More Connections" : "Connect Services"}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each providers as provider}
          {@const existingIntegration = integrations.find(i => i.provider === provider.id)}
          <div class="bg-zinc-800/50 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <svg class="w-6 h-6 text-zinc-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d={getProviderIcon(provider.id)} />
                </svg>
                <span class="font-medium text-zinc-100">{provider.name}</span>
              </div>
              {#if !provider.hasCredentials}
                <button
                  class="text-xs text-accent-400 hover:text-accent-300"
                  onclick={() => { setupProvider = provider.id; showCredentialsSetup = true; }}
                >
                  Configure
                </button>
              {/if}
            </div>

            <div class="space-y-2 mb-4">
              {#each provider.services as service}
                {@const isConnected = existingIntegration?.services.includes(service.id)}
                <div class="flex items-center gap-2 text-sm">
                  <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getServiceIcon(service.id)} />
                  </svg>
                  <span class={isConnected ? "text-green-400" : "text-zinc-400"}>{service.name}</span>
                  {#if isConnected}
                    <span class="text-xs text-green-500">Connected</span>
                  {/if}
                </div>
              {/each}
            </div>

            {#if provider.hasCredentials}
              <button
                class="w-full py-2 px-3 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={connectingProvider === provider.id}
                onclick={() => startConnect(provider.id)}
              >
                {#if connectingProvider === provider.id}
                  <span class="flex items-center justify-center gap-2">
                    <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </span>
                {:else if existingIntegration}
                  Add More Services
                {:else}
                  Connect {provider.name}
                {/if}
              </button>
            {:else}
              <div class="text-center text-zinc-500 text-sm py-2">
                OAuth credentials required. <button class="text-accent-400 underline" onclick={() => { setupProvider = provider.id; showCredentialsSetup = true; }}>Set up</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- CLI Usage Info -->
    <div class="bg-zinc-800/30 rounded-lg p-4 mt-6">
      <h4 class="text-zinc-200 font-medium mb-2">CLI Access for Agents</h4>
      <p class="text-zinc-400 text-sm mb-3">
        Connected integrations can be accessed by Claude agents via the CLI:
      </p>
      <div class="bg-zinc-900 rounded p-3 font-mono text-sm text-zinc-300 overflow-x-auto">
        <div class="text-zinc-500"># List connected integrations</div>
        <div>navi-integrations list</div>
        <br />
        <div class="text-zinc-500"># Access Gmail</div>
        <div>navi-integrations gmail list</div>
        <div>navi-integrations gmail search "from:important"</div>
        <br />
        <div class="text-zinc-500"># Access Google Sheets</div>
        <div>navi-integrations sheets list</div>
        <div>navi-integrations sheets read &lt;spreadsheet-id&gt;</div>
      </div>
    </div>
  {/if}
</div>

<!-- Credentials Setup Modal -->
{#if showCredentialsSetup && setupProvider}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={() => showCredentialsSetup = false}>
    <div class="bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-lg font-medium text-zinc-100 mb-4">
        Configure {providers.find(p => p.id === setupProvider)?.name} OAuth
      </h3>

      <p class="text-zinc-400 text-sm mb-4">
        {#if setupProvider === "google"}
          Create OAuth credentials in the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="text-accent-400 underline">Google Cloud Console</a>.
          Enable the Gmail, Sheets, Drive, and Calendar APIs.
        {:else if setupProvider === "github"}
          Create an OAuth App in <a href="https://github.com/settings/developers" target="_blank" class="text-accent-400 underline">GitHub Developer Settings</a>.
        {:else}
          Set up OAuth credentials for {setupProvider}.
        {/if}
      </p>

      <div class="space-y-4">
        <div>
          <label class="block text-sm text-zinc-400 mb-1">Client ID</label>
          <input
            type="text"
            bind:value={clientIdInput}
            class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-accent-500"
            placeholder="Your OAuth client ID"
          />
        </div>

        <div>
          <label class="block text-sm text-zinc-400 mb-1">Client Secret</label>
          <input
            type="password"
            bind:value={clientSecretInput}
            class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-accent-500"
            placeholder="Your OAuth client secret"
          />
        </div>

        <div class="bg-zinc-800/50 rounded-lg p-3">
          <div class="text-sm text-zinc-400">
            <strong class="text-zinc-300">Redirect URI:</strong>
            <code class="ml-2 text-accent-400">{`${getServerUrl()}/api/integrations/oauth/callback`}</code>
          </div>
          <p class="text-xs text-zinc-500 mt-1">Add this to your OAuth app's allowed redirect URIs</p>
        </div>
      </div>

      <div class="flex justify-end gap-3 mt-6">
        <button
          class="px-4 py-2 text-zinc-400 hover:text-zinc-200"
          onclick={() => { showCredentialsSetup = false; setupProvider = null; }}
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg disabled:opacity-50"
          disabled={!clientIdInput || !clientSecretInput || savingCredentials}
          onclick={saveCredentials}
        >
          {savingCredentials ? "Saving..." : "Save Credentials"}
        </button>
      </div>
    </div>
  </div>
{/if}
