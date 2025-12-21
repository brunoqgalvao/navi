<script lang="ts">
  import { api, type PermissionSettings } from "../api";
  import { onMount } from "svelte";
  import { advancedMode } from "../stores";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

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

  onMount(() => {
    if (open) loadStatus();
  });

  $effect(() => {
    if (open) loadStatus();
  });

  async function loadStatus() {
    loading = true;
    try {
      const [config, auth, perms] = await Promise.all([
        api.config.get(),
        api.auth.status(),
        api.permissions.get(),
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
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
      <div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-gray-100 rounded-lg">
            <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 class="font-semibold text-base text-gray-900">Settings</h3>
        </div>
        <button onclick={onClose} class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
        {#if loading}
          <div class="flex items-center justify-center py-8">
            <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        {:else}
          <!-- Claude / Anthropic Section -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span class="w-6 h-6 bg-orange-100 rounded flex items-center justify-center text-orange-600 text-xs font-bold">C</span>
              Claude (Anthropic)
            </h4>
            
            <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Status</span>
                {#if authMethod === "oauth"}
                  <span class="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">OAuth Connected</span>
                {:else if authMethod === "api_key"}
                  <span class="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">API Key Set</span>
                {:else}
                  <span class="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Not Configured</span>
                {/if}
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Claude CLI</span>
                {#if claudeInstalled}
                  <span class="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Installed</span>
                {:else}
                  <span class="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">Not Found</span>
                {/if}
              </div>

              {#if !showAnthropicInput}
                <button
                  onclick={() => showAnthropicInput = true}
                  class="w-full text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg px-3 py-2 transition-colors"
                >
                  {hasAnthropicKey ? "Update API Key" : "Add API Key"}
                </button>
              {:else}
                <div class="space-y-2">
                  <input
                    type="password"
                    bind:value={anthropicKeyInput}
                    placeholder="sk-ant-..."
                    class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none transition-colors"
                    onkeydown={(e) => e.key === "Enter" && saveAnthropicKey()}
                  />
                  {#if anthropicError}
                    <p class="text-xs text-red-600">{anthropicError}</p>
                  {/if}
                  <div class="flex gap-2">
                    <button
                      onclick={() => { showAnthropicInput = false; anthropicKeyInput = ""; anthropicError = null; }}
                      class="flex-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onclick={saveAnthropicKey}
                      disabled={savingAnthropic}
                      class="flex-1 text-sm font-medium bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-black transition-colors disabled:opacity-50"
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

          <!-- OpenAI Section -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span class="w-6 h-6 bg-emerald-100 rounded flex items-center justify-center">
                <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </span>
              OpenAI (Voice Input)
            </h4>
            
            <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">OpenAI API Key</span>
                {#if hasOpenAIKey}
                  <span class="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Configured</span>
                {:else}
                  <span class="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Not Configured</span>
                {/if}
              </div>

              {#if hasOpenAIKey && openAIKeyPreview && !showOpenAIInput}
                <div class="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <code class="text-sm font-mono text-gray-600">{openAIKeyPreview}</code>
                  <span class="text-xs text-gray-400">from environment</span>
                </div>
              {/if}

              {#if !showOpenAIInput}
                <button
                  onclick={() => showOpenAIInput = true}
                  class="w-full text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg px-3 py-2 transition-colors"
                >
                  {hasOpenAIKey ? "Update API Key" : "Add API Key"}
                </button>
              {:else}
                <div class="space-y-2">
                  <input
                    type="password"
                    bind:value={openAIKeyInput}
                    placeholder="sk-..."
                    class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none transition-colors"
                    onkeydown={(e) => e.key === "Enter" && saveOpenAIKey()}
                  />
                  {#if openAIError}
                    <p class="text-xs text-red-600">{openAIError}</p>
                  {/if}
                  <div class="flex gap-2">
                    <button
                      onclick={() => { showOpenAIInput = false; openAIKeyInput = ""; openAIError = null; }}
                      class="flex-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onclick={saveOpenAIKey}
                      disabled={savingOpenAI}
                      class="flex-1 text-sm font-medium bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-black transition-colors disabled:opacity-50"
                    >
                      {savingOpenAI ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              {/if}

              <p class="text-xs text-gray-500">
                Used for voice-to-text transcription. Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" class="text-blue-600 hover:underline">platform.openai.com</a>
              </p>
            </div>
          </div>

          <!-- Features Section -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span class="w-6 h-6 bg-purple-100 rounded flex items-center justify-center">
                <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              Features
            </h4>
            
            <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="space-y-0.5">
                  <span class="text-sm text-gray-900 font-medium">Auto-generate chat titles</span>
                  <p class="text-xs text-gray-500">Use AI to create descriptive titles for new chats</p>
                </div>
                <button
                  onclick={toggleAutoTitle}
                  class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoTitleEnabled ? 'bg-gray-900' : 'bg-gray-300'}`}
                >
                  <span
                    class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoTitleEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                  ></span>
                </button>
              </div>
              
              {#if autoTitleEnabled}
                <p class="text-xs text-gray-500 bg-gray-100 rounded px-2 py-1.5">
                  Uses {hasOpenAIKey ? "GPT-4o-mini" : hasAnthropicKey ? "Claude Haiku" : "your API"} for title generation (~$0.0001 per title)
                </p>
              {/if}

              <div class="border-t border-gray-200 my-3"></div>

              <div class="flex items-center justify-between">
                <div class="space-y-0.5">
                  <span class="text-sm text-gray-900 font-medium">Advanced Mode</span>
                  <p class="text-xs text-gray-500">Show reasoning history and system prompt info</p>
                </div>
                <button
                  onclick={() => advancedMode.toggle()}
                  class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${$advancedMode ? 'bg-gray-900' : 'bg-gray-300'}`}
                >
                  <span
                    class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${$advancedMode ? 'translate-x-6' : 'translate-x-1'}`}
                  ></span>
                </button>
              </div>
              
              {#if $advancedMode}
                <p class="text-xs text-gray-500 bg-gray-100 rounded px-2 py-1.5">
                  Tool calls will be collapsible. You can view loaded CLAUDE.md and system context.
                </p>
              {/if}
            </div>
          </div>

          <!-- Permissions Section -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span class="w-6 h-6 bg-amber-100 rounded flex items-center justify-center">
                <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              Tool Permissions
            </h4>
            
            {#if permissionSettings}
              <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-4">
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <span class="text-sm text-gray-900 font-medium">Auto-accept all tools</span>
                    <p class="text-xs text-gray-500">Skip confirmation for all tool uses</p>
                  </div>
                  <button
                    onclick={toggleAutoAccept}
                    class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${permissionSettings.autoAcceptAll ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span
                      class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${permissionSettings.autoAcceptAll ? 'translate-x-6' : 'translate-x-1'}`}
                    ></span>
                  </button>
                </div>

                {#if !permissionSettings.autoAcceptAll}
                  <div class="border-t border-gray-200 pt-4">
                    <p class="text-xs font-medium text-gray-500 mb-3">Require confirmation for:</p>
                    <div class="space-y-2">
                      {#each dangerousTools as tool}
                        <label class="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={permissionSettings.requireConfirmation.includes(tool)}
                            onchange={() => toggleRequireConfirmation(tool)}
                            class="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span class="text-sm text-gray-700">{tool}</span>
                          <span class="text-xs text-gray-400">
                            {#if tool === "Bash"}(shell commands){/if}
                            {#if tool === "Write"}(create files){/if}
                            {#if tool === "Edit"}(modify files){/if}
                          </span>
                        </label>
                      {/each}
                    </div>
                  </div>
                  
                  <p class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    When a tool requires confirmation, you'll see a dialog before it executes.
                  </p>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Storage Info -->
          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span class="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </span>
              Storage
            </h4>
            
            <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2 text-sm text-gray-600">
              <div class="flex justify-between">
                <span>Config location</span>
                <code class="text-xs bg-gray-200 px-1.5 py-0.5 rounded font-mono">~/.claude-code-ui/</code>
              </div>
              <div class="flex justify-between">
                <span>Audio backups</span>
                <code class="text-xs bg-gray-200 px-1.5 py-0.5 rounded font-mono">~/.claude-code-ui/audio-backups/</code>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button onclick={onClose} class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
