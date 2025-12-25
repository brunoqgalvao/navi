<script lang="ts">
  import { api, type PermissionSettings } from "../api";

  interface Props {
    settings: PermissionSettings | null;
    defaultTools: string[];
    dangerousTools: string[];
    globalSettings?: PermissionSettings | null;
    saving?: boolean;
    showInheritOption?: boolean;
    onSave: (settings: PermissionSettings | null) => void;
  }

  let { 
    settings, 
    defaultTools, 
    dangerousTools, 
    globalSettings,
    saving = false,
    showInheritOption = true,
    onSave 
  }: Props = $props();

  let useCustom = $state(settings !== null);
  let localSettings = $state<PermissionSettings>(
    settings || globalSettings || {
      autoAcceptAll: false,
      allowedTools: [...defaultTools],
      requireConfirmation: [...dangerousTools],
    }
  );

  $effect(() => {
    if (settings !== null) {
      useCustom = true;
      localSettings = settings;
    } else {
      useCustom = false;
      localSettings = globalSettings || {
        autoAcceptAll: false,
        allowedTools: [...defaultTools],
        requireConfirmation: [...dangerousTools],
      };
    }
  });

  function toggleCustom() {
    useCustom = !useCustom;
    if (useCustom) {
      localSettings = globalSettings ? { ...globalSettings } : {
        autoAcceptAll: false,
        allowedTools: [...defaultTools],
        requireConfirmation: [...dangerousTools],
      };
      onSave(localSettings);
    } else {
      onSave(null);
    }
  }

  function toggleAutoAcceptAll() {
    localSettings = { ...localSettings, autoAcceptAll: !localSettings.autoAcceptAll };
    onSave(localSettings);
  }

  function toggleToolAllowed(tool: string) {
    const isAllowed = localSettings.allowedTools.includes(tool);
    const newAllowed = isAllowed
      ? localSettings.allowedTools.filter(t => t !== tool)
      : [...localSettings.allowedTools, tool];
    const newConfirm = isAllowed
      ? localSettings.requireConfirmation.filter(t => t !== tool)
      : localSettings.requireConfirmation;
    localSettings = { ...localSettings, allowedTools: newAllowed, requireConfirmation: newConfirm };
    onSave(localSettings);
  }

  function toggleRequireConfirmation(tool: string) {
    const requires = localSettings.requireConfirmation.includes(tool);
    const newConfirm = requires
      ? localSettings.requireConfirmation.filter(t => t !== tool)
      : [...localSettings.requireConfirmation, tool];
    localSettings = { ...localSettings, requireConfirmation: newConfirm };
    onSave(localSettings);
  }
</script>

<div class="space-y-4">
  {#if showInheritOption}
    <div class="flex items-center justify-between">
      <div class="space-y-0.5">
        <span class="text-sm text-gray-900 font-medium">Custom permissions</span>
        <p class="text-xs text-gray-500">Override global settings for this context</p>
      </div>
      <button
        onclick={toggleCustom}
        disabled={saving}
        class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useCustom ? 'bg-gray-900' : 'bg-gray-300'}`}
      >
        <span
          class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useCustom ? 'translate-x-6' : 'translate-x-1'}`}
        ></span>
      </button>
    </div>
  {/if}

  {#if !showInheritOption || useCustom}
    <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-4">
      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <span class="text-sm text-gray-900 font-medium">Auto-accept all tools</span>
          <p class="text-xs text-gray-500">Skip confirmation dialogs</p>
        </div>
        <button
          onclick={toggleAutoAcceptAll}
          disabled={saving}
          class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${localSettings.autoAcceptAll ? 'bg-red-600' : 'bg-gray-300'}`}
        >
          <span
            class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localSettings.autoAcceptAll ? 'translate-x-6' : 'translate-x-1'}`}
          ></span>
        </button>
      </div>

      {#if !localSettings.autoAcceptAll}
        <div class="border-t border-gray-200 pt-4 space-y-3">
          <p class="text-xs text-gray-600 font-medium">Allowed Tools</p>
          <div class="grid grid-cols-2 gap-2">
            {#each defaultTools as tool}
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.allowedTools.includes(tool)}
                  onchange={() => toggleToolAllowed(tool)}
                  disabled={saving}
                  class="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span class={localSettings.allowedTools.includes(tool) ? 'text-gray-900' : 'text-gray-400'}>{tool}</span>
                {#if dangerousTools.includes(tool)}
                  <span class="text-xs text-red-500">!</span>
                {/if}
              </label>
            {/each}
          </div>
        </div>

        <div class="border-t border-gray-200 pt-4 space-y-3">
          <p class="text-xs text-gray-600 font-medium">Require Confirmation</p>
          <div class="grid grid-cols-2 gap-2">
            {#each localSettings.allowedTools as tool}
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.requireConfirmation.includes(tool)}
                  onchange={() => toggleRequireConfirmation(tool)}
                  disabled={saving}
                  class="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span class="text-gray-900">{tool}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <p class="text-xs text-gray-500 bg-gray-100 rounded px-3 py-2">
      Using global permission settings. Enable custom permissions to override.
    </p>
  {/if}
</div>
