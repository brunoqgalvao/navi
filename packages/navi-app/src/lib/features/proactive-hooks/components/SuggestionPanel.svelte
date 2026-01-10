<script lang="ts">
  import { hookRegistry } from "../stores";
  import { acceptSuggestion, dismissSuggestion } from "../runner";
  import type { HookContext } from "../types";
  import SuggestionToast from "./SuggestionToast.svelte";

  interface Props {
    sessionId: string;
    getContext: () => HookContext;
  }

  let { sessionId, getContext }: Props = $props();

  // Filter suggestions for current session
  const suggestions = $derived(
    $hookRegistry.pendingSuggestions.filter((s) => s.sessionId === sessionId)
  );

  async function handleAccept(suggestionId: string) {
    const ctx = getContext();
    await acceptSuggestion(suggestionId, ctx);
  }

  function handleDismiss(suggestionId: string) {
    dismissSuggestion(suggestionId, sessionId);
  }
</script>

{#if suggestions.length > 0}
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
    {#each suggestions.slice(0, 3) as suggestion (suggestion.id)}
      <SuggestionToast
        {suggestion}
        onAccept={handleAccept}
        onDismiss={handleDismiss}
      />
    {/each}
  </div>
{/if}
