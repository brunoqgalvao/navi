<script lang="ts">
  type Model = {
    value: string;
    displayName: string;
    description: string;
    provider?: string;
  };

  let {
    models = [],
    selectedModel = $bindable(""),
    onSelect,
  }: {
    models: Model[];
    selectedModel: string;
    onSelect?: (model: string) => void;
  } = $props();

  let isOpen = $state(false);
  let containerRef: HTMLDivElement | undefined = $state();

  const currentModel = $derived(models.find(m => m.value === selectedModel));

  // Group models by provider
  const groupedModels = $derived(() => {
    const groups: { provider: string; label: string; models: Model[] }[] = [];
    const anthropicModels = models.filter(m => !m.provider || m.provider === "anthropic");
    const zaiModels = models.filter(m => m.provider === "zai");

    if (anthropicModels.length > 0) {
      groups.push({ provider: "anthropic", label: "Claude", models: anthropicModels });
    }
    if (zaiModels.length > 0) {
      groups.push({ provider: "zai", label: "Z.AI", models: zaiModels });
    }
    return groups;
  });

  function handleSelect(value: string, e: MouseEvent) {
    e.stopPropagation();
    selectedModel = value;
    isOpen = false;
    onSelect?.(value);
  }

  function toggleDropdown(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
  }

  function handleClickOutside(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener("click", handleClickOutside);
      };
    }
    return undefined;
  });
</script>

<div class="relative" bind:this={containerRef}>
  <button
    onclick={toggleDropdown}
    class="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-left hover:border-gray-300 transition-colors group"
  >
    <div class="flex-1 min-w-0">
      <div class="text-[11px] font-medium text-gray-900 truncate">
        {currentModel?.displayName || "Select model"}
      </div>
    </div>
    <svg
      class={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
    </svg>
  </button>

  {#if isOpen}
    <div class="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto">
      {#each groupedModels() as group}
        <div class="sticky top-0 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
          <span class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{group.label}</span>
        </div>
        {#each group.models as model}
          <button
            onclick={(e) => handleSelect(model.value, e)}
            class={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${selectedModel === model.value ? 'bg-blue-50' : ''}`}
          >
            <div class="flex items-center gap-2">
              {#if selectedModel === model.value}
                <svg class="w-3 h-3 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                </svg>
              {:else}
                <div class="w-3 h-3 shrink-0"></div>
              {/if}
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-medium text-gray-900">{model.displayName}</div>
                {#if model.description}
                  <div class="text-[10px] text-gray-500 truncate">{model.description}</div>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      {/each}
      {#if models.length === 0}
        <div class="px-3 py-2 text-[11px] text-gray-400 italic">Loading models...</div>
      {/if}
    </div>
  {/if}
</div>
