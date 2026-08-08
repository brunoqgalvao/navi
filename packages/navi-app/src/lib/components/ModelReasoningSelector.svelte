<script lang="ts">
  import { Check, ChevronDown, ChevronRight, Lock, Sparkles, Zap } from "lucide-svelte";
  import type { BackendId, ModelInfo, ReasoningEffort } from "../stores";
  import { getAnthropicModelShortLabel } from "../../../shared/anthropic-models";
  import { isZaiModel } from "../../../shared/zai-models";

  interface Props {
    backend: BackendId;
    selectedModel?: string;
    backendModels?: Record<BackendId, ModelInfo[]>;
    reasoningEffort?: ReasoningEffort;
    canChangeBackend?: boolean;
    onBackendChange?: (backend: BackendId) => void;
    onModelSelect?: (model: string) => void;
    onReasoningEffortChange?: (effort: ReasoningEffort) => void;
    class?: string;
  }

  let {
    backend,
    selectedModel = "",
    backendModels = { claude: [], codex: [], gemini: [] },
    reasoningEffort = "medium",
    canChangeBackend = false,
    onBackendChange,
    onModelSelect,
    onReasoningEffortChange,
    class: className = "",
  }: Props = $props();

  let isOpen = $state(false);
  let activeProvider = $state<ModelProviderId | null>(null);
  let containerRef: HTMLDivElement | undefined = $state();

  type ModelProviderId = "anthropic" | "zai" | "codex" | "gemini";

  const providerOrder: ModelProviderId[] = ["anthropic", "zai", "codex", "gemini"];

  const providerMeta: Record<ModelProviderId, { backendId: BackendId; label: string; icon: string; accent: string; muted: string; description: string }> = {
    anthropic: {
      backendId: "claude",
      label: "Claude",
      icon: "C",
      accent: "bg-orange-500 text-white",
      muted: "bg-orange-50 text-orange-700 dark:bg-orange-950/45 dark:text-orange-300",
      description: "Careful agent work",
    },
    zai: {
      backendId: "claude",
      label: "Z.ai",
      icon: "Z",
      accent: "bg-fuchsia-600 text-white",
      muted: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/45 dark:text-fuchsia-300",
      description: "GLM coding models",
    },
    codex: {
      backendId: "codex",
      label: "Codex",
      icon: "X",
      accent: "bg-emerald-600 text-white",
      muted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300",
      description: "Deep coding runs",
    },
    gemini: {
      backendId: "gemini",
      label: "Gemini",
      icon: "G",
      accent: "bg-blue-600 text-white",
      muted: "bg-blue-50 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300",
      description: "Long-context passes",
    },
  };

  const reasoningOptions: { value: ReasoningEffort; label: string }[] = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
    { value: "max", label: "Max" },
  ];

  const currentModels = $derived(backendModels[backend] || []);
  const currentModel = $derived.by(() => {
    const models = backendModels[backend] || [];
    if (selectedModel) {
      return models.find((model) => model.value === selectedModel) || null;
    }
    return models[0] || null;
  });
  const currentProvider = $derived(resolveProviderForSelection(backend, currentModel, selectedModel));
  const panelProvider = $derived(activeProvider || currentProvider);
  const panelModels = $derived(getProviderModels(panelProvider));
  const visibleProviders = $derived(providerOrder.filter((providerId) => {
    return providerId === currentProvider || getProviderModels(providerId).length > 0;
  }));
  const supportsReasoning = $derived(true);
  const effectiveReasoningEffort = $derived(
    backend === "gemini" && (reasoningEffort === "xhigh" || reasoningEffort === "max")
      ? "high"
      : backend === "codex" && reasoningEffort === "max"
        ? "xhigh"
        : reasoningEffort
  );

  function compactModelLabel(model: ModelInfo | string | null | undefined): string {
    const value = typeof model === "string" ? model : model?.value;
    const displayName = typeof model === "string" ? "" : model?.displayName;
    const anthropicLabel = getAnthropicModelShortLabel(value);

    if (anthropicLabel) return anthropicLabel;
    if (displayName) {
      return displayName
        .replace(/^Claude\s+/, "")
        .replace(/^Gemini\s+/, "Gemini ")
        .replace(/\s+\(Preview\)$/i, " Preview");
    }

    if (!value) return "Model";

    return value
      .replace(/^gpt-/, "GPT-")
      .replace(/^gemini-/, "Gemini ")
      .replace(/^claude-/, "")
      .replace(/-codex$/i, " Codex")
      .replace(/-preview$/i, " Preview")
      .replace(/-/g, " ");
  }

  function resolveProviderForSelection(
    selectedBackend: BackendId,
    model: ModelInfo | null | undefined,
    modelValue: string | null | undefined
  ): ModelProviderId {
    if (selectedBackend === "codex") return "codex";
    if (selectedBackend === "gemini") return "gemini";
    if (model?.provider === "zai" || isZaiModel(modelValue || model?.value)) return "zai";
    return "anthropic";
  }

  function getProviderModels(providerId: ModelProviderId): ModelInfo[] {
    const provider = providerMeta[providerId];
    const models = backendModels[provider.backendId] || [];

    if (providerId === "anthropic") {
      return models.filter((model) => !model.provider || model.provider === "anthropic");
    }

    if (providerId === "zai") {
      return models.filter((model) => model.provider === "zai" || isZaiModel(model.value));
    }

    return models;
  }

  function reasoningLabel(value: ReasoningEffort): string {
    return reasoningOptions.find((option) => option.value === value)?.label || "Medium";
  }

  function canUseProvider(targetProvider: ModelProviderId): boolean {
    const targetBackend = providerMeta[targetProvider].backendId;
    return targetBackend === backend || (canChangeBackend && !!onBackendChange);
  }

  function isReasoningOptionDisabled(value: ReasoningEffort): boolean {
    if (backend === "gemini") {
      return value === "xhigh" || value === "max";
    }
    if (backend === "codex") {
      return value === "max";
    }
    return false;
  }

  function reasoningDisabledTitle(value: ReasoningEffort): string | undefined {
    if (!isReasoningOptionDisabled(value)) return undefined;
    if (backend === "gemini") return "Gemini supports up to High";
    if (backend === "codex") return "Codex supports up to Extra High";
    return undefined;
  }

  function openMenu(event: MouseEvent) {
    event.stopPropagation();
    isOpen = !isOpen;
    activeProvider = currentProvider;
  }

  function closeMenu() {
    isOpen = false;
    activeProvider = null;
  }

  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      closeMenu();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeMenu();
    }
  }

  function focusProvider(targetProvider: ModelProviderId) {
    if (canUseProvider(targetProvider)) {
      activeProvider = targetProvider;
    }
  }

  function selectReasoning(value: ReasoningEffort, event: MouseEvent) {
    event.stopPropagation();
    if (isReasoningOptionDisabled(value)) return;
    onReasoningEffortChange?.(value);
  }

  function selectModel(targetProvider: ModelProviderId, model: string, event: MouseEvent) {
    event.stopPropagation();
    if (!canUseProvider(targetProvider)) return;

    const targetBackend = providerMeta[targetProvider].backendId;
    if (targetBackend !== backend) {
      onBackendChange?.(targetBackend);
    }

    onModelSelect?.(model);
    closeMenu();
  }

  $effect(() => {
    if (!currentModel && currentModels.length > 0 && !selectedModel) {
      onModelSelect?.(currentModels[0].value);
    }
  });

  $effect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
        document.addEventListener("keydown", handleKeydown);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("keydown", handleKeydown);
      };
    }

    return undefined;
  });
</script>

<div class="relative {className}" bind:this={containerRef}>
  <button
    type="button"
    onclick={openMenu}
    class="flex min-h-7 max-w-[18rem] items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] transition-[background-color,box-shadow,transform] duration-150 hover:bg-gray-200/80 active:scale-[0.96] dark:bg-gray-700/70 dark:text-gray-200 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] dark:hover:bg-gray-700"
    title="Model and reasoning"
    aria-expanded={isOpen}
  >
    <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full {providerMeta[currentProvider].muted}">
      <Zap size={12} strokeWidth={2.5} />
    </span>
    <span class="truncate text-[11px] font-semibold leading-none">
      {compactModelLabel(currentModel || selectedModel)}
    </span>
    {#if supportsReasoning}
      <span class="shrink-0 text-[11px] leading-none text-gray-500 dark:text-gray-400">
        {reasoningLabel(effectiveReasoningEffort)}
      </span>
    {/if}
    <ChevronDown
      size={13}
      strokeWidth={2.25}
      class="shrink-0 text-gray-500 transition-transform duration-150 dark:text-gray-400 {isOpen ? 'rotate-180' : ''}"
    />
  </button>

  {#if isOpen}
    <div
      class="absolute bottom-full left-0 z-[70] mb-2 w-[19rem] overflow-visible rounded-2xl bg-white p-2 text-gray-900 shadow-[0_18px_50px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)] dark:bg-gray-800 dark:text-gray-100 dark:shadow-[0_18px_50px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)]"
    >
      {#if supportsReasoning && onReasoningEffortChange}
        <div class="px-3 pb-1 pt-2 text-[13px] font-medium text-gray-400 dark:text-gray-500">
          Intelligence
        </div>
        <div class="space-y-0.5">
          {#each reasoningOptions as option}
            {@const isSelected = effectiveReasoningEffort === option.value}
            {@const disabledReasoning = isReasoningOptionDisabled(option.value)}
            <button
              type="button"
              onclick={(event) => selectReasoning(option.value, event)}
              disabled={disabledReasoning}
              class="flex h-9 w-full items-center justify-between rounded-xl px-3 text-left text-[15px] transition-[background-color,color,transform] duration-150 active:scale-[0.96] {isSelected ? 'bg-gray-100 text-gray-950 dark:bg-gray-700/70 dark:text-white' : 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'} {disabledReasoning ? 'cursor-not-allowed opacity-40' : ''}"
              title={reasoningDisabledTitle(option.value)}
            >
              <span>{option.label}</span>
              {#if isSelected}
                <Check size={19} strokeWidth={2.25} />
              {/if}
            </button>
          {/each}
        </div>

        <div class="my-2 h-px bg-gray-100 dark:bg-gray-700/70"></div>
      {/if}

      <div class="space-y-0.5">
        {#each visibleProviders as providerId}
          {@const meta = providerMeta[providerId]}
          {@const models = getProviderModels(providerId)}
          {@const providerAvailable = canUseProvider(providerId)}
          {@const selectedInProvider = providerId === currentProvider}
          <button
            type="button"
            onmouseenter={() => focusProvider(providerId)}
            onfocus={() => focusProvider(providerId)}
            onclick={() => focusProvider(providerId)}
            disabled={!providerAvailable}
            class="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.96] {panelProvider === providerId ? 'bg-gray-100 dark:bg-gray-700/70' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} {!providerAvailable ? 'cursor-not-allowed opacity-45' : ''}"
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold {meta.accent}">
              {meta.icon}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-medium text-gray-900 dark:text-gray-100">
                {meta.label}
              </span>
              <span class="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                {selectedInProvider ? compactModelLabel(currentModel || selectedModel) : models.length ? meta.description : "No models"}
              </span>
            </span>
            {#if !providerAvailable}
              <Lock size={14} strokeWidth={2.25} class="text-gray-400" />
            {:else}
              <ChevronRight size={18} strokeWidth={2.1} class="text-gray-400" />
            {/if}
          </button>
        {/each}
      </div>

      <div
        class="absolute bottom-0 left-[calc(100%+0.5rem)] z-[71] w-[21rem] overflow-hidden rounded-2xl bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)] dark:bg-gray-800 dark:shadow-[0_18px_50px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)]"
      >
        <div class="flex items-center gap-2 px-3 pb-2 pt-1">
          <span class="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold {providerMeta[panelProvider].accent}">
            {providerMeta[panelProvider].icon}
          </span>
          <div class="min-w-0">
            <div class="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              {providerMeta[panelProvider].label}
            </div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400">
              Model
            </div>
          </div>
          <Sparkles size={15} strokeWidth={2.2} class="ml-auto text-gray-400" />
        </div>

        <div class="max-h-72 space-y-0.5 overflow-y-auto pr-0.5">
          {#if panelModels.length > 0}
            {#each panelModels as model}
              {@const isSelected = currentProvider === panelProvider && (selectedModel === model.value || (!selectedModel && model === currentModel))}
              <button
                type="button"
                onclick={(event) => selectModel(panelProvider, model.value, event)}
                disabled={!canUseProvider(panelProvider)}
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.96] {isSelected ? 'bg-gray-100 text-gray-950 dark:bg-gray-700/70 dark:text-white' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} {!canUseProvider(panelProvider) ? 'cursor-not-allowed opacity-45' : ''}"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px] font-medium">
                    {compactModelLabel(model)}
                  </span>
                  {#if model.description}
                    <span class="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                      {model.description}
                    </span>
                  {/if}
                </span>
                {#if isSelected}
                  <Check size={18} strokeWidth={2.25} class="shrink-0" />
                {/if}
              </button>
            {/each}
          {:else}
            <div class="px-3 py-6 text-center text-[12px] text-gray-400">
              No models available
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
