<script lang="ts">
  /**
   * Browser Action Widget
   *
   * Displays browser-use actions inline in chat messages
   * Shows screenshots, navigation, form fills, etc.
   */

  interface Props {
    action: string;
    url?: string;
    screenshot?: string;
    result?: string;
    status: "pending" | "running" | "success" | "error";
    timestamp?: number;
    duration?: number;
  }

  let {
    action,
    url,
    screenshot,
    result,
    status,
    timestamp,
    duration
  }: Props = $props();

  const statusIcon = $derived(
    status === "success" ? "✓" :
    status === "error" ? "✗" :
    status === "running" ? "⏳" :
    "⋯"
  );

  const statusColor = $derived(
    status === "success" ? "text-green-600 dark:text-green-400" :
    status === "error" ? "text-red-600 dark:text-red-400" :
    status === "running" ? "text-blue-600 dark:text-blue-400" :
    "text-gray-500 dark:text-gray-400"
  );

  let showScreenshot = $state(false);
</script>

<div class="browser-action-widget border border-gray-200 dark:border-gray-700 rounded-lg p-3 my-2 bg-white dark:bg-gray-800">
  <!-- Header -->
  <div class="flex items-start gap-2 mb-2">
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/>
        <circle cx="7" cy="6" r="0.5"/>
        <circle cx="9" cy="6" r="0.5"/>
        <circle cx="11" cy="6" r="0.5"/>
      </svg>
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class={`text-sm font-medium ${statusColor}`}>
          {statusIcon} Browser Action
        </span>
        {#if duration}
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
          </span>
        {/if}
      </div>

      <p class="text-sm text-gray-700 dark:text-gray-300 mb-1">
        {action}
      </p>

      {#if url}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block"
        >
          {url}
        </a>
      {/if}
    </div>
  </div>

  <!-- Screenshot -->
  {#if screenshot}
    <div class="mt-2">
      {#if !showScreenshot}
        <button
          onclick={() => showScreenshot = true}
          class="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
          View Screenshot
        </button>
      {:else}
        <img
          src={screenshot}
          alt="Browser screenshot"
          class="rounded border border-gray-200 dark:border-gray-700 w-full cursor-pointer"
          onclick={() => showScreenshot = false}
        />
      {/if}
    </div>
  {/if}

  <!-- Result -->
  {#if result && status === "success"}
    <div class="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs font-mono text-gray-700 dark:text-gray-300">
      {result}
    </div>
  {/if}

  <!-- Error -->
  {#if status === "error" && result}
    <div class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-400">
      {result}
    </div>
  {/if}
</div>

<style>
  .browser-action-widget {
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
