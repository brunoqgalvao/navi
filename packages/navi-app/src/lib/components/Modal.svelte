<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
    title: string;
    children: Snippet;
    footer?: Snippet;
    size?: "sm" | "md" | "lg" | "xl" | "full";
    headerSlot?: Snippet;
  }

  let { open, onClose, title, children, footer, size = "md", headerSlot }: Props = $props();

  const sizeClasses: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[90vw] max-h-[90vh]",
  };

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30 dark:bg-black/50"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-full {sizeClasses[size]} overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col {size === 'full' ? 'h-[90vh]' : ''}">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
        {#if headerSlot}
          {@render headerSlot()}
        {:else}
          <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100">{title}</h3>
        {/if}
        <button
          onclick={onClose}
          class="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-6 overflow-y-auto flex-1">
        {@render children()}
      </div>
      {#if footer}
        <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
