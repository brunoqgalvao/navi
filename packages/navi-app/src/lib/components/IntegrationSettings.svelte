<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getServerUrl } from "../api";
  import { currentProject } from "../stores";
  import Modal from "./Modal.svelte";

  // Track active OAuth polling intervals for cleanup
  let activePollingIntervals: NodeJS.Timeout[] = [];

  // Props
  interface Props {
    projectId?: string | null;  // Optional project ID for project-scoped credentials
  }
  let { projectId = null }: Props = $props();

  // Use currentProject if projectId not provided
  let effectiveProjectId = $derived(projectId ?? $currentProject?.id ?? null);

  // Types matching server definitions
  type IntegrationProvider = "google" | "github" | "notion" | "slack" | "linear";
  type IntegrationService = "gmail" | "sheets" | "drive" | "calendar" | "repos" | "issues" | "prs" | "pages" | "databases" | "channels" | "messages";
  type CredentialFieldType = "text" | "password" | "oauth";
  type CredentialScopeType = "user" | "project" | null;

  interface CredentialField {
    key: string;
    label: string;
    type: CredentialFieldType;
    placeholder?: string;
    helpUrl?: string;
    helpText?: string;
    required?: boolean;
  }

  interface CredentialStatus {
    key: string;
    label: string;
    type: CredentialFieldType;
    required: boolean;
    isSet: boolean;
    scope?: CredentialScopeType;
    hasUserLevel?: boolean;
    hasProjectLevel?: boolean;
  }

  interface ServiceInfo {
    id: IntegrationService;
    name: string;
    description: string;
    icon: string;
  }

  interface SetupGuide {
    description: string;
    steps: string[];
    capabilities: string[];
    examplePrompts?: string[];
  }

  interface ProviderInfo {
    id: IntegrationProvider;
    name: string;
    icon: string;
    color: string;
    credentials: CredentialField[];
    credentialStatus?: CredentialStatus[];
    hasCredentials?: boolean;
    hasUserCredentials?: boolean;
    hasProjectCredentials?: boolean;
    isOAuth?: boolean;
    isCredentialless?: boolean;
    services?: ServiceInfo[];
    setupGuide?: SetupGuide;
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

  // Unified status from the new API
  interface UnifiedStatus {
    provider: string;
    name: string;
    connected: boolean;
    enabled: boolean;
    enabledGlobal: boolean;
    enabledProject: boolean | null;
    health: "healthy" | "degraded" | "failed" | "unknown";
    lastError: string | null;
    errorCount: number;
    authType: "oauth" | "api_key" | "credentialless";
  }

  // State
  let oauthProviders = $state<ProviderInfo[]>([]);
  let credentialProviders = $state<ProviderInfo[]>([]);
  let integrations = $state<Integration[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let statusMap = $state<Map<string, UnifiedStatus>>(new Map());

  // Connect flow
  let connectingProvider = $state<IntegrationProvider | null>(null);

  // Credential modal state (for API key providers)
  let credentialModalOpen = $state(false);
  let selectedProvider = $state<ProviderInfo | null>(null);
  let credentialValues = $state<Record<string, string>>({});
  let testingCredentials = $state(false);
  let savingCredentials = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let saveForProjectOnly = $state(false);  // Toggle for project-scoped credentials

  // OAuth App Configuration modal state (for OAuth providers like Google)
  let oauthConfigModalOpen = $state(false);
  let selectedOAuthProvider = $state<ProviderInfo | null>(null);
  let oauthClientId = $state("");
  let oauthClientSecret = $state("");
  let savingOAuthConfig = $state(false);
  let oauthConfigError = $state<string | null>(null);

  const API_BASE = () => getServerUrl();

  // Build URL with optional projectId query param
  function buildUrl(path: string, includeProjectId = true): string {
    const base = `${API_BASE()}${path}`;
    if (includeProjectId && effectiveProjectId) {
      return `${base}${path.includes('?') ? '&' : '?'}projectId=${effectiveProjectId}`;
    }
    return base;
  }

  async function loadData() {
    loading = true;
    error = null;
    try {
      const [oauthRes, credRes, integrationsRes, statusRes] = await Promise.all([
        fetch(`${API_BASE()}/api/integrations/providers`),
        fetch(buildUrl("/api/credentials/providers")),  // Include project context
        fetch(`${API_BASE()}/api/integrations`),
        fetch(buildUrl("/api/integrations/status")),  // Load unified status
      ]);

      if (!oauthRes.ok || !credRes.ok || !integrationsRes.ok || !statusRes.ok) {
        throw new Error("Failed to load integrations data");
      }

      const oauthData = await oauthRes.json();
      const credData = await credRes.json();
      const statusData = await statusRes.json();

      // Split providers by type
      oauthProviders = oauthData.filter((p: ProviderInfo) => p.isOAuth && !p.isCredentialless);
      credentialProviders = credData.filter((p: ProviderInfo) => !p.isOAuth && !p.isCredentialless);

      integrations = await integrationsRes.json();

      // Build status map
      const newStatusMap = new Map<string, UnifiedStatus>();
      if (statusData.integrations) {
        for (const status of statusData.integrations) {
          newStatusMap.set(status.provider, status);
        }
      }
      statusMap = newStatusMap;
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading = false;
    }
  }

  async function startOAuthConnect(provider: IntegrationProvider, services?: IntegrationService[]) {
    connectingProvider = provider;
    const servicesToConnect = services || oauthProviders.find(p => p.id === provider)?.services?.map(s => s.id) || [];

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
          clearInterval(checkClosed);
          // Remove from tracking
          activePollingIntervals = activePollingIntervals.filter(i => i !== checkClosed);
          connectingProvider = null;
          loadData();
        }
      };
      window.addEventListener("message", handleMessage);

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          // Remove from tracking
          activePollingIntervals = activePollingIntervals.filter(i => i !== checkClosed);
          connectingProvider = null;
        }
      }, 500);

      // Track this interval for cleanup on unmount
      activePollingIntervals.push(checkClosed);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to start connection";
      connectingProvider = null;
    }
  }

  async function openCredentialModal(provider: ProviderInfo) {
    selectedProvider = provider;
    credentialValues = {};
    testResult = null;
    // Default to project-scoped if in a project context and no user creds exist yet
    saveForProjectOnly = effectiveProjectId !== null && !provider.hasUserCredentials;

    // Pre-fill with existing credentials (values won't be shown, just mark as set)
    if (provider.credentialStatus) {
      provider.credentialStatus.forEach(status => {
        if (status.isSet) {
          credentialValues[status.key] = ""; // Don't show actual values
        }
      });
    }

    credentialModalOpen = true;
  }

  function closeCredentialModal() {
    credentialModalOpen = false;
    selectedProvider = null;
    credentialValues = {};
    testResult = null;
    saveForProjectOnly = false;
  }

  async function saveCredentials() {
    if (!selectedProvider) return;

    savingCredentials = true;
    testResult = null;

    try {
      // Filter out empty values
      const credentialsToSave = Object.fromEntries(
        Object.entries(credentialValues).filter(([_, v]) => v && v.trim())
      );

      if (Object.keys(credentialsToSave).length === 0) {
        testResult = { success: false, message: "Please enter at least one credential" };
        return;
      }

      // Build URL with projectId if saving for project only
      const url = saveForProjectOnly && effectiveProjectId
        ? `${API_BASE()}/api/credentials/${selectedProvider.id}?projectId=${effectiveProjectId}`
        : `${API_BASE()}/api/credentials/${selectedProvider.id}`;

      // First save the credentials
      const saveRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials: credentialsToSave,
          scope: saveForProjectOnly ? "project" : "user"
        }),
      });

      if (!saveRes.ok) {
        const data = await saveRes.json();
        throw new Error(data.error || "Failed to save credentials");
      }

      // Auto-test after saving (skip for OAuth providers)
      if (!selectedProvider.isOAuth) {
        const testUrl = saveForProjectOnly && effectiveProjectId
          ? `${API_BASE()}/api/credentials/${selectedProvider.id}/test?projectId=${effectiveProjectId}`
          : `${API_BASE()}/api/credentials/${selectedProvider.id}/test`;

        const testRes = await fetch(testUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const testData = await testRes.json();

        if (!testRes.ok || !testData.success) {
          // Credentials saved but test failed - show warning but don't block
          testResult = {
            success: false,
            message: `Saved, but test failed: ${testData.error || testData.message || "Connection test failed"}. You may need to check the credentials.`
          };
          await loadData();
          return; // Don't close modal so user can see the warning
        }

        testResult = { success: true, message: testData.message || "Connected successfully!" };
      }

      await loadData();
      closeCredentialModal();
    } catch (e) {
      testResult = {
        success: false,
        message: e instanceof Error ? e.message : "Failed to save credentials"
      };
    } finally {
      savingCredentials = false;
    }
  }

  // Open a chat session to help with integration setup
  async function openSetupHelp(provider: ProviderInfo) {
    closeCredentialModal();
    // Dispatch event to open a new chat with the integration setup context
    const event = new CustomEvent("open-setup-chat", {
      detail: {
        providerId: provider.id,
        providerName: provider.name,
        setupGuide: (provider as any).setupGuide,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  async function testCredentials() {
    if (!selectedProvider) return;

    testingCredentials = true;
    testResult = null;

    try {
      // Include project context for testing
      const res = await fetch(buildUrl(`/api/credentials/${selectedProvider.id}/test`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (res.ok) {
        testResult = { success: true, message: data.message };
      } else {
        testResult = { success: false, message: data.error || "Test failed" };
      }
    } catch (e) {
      testResult = {
        success: false,
        message: e instanceof Error ? e.message : "Failed to test credentials"
      };
    } finally {
      testingCredentials = false;
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

  async function disconnectCredentials(provider: IntegrationProvider) {
    if (!confirm(`Disconnect ${provider}? All stored credentials will be deleted.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE()}/api/credentials/${provider}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to disconnect");
      await loadData();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to disconnect";
    }
  }

  async function toggleIntegration(providerId: string, enabled: boolean, scope: "global" | "project") {
    try {
      const url = scope === "project" && effectiveProjectId
        ? `${API_BASE()}/api/integrations/${providerId}/${enabled ? "enable" : "disable"}?projectId=${effectiveProjectId}`
        : `${API_BASE()}/api/integrations/${providerId}/${enabled ? "enable" : "disable"}`;

      const res = await fetch(url, { method: "POST" });

      if (!res.ok) throw new Error(`Failed to ${enabled ? "enable" : "disable"} integration`);
      await loadData();
    } catch (e) {
      error = e instanceof Error ? e.message : `Failed to ${enabled ? "enable" : "disable"} integration`;
    }
  }

  // Helper to get health status color and icon
  function getHealthIndicator(status: UnifiedStatus): { color: string; bgColor: string; tooltip: string } {
    if (status.errorCount === 0) {
      return {
        color: "bg-green-500",
        bgColor: "bg-green-100 dark:bg-green-900/30",
        tooltip: "Healthy"
      };
    } else if (status.errorCount < 3) {
      return {
        color: "bg-yellow-500",
        bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
        tooltip: `Degraded (${status.errorCount} error${status.errorCount > 1 ? 's' : ''})`
      };
    } else {
      return {
        color: "bg-red-500",
        bgColor: "bg-red-100 dark:bg-red-900/30",
        tooltip: `Failed (${status.errorCount} errors)`
      };
    }
  }

  // OAuth App Configuration functions
  function openOAuthConfigModal(provider: ProviderInfo) {
    selectedOAuthProvider = provider;
    oauthClientId = "";
    oauthClientSecret = "";
    oauthConfigError = null;
    oauthConfigModalOpen = true;
  }

  function closeOAuthConfigModal() {
    oauthConfigModalOpen = false;
    selectedOAuthProvider = null;
    oauthClientId = "";
    oauthClientSecret = "";
    oauthConfigError = null;
  }

  async function saveOAuthConfig() {
    if (!selectedOAuthProvider) return;
    if (!oauthClientId.trim() || !oauthClientSecret.trim()) {
      oauthConfigError = "Both Client ID and Client Secret are required";
      return;
    }

    savingOAuthConfig = true;
    oauthConfigError = null;

    try {
      const res = await fetch(`${API_BASE()}/api/integrations/credentials/${selectedOAuthProvider.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: oauthClientId.trim(),
          clientSecret: oauthClientSecret.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save OAuth credentials");
      }

      await loadData();
      closeOAuthConfigModal();
    } catch (e) {
      oauthConfigError = e instanceof Error ? e.message : "Failed to save";
    } finally {
      savingOAuthConfig = false;
    }
  }

  function getProviderIcon(provider: IntegrationProvider): string {
    const icons: Record<IntegrationProvider, string> = {
      google: "M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z",
      github: "M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z",
      notion: "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.046-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.448-1.632z",
      slack: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
      linear: "M4.5 2.5l-2 17 17-2-15-15z M6.5 6.5l10 10",
    };
    return icons[provider];
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  // Compute connected vs available providers
  let connectedOAuthProviders = $derived(
    oauthProviders.filter(p => integrations.some(i => i.provider === p.id))
  );

  let availableOAuthProviders = $derived(
    oauthProviders.filter(p => !integrations.some(i => i.provider === p.id))
  );

  let connectedCredentialProviders = $derived(
    credentialProviders.filter(p => p.hasCredentials)
  );

  let availableCredentialProviders = $derived(
    credentialProviders.filter(p => !p.hasCredentials)
  );

  onMount(loadData);

  // Cleanup active polling intervals on component destroy
  onDestroy(() => {
    for (const interval of activePollingIntervals) {
      clearInterval(interval);
    }
    activePollingIntervals = [];
  });
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
      <button class="text-red-600 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline text-sm" onclick={() => { error = null; loadData(); }}>Retry</button>
    </div>
  {:else}
    <!-- Connected OAuth Accounts -->
    {#if connectedOAuthProviders.length > 0}
      <section>
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">OAuth Connections</h3>
        <div class="space-y-3">
          {#each integrations as integration}
            {@const provider = oauthProviders.find(p => p.id === integration.provider)}
            {@const status = statusMap.get(integration.provider)}
            {#if provider}
              <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-start gap-4">
                  <div class="shrink-0 w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <svg class="w-5 h-5 {provider.color}" viewBox="0 0 24 24" fill="currentColor">
                      <path d={getProviderIcon(integration.provider)} />
                    </svg>
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900 dark:text-gray-100">{integration.account_label}</span>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Connected
                      </span>
                      {#if status}
                        {@const healthIndicator = getHealthIndicator(status)}
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs {healthIndicator.bgColor}" title={healthIndicator.tooltip}>
                          <span class="w-1.5 h-1.5 rounded-full {healthIndicator.color}"></span>
                          {healthIndicator.tooltip}
                        </span>
                      {/if}
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{integration.account_id}</p>

                    {#if integration.services.length > 0}
                      <div class="flex flex-wrap gap-1.5 mt-3">
                        {#each integration.services as service}
                          <span class="px-2 py-1 rounded-md text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 capitalize">
                            {service}
                          </span>
                        {/each}
                      </div>
                    {/if}

                    <!-- Error display -->
                    {#if status?.lastError}
                      <div class="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
                        <details>
                          <summary class="cursor-pointer font-medium">Last error (click to expand)</summary>
                          <p class="mt-1 text-red-600 dark:text-red-300">{status.lastError}</p>
                        </details>
                      </div>
                    {/if}

                    <!-- Enable/Disable toggles -->
                    {#if status}
                      <div class="mt-3 flex items-center gap-4 text-sm">
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={status.enabledGlobal}
                            onchange={(e) => toggleIntegration(integration.provider, e.currentTarget.checked, "global")}
                            class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span class="text-gray-700 dark:text-gray-300">Enabled globally</span>
                        </label>
                        {#if effectiveProjectId}
                          <label class="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={status.enabledProject ?? status.enabledGlobal}
                              onchange={(e) => toggleIntegration(integration.provider, e.currentTarget.checked, "project")}
                              class="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                            />
                            <span class="text-gray-700 dark:text-gray-300">Enabled for this project</span>
                          </label>
                        {/if}
                      </div>
                    {/if}
                  </div>

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

    <!-- Connected Credential Providers -->
    {#if connectedCredentialProviders.length > 0}
      <section>
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">API Key Connections</h3>
        <div class="space-y-3">
          {#each connectedCredentialProviders as provider}
            {@const status = statusMap.get(provider.id)}
            <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div class="flex items-start gap-4">
                <div class="shrink-0 w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                  <svg class="w-5 h-5 {provider.color}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
                    <path d={getProviderIcon(provider.id)} />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-900 dark:text-gray-100">{provider.name}</span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                      Connected
                    </span>
                    {#if status}
                      {@const healthIndicator = getHealthIndicator(status)}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs {healthIndicator.bgColor}" title={healthIndicator.tooltip}>
                        <span class="w-1.5 h-1.5 rounded-full {healthIndicator.color}"></span>
                        {healthIndicator.tooltip}
                      </span>
                    {/if}
                    {#if provider.hasProjectCredentials}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                        Project
                      </span>
                    {:else if provider.hasUserCredentials}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        Global
                      </span>
                    {/if}
                  </div>
                  {#if provider.credentialStatus}
                    {@const setCredentials = provider.credentialStatus.filter(c => c.isSet)}
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {setCredentials.length} credential{setCredentials.length !== 1 ? 's' : ''} configured
                    </p>
                  {/if}

                  <!-- Error display -->
                  {#if status?.lastError}
                    <div class="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
                      <details>
                        <summary class="cursor-pointer font-medium">Last error (click to expand)</summary>
                        <p class="mt-1 text-red-600 dark:text-red-300">{status.lastError}</p>
                      </details>
                    </div>
                  {/if}

                  <!-- Enable/Disable toggles -->
                  {#if status}
                    <div class="mt-3 flex items-center gap-4 text-sm">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={status.enabledGlobal}
                          onchange={(e) => toggleIntegration(provider.id, e.currentTarget.checked, "global")}
                          class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span class="text-gray-700 dark:text-gray-300">Enabled globally</span>
                      </label>
                      {#if effectiveProjectId}
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={status.enabledProject ?? status.enabledGlobal}
                            onchange={(e) => toggleIntegration(provider.id, e.currentTarget.checked, "project")}
                            class="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                          />
                          <span class="text-gray-700 dark:text-gray-300">Enabled for this project</span>
                        </label>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="shrink-0 flex items-center gap-2">
                  <button
                    class="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    onclick={() => openCredentialModal(provider)}
                  >
                    Edit
                  </button>
                  <button
                    class="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Disconnect"
                    onclick={() => disconnectCredentials(provider.id)}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Available OAuth Providers -->
    {#if availableOAuthProviders.length > 0}
      <section>
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          {connectedOAuthProviders.length > 0 ? "Available OAuth" : "Connect with OAuth"}
        </h3>
        <div class="space-y-3">
          {#each availableOAuthProviders as provider}
            <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <div class="shrink-0 w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <svg class="w-5 h-5 {provider.color}" viewBox="0 0 24 24" fill="currentColor">
                      <path d={getProviderIcon(provider.id)} />
                    </svg>
                  </div>
                  <div>
                    <span class="font-medium text-gray-900 dark:text-gray-100">{provider.name}</span>
                    {#if provider.services}
                      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {provider.services.map(s => s.name).join(" · ")}
                      </p>
                    {/if}
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  {#if provider.hasCredentials}
                    <!-- OAuth app configured - show Connect button -->
                    <button
                      class="px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      disabled={connectingProvider === provider.id}
                      onclick={() => startOAuthConnect(provider.id)}
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
                    <button
                      class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Configure OAuth App"
                      onclick={() => openOAuthConfigModal(provider)}
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  {:else}
                    <!-- No OAuth app - show Configure button -->
                    <button
                      class="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      onclick={() => openOAuthConfigModal(provider)}
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>Configure OAuth App</span>
                    </button>
                  {/if}
                </div>
              </div>
              {#if !provider.hasCredentials}
                <p class="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-center gap-1.5">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Requires OAuth app configuration. <a href="https://console.cloud.google.com/" target="_blank" rel="noopener" class="underline hover:no-underline">Create a Google Cloud project</a> first.</span>
                </p>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Available Credential Providers -->
    {#if availableCredentialProviders.length > 0}
      <section>
        <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          {connectedCredentialProviders.length > 0 ? "Available API Key" : "Connect with API Key"}
        </h3>
        <div class="space-y-3">
          {#each availableCredentialProviders as provider}
            <div class="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <div class="shrink-0 w-10 h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <svg class="w-5 h-5 {provider.color}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
                      <path d={getProviderIcon(provider.id)} />
                    </svg>
                  </div>
                  <div>
                    <span class="font-medium text-gray-900 dark:text-gray-100">{provider.name}</span>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      API Key Authentication
                    </p>
                  </div>
                </div>

                <button
                  class="px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  onclick={() => openCredentialModal(provider)}
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span>Connect</span>
                </button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Empty State -->
    {#if oauthProviders.length === 0 && credentialProviders.length === 0}
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
    {#if (integrations.length > 0 || connectedCredentialProviders.length > 0)}
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
              Try asking: "Read my latest emails" or "Create a Linear issue".
            </p>
          </div>
        </div>
      </section>
    {/if}
  {/if}
</div>

<!-- Credential Modal -->
{#if selectedProvider}
  <Modal
    open={credentialModalOpen}
    onClose={closeCredentialModal}
    title="Connect {selectedProvider.name}"
    size="md"
  >
    {#snippet children()}
      {@const setupGuide = (selectedProvider as any).setupGuide}
      <div class="space-y-4">
        <!-- Setup Guide (if available) -->
        {#if setupGuide}
          <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">{setupGuide.description}</p>
            <details class="group">
              <summary class="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2">
                <svg class="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                How to get your API key
              </summary>
              <ol class="mt-3 ml-6 space-y-2 text-sm text-gray-600 dark:text-gray-400 list-decimal">
                {#each setupGuide.steps as step}
                  <li>{@html step.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-gray-900 dark:text-gray-100">$1</strong>').replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs">$1</code>')}</li>
                {/each}
              </ol>
            </details>
            <!-- Help me button -->
            <button
              type="button"
              class="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors"
              onclick={() => openSetupHelp(selectedProvider)}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Help me set this up (opens chat)
            </button>
          </div>
        {:else}
          <div class="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="text-sm text-blue-700 dark:text-blue-300">
              <p class="font-medium">Secure Storage</p>
              <p class="mt-1">Your credentials are encrypted and stored locally on your machine.</p>
            </div>
          </div>
        {/if}

        {#each selectedProvider.credentials.filter(c => c.type !== "oauth") as field}
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {field.label}
              {#if field.required}
                <span class="text-red-500">*</span>
              {/if}
            </label>
            <input
              type={field.type === "password" ? "password" : "text"}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              bind:value={credentialValues[field.key]}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
            {#if field.helpText || field.helpUrl}
              <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {field.helpText}
                {#if field.helpUrl}
                  <a href={field.helpUrl} target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline ml-1">
                    Get API key →
                  </a>
                {/if}
              </p>
            {/if}
          </div>
        {/each}

        <!-- Scope Toggle (only shown when in a project context) -->
        {#if effectiveProjectId}
          <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
            <fieldset class="space-y-2">
              <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Credential Scope
              </legend>
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors {!saveForProjectOnly ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}">
                <input
                  type="radio"
                  name="credentialScope"
                  checked={!saveForProjectOnly}
                  onchange={() => saveForProjectOnly = false}
                  class="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <div class="flex-1">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">Use for all projects</span>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    This credential will be available in all your projects (default)
                  </p>
                </div>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors {saveForProjectOnly ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}">
                <input
                  type="radio"
                  name="credentialScope"
                  checked={saveForProjectOnly}
                  onchange={() => saveForProjectOnly = true}
                  class="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <div class="flex-1">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">Use only for this project</span>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    This credential will only be used in the current project
                  </p>
                </div>
              </label>
            </fieldset>
            {#if selectedProvider.hasUserCredentials && saveForProjectOnly}
              <p class="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                This will override your global {selectedProvider.name} credentials for this project
              </p>
            {/if}
          </div>
        {/if}

        {#if testResult}
          <div class="p-3 rounded-lg {testResult.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'}">
            <div class="flex items-start gap-2">
              {#if testResult.success}
                <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              {:else}
                <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              {/if}
              <span class="text-sm">{testResult.message}</span>
            </div>
          </div>
        {/if}
      </div>
    {/snippet}

    {#snippet footer()}
      <button
        class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        onclick={closeCredentialModal}
      >
        Cancel
      </button>
      {#if selectedProvider.credentialStatus?.some(c => c.isSet)}
        <button
          class="px-4 py-2 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          disabled={testingCredentials}
          onclick={testCredentials}
        >
          {#if testingCredentials}
            <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {/if}
          Test Connection
        </button>
      {/if}
      <button
        class="px-4 py-2 text-sm bg-gray-900 dark:bg-gray-700 text-white hover:bg-black dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        disabled={savingCredentials}
        onclick={saveCredentials}
      >
        {#if savingCredentials}
          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {/if}
        Save
      </button>
    {/snippet}
  </Modal>
{/if}

<!-- OAuth App Configuration Modal -->
{#if selectedOAuthProvider}
  <Modal
    open={oauthConfigModalOpen}
    onClose={closeOAuthConfigModal}
    title="Configure {selectedOAuthProvider.name} OAuth App"
    size="md"
  >
    {#snippet children()}
      <div class="space-y-4">
        <!-- Setup Instructions -->
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="text-sm text-blue-700 dark:text-blue-300">
              <p class="font-medium mb-2">How to get OAuth credentials:</p>
              <ol class="list-decimal ml-4 space-y-1 text-blue-600 dark:text-blue-400">
                <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener" class="underline hover:no-underline">Google Cloud Console</a></li>
                <li>Create a project (or select existing)</li>
                <li>Enable Gmail, Calendar, Sheets, Drive APIs</li>
                <li>Go to <strong>APIs & Services → Credentials</strong></li>
                <li>Create OAuth client ID (Desktop app type)</li>
                <li>Copy Client ID and Client Secret below</li>
              </ol>
              <p class="mt-2 text-xs">
                <a href="/docs/OAUTH_SETUP.md" target="_blank" class="underline hover:no-underline">Full setup guide →</a>
              </p>
            </div>
          </div>
        </div>

        <!-- Client ID -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Client ID <span class="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="xxxx.apps.googleusercontent.com"
            bind:value={oauthClientId}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent font-mono text-sm"
          />
        </div>

        <!-- Client Secret -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Client Secret <span class="text-red-500">*</span>
          </label>
          <input
            type="password"
            placeholder="GOCSPX-..."
            bind:value={oauthClientSecret}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent font-mono text-sm"
          />
        </div>

        <!-- Error Display -->
        {#if oauthConfigError}
          <div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
            <div class="flex items-start gap-2">
              <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-sm">{oauthConfigError}</span>
            </div>
          </div>
        {/if}

        <!-- Security Note -->
        <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Credentials are encrypted and stored locally on your machine.</span>
        </div>
      </div>
    {/snippet}

    {#snippet footer()}
      <button
        class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        onclick={closeOAuthConfigModal}
      >
        Cancel
      </button>
      <button
        class="px-4 py-2 text-sm bg-gray-900 dark:bg-gray-700 text-white hover:bg-black dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        disabled={savingOAuthConfig}
        onclick={saveOAuthConfig}
      >
        {#if savingOAuthConfig}
          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {/if}
        Save Configuration
      </button>
    {/snippet}
  </Modal>
{/if}
