<script lang="ts">
  /**
   * One row of the run settings menu: a label, its current value, and a submenu.
   *
   * Owns opening, keyboard navigation and edge-aware positioning so RunSettingsMenu stays
   * about content. Roving focus works by querying this row's own submenu container for
   * [role="menuitemradio"] — the items themselves come from the caller's snippet and declare
   * their own roles (see MenuItem.svelte).
   */
  import { ChevronRight } from "lucide-svelte";
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    value: string;
    /** Fires when Escape is pressed with the submenu already closed. */
    onDismiss?: () => void;
    children: Snippet;
  }

  let { label, value, onDismiss, children }: Props = $props();

  let open = $state(false);
  let flipped = $state(false);
  let rowRef = $state<HTMLButtonElement | null>(null);
  let submenuRef = $state<HTMLDivElement | null>(null);

  const EDGE_MARGIN = 24;

  function items(): HTMLElement[] {
    if (!submenuRef) return [];
    return Array.from(submenuRef.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).filter(
      (el) => !el.hasAttribute("disabled")
    );
  }

  function position() {
    if (!rowRef || !submenuRef) return;
    const row = rowRef.getBoundingClientRect();
    const width = submenuRef.offsetWidth || 336;
    // Flip to the left when opening right would run past the viewport.
    flipped = row.right + width + EDGE_MARGIN > window.innerWidth;

    // Clamp vertically so the submenu never extends past the top or bottom.
    const height = submenuRef.offsetHeight;
    const desiredTop = row.top;
    const maxTop = window.innerHeight - height - EDGE_MARGIN;
    const top = Math.max(EDGE_MARGIN, Math.min(desiredTop, maxTop));
    submenuRef.style.top = `${top - row.top}px`;
  }

  function openMenu(focusFirst = false) {
    open = true;
    queueMicrotask(() => {
      position();
      if (focusFirst) items()[0]?.focus();
    });
  }

  function closeMenu(focusRow = true) {
    open = false;
    if (focusRow) rowRef?.focus();
  }

  function onRowKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      openMenu(true);
    } else if (e.key === "Escape") {
      // Two-stage Escape: close the submenu first, then let the parent close the menu.
      if (open) {
        e.stopPropagation();
        closeMenu();
      } else {
        onDismiss?.();
      }
    }
  }

  function onSubmenuKeydown(e: KeyboardEvent) {
    const list = items();
    if (!list.length) return;
    const index = list.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(index + 1 + list.length) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    }
  }
</script>

<div
  class="relative"
  role="none"
  onmouseenter={() => openMenu(false)}
  onmouseleave={() => (open = false)}
>
  <button
    bind:this={rowRef}
    type="button"
    role="menuitem"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open ? closeMenu(false) : openMenu(false))}
    onkeydown={onRowKeydown}
    class="flex h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-700/60"
  >
    <span class="text-[13px] font-medium text-gray-900 dark:text-gray-100">{label}</span>
    <span class="flex min-w-0 items-center gap-1.5">
      <span class="truncate text-[13px] text-gray-500 dark:text-gray-400">{value}</span>
      <ChevronRight size={14} class="shrink-0 text-gray-400 dark:text-gray-500" />
    </span>
  </button>

  {#if open}
    <div
      bind:this={submenuRef}
      role="menu"
      tabindex="-1"
      aria-label={label}
      onkeydown={onSubmenuKeydown}
      class="absolute z-[71] w-[21rem] rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl dark:border-gray-700 dark:bg-gray-800
        {flipped ? 'right-[calc(100%+0.5rem)]' : 'left-[calc(100%+0.5rem)]'}"
      style="top: 0"
    >
      <div class="max-h-72 overflow-y-auto">
        {@render children()}
      </div>
    </div>
  {/if}
</div>
