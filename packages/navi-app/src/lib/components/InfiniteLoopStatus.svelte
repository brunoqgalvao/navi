<script lang="ts">
  import { getServerUrl } from "$lib/api";

  interface LoopStatus {
    loopId: string;
    iteration: number;
    maxIterations: number;
    totalCost: number;
    contextResets: number;
    status: "running" | "paused" | "completed" | "failed" | "stopped";
    statusReason?: string;
    isVerifying?: boolean;
    contextPercent?: number;
    lastReason?: string;
    nextAction?: string;
    definitionOfDone?: Array<{
      id: string;
      description: string;
      verified: boolean;
    }>;
  }

  interface Props {
    status: LoopStatus;
    onStop?: () => void;
    compact?: boolean;
  }

  let { status, onStop, compact = false }: Props = $props();

  let isStopping = $state(false);

  async function stopLoop() {
    if (!status.loopId || isStopping) return;
    isStopping = true;

    try {
      await fetch(`${getServerUrl()}/api/loops/${status.loopId}/stop`, {
        method: "POST",
      });
      onStop?.();
    } catch (e) {
      console.error("Failed to stop loop:", e);
    } finally {
      isStopping = false;
    }
  }

  // Calculate DoD progress
  const dodProgress = $derived(() => {
    if (!status.definitionOfDone?.length) return null;
    const verified = status.definitionOfDone.filter(d => d.verified).length;
    const total = status.definitionOfDone.length;
    return { verified, total, percent: Math.round((verified / total) * 100) };
  });
</script>

{#if compact}
  <!-- Compact inline status -->
  <div class="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
    {#if status.isVerifying}
      <span class="animate-pulse">🔍</span>
      <span class="text-xs text-emerald-700 dark:text-emerald-300">Verifying...</span>
    {:else}
      <span class="text-emerald-500">🔄</span>
      <span class="text-xs text-emerald-700 dark:text-emerald-300">
        Iteration {status.iteration}
        {#if status.contextPercent}
          · {status.contextPercent}% ctx
        {/if}
        · ${status.totalCost.toFixed(2)}
      </span>
    {/if}
    <button
      onclick={stopLoop}
      disabled={isStopping}
      class="ml-auto p-1 text-gray-400 hover:text-red-500 transition-colors"
      title="Stop loop"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
{:else}
  <!-- Full status card -->
  <div class="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
      <div class="flex items-center gap-2">
        {#if status.isVerifying}
          <span class="animate-pulse text-lg">🔍</span>
          <span class="font-medium text-emerald-900 dark:text-emerald-100">Verifying...</span>
        {:else if status.status === "running"}
          <span class="animate-spin-slow text-lg">🔄</span>
          <span class="font-medium text-emerald-900 dark:text-emerald-100">Infinite Loop Running</span>
        {:else if status.status === "completed"}
          <span class="text-lg">✅</span>
          <span class="font-medium text-emerald-900 dark:text-emerald-100">Loop Completed</span>
        {:else if status.status === "failed"}
          <span class="text-lg">❌</span>
          <span class="font-medium text-red-900 dark:text-red-100">Loop Failed</span>
        {:else}
          <span class="text-lg">⏹️</span>
          <span class="font-medium text-gray-900 dark:text-gray-100">Loop Stopped</span>
        {/if}
      </div>

      {#if status.status === "running" || status.status === "paused"}
        <button
          onclick={stopLoop}
          disabled={isStopping}
          class="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
        >
          {isStopping ? "Stopping..." : "Stop Loop"}
        </button>
      {/if}
    </div>

    <!-- Stats -->
    <div class="px-4 py-3 grid grid-cols-4 gap-4 text-center border-b border-emerald-100 dark:border-emerald-900">
      <div>
        <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400">{status.iteration}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Iteration</div>
      </div>
      <div>
        <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400">{status.contextResets}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Resets</div>
      </div>
      <div>
        <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400">${status.totalCost.toFixed(2)}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Cost</div>
      </div>
      <div>
        <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400">{status.contextPercent || 0}%</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Context</div>
      </div>
    </div>

    <!-- DoD Progress -->
    {#if status.definitionOfDone?.length}
      <div class="px-4 py-3 border-b border-emerald-100 dark:border-emerald-900">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-gray-600 dark:text-gray-400">Definition of Done</span>
          {#if dodProgress()}
            <span class="text-xs text-emerald-600 dark:text-emerald-400">
              {dodProgress()!.verified}/{dodProgress()!.total} ({dodProgress()!.percent}%)
            </span>
          {/if}
        </div>

        <!-- Progress bar -->
        {#if dodProgress()}
          <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
            <div
              class="h-full bg-emerald-500 transition-all duration-500"
              style="width: {dodProgress()!.percent}%"
            ></div>
          </div>
        {/if}

        <!-- DoD items -->
        <div class="space-y-1.5">
          {#each status.definitionOfDone as item}
            <div class="flex items-center gap-2 text-sm">
              {#if item.verified}
                <span class="text-emerald-500">✓</span>
                <span class="text-gray-500 dark:text-gray-400 line-through">{item.description}</span>
              {:else}
                <span class="text-gray-400">○</span>
                <span class="text-gray-700 dark:text-gray-300">{item.description}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Last action / Next action -->
    {#if status.lastReason || status.nextAction}
      <div class="px-4 py-3 text-sm">
        {#if status.isVerifying}
          <div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Running verifier agent...
          </div>
        {:else if status.nextAction}
          <div class="text-gray-600 dark:text-gray-400">
            <span class="font-medium">Next:</span> {status.nextAction}
          </div>
        {:else if status.lastReason}
          <div class="text-gray-600 dark:text-gray-400">
            <span class="font-medium">Status:</span> {status.lastReason}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Status reason (for completed/failed) -->
    {#if status.statusReason && (status.status === "completed" || status.status === "failed")}
      <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-600 dark:text-gray-400">
        {status.statusReason}
      </div>
    {/if}
  </div>
{/if}

<style>
  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  .animate-spin-slow {
    animation: spin-slow 3s linear infinite;
  }
</style>
