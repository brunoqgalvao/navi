<script lang="ts">
  /**
   * One selectable item inside a MenuRow's submenu.
   *
   * This exists as its own component so the ARIA roles live with the element that has them.
   * MenuRow cannot set roles on items rendered by its caller's snippet without reaching into
   * the DOM, so it owns roving focus (by querying its own container for these roles) while
   * each item declares what it is.
   */
  import { Check } from "lucide-svelte";

  interface Props {
    label: string;
    description?: string;
    selected?: boolean;
    disabled?: boolean;
    /** Shown greyed beside the label — e.g. why a harness cannot be used. */
    note?: string;
    title?: string;
    onSelect?: () => void;
  }

  let {
    label,
    description = "",
    selected = false,
    disabled = false,
    note = "",
    title = "",
    onSelect,
  }: Props = $props();
</script>

<button
  type="button"
  role="menuitemradio"
  aria-checked={selected}
  {disabled}
  title={title || undefined}
  onclick={() => !disabled && onSelect?.()}
  class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.98]
    {disabled
    ? 'cursor-not-allowed opacity-45'
    : 'hover:bg-gray-100 dark:hover:bg-gray-700/60'}"
>
  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-2">
      <span class="truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">
        {label}
      </span>
      {#if note}
        <span class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{note}</span>
      {/if}
    </span>
    {#if description}
      <span class="block truncate text-[11px] text-gray-500 dark:text-gray-400">
        {description}
      </span>
    {/if}
  </span>
  {#if selected}
    <Check size={16} class="shrink-0 text-gray-900 dark:text-gray-100" />
  {/if}
</button>
