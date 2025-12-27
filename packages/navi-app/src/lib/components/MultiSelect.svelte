<script lang="ts">
  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    options: Option[];
    selected: string[];
    placeholder?: string;
    onChange: (selected: string[]) => void;
  }

  let { options, selected, placeholder = "All", onChange }: Props = $props();

  let isOpen = $state(false);
  let searchQuery = $state("");

  let filteredOptions = $derived(
    searchQuery.trim()
      ? options.filter(o => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
      : options
  );

  let displayText = $derived(
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find(o => o.value === selected[0])?.label || "1 selected"
        : `${selected.length} selected`
  );

  function toggleOption(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function selectAll() {
    onChange(options.map(o => o.value));
  }

  function clearAll() {
    onChange([]);
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".multiselect-container")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
    return undefined;
  });
</script>

<div class="multiselect-container relative">
  <button
    type="button"
    onclick={() => isOpen = !isOpen}
    class="w-full text-left text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:border-gray-900 focus:outline-none flex items-center justify-between gap-2 hover:border-gray-400 transition-colors"
  >
    <span class="truncate {selected.length === 0 ? 'text-gray-500' : 'text-gray-900'}">{displayText}</span>
    <svg class="w-4 h-4 text-gray-400 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if isOpen}
    <div class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-hidden flex flex-col">
      <div class="p-2 border-b border-gray-100">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search..."
          class="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:border-gray-400 focus:outline-none"
        />
      </div>
      
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-100 text-xs">
        <button onclick={selectAll} class="text-blue-600 hover:text-blue-800">Select all</button>
        <button onclick={clearAll} class="text-gray-500 hover:text-gray-700">Clear</button>
      </div>

      <div class="overflow-y-auto flex-1">
        {#if filteredOptions.length === 0}
          <div class="px-3 py-2 text-sm text-gray-500">No options found</div>
        {:else}
          {#each filteredOptions as option}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onchange={() => toggleOption(option.value)}
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-900 truncate">{option.label}</span>
            </label>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
