<script lang="ts">
  /**
   * Email Notification Widget
   *
   * Displays incoming emails inline in chat messages
   */

  interface Props {
    from: string;
    to: string;
    subject: string;
    preview?: string;
    timestamp: number;
    messageId: string;
    inbox: string;
    hasVerificationLink?: boolean;
    onExtractLink?: () => void;
    onViewFull?: () => void;
  }

  let {
    from,
    to,
    subject,
    preview,
    timestamp,
    messageId,
    inbox,
    hasVerificationLink = false,
    onExtractLink,
    onViewFull
  }: Props = $props();

  const formattedDate = $derived(new Date(timestamp).toLocaleString());
</script>

<div class="email-notification-widget border border-blue-200 dark:border-blue-800 rounded-lg p-3 my-2 bg-blue-50/50 dark:bg-blue-900/10">
  <!-- Header -->
  <div class="flex items-start gap-2 mb-2">
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <path d="m22 6-10 7L2 6"/>
      </svg>
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-sm font-medium text-blue-700 dark:text-blue-300">
          New Email
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {formattedDate}
        </span>
      </div>

      <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span class="font-medium">From:</span> {from}
      </div>
      <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span class="font-medium">To:</span> {to}
      </div>
    </div>
  </div>

  <!-- Subject -->
  <div class="mb-2">
    <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
      {subject}
    </p>
  </div>

  <!-- Preview -->
  {#if preview}
    <div class="mb-2 p-2 bg-white dark:bg-gray-800 rounded text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
      {preview}
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex items-center gap-2 flex-wrap">
    {#if hasVerificationLink && onExtractLink}
      <button
        onclick={onExtractLink}
        class="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors flex items-center gap-1"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        Extract Link
      </button>
    {/if}

    {#if onViewFull}
      <button
        onclick={onViewFull}
        class="px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
      >
        View Full Email
      </button>
    {/if}

    <button
      onclick={() => navigator.clipboard.writeText(messageId)}
      class="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
      title="Copy Message ID"
    >
      Copy ID
    </button>
  </div>

  <!-- Inbox badge -->
  <div class="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
    <span class="text-xs text-gray-500 dark:text-gray-400">
      Inbox: <span class="font-mono">{inbox}</span>
    </span>
  </div>
</div>

<style>
  .email-notification-widget {
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
