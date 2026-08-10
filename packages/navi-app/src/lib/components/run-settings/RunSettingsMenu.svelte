<script lang="ts">
  /**
   * The composer's run settings chip and menu.
   *
   * Replaces ModelReasoningSelector's two-pane hover flyout with labelled rows in the shape
   * of Codex's own settings popover, plus one axis Codex does not have: the harness.
   *
   * Two behaviours here are deliberate and easy to lose:
   *  - the harness row appears only while the chat can still switch. Otherwise a footer
   *    states the constraint once, instead of padlocking every other row and implying an
   *    auth problem, which is what the old menu did.
   *  - an entry that cannot run is still listed, greyed, with the reason and a way to fix
   *    it. Z.ai used to vanish entirely when it had no key.
   */
  import { ChevronDown, Zap, AlertCircle, Copy, Check } from "lucide-svelte";
  import type { BackendId, ModelInfo, ReasoningEffort } from "../../stores";
  import {
    runAvailability,
    type AvailabilityFix,
    type EntryAvailability,
    type MenuEntryId,
  } from "../../stores/run-availability";
  import { entryMeta, compactModelLabel, reasoningLabel, reasoningOptions, resolveEntryForSelection } from "./entries";
  import { modelGroupsFor, shouldShowHarnessRow, harnessFooterText, harnessMeta } from "./model-groups";
  import { isEffortDisabled, effortDisabledReason, clampEffort } from "./effort";
  import MenuRow from "./MenuRow.svelte";
  import MenuItem from "./MenuItem.svelte";

  interface Props {
    backend: BackendId;
    selectedModel?: string;
    backendModels?: Record<BackendId, ModelInfo[]>;
    reasoningEffort?: ReasoningEffort;
    canChangeBackend?: boolean;
    onBackendChange?: (backend: BackendId) => void;
    onModelSelect?: (model: string) => void;
    onReasoningEffortChange?: (effort: ReasoningEffort) => void;
    onOpenProviderSettings?: () => void;
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
    onOpenProviderSettings,
    class: className = "",
  }: Props = $props();

  let isOpen = $state(false);
  let containerRef = $state<HTMLDivElement | null>(null);
  let chipRef = $state<HTMLButtonElement | null>(null);
  let copiedCommand = $state<string | null>(null);

  const READY: EntryAvailability = { state: "ready" };
  const ALL_READY: Record<MenuEntryId, EntryAvailability> = {
    claude: READY,
    codex: READY,
    gemini: READY,
    zai: READY,
  };

  type EntryProblem = Extract<EntryAvailability, { state: "needs-setup" }>;

  /** Narrows to the problem case, so `.fix` is reachable in the template. */
  function problemOf(entry: EntryAvailability | undefined): EntryProblem | null {
    return entry && entry.state === "needs-setup" ? entry : null;
  }

  const availability = $derived($runAvailability ?? ALL_READY);
  const currentModels = $derived(backendModels[backend] ?? []);
  const currentModel = $derived(currentModels.find((m) => m.value === selectedModel) ?? null);
  const currentEntry = $derived(resolveEntryForSelection(backend, currentModel, selectedModel));
  const effectiveEffort = $derived(clampEffort(backend, reasoningEffort));
  const groups = $derived(modelGroupsFor(backendModels, backend, canChangeBackend, availability));
  const currentEntryProblem = $derived(problemOf(availability[currentEntry]));

  function openMenu(event: MouseEvent) {
    event.stopPropagation();
    isOpen = !isOpen;
    if (isOpen) void runAvailability.refresh();
  }

  function closeMenu() {
    isOpen = false;
  }

  function dismissToChip() {
    closeMenu();
    chipRef?.focus();
  }

  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) closeMenu();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") dismissToChip();
  }

  // Carried over deliberately: without this a brand-new chat opens with an empty chip.
  $effect(() => {
    if (!currentModel && currentModels.length > 0 && !selectedModel) {
      onModelSelect?.(currentModels[0].value);
    }
  });

  $effect(() => {
    if (isOpen) {
      // The timeout stops the click that opened the menu from immediately closing it.
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

  function selectHarness(target: BackendId) {
    if (availability[target]?.state === "needs-setup") return;
    onBackendChange?.(target);
    closeMenu();
  }

  function selectModel(model: ModelInfo, harness: BackendId) {
    // Picking a model from another harness switches the harness with it — the behaviour
    // the old selectModel had. Order matters: backend first, then model.
    if (harness !== backend) onBackendChange?.(harness);
    onModelSelect?.(model.value);
    closeMenu();
  }

  function selectEffort(value: ReasoningEffort) {
    if (isEffortDisabled(backend, value)) return;
    onReasoningEffortChange?.(value);
    closeMenu();
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      copiedCommand = command;
      setTimeout(() => (copiedCommand = null), 1600);
    } catch {
      /* clipboard unavailable; the command is visible to copy by hand */
    }
  }
</script>

<div class="relative {className}" bind:this={containerRef}>
  <button
    bind:this={chipRef}
    type="button"
    onclick={openMenu}
    class="flex min-h-7 max-w-[18rem] items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] transition-[background-color,box-shadow,transform] duration-150 hover:bg-gray-200/80 active:scale-[0.96] dark:bg-gray-700/70 dark:text-gray-200 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] dark:hover:bg-gray-700"
    title="Model and reasoning"
    aria-haspopup="menu"
    aria-expanded={isOpen}
  >
    <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full {entryMeta[currentEntry].muted}">
      <Zap size={12} strokeWidth={2.5} />
    </span>
    <span class="truncate text-[11px] font-semibold leading-none">
      {compactModelLabel(currentModel || selectedModel)}
    </span>
    <span class="shrink-0 text-[11px] leading-none text-gray-500 dark:text-gray-400">
      {reasoningLabel(effectiveEffort)}
    </span>
    {#if currentEntryProblem}
      <AlertCircle size={12} class="shrink-0 text-amber-500" aria-label={currentEntryProblem.reason} />
    {/if}
    <ChevronDown
      size={13}
      strokeWidth={2.25}
      class="shrink-0 text-gray-500 transition-transform duration-150 dark:text-gray-400 {isOpen ? 'rotate-180' : ''}"
    />
  </button>

  {#if isOpen}
    <div
      role="menu"
      aria-label="Run settings"
      class="absolute bottom-full left-0 z-[70] mb-2 w-[19rem] overflow-visible rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
    >
      {#snippet fixAffordance(fix: AvailabilityFix)}
        {#if fix.kind === "settings"}
          <button
            type="button"
            onclick={() => { closeMenu(); onOpenProviderSettings?.(); }}
            class="mb-1 ml-3 rounded-lg px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
          >
            Set up →
          </button>
        {:else}
          <button
            type="button"
            onclick={() => copyCommand(fix.command)}
            class="mb-1 ml-3 flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-600 hover:bg-gray-100 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:bg-gray-900"
            title="Copy install command"
          >
            <span class="truncate">{fix.command}</span>
            {#if copiedCommand === fix.command}
              <Check size={11} class="shrink-0 text-emerald-500" />
            {:else}
              <Copy size={11} class="shrink-0 opacity-60" />
            {/if}
          </button>
        {/if}
      {/snippet}

      {#if shouldShowHarnessRow(canChangeBackend)}
        <MenuRow label="Harness" value={harnessMeta[backend].label} onDismiss={dismissToChip}>
          {#each Object.keys(harnessMeta) as BackendId[] as harness}
            {@const problem = problemOf(availability[harness])}
            <MenuItem
              label={harnessMeta[harness].label}
              description={problem ? problem.reason : harnessMeta[harness].description}
              note={problem ? "unavailable" : ""}
              selected={harness === backend}
              disabled={!!problem}
              title={problem?.reason}
              onSelect={() => selectHarness(harness)}
            />
            {#if problem}
              {@render fixAffordance(problem.fix)}
            {/if}
          {/each}
        </MenuRow>
      {/if}

      <MenuRow
        label="Model"
        value={compactModelLabel(currentModel || selectedModel)}
        onDismiss={dismissToChip}
      >
        {#each groups as group (group.id)}
          <div
            class="sticky top-0 z-[1] bg-white px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:bg-gray-800 dark:text-gray-500"
          >
            {group.label}
            {#if group.availability.state === "needs-setup"}
              <span class="ml-1 normal-case tracking-normal text-gray-400">
                · {group.availability.reason}
              </span>
            {/if}
          </div>

          {@const groupProblem = problemOf(group.availability)}
          {#if groupProblem}
            {@render fixAffordance(groupProblem.fix)}
          {/if}

          {#each group.models as model (model.value)}
            <MenuItem
              label={model.displayName || model.value}
              description={model.description}
              selected={model.value === selectedModel}
              disabled={group.availability.state === "needs-setup"}
              onSelect={() => selectModel(model, group.harness)}
            />
          {/each}
        {/each}
      </MenuRow>

      <MenuRow label="Effort" value={reasoningLabel(effectiveEffort)} onDismiss={dismissToChip}>
        {#each reasoningOptions as option (option.value)}
          <MenuItem
            label={option.label}
            selected={option.value === effectiveEffort}
            disabled={isEffortDisabled(backend, option.value)}
            title={effortDisabledReason(backend, option.value)}
            onSelect={() => selectEffort(option.value)}
          />
        {/each}
      </MenuRow>

      {#if !shouldShowHarnessRow(canChangeBackend)}
        <div class="mt-1 border-t border-gray-100 pt-2 dark:border-gray-700">
          <p class="px-3 pb-1 text-[11px] text-gray-400 dark:text-gray-500">
            {harnessFooterText(backend)}
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>
