<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { currentSessionWait, activeWaits } from "../../stores/session";
  import type { ActiveWait } from "../../stores/types";
  import { getServerUrl } from "../../api";

  // Current countdown display
  let remainingSeconds = $state(0);
  let intervalId: number | null = null;

  // Current active wait (from store)
  const wait = $derived($currentSessionWait);

  // Debug: log when wait changes
  $effect(() => {
    console.log("[WaitCountdown] wait changed:", wait);
  });

  // Update countdown every second (whole seconds only)
  // Auto-clear when countdown reaches 0 (failsafe if backend doesn't send wait_end)
  function updateCountdown() {
    if (!wait) {
      remainingSeconds = 0;
      return;
    }
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((wait.endTime - now) / 1000));
    remainingSeconds = remaining;

    // Auto-clear expired waits (failsafe for missing backend events)
    if (remaining === 0 && wait.endTime <= now) {
      console.log("[WaitCountdown] Auto-clearing expired wait:", wait.requestId);
      activeWaits.end(wait.requestId);
    }
  }

  // Skip the wait
  async function handleSkip() {
    if (!wait) return;

    const requestId = wait.requestId;

    // Optimistically clear the wait from UI immediately
    activeWaits.end(requestId);

    try {
      const res = await fetch(
        `${getServerUrl()}/api/sessions/waits/${requestId}/skip`,
        { method: "POST" }
      );
      if (!res.ok) {
        console.error("Failed to skip wait:", await res.text());
      }
    } catch (e) {
      console.error("Failed to skip wait:", e);
    }
  }

  // Format seconds for display (whole seconds only, supports hours/days)
  function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    if (seconds < 86400) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hrs}h ${mins}m`;
    }
    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hrs}h`;
  }

  onMount(() => {
    intervalId = setInterval(updateCountdown, 1000) as unknown as number;
    updateCountdown();
  });

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });
</script>

{#if wait}
  <div
    class="wait-countdown w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700
           rounded-lg px-4 py-3 flex items-center gap-3"
  >
    <!-- Simple timer icon -->
    <div class="flex-shrink-0 text-gray-400">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>

    <!-- Info -->
    <div class="flex-1 min-w-0 flex items-center gap-3">
      <span class="text-sm text-gray-600 dark:text-gray-300">
        {wait.reason}
      </span>
      <span class="text-lg font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
        {formatTime(remainingSeconds)}
      </span>
    </div>

    <!-- Skip button -->
    <button
      onclick={handleSkip}
      class="px-3 py-1.5 text-xs font-medium rounded-md
             bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
             text-gray-600 dark:text-gray-300
             transition-colors flex items-center gap-1.5"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z"
        />
      </svg>
      Skip
    </button>
  </div>
{/if}
