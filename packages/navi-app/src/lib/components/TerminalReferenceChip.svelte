<script lang="ts">
  import type { TerminalReference } from "../stores/types";

  interface Props {
    reference: TerminalReference;
    onRemove?: () => void;
  }

  let { reference, onRemove }: Props = $props();
</script>

<div
  class="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-xs transition-colors group max-w-[200px]"
>
  <svg
    class="w-3 h-3 text-green-500 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    ></path>
  </svg>

  <div class="flex flex-col min-w-0">
    <span class="text-green-700 font-medium truncate" title={reference.name}>
      {reference.name}
    </span>
    <span class="text-[10px] text-green-500 truncate font-mono">
      {reference.bufferLines} lines
    </span>
  </div>

  {#if onRemove}
    <button
      onclick={onRemove}
      class="text-green-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      title="Remove terminal reference"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        ></path>
      </svg>
    </button>
  {/if}
</div>
