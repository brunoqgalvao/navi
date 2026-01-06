<script lang="ts">
  /**
   * BackgroundProcessBadge - Small indicator for running background processes
   * Shows in the chat area when there are active background processes for this session
   */
  import { onMount, onDestroy } from "svelte";
  import { backgroundProcessApi, type BackgroundProcess } from "../api";

  interface Props {
    sessionId: string | null;
    onClick?: () => void;
  }

  let { sessionId, onClick }: Props = $props();

  let processes: BackgroundProcess[] = $state([]);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function loadProcesses() {
    if (!sessionId) {
      processes = [];
      return;
    }
    try {
      // Get background processes for this session only
      const all = await backgroundProcessApi.list({ sessionId });
      // Only show running processes that belong to this session
      processes = all.filter(p =>
        p.status === "running" && p.sessionId === sessionId
      );
    } catch (e) {
      console.error("[BackgroundProcessBadge] Failed to load:", e);
      processes = [];
    }
  }

  onMount(() => {
    loadProcesses();
    pollInterval = setInterval(loadProcesses, 3000);
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  let runningCount = $derived(processes.length);
  let totalPorts = $derived(processes.flatMap(p => p.ports).length);
</script>

{#if runningCount > 0}
  <button
    onclick={onClick}
    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full hover:bg-green-100 transition-colors cursor-pointer"
    title="Click to view running processes"
  >
    <!-- Animated pulse dot -->
    <span class="relative flex h-2 w-2">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
      <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
    </span>

    <span>
      {runningCount} process{runningCount > 1 ? "es" : ""} running
    </span>

    {#if totalPorts > 0}
      <span class="text-green-500">
        ({totalPorts} port{totalPorts > 1 ? "s" : ""})
      </span>
    {/if}
  </button>
{/if}
