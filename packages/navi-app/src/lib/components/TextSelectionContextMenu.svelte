<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    x: number;
    y: number;
    selectedText: string;
    onQuote: (text: string) => void;
    onForkWithQuote: (text: string) => void;
    onClose: () => void;
  }

  let { x, y, selectedText, onQuote, onForkWithQuote, onClose }: Props = $props();

  let menuRef = $state<HTMLDivElement | null>(null);
  let adjustedX = $state(0);
  let adjustedY = $state(0);

  // Initialize and adjust position on mount
  onMount(() => {
    // Start with prop values
    adjustedX = x;
    adjustedY = y;

    // Adjust for viewport boundaries
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
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  function handleQuote() {
    onQuote(selectedText);
    onClose();
  }

  function handleForkWithQuote() {
    onForkWithQuote(selectedText);
    onClose();
  }

  // Truncate display text if too long
  const truncatedText = $derived(
    selectedText.length > 50 ? selectedText.slice(0, 50) + "..." : selectedText
  );
</script>

<svelte:window onclick={onClose} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  bind:this={menuRef}
  class="fixed bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[100] min-w-[180px] max-w-[280px]"
  style="left: {adjustedX}px; top: {adjustedY}px;"
  onclick={(e) => e.stopPropagation()}
  oncontextmenu={(e) => e.preventDefault()}
  role="menu"
  tabindex="-1"
>
  <!-- Preview of selected text -->
  <div class="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 truncate">
    "{truncatedText}"
  </div>

  <!-- Quote option -->
  <button
    onclick={handleQuote}
    class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2.5 transition-colors"
    role="menuitem"
  >
    <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
    </svg>
    Quote in chat
  </button>

  <!-- Fork with quote option -->
  <button
    onclick={handleForkWithQuote}
    class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2.5 transition-colors"
    role="menuitem"
  >
    <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
    </svg>
    Fork with quote
  </button>
</div>
