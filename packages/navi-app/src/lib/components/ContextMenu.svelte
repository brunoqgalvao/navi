<script lang="ts">
  import { onMount } from "svelte";

  interface MenuItem {
    label: string;
    icon?: string;
    onclick: () => void;
    show?: boolean;
  }

  interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onclose: () => void;
  }

  let { x, y, items, onclose }: Props = $props();

  let menuRef = $state<HTMLDivElement | null>(null);
  let adjustedX = $state(x);
  let adjustedY = $state(y);

  onMount(() => {
    if (menuRef) {
      const rect = menuRef.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 8;
      }
    }

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onclose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  function handleClick(item: MenuItem) {
    item.onclick();
    onclose();
  }

  const visibleItems = $derived(items.filter(item => item.show !== false));
</script>

<svelte:window onclick={onclose} />

<div 
  bind:this={menuRef}
  class="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]"
  style="left: {adjustedX}px; top: {adjustedY}px;"
  onclick={(e) => e.stopPropagation()}
  role="menu"
>
  {#each visibleItems as item}
    <button
      onclick={() => handleClick(item)}
      class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
      role="menuitem"
    >
      {#if item.icon}
        {@html item.icon}
      {/if}
      {item.label}
    </button>
  {/each}
</div>
