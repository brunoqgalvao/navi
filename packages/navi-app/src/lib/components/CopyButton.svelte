<script lang="ts">
  interface Props {
    text: string;
    class?: string;
  }

  let { text, class: className = "" }: Props = $props();

  let copied = $state(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }
</script>

<button onclick={handleCopy} class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors {className}" title="Copy">
  {#if copied}
    <svg class="w-3.5 h-3.5 text-green-500 checkmark-animate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
    </svg>
  {:else}
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
    </svg>
  {/if}
</button>
