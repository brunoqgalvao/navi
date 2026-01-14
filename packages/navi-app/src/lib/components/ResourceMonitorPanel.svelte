<script lang="ts">
  /**
   * ResourceMonitorPanel - Monitor Navi server & process resource usage
   *
   * @experimental - disabled by default
   *
   * Features:
   * - Server memory usage (heap, RSS)
   * - System stats (CPU load, total/free memory)
   * - Per-process memory/CPU breakdown
   */
  import { onMount, onDestroy } from "svelte";
  import { getApiBase } from "../config";

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
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // History for sparkline charts (last 30 data points)
  let memoryHistory = $state<number[]>([]);
  let cpuHistory = $state<number[]>([]);
  const HISTORY_LENGTH = 30;

  async function loadStats() {
    try {
      const res = await fetch(`${getApiBase()}/resources`);
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const data: ResourceStats = await res.json();
      stats = data;

      // Update history for charts
      if (data.server?.memory?.rss) {
        memoryHistory = [...memoryHistory.slice(-(HISTORY_LENGTH - 1)), data.server.memory.rss];
      }
      if (data.system?.loadAvg?.[0]) {
        const cpuPercent = (data.system.loadAvg[0] / data.system.cpus) * 100;
        cpuHistory = [...cpuHistory.slice(-(HISTORY_LENGTH - 1)), cpuPercent];
      }

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

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
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
    // Load avg as percentage of CPU cores
    return Math.min((system.loadAvg[0] / system.cpus) * 100, 100);
  }

  function getBarColor(percent: number): string {
    if (percent < 50) return "bg-green-500";
    if (percent < 75) return "bg-yellow-500";
    return "bg-red-500";
  }

  // Mini sparkline component (inline SVG)
  function renderSparkline(data: number[], color: string = "#3b82f6"): string {
    if (data.length < 2) return "";
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const width = 100;
    const height = 24;
    const points = data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
      })
      .join(" ");
    return `<svg width="${width}" height="${height}" class="opacity-70"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}"/></svg>`;
  }

  onMount(() => {
    loadStats();
    // Poll every 3 seconds for relatively real-time stats
    pollInterval = setInterval(loadStats, 3000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  // Derived stats
  let serverMemPercent = $derived(stats ? getMemoryPercent(stats.server) : 0);
  let systemMemPercent = $derived(stats ? getSystemMemoryPercent(stats.system) : 0);
  let cpuPercent = $derived(stats ? getCpuPercent(stats.system) : 0);
</script>

<div class="h-full flex flex-col bg-white">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
    <div class="flex items-center gap-2">
      <h2 class="font-medium text-gray-900">Resource Monitor</h2>
      <span class="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
        experimental
      </span>
    </div>
    <button
      onclick={loadStats}
      class="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
      title="Refresh"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if loading && !stats}
      <div class="flex items-center justify-center h-32 text-gray-500">
        <svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading...
      </div>
    {:else if error}
      <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
        {error}
      </div>
    {:else if stats}
      <!-- Server Stats -->
      <div class="bg-gray-50 rounded-lg p-3 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-700">Navi Server</h3>
          <span class="text-xs text-gray-500">PID {stats.server.pid}</span>
        </div>

        <!-- Heap Memory -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-600">Heap Memory</span>
            <span class="font-mono text-gray-800">
              {formatBytes(stats.server.memory.heapUsed)} / {formatBytes(stats.server.memory.heapTotal)}
            </span>
          </div>
          <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-300 {getBarColor(serverMemPercent)}"
              style="width: {serverMemPercent}%"
            />
          </div>
        </div>

        <!-- RSS Memory -->
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-600">RSS (Total)</span>
          <span class="font-mono text-gray-800">{formatBytes(stats.server.memory.rss)}</span>
        </div>

        <!-- External + ArrayBuffers -->
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-600">External + Buffers</span>
          <span class="font-mono text-gray-800">
            {formatBytes(stats.server.memory.external + stats.server.memory.arrayBuffers)}
          </span>
        </div>

        <!-- Uptime -->
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-600">Uptime</span>
          <span class="font-mono text-gray-800">{formatUptime(stats.server.uptime)}</span>
        </div>

        <!-- Memory sparkline -->
        {#if memoryHistory.length > 1}
          <div class="pt-1">
            <div class="text-[10px] text-gray-500 mb-1">Memory trend (RSS)</div>
            {@html renderSparkline(memoryHistory, "#22c55e")}
          </div>
        {/if}
      </div>

      <!-- System Stats -->
      <div class="bg-gray-50 rounded-lg p-3 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-700">System</h3>
          <span class="text-xs text-gray-500">{stats.system.platform} ({stats.system.arch})</span>
        </div>

        <!-- System Memory -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-600">Memory</span>
            <span class="font-mono text-gray-800">
              {formatBytes(stats.system.totalMemory - stats.system.freeMemory)} / {formatBytes(stats.system.totalMemory)}
            </span>
          </div>
          <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-300 {getBarColor(systemMemPercent)}"
              style="width: {systemMemPercent}%"
            />
          </div>
        </div>

        <!-- CPU Load -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-600">CPU Load ({stats.system.cpus} cores)</span>
            <span class="font-mono text-gray-800">
              {stats.system.loadAvg[0].toFixed(2)} / {stats.system.loadAvg[1].toFixed(2)} / {stats.system.loadAvg[2].toFixed(2)}
            </span>
          </div>
          <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-300 {getBarColor(cpuPercent)}"
              style="width: {cpuPercent}%"
            />
          </div>
        </div>

        <!-- CPU sparkline -->
        {#if cpuHistory.length > 1}
          <div class="pt-1">
            <div class="text-[10px] text-gray-500 mb-1">CPU load trend</div>
            {@html renderSparkline(cpuHistory, "#3b82f6")}
          </div>
        {/if}
      </div>

      <!-- Process Stats -->
      {#if stats.processes.length > 0}
        <div class="bg-gray-50 rounded-lg p-3 space-y-2">
          <h3 class="text-sm font-medium text-gray-700">Active Processes</h3>

          <div class="space-y-2">
            {#each stats.processes as proc}
              <div class="flex items-center justify-between text-xs py-1 border-b border-gray-200 last:border-0">
                <div class="flex items-center gap-2">
                  <span class="px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-600 rounded">
                    {proc.type}
                  </span>
                  <span class="text-gray-700 truncate max-w-[120px]" title={proc.name}>
                    {proc.name}
                  </span>
                </div>
                <div class="flex items-center gap-3 font-mono text-gray-600">
                  {#if proc.memory}
                    <span title="Memory (RSS)">{formatBytes(proc.memory)}</span>
                  {/if}
                  {#if proc.cpu !== undefined}
                    <span title="CPU %">{proc.cpu.toFixed(1)}%</span>
                  {/if}
                  <span class="text-gray-400">PID {proc.pid}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="text-xs text-gray-500 text-center py-4">
          No active processes being monitored
        </div>
      {/if}

      <!-- Last updated -->
      <div class="text-[10px] text-gray-400 text-center">
        Last updated: {new Date(stats.timestamp).toLocaleTimeString()}
      </div>
    {/if}
  </div>
</div>
