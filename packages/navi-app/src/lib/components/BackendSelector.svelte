<script lang="ts">
  import { onMount } from "svelte";
  import { backendsApi, type BackendId, type BackendInfo } from "$lib/api";

  interface Props {
    value?: string | null; // Now "backend:model" format e.g. "claude:claude-sonnet-4-20250514"
    onchange?: (backend: BackendId, model: string) => void;
    class?: string;
  }

  let {
    value = $bindable("claude:claude-sonnet-4-20250514"),
    onchange,
    class: className = "",
  }: Props = $props();

  let backends: BackendInfo[] = $state([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isOpen = $state(false);

  // Backend icons/colors
  const backendMeta: Record<BackendId, { icon: string; color: string; label: string }> = {
    claude: { icon: "C", color: "bg-orange-500", label: "Claude" },
    codex: { icon: "X", color: "bg-green-500", label: "Codex" },
    gemini: { icon: "G", color: "bg-blue-500", label: "Gemini" },
  };

  onMount(async () => {
    try {
      backends = await backendsApi.list();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  // Parse current value
  const parsed = $derived(() => {
    if (!value) return { backendId: "claude" as BackendId, model: "" };
    const [backendId, ...modelParts] = value.split(":");
    return {
      backendId: (backendId || "claude") as BackendId,
      model: modelParts.join(":") || "",
    };
  });

  // Get currently selected backend info
  const selectedBackend = $derived(backends.find((b) => b.id === parsed().backendId));
  const selectedModel = $derived(parsed().model || selectedBackend?.models?.[0] || "");

  // Build options list: group by backend, with models underneath
  type Option = {
    backendId: BackendId;
    model: string;
    label: string;
    isDefault?: boolean;
    installed: boolean;
  };

  const options = $derived<Option[]>(() => {
    const result: Option[] = [];
    for (const backend of backends) {
      const meta = backendMeta[backend.id];
      const models = backend.models || [];
      for (const model of models) {
        const isDefault = models.indexOf(model) === 0;
        result.push({
          backendId: backend.id,
          model,
          label: `${meta.label} › ${formatModelName(model)}${isDefault ? " (default)" : ""}`,
          isDefault,
          installed: backend.installed,
        });
      }
    }
    return result;
  });

  function formatModelName(model: string): string {
    // Make model names more readable
    return model
      .replace(/^claude-/, "")
      .replace(/^gpt-/, "GPT ")
      .replace(/^gemini-/, "")
      .replace(/-preview$/, " Preview")
      .replace(/-20\d{6}$/, ""); // Remove date suffix
  }

  function handleSelect(opt: Option) {
    if (!opt.installed) return;
    value = `${opt.backendId}:${opt.model}`;
    onchange?.(opt.backendId, opt.model);
    isOpen = false;
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".backend-selector")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });
</script>

<div class="backend-selector relative {className}">
  {#if loading}
    <div class="text-zinc-500 text-sm">Loading...</div>
  {:else if error}
    <div class="text-red-500 text-sm">{error}</div>
  {:else}
    <!-- Dropdown trigger -->
    <button
      type="button"
      onclick={() => (isOpen = !isOpen)}
      class="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700
             hover:border-zinc-500 bg-zinc-800/50 w-full text-left transition-all"
    >
      {@const meta = backendMeta[parsed().backendId]}
      <div
        class="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold {meta.color}"
      >
        {meta.icon}
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium truncate">
          {meta.label} › {formatModelName(selectedModel)}
        </div>
      </div>
      <svg
        class="w-4 h-4 text-zinc-400 transition-transform {isOpen ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown menu -->
    {#if isOpen}
      <div
        class="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700
               rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto"
      >
        {#each backends as backend}
          {@const meta = backendMeta[backend.id]}
          {@const models = backend.models || []}

          <!-- Backend header -->
          <div class="px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide
                      bg-zinc-900/50 sticky top-0 flex items-center gap-2 border-b border-zinc-700/50">
            <div
              class="w-4 h-4 rounded flex items-center justify-center text-white text-[10px] font-bold {meta.color}"
            >
              {meta.icon}
            </div>
            {meta.label}
            {#if !backend.installed}
              <span class="text-zinc-500 font-normal normal-case">(not installed)</span>
            {/if}
          </div>

          <!-- Models -->
          {#each models as model, i}
            {@const isSelected = parsed().backendId === backend.id && selectedModel === model}
            <button
              type="button"
              onclick={() => handleSelect({ backendId: backend.id, model, label: "", installed: backend.installed })}
              disabled={!backend.installed}
              class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                     {isSelected ? 'bg-accent-500/20 text-accent-300' : 'hover:bg-zinc-700/50'}
                     {!backend.installed ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
            >
              <span class="w-4"></span>
              <span class="flex-1 truncate">{formatModelName(model)}</span>
              {#if i === 0}
                <span class="text-xs text-zinc-500">default</span>
              {/if}
              {#if isSelected}
                <svg class="w-4 h-4 text-accent-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              {/if}
            </button>
          {/each}
        {/each}
      </div>
    {/if}

    <!-- Warning for backends without permission callbacks -->
    {#if selectedBackend && !selectedBackend.supportsCallbackPermissions}
      <div class="mt-2 text-xs text-yellow-500 flex items-center gap-1">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
        Uses auto-approve mode (no permission prompts)
      </div>
    {/if}
  {/if}
</div>

<style>
  .backend-selector {
    @apply text-zinc-200;
  }
</style>
