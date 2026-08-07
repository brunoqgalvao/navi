<script lang="ts">
  import { Check, ChevronDown, ChevronRight, Lock, Sparkles, Zap } from "lucide-svelte";
  import type { BackendId, ModelInfo, ReasoningEffort } from "../stores";
  import { getAnthropicModelShortLabel } from "../../../shared/anthropic-models";

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
  let activeBackend = $state<BackendId | null>(null);
  let containerRef: HTMLDivElement | undefined = $state();

  const backendOrder: BackendId[] = ["claude", "codex", "gemini"];

  const backendMeta: Record<BackendId, { label: string; icon: string; accent: string; muted: string; description: string }> = {
    claude: {
      label: "Claude",
      icon: "C",
      accent: "bg-orange-500 text-white",
      muted: "bg-orange-50 text-orange-700 dark:bg-orange-950/45 dark:text-orange-300",
      description: "Careful agent work",
    },
    codex: {
      label: "Codex",
      icon: "X",
      accent: "bg-emerald-600 text-white",
      muted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300",
      description: "Deep coding runs",
    },
    gemini: {
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
  ];

  const currentModels = $derived(backendModels[backend] || []);
  const currentModel = $derived.by(() => {
    const models = backendModels[backend] || [];
    return models.find((model) => model.value === selectedModel) || models[0] || null;
  });
  const panelBackend = $derived(activeBackend || backend);
  const panelModels = $derived(backendModels[panelBackend] || []);
  const supportsReasoning = true;
  // Claude (via CLAUDE_CODE_EFFORT_LEVEL) and Gemini support up to "high"
  const capsAtHigh = $derived(backend === "gemini" || backend === "claude");
  const effectiveReasoningEffort = $derived(
    capsAtHigh && reasoningEffort === "xhigh" ? "high" : reasoningEffort
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

  function reasoningLabel(value: ReasoningEffort): string {
    return reasoningOptions.find((option) => option.value === value)?.label || "Medium";
  }

  function canUseBackend(targetBackend: BackendId): boolean {
    return targetBackend === backend || (canChangeBackend && !!onBackendChange);
  }

  function isReasoningOptionDisabled(value: ReasoningEffort): boolean {
    return capsAtHigh && value === "xhigh";
  }

  function openMenu(event: MouseEvent) {
    event.stopPropagation();
    isOpen = !isOpen;
    activeBackend = backend;
  }

  function closeMenu() {
    isOpen = false;
    activeBackend = null;
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

  function focusBackend(targetBackend: BackendId) {
    if (canUseBackend(targetBackend)) {
      activeBackend = targetBackend;
    }
  }

  function selectReasoning(value: ReasoningEffort, event: MouseEvent) {
    event.stopPropagation();
    if (isReasoningOptionDisabled(value)) return;
    onReasoningEffortChange?.(value);
  }

  function selectModel(targetBackend: BackendId, model: string, event: MouseEvent) {
    event.stopPropagation();
    if (!canUseBackend(targetBackend)) return;

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
    <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full {backendMeta[backend].muted}">
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
              title={disabledReasoning ? `${backendMeta[backend].label} supports up to High` : undefined}
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
        {#each backendOrder as backendId}
          {@const meta = backendMeta[backendId]}
          {@const models = backendModels[backendId] || []}
          {@const backendAvailable = canUseBackend(backendId)}
          {@const selectedInBackend = backendId === backend}
          <button
            type="button"
            onmouseenter={() => focusBackend(backendId)}
            onfocus={() => focusBackend(backendId)}
            onclick={() => focusBackend(backendId)}
            disabled={!backendAvailable}
            class="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.96] {panelBackend === backendId ? 'bg-gray-100 dark:bg-gray-700/70' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} {!backendAvailable ? 'cursor-not-allowed opacity-45' : ''}"
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold {meta.accent}">
              {meta.icon}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15px] font-medium text-gray-900 dark:text-gray-100">
                {meta.label}
              </span>
              <span class="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                {selectedInBackend ? compactModelLabel(currentModel || selectedModel) : models.length ? meta.description : "No models"}
              </span>
            </span>
            {#if !backendAvailable}
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
          <span class="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold {backendMeta[panelBackend].accent}">
            {backendMeta[panelBackend].icon}
          </span>
          <div class="min-w-0">
            <div class="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              {backendMeta[panelBackend].label}
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
              {@const isSelected = backend === panelBackend && (selectedModel === model.value || (!selectedModel && model === currentModel))}
              <button
                type="button"
                onclick={(event) => selectModel(panelBackend, model.value, event)}
                disabled={!canUseBackend(panelBackend)}
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.96] {isSelected ? 'bg-gray-100 text-gray-950 dark:bg-gray-700/70 dark:text-white' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} {!canUseBackend(panelBackend) ? 'cursor-not-allowed opacity-45' : ''}"
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
