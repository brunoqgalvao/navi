<script lang="ts">
  import { api, type PermissionSettings } from "../api";
  import { onMount } from "svelte";
  import { advancedMode } from "../stores";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  type Tab = "api" | "permissions" | "claude-md" | "features";
  let activeTab: Tab = $state("api");

  let hasOpenAIKey = $state(false);
  let openAIKeyPreview: string | null = $state(null);
  let hasAnthropicKey = $state(false);
  let authMethod: "oauth" | "api_key" | null = $state(null);
  let claudeInstalled = $state(false);
  let loading = $state(true);
  let autoTitleEnabled = $state(true);

  let showOpenAIInput = $state(false);
  let openAIKeyInput = $state("");
  let openAIError: string | null = $state(null);
  let savingOpenAI = $state(false);

  let showAnthropicInput = $state(false);
  let anthropicKeyInput = $state("");
  let anthropicError: string | null = $state(null);
  let savingAnthropic = $state(false);

  let permissionSettings = $state<PermissionSettings | null>(null);
  let defaultTools = $state<string[]>([]);
  let dangerousTools = $state<string[]>([]);
  let savingPermissions = $state(false);

  let defaultClaudeMd = $state("");
  let defaultClaudeMdExists = $state(false);
  let editingClaudeMd = $state(false);
  let claudeMdDraft = $state("");
  let savingClaudeMd = $state(false);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "api", label: "API Keys", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
    { id: "permissions", label: "Permissions", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
    { id: "claude-md", label: "CLAUDE.md", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { id: "features", label: "Features", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  ];

  onMount(() => {
    if (open) loadStatus();
  });

  $effect(() => {
    if (open) loadStatus();
  });

  async function loadStatus() {
    loading = true;
    try {
      const [config, auth, perms, claudeMd] = await Promise.all([
        api.config.get(),
        api.auth.status(),
        api.permissions.get(),
        api.claudeMd.getDefault(),
      ]);
      hasOpenAIKey = config.hasOpenAIKey;
      openAIKeyPreview = config.openAIKeyPreview;
      autoTitleEnabled = config.autoTitleEnabled;
      hasAnthropicKey = auth.hasApiKey;
      authMethod = auth.authMethod;
      claudeInstalled = auth.claudeInstalled;
      permissionSettings = perms.global;
      defaultTools = perms.defaults.tools;
      dangerousTools = perms.defaults.dangerous;
      defaultClaudeMd = claudeMd.content;
      defaultClaudeMdExists = claudeMd.exists;
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      loading = false;
    }
  }

  async function savePermissions() {
    if (!permissionSettings) return;
    savingPermissions = true;
    try {
      await api.permissions.set(permissionSettings);
    } catch (e) {
      console.error("Failed to save permissions:", e);
    } finally {
      savingPermissions = false;
    }
  }

  function toggleAutoAccept() {
    if (!permissionSettings) return;
    permissionSettings = { ...permissionSettings, autoAcceptAll: !permissionSettings.autoAcceptAll };
    savePermissions();
  }

  function toggleRequireConfirmation(tool: string) {
    if (!permissionSettings) return;
    const current = permissionSettings.requireConfirmation;
    if (current.includes(tool)) {
      permissionSettings = { ...permissionSettings, requireConfirmation: current.filter(t => t !== tool) };
    } else {
      permissionSettings = { ...permissionSettings, requireConfirmation: [...current, tool] };
    }
    savePermissions();
  }

  function toggleAllowedTool(tool: string) {
    if (!permissionSettings) return;
    const current = permissionSettings.allowedTools;
    if (current.includes(tool)) {
      permissionSettings = { 
        ...permissionSettings, 
        allowedTools: current.filter(t => t !== tool),
        requireConfirmation: permissionSettings.requireConfirmation.filter(t => t !== tool)
      };
    } else {
      permissionSettings = { ...permissionSettings, allowedTools: [...current, tool] };
    }
    savePermissions();
  }

  async function saveOpenAIKey() {
    if (!openAIKeyInput.trim()) {
      openAIError = "Please enter an API key";
      return;
    }
    if (!openAIKeyInput.startsWith("sk-")) {
      openAIError = "API key should start with 'sk-'";
      return;
    }

    savingOpenAI = true;
    openAIError = null;

    try {
      await api.config.setOpenAIKey(openAIKeyInput.trim());
      hasOpenAIKey = true;
      showOpenAIInput = false;
      openAIKeyInput = "";
    } catch (e: any) {
      openAIError = e.message || "Failed to save API key";
    } finally {
      savingOpenAI = false;
    }
  }

  async function saveAnthropicKey() {
    if (!anthropicKeyInput.trim()) {
      anthropicError = "Please enter an API key";
      return;
    }
    if (!anthropicKeyInput.startsWith("sk-ant-")) {
      anthropicError = "API key should start with 'sk-ant-'";
      return;
    }

    savingAnthropic = true;
    anthropicError = null;

    try {
      await api.auth.setApiKey(anthropicKeyInput.trim());
      hasAnthropicKey = true;
      authMethod = "api_key";
      showAnthropicInput = false;
      anthropicKeyInput = "";
    } catch (e: any) {
      anthropicError = e.message || "Failed to save API key";
    } finally {
      savingAnthropic = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  async function toggleAutoTitle() {
    const newValue = !autoTitleEnabled;
    autoTitleEnabled = newValue;
    try {
      await api.config.setAutoTitle(newValue);
    } catch (e) {
      console.error("Failed to save auto-title setting:", e);
      autoTitleEnabled = !newValue;
    }
  }

  function startEditingClaudeMd() {
    claudeMdDraft = defaultClaudeMd;
    editingClaudeMd = true;
  }

  function cancelEditingClaudeMd() {
    editingClaudeMd = false;
    claudeMdDraft = "";
  }

  async function saveClaudeMd() {
    savingClaudeMd = true;
    try {
      await api.claudeMd.setDefault(claudeMdDraft);
      defaultClaudeMd = claudeMdDraft;
      defaultClaudeMdExists = true;
      editingClaudeMd = false;
    } catch (e) {
      console.error("Failed to save CLAUDE.md:", e);
    } finally {
      savingClaudeMd = false;
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-gray-100 rounded-lg">
            <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 class="font-semibold text-lg text-gray-900">Settings</h3>
        </div>
        <button onclick={onClose} class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex flex-1 min-h-0">
        <div class="w-48 border-r border-gray-100 bg-gray-50/50 p-3 shrink-0">
          <nav class="space-y-1">
            {#each tabs as tab}
              <button
                onclick={() => activeTab = tab.id}
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}"
              >
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            {/each}
          </nav>

          <div class="mt-6 pt-6 border-t border-gray-200">
            <div class="px-3 space-y-2 text-xs text-gray-500">
              <div class="flex justify-between">
                <span>Config</span>
                <code class="bg-gray-200 px-1 rounded font-mono">~/.claude-code-ui/</code>
              </div>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          {#if loading}
            <div class="flex items-center justify-center h-full">
              <svg class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          {:else if activeTab === "api"}
            <div class="space-y-6 max-w-2xl">
              <div>
                <h4 class="text-lg font-semibold text-gray-900 mb-1">API Keys</h4>
                <p class="text-sm text-gray-500">Configure your API keys for Claude and other services.</p>
              </div>

              <div class="space-y-4">
                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5">
                  <div class="flex items-start gap-4">
                    <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold shrink-0">C</div>
                    <div class="flex-1 space-y-4">
                      <div class="flex items-center justify-between">
                        <div>
                          <h5 class="font-medium text-gray-900">Claude (Anthropic)</h5>
                          <p class="text-sm text-gray-500">Required for AI conversations</p>
                        </div>
                        {#if authMethod === "oauth"}
                          <span class="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">OAuth Connected</span>
                        {:else if authMethod === "api_key"}
                          <span class="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">API Key Set</span>
                        {:else}
                          <span class="text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">Not Configured</span>
                        {/if}
                      </div>

                      <div class="flex items-center gap-3 text-sm">
                        <span class="text-gray-600">Claude CLI:</span>
                        {#if claudeInstalled}
                          <span class="text-green-600">Installed</span>
                        {:else}
                          <span class="text-gray-400">Not Found</span>
                        {/if}
                      </div>

                      {#if !showAnthropicInput}
                        <button
                          onclick={() => showAnthropicInput = true}
                          class="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg px-4 py-2 transition-colors"
                        >
                          {hasAnthropicKey ? "Update API Key" : "Add API Key"}
                        </button>
                      {:else}
                        <div class="space-y-3">
                          <input
                            type="password"
                            bind:value={anthropicKeyInput}
                            placeholder="sk-ant-..."
                            class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:border-gray-900 focus:outline-none transition-colors"
                            onkeydown={(e) => e.key === "Enter" && saveAnthropicKey()}
                          />
                          {#if anthropicError}
                            <p class="text-sm text-red-600">{anthropicError}</p>
                          {/if}
                          <div class="flex gap-2">
                            <button
                              onclick={() => { showAnthropicInput = false; anthropicKeyInput = ""; anthropicError = null; }}
                              class="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-2 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onclick={saveAnthropicKey}
                              disabled={savingAnthropic}
                              class="text-sm font-medium bg-gray-900 text-white rounded-lg px-4 py-2 hover:bg-black transition-colors disabled:opacity-50"
                            >
                              {savingAnthropic ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      {/if}

                      <p class="text-xs text-gray-500">
                        Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" class="text-blue-600 hover:underline">console.anthropic.com</a>
                      </p>
                    </div>
                  </div>
                </div>

                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5">
                  <div class="flex items-start gap-4">
                    <div class="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                      <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div class="flex-1 space-y-4">
                      <div class="flex items-center justify-between">
                        <div>
                          <h5 class="font-medium text-gray-900">OpenAI</h5>
                          <p class="text-sm text-gray-500">Used for voice-to-text transcription</p>
                        </div>
                        {#if hasOpenAIKey}
                          <span class="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">Configured</span>
                        {:else}
                          <span class="text-xs font-medium text-gray-500 bg-gray-200 px-2.5 py-1 rounded-full">Optional</span>
                        {/if}
                      </div>

                      {#if hasOpenAIKey && openAIKeyPreview && !showOpenAIInput}
                        <div class="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5">
                          <code class="text-sm font-mono text-gray-600">{openAIKeyPreview}</code>
                          <span class="text-xs text-gray-400">from environment</span>
                        </div>
                      {/if}

                      {#if !showOpenAIInput}
                        <button
                          onclick={() => showOpenAIInput = true}
                          class="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg px-4 py-2 transition-colors"
                        >
                          {hasOpenAIKey ? "Update API Key" : "Add API Key"}
                        </button>
                      {:else}
                        <div class="space-y-3">
                          <input
                            type="password"
                            bind:value={openAIKeyInput}
                            placeholder="sk-..."
                            class="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:border-gray-900 focus:outline-none transition-colors"
                            onkeydown={(e) => e.key === "Enter" && saveOpenAIKey()}
                          />
                          {#if openAIError}
                            <p class="text-sm text-red-600">{openAIError}</p>
                          {/if}
                          <div class="flex gap-2">
                            <button
                              onclick={() => { showOpenAIInput = false; openAIKeyInput = ""; openAIError = null; }}
                              class="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-2 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onclick={saveOpenAIKey}
                              disabled={savingOpenAI}
                              class="text-sm font-medium bg-gray-900 text-white rounded-lg px-4 py-2 hover:bg-black transition-colors disabled:opacity-50"
                            >
                              {savingOpenAI ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      {/if}

                      <p class="text-xs text-gray-500">
                        Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" class="text-blue-600 hover:underline">platform.openai.com</a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          {:else if activeTab === "permissions"}
            <div class="space-y-6 max-w-2xl">
              <div>
                <h4 class="text-lg font-semibold text-gray-900 mb-1">Tool Permissions</h4>
                <p class="text-sm text-gray-500">Control which tools Claude can use and which require confirmation.</p>
              </div>

              {#if permissionSettings}
                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-5">
                  <div class="flex items-center justify-between">
                    <div>
                      <h5 class="font-medium text-gray-900">Auto-accept all tools</h5>
                      <p class="text-sm text-gray-500">Skip confirmation for all tool uses (not recommended)</p>
                    </div>
                    <button
                      onclick={toggleAutoAccept}
                      disabled={savingPermissions}
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {permissionSettings.autoAcceptAll ? 'bg-amber-500' : 'bg-gray-300'}"
                    >
                      <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {permissionSettings.autoAcceptAll ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                  </div>
                </div>

                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-5">
                  <div>
                    <h5 class="font-medium text-gray-900 mb-1">Allowed Tools</h5>
                    <p class="text-sm text-gray-500 mb-4">Which tools Claude is allowed to use</p>
                    <div class="grid grid-cols-2 gap-2">
                      {#each defaultTools as tool}
                        <label class="flex items-center gap-3 cursor-pointer bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-gray-300 transition-colors">
                          <input
                            type="checkbox"
                            checked={permissionSettings.allowedTools.includes(tool)}
                            onchange={() => toggleAllowedTool(tool)}
                            disabled={savingPermissions}
                            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span class="text-sm text-gray-900">{tool}</span>
                        </label>
                      {/each}
                    </div>
                  </div>
                </div>

                {#if !permissionSettings.autoAcceptAll}
                  <div class="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-5">
                    <div>
                      <h5 class="font-medium text-amber-900 mb-1">Require Confirmation</h5>
                      <p class="text-sm text-amber-700 mb-4">These tools will show a confirmation dialog before executing</p>
                      <div class="grid grid-cols-2 gap-2">
                        {#each defaultTools as tool}
                          {@const isAllowed = permissionSettings.allowedTools.includes(tool)}
                          {@const isDangerous = dangerousTools.includes(tool)}
                          <label class="flex items-center gap-3 cursor-pointer bg-white border border-amber-200 rounded-lg px-3 py-2 hover:border-amber-300 transition-colors {!isAllowed ? 'opacity-50' : ''}">
                            <input
                              type="checkbox"
                              checked={permissionSettings.requireConfirmation.includes(tool)}
                              onchange={() => toggleRequireConfirmation(tool)}
                              disabled={savingPermissions || !isAllowed}
                              class="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span class="text-sm text-gray-900">{tool}</span>
                            {#if isDangerous}
                              <span class="text-xs text-amber-600 ml-auto">!</span>
                            {/if}
                          </label>
                        {/each}
                      </div>
                    </div>
                  </div>

                  <p class="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    Tools marked with <span class="font-bold">!</span> are potentially dangerous. When a tool requires confirmation, you'll see a dialog before it executes.
                  </p>
                {/if}
              {/if}
            </div>

          {:else if activeTab === "claude-md"}
            <div class="space-y-6">
              <div>
                <h4 class="text-lg font-semibold text-gray-900 mb-1">Default CLAUDE.md Template</h4>
                <p class="text-sm text-gray-500">This template is automatically copied to new projects as their CLAUDE.md file.</p>
              </div>

              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-600">Status:</span>
                {#if defaultClaudeMdExists}
                  <span class="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">Custom Template</span>
                {:else}
                  <span class="text-xs font-medium text-gray-500 bg-gray-200 px-2.5 py-1 rounded-full">Using Default</span>
                {/if}
              </div>

              {#if editingClaudeMd}
                <div class="space-y-4">
                  <textarea
                    bind:value={claudeMdDraft}
                    rows="20"
                    class="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:border-gray-900 focus:outline-none transition-colors resize-none"
                    placeholder="# Project Instructions..."
                  ></textarea>
                  <div class="flex gap-3">
                    <button
                      onclick={cancelEditingClaudeMd}
                      class="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-2 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onclick={saveClaudeMd}
                      disabled={savingClaudeMd}
                      class="text-sm font-medium bg-gray-900 text-white rounded-lg px-4 py-2 hover:bg-black transition-colors disabled:opacity-50"
                    >
                      {savingClaudeMd ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </div>
              {:else}
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                  <pre class="text-sm font-mono text-gray-700 whitespace-pre-wrap">{defaultClaudeMd}</pre>
                </div>
                <button
                  onclick={startEditingClaudeMd}
                  class="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg px-4 py-2 transition-colors"
                >
                  Edit Template
                </button>
              {/if}

              <p class="text-sm text-gray-500">
                When you select a project, if it doesn't have a <code class="bg-gray-200 px-1.5 py-0.5 rounded font-mono text-xs">CLAUDE.md</code> file, this template will be copied to create one.
              </p>
            </div>

          {:else if activeTab === "features"}
            <div class="space-y-6 max-w-2xl">
              <div>
                <h4 class="text-lg font-semibold text-gray-900 mb-1">Features</h4>
                <p class="text-sm text-gray-500">Configure optional features and behaviors.</p>
              </div>

              <div class="space-y-4">
                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5">
                  <div class="flex items-center justify-between">
                    <div>
                      <h5 class="font-medium text-gray-900">Auto-generate chat titles</h5>
                      <p class="text-sm text-gray-500">Use AI to create descriptive titles for new chats</p>
                    </div>
                    <button
                      onclick={toggleAutoTitle}
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {autoTitleEnabled ? 'bg-gray-900' : 'bg-gray-300'}"
                    >
                      <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {autoTitleEnabled ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                  </div>
                  
                  {#if autoTitleEnabled}
                    <p class="text-sm text-gray-500 mt-3 bg-gray-100 rounded-lg px-3 py-2">
                      Uses {hasOpenAIKey ? "GPT-4o-mini" : hasAnthropicKey ? "Claude Haiku" : "your API"} for title generation (~$0.0001 per title)
                    </p>
                  {/if}
                </div>

                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5">
                  <div class="flex items-center justify-between">
                    <div>
                      <h5 class="font-medium text-gray-900">Advanced Mode</h5>
                      <p class="text-sm text-gray-500">Show reasoning history and system prompt info</p>
                    </div>
                    <button
                      onclick={() => advancedMode.toggle()}
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {$advancedMode ? 'bg-gray-900' : 'bg-gray-300'}"
                    >
                      <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {$advancedMode ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                  </div>
                  
                  {#if $advancedMode}
                    <p class="text-sm text-gray-500 mt-3 bg-gray-100 rounded-lg px-3 py-2">
                      Tool calls will be collapsible. You can view loaded CLAUDE.md and system context.
                    </p>
                  {/if}
                </div>

                <div class="bg-gray-50 rounded-xl border border-gray-200 p-5">
                  <div>
                    <h5 class="font-medium text-gray-900 mb-1">Storage Locations</h5>
                    <p class="text-sm text-gray-500 mb-4">Where your data is stored on disk</p>
                  </div>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between items-center bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span class="text-gray-600">Configuration</span>
                      <code class="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">~/.claude-code-ui/</code>
                    </div>
                    <div class="flex justify-between items-center bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span class="text-gray-600">Audio backups</span>
                      <code class="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">~/.claude-code-ui/audio-backups/</code>
                    </div>
                    <div class="flex justify-between items-center bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span class="text-gray-600">Default CLAUDE.md</span>
                      <code class="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">~/.claude-code-ui/default-claude.md</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
