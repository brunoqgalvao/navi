<script lang="ts">
  /**
   * ResourceMonitor - Floating resource monitor with modal
   *
   * @experimental - disabled by default in Settings → Features
   *
   * Shows a small floating button in bottom-right that opens a modal
   * with server/system resource stats.
   */
  import { onMount, onDestroy } from "svelte";
  import { getApiBase } from "../config";
  import Modal from "./Modal.svelte";

  interface ServerResourceStats {
    pid: number;
    memory: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
      external: number;
      arrayBuffers: number;
    };
    uptime: number;
  }

  interface SystemResourceStats {
    platform: string;
    arch: string;
    cpus: number;
    totalMemory: number;
    freeMemory: number;
    loadAvg: number[];
  }

  interface ProcessResourceStats {
    id: string;
    pid: number;
    type: string;
    name: string;
    memory?: number;
    cpu?: number;
  }

  interface ResourceStats {
    timestamp: number;
    server: ServerResourceStats;
    system: SystemResourceStats;
    processes: ProcessResourceStats[];
  }

  let stats = $state<ResourceStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isOpen = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Compact stats for the floating button
  let compactMemory = $derived(stats ? formatBytesCompact(stats.server.memory.rss) : "—");
  let compactCpu = $derived(stats ? `${stats.system.loadAvg[0].toFixed(1)}` : "—");

  async function loadStats() {
    try {
      const res = await fetch(`${getApiBase()}/resources`);
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      stats = await res.json();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load stats";
    } finally {
      loading = false;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatBytesCompact(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}M`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
  }

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function getMemoryPercent(server: ServerResourceStats): number {
    return (server.memory.heapUsed / server.memory.heapTotal) * 100;
  }

  function getSystemMemoryPercent(system: SystemResourceStats): number {
    return ((system.totalMemory - system.freeMemory) / system.totalMemory) * 100;
  }

  function getCpuPercent(system: SystemResourceStats): number {
    return Math.min((system.loadAvg[0] / system.cpus) * 100, 100);
  }

  function getBarColor(percent: number): string {
    if (percent < 50) return "bg-green-500";
    if (percent < 75) return "bg-yellow-500";
    return "bg-red-500";
  }

  onMount(() => {
    loadStats();
    // Poll every 5 seconds (less aggressive since it's floating)
    pollInterval = setInterval(loadStats, 5000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  // Derived stats
  let serverMemPercent = $derived(stats ? getMemoryPercent(stats.server) : 0);
  let systemMemPercent = $derived(stats ? getSystemMemoryPercent(stats.system) : 0);
  let cpuPercent = $derived(stats ? getCpuPercent(stats.system) : 0);
</script>

<!-- Floating Button -->
<button
  onclick={() => isOpen = true}
  class="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 group"
  title="Resource Monitor"
>
  <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
  </svg>
  <span class="text-xs font-mono text-gray-600 dark:text-gray-300">{compactMemory}</span>
  <span class="w-px h-3 bg-gray-300 dark:bg-gray-600"></span>
  <span class="text-xs font-mono text-gray-600 dark:text-gray-300">{compactCpu}</span>
</button>

<!-- Modal -->
<Modal open={isOpen} onClose={() => isOpen = false} title="Resource Monitor" size="md">
  {#snippet children()}
    <div class="space-y-4">
      {#if loading && !stats}
        <div class="flex items-center justify-center h-32 text-gray-500">
          <svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Loading...
        </div>
      {:else if error}
        <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      {:else if stats}
        <!-- Server Stats -->
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Navi Server</h3>
            <span class="text-xs text-gray-500 dark:text-gray-400">PID {stats.server.pid} • Up {formatUptime(stats.server.uptime)}</span>
          </div>

          <!-- Heap Memory -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Heap Memory</span>
              <span class="font-mono text-gray-800 dark:text-gray-200">
                {formatBytes(stats.server.memory.heapUsed)} / {formatBytes(stats.server.memory.heapTotal)}
              </span>
            </div>
            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full transition-all duration-300 {getBarColor(serverMemPercent)}"
                style="width: {serverMemPercent}%"
              ></div>
            </div>
          </div>

          <!-- RSS -->
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-600 dark:text-gray-400">RSS (Total)</span>
            <span class="font-mono text-gray-800 dark:text-gray-200">{formatBytes(stats.server.memory.rss)}</span>
          </div>
        </div>

        <!-- System Stats -->
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">System</h3>
            <span class="text-xs text-gray-500 dark:text-gray-400">{stats.system.platform} • {stats.system.cpus} cores</span>
          </div>

          <!-- System Memory -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Memory</span>
              <span class="font-mono text-gray-800 dark:text-gray-200">
                {formatBytes(stats.system.totalMemory - stats.system.freeMemory)} / {formatBytes(stats.system.totalMemory)}
              </span>
            </div>
            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full transition-all duration-300 {getBarColor(systemMemPercent)}"
                style="width: {systemMemPercent}%"
              ></div>
            </div>
          </div>

          <!-- CPU Load -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">CPU Load</span>
              <span class="font-mono text-gray-800 dark:text-gray-200">
                {stats.system.loadAvg[0].toFixed(2)} / {stats.system.loadAvg[1].toFixed(2)} / {stats.system.loadAvg[2].toFixed(2)}
              </span>
            </div>
            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full transition-all duration-300 {getBarColor(cpuPercent)}"
                style="width: {cpuPercent}%"
              ></div>
            </div>
          </div>
        </div>

        <!-- Process Stats -->
        {#if stats.processes.length > 0}
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Active Processes</h3>
            <div class="space-y-1 max-h-40 overflow-y-auto">
              {#each stats.processes as proc}
                <div class="flex items-center justify-between text-xs py-1 border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                      {proc.type}
                    </span>
                    <span class="text-gray-700 dark:text-gray-300 truncate max-w-[150px]" title={proc.name}>
                      {proc.name}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 font-mono text-gray-600 dark:text-gray-400">
                    {#if proc.memory}
                      <span>{formatBytesCompact(proc.memory)}</span>
                    {/if}
                    {#if proc.cpu !== undefined}
                      <span>{proc.cpu.toFixed(1)}%</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Last updated -->
        <div class="text-[10px] text-gray-400 dark:text-gray-500 text-center">
          Updated: {new Date(stats.timestamp).toLocaleTimeString()}
        </div>
      {/if}
    </div>
  {/snippet}
</Modal>
