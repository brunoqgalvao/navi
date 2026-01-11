<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { currentSessionWait } from "../../stores/session";
  import type { ActiveWait } from "../../stores/types";
  import { getServerUrl } from "../../api";

  // Current countdown display
  let remainingSeconds = $state(0);
  let intervalId: number | null = null;

  // Current active wait (from store)
  const wait = $derived($currentSessionWait);

  // Update countdown every 100ms for smooth display
  function updateCountdown() {
    if (!wait) {
      remainingSeconds = 0;
      return;
    }
    const now = Date.now();
    const remaining = Math.max(0, (wait.endTime - now) / 1000);
    remainingSeconds = remaining;
  }

  // Skip the wait
  async function handleSkip() {
    if (!wait) return;

    try {
      const res = await fetch(
        `${getServerUrl()}/api/sessions/waits/${wait.requestId}/skip`,
        { method: "POST" }
      );
      if (!res.ok) {
        console.error("Failed to skip wait:", await res.text());
      }
    } catch (e) {
      console.error("Failed to skip wait:", e);
    }
  }

  // Format seconds for display
  function formatTime(seconds: number): string {
    if (seconds < 1) return "0.0s";
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Calculate progress percentage (0-100)
  const progress = $derived(
    wait ? Math.max(0, Math.min(100, ((wait.endTime - Date.now()) / (wait.seconds * 1000)) * 100)) : 0
  );

  onMount(() => {
    intervalId = setInterval(updateCountdown, 100) as unknown as number;
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
    class="wait-countdown fixed bottom-24 left-1/2 -translate-x-1/2 z-50
           bg-zinc-800/95 backdrop-blur-sm border border-zinc-700
           rounded-xl shadow-xl px-4 py-3 flex items-center gap-4"
  >
    <!-- Circular progress -->
    <div class="relative w-12 h-12 flex-shrink-0">
      <svg class="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
        <!-- Background circle -->
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="text-zinc-700"
        />
        <!-- Progress circle -->
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          class="text-amber-500 transition-all duration-100"
          stroke-dasharray={`${progress} ${100 - progress}`}
          style="stroke-dashoffset: 25;"
        />
      </svg>
      <!-- Time display in center -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-xs font-mono text-amber-400">
          {formatTime(remainingSeconds)}
        </span>
      </div>
    </div>

    <!-- Info -->
    <div class="flex flex-col min-w-0">
      <span class="text-sm font-medium text-zinc-200 truncate">
        {wait.reason}
      </span>
      <span class="text-xs text-zinc-400">
        Waiting {wait.seconds}s total
      </span>
    </div>

    <!-- Skip button -->
    <button
      onclick={handleSkip}
      class="ml-2 px-3 py-1.5 text-xs font-medium rounded-lg
             bg-zinc-700 hover:bg-zinc-600 text-zinc-200
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
