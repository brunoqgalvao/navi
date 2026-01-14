<script lang="ts">
  import type { AccessibilityElement } from '$lib/utils/agent-browser-parser';
  import { showSuccess } from '$lib/errorHandler';

  interface Props {
    elements: AccessibilityElement[];
    maxHeight?: string;
    collapsible?: boolean;
    highlightRef?: string;
  }

  let { elements, maxHeight = '300px', collapsible = true, highlightRef }: Props = $props();

  let collapsed = $state(false);
  let lastElementsLength = $state(0);

  // Auto-collapse only when elements change (new snapshot), not on user toggle
  $effect(() => {
    if (elements.length !== lastElementsLength) {
      lastElementsLength = elements.length;
      if (elements.length > 20) {
        collapsed = true;
      }
    }
  });

  const visibleElements = $derived(
    collapsed ? elements.slice(0, 10) : elements
  );

  function copyRef(ref: string) {
    navigator.clipboard.writeText(ref);
    showSuccess('Copied', `${ref} copied to clipboard`);
  }

  function getRoleColor(role: string): string {
    // Theme-aware colors (dark on light, light on dark)
    const colors: Record<string, string> = {
      button: 'text-blue-600 dark:text-blue-400',
      link: 'text-cyan-600 dark:text-cyan-400',
      textbox: 'text-green-600 dark:text-green-400',
      heading: 'text-purple-600 dark:text-purple-400',
      img: 'text-yellow-600 dark:text-yellow-400',
      checkbox: 'text-orange-600 dark:text-orange-400',
      radio: 'text-orange-600 dark:text-orange-400',
      listitem: 'text-gray-500 dark:text-gray-400',
      paragraph: 'text-gray-500 dark:text-gray-500',
      document: 'text-gray-400 dark:text-gray-600',
    };
    return colors[role] || 'text-gray-500 dark:text-gray-400';
  }

  function getStateStyle(state: string): string {
    if (state === 'focused') return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300';
    if (state === 'disabled') return 'bg-gray-100 dark:bg-gray-500/20 text-gray-500 dark:text-gray-400';
    if (state.startsWith('level=')) return 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300';
    if (state.startsWith('nth=')) return 'bg-gray-100 dark:bg-gray-500/20 text-gray-500 dark:text-gray-400';
    return 'bg-gray-100 dark:bg-gray-500/20 text-gray-500 dark:text-gray-400';
  }
</script>

<div class="a11y-tree font-mono text-xs" style:max-height={maxHeight}>
  <div class="space-y-0.5">
    {#each visibleElements as el (el.ref)}
      <div
        class="a11y-element flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 transition-colors {highlightRef === el.ref ? 'highlighted' : ''}"
        style:padding-left={`${el.indent * 12 + 4}px`}
      >
        <!-- Ref badge (clickable to copy) -->
        <button
          class="ref-badge px-1.5 py-0.5 rounded bg-blue-100 dark:bg-accent/20 text-blue-700 dark:text-accent text-[10px] font-bold
                 hover:bg-blue-200 dark:hover:bg-accent/30 active:scale-95 transition-all cursor-pointer flex-shrink-0"
          onclick={() => copyRef(el.ref)}
          title="Click to copy"
        >
          {el.ref}
        </button>

        <!-- Role -->
        <span class="role flex-shrink-0 {getRoleColor(el.role)}">
          {el.role}
        </span>

        <!-- Name (truncated if long) -->
        {#if el.name}
          <span class="name text-gray-700 dark:text-white/80 truncate" title={el.name}>
            "{el.name.length > 40 ? el.name.slice(0, 40) + '...' : el.name}"
          </span>
        {/if}

        <!-- States -->
        {#if el.states.length > 0}
          <span class="states flex gap-1 flex-shrink-0">
            {#each el.states as state}
              <span class="px-1 py-0.5 rounded text-[9px] {getStateStyle(state)}">
                {state}
              </span>
            {/each}
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Collapse/Expand toggle -->
  {#if collapsible && elements.length > 10}
    <button
      class="mt-2 w-full py-1 text-center text-xs text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80
             hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors"
      onclick={() => collapsed = !collapsed}
    >
      {#if collapsed}
        Show all {elements.length} elements ({elements.length - 10} more)
      {:else}
        Show less
      {/if}
    </button>
  {/if}
</div>

<style>
  .a11y-tree {
    overflow-y: auto;
    scrollbar-width: thin;
  }

  :global(.dark) .a11y-tree {
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  :global(:not(.dark)) .a11y-tree {
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }

  .a11y-tree::-webkit-scrollbar {
    width: 6px;
  }

  .a11y-tree::-webkit-scrollbar-track {
    background: transparent;
  }

  :global(.dark) .a11y-tree::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }

  :global(:not(.dark)) .a11y-tree::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  .highlighted {
    background: rgba(var(--accent-rgb), 0.1);
    border-left: 2px solid rgb(var(--accent-rgb));
  }
</style>
