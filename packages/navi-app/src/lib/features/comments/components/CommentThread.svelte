<script lang="ts">
  // CommentThread - Google Docs-style floating comment card
  // @experimental
  import type { CommentThread as CommentThreadType } from "../types";
  import { commentsStore } from "../stores";
  import { fade, slide } from "svelte/transition";

  interface Props {
    thread: CommentThreadType;
    sessionId: string;
    onClose?: () => void;
    onAskAI?: (threadId: string, question: string) => void;
  }

  let { thread, sessionId, onClose, onAskAI }: Props = $props();

  let replyInput = $state("");
  let isSubmitting = $state(false);

  async function handleReply() {
    if (!replyInput.trim() || isSubmitting) return;

    isSubmitting = true;
    try {
      await commentsStore.addReply(sessionId, thread.thread_id, replyInput.trim(), 'user');
      replyInput = "";

      // If onAskAI is provided, trigger AI response
      if (onAskAI) {
        commentsStore.setThreadLoading(sessionId, thread.thread_id, true);
        onAskAI(thread.thread_id, replyInput.trim());
      }
    } finally {
      isSubmitting = false;
    }
  }

  async function handleResolve() {
    await commentsStore.setResolved(sessionId, thread.thread_id, thread.resolved === 0);
  }

  async function handleDelete() {
    if (confirm("Delete this comment thread?")) {
      await commentsStore.deleteThread(sessionId, thread.thread_id);
      onClose?.();
    }
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  const isResolved = $derived(thread.resolved === 1);
</script>

<div
  class="comment-thread bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-72 max-h-96 overflow-hidden flex flex-col"
  transition:fade={{ duration: 150 }}
>
  <!-- Header with selection text -->
  <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
    <div class="flex items-center justify-between gap-2">
      <div class="flex-1 min-w-0">
        {#if thread.selection_text}
          <p class="text-xs text-gray-600 dark:text-gray-400 truncate font-medium">
            "{thread.selection_text.slice(0, 40)}{thread.selection_text.length > 40 ? '...' : ''}"
          </p>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        <!-- Resolve button -->
        <button
          onclick={handleResolve}
          class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          title={isResolved ? "Reopen" : "Resolve"}
        >
          {#if isResolved}
            <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
          {:else}
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          {/if}
        </button>
        <!-- Delete button -->
        <button
          onclick={handleDelete}
          class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          title="Delete thread"
        >
          <svg class="w-4 h-4 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <!-- Close button -->
        {#if onClose}
          <button
            onclick={onClose}
            class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Close"
          >
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Comments list -->
  <div class="flex-1 overflow-y-auto px-3 py-2 space-y-3 {isResolved ? 'opacity-60' : ''}">
    {#each thread.comments as comment (comment.id)}
      <div class="comment" transition:slide={{ duration: 150 }}>
        <div class="flex items-start gap-2">
          <!-- Avatar -->
          <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0
            {comment.author === 'user'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
              : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300'}">
            {comment.author === 'user' ? 'U' : 'AI'}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
                {comment.author === 'user' ? 'You' : 'Claude'}
              </span>
              <span class="text-xs text-gray-400">
                {formatTime(comment.created_at)}
              </span>
            </div>
            <p class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          </div>
        </div>
      </div>
    {/each}

    {#if thread.isLoading}
      <div class="flex items-center gap-2 text-gray-500" transition:slide={{ duration: 150 }}>
        <div class="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
          <svg class="w-4 h-4 text-purple-600 dark:text-purple-300 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <span class="text-xs italic">Claude is thinking...</span>
      </div>
    {/if}
  </div>

  <!-- Reply input -->
  {#if !isResolved}
    <div class="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
      <form onsubmit={(e) => { e.preventDefault(); handleReply(); }} class="flex gap-2">
        <input
          type="text"
          bind:value={replyInput}
          placeholder="Reply or ask a follow-up..."
          disabled={isSubmitting || thread.isLoading}
          class="flex-1 text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!replyInput.trim() || isSubmitting || thread.isLoading}
          class="px-3 py-1.5 text-sm font-medium rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? '...' : 'Send'}
        </button>
      </form>
    </div>
  {/if}
</div>
