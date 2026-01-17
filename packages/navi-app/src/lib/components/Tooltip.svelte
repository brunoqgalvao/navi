<script lang="ts">
  /**
   * Tooltip - A simple tooltip component that shows on hover
   *
   * Usage:
   * <Tooltip text="My tooltip">
   *   <button>Hover me</button>
   * </Tooltip>
   */
  import type { Snippet } from "svelte";

  interface Props {
    text: string;
    position?: "top" | "bottom" | "left" | "right";
    delay?: number;
    disabled?: boolean;
    children: Snippet;
  }

  let { text, position = "top", delay = 200, disabled = false, children }: Props = $props();

  let visible = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function handleMouseEnter() {
    timeoutId = setTimeout(() => {
      visible = true;
    }, delay);
  }

  function handleMouseLeave() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    visible = false;
  }
</script>

<div
  class="relative inline-flex"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  {@render children()}

  {#if visible && !disabled}
    <div
      class="absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg whitespace-nowrap pointer-events-none
        {position === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' : ''}
        {position === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-2' : ''}
        {position === 'left' ? 'right-full top-1/2 -translate-y-1/2 mr-2' : ''}
        {position === 'right' ? 'left-full top-1/2 -translate-y-1/2 ml-2' : ''}"
      role="tooltip"
    >
      {text}
      <!-- Arrow -->
      <div
        class="absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 transform rotate-45
          {position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' : ''}
          {position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' : ''}
          {position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' : ''}
          {position === 'right' ? 'right-full top-1/2 -translate-y-1/2 -mr-1' : ''}"
      ></div>
    </div>
  {/if}
</div>
