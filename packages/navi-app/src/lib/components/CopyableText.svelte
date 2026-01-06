<script lang="ts">
  interface Props {
    text: string;
    label?: string;
  }

  let { text, label }: Props = $props();

  let copied = $state(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }
</script>

<div class="copyable-container group relative inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm max-w-full">
  {#if label}
    <span class="text-gray-500 text-xs font-sans shrink-0">{label}:</span>
  {/if}
  <span class="text-gray-800 truncate select-all" title={text}>{text}</span>
  <button
    onclick={handleCopy}
    class="shrink-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
    title="Copy to clipboard"
  >
    {#if copied}
      <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
    {:else}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
      </svg>
    {/if}
  </button>
</div>

<style>
  .copyable-container {
    word-break: break-word;
  }
</style>
