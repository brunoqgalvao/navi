<script lang="ts">
  // CommentInput - Initial comment input when user selects text
  // @experimental
  import { fade } from "svelte/transition";
  import { commentsStore, activeCommentInput } from "../stores";

  interface Props {
    messageId: string;
    sessionId: string;
    selectionText: string;
    x: number;
    y: number;
    onClose: () => void;
    onCreated?: (threadId: string) => void;
    onAskAI?: (threadId: string, question: string) => void;
  }

  let { messageId, sessionId, selectionText, x, y, onClose, onCreated, onAskAI }: Props = $props();

  let commentInput = $state("");
  let isSubmitting = $state(false);
  let inputRef = $state<HTMLInputElement | null>(null);

  // Focus input on mount
  $effect(() => {
    if (inputRef) {
      inputRef.focus();
    }
  });

  async function handleSubmit() {
    if (!commentInput.trim() || isSubmitting) return;

    isSubmitting = true;
    try {
      const thread = await commentsStore.createThread({
        message_id: messageId,
        session_id: sessionId,
        content: commentInput.trim(),
        selection_text: selectionText,
        author: 'user',
      });

      if (thread) {
        onCreated?.(thread.thread_id);

        // Trigger AI response (store handles loading state)
        if (onAskAI) {
          onAskAI(thread.thread_id, commentInput.trim());
        }
      }

      onClose();
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Truncate selection text for display
  const displayText = $derived(
    selectionText.length > 50 ? selectionText.slice(0, 47) + "..." : selectionText
  );
</script>

<svelte:window onclick={onClose} onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-72 overflow-hidden"
  style="left: {x}px; top: {y}px;"
  onclick={(e) => e.stopPropagation()}
  transition:fade={{ duration: 100 }}
>
  <!-- Header with quoted text -->
  <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
    <p class="text-xs text-gray-600 dark:text-gray-400 font-medium">
      "{displayText}"
    </p>
  </div>

  <!-- Input area -->
  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="p-3">
    <input
      bind:this={inputRef}
      type="text"
      bind:value={commentInput}
      placeholder="Add a comment or question..."
      disabled={isSubmitting}
      class="w-full text-sm px-3 py-2 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    />

    <div class="flex items-center justify-between mt-3">
      <span class="text-xs text-gray-400">
        Claude will respond
      </span>
      <div class="flex gap-2">
        <button
          type="button"
          onclick={onClose}
          disabled={isSubmitting}
          class="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!commentInput.trim() || isSubmitting}
          class="px-4 py-1.5 text-sm font-medium rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Adding...' : 'Comment'}
        </button>
      </div>
    </div>
  </form>
</div>
