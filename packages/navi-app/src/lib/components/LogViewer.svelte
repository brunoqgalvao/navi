<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getApiBase } from "../config";

  type LogSource = "process" | "terminal";

  interface Props {
    /** Process ID for background processes OR terminal ID for PTY terminals */
    sourceId: string;
    /** Whether this is a background process or terminal */
    sourceType?: LogSource;
    autoRefresh?: boolean;
    refreshInterval?: number;
    onClose?: () => void;
  }

  let {
    sourceId,
    sourceType = "process",
    autoRefresh = true,
    refreshInterval = 2000,
    onClose,
  }: Props = $props();

  // Process info (for background processes)
  interface ProcessInfo {
    id: string;
    type: string;
    command: string;
    cwd: string;
    pid?: number;
    status: "running" | "completed" | "failed" | "killed";
    startedAt: number;
    exitCode?: number;
    label?: string;
    ports: number[];
  }

  // Terminal info (for PTY terminals)
  interface TerminalInfo {
    id: string;
    pid: number;
    cwd: string;
    name?: string;
    createdAt: number;
  }

  let logs = $state<string[]>([]);
  let processInfo = $state<ProcessInfo | null>(null);
  let terminalInfo = $state<TerminalInfo | null>(null);
  let loading = $state(true);
  let error = $state("");
  let autoScroll = $state(true);
  let showAnsi = $state(false);
  let hasErrors = $state(false);
  let errorLines = $state<string[]>([]);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let logsContainer: HTMLDivElement | null = null;

  // Strip ANSI codes for display
  function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, "");
  }

  // Convert ANSI to HTML (basic support)
  function ansiToHtml(str: string): string {
    const ansiColors: Record<string, string> = {
      "30": "#000", "31": "#e74c3c", "32": "#2ecc71", "33": "#f1c40f",
      "34": "#3498db", "35": "#9b59b6", "36": "#1abc9c", "37": "#ecf0f1",
      "90": "#7f8c8d", "91": "#e74c3c", "92": "#2ecc71", "93": "#f1c40f",
      "94": "#3498db", "95": "#9b59b6", "96": "#1abc9c", "97": "#fff",
    };

    let result = str;
    // Replace color codes
    result = result.replace(/\x1b\[(\d+)m/g, (_, code) => {
      if (code === "0") return "</span>";
      if (code === "1") return '<span style="font-weight:bold">';
      if (ansiColors[code]) return `<span style="color:${ansiColors[code]}">`;
      return "";
    });
    // Close any unclosed spans
    const openSpans = (result.match(/<span/g) || []).length;
    const closeSpans = (result.match(/<\/span>/g) || []).length;
    for (let i = 0; i < openSpans - closeSpans; i++) {
      result += "</span>";
    }
    return result;
  }

  async function fetchProcessLogs() {
    try {
      const [outputRes, processRes] = await Promise.all([
        fetch(`${getApiBase()}/background-processes/${sourceId}/output?lines=500`),
        fetch(`${getApiBase()}/background-processes/${sourceId}`),
      ]);

      if (!outputRes.ok || !processRes.ok) {
        throw new Error("Process not found");
      }

      const outputData = await outputRes.json();
      const processData = await processRes.json();

      logs = outputData.output || [];
      processInfo = processData;
      terminalInfo = null;

      scrollIfNeeded();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load process logs";
    } finally {
      loading = false;
    }
  }

  async function fetchTerminalLogs() {
    try {
      const [bufferRes, errorsRes] = await Promise.all([
        fetch(`${getApiBase()}/terminal/pty/${sourceId}/buffer?lines=500`),
        fetch(`${getApiBase()}/terminal/pty/${sourceId}/errors`),
      ]);

      if (!bufferRes.ok) {
        throw new Error("Terminal not found");
      }

      const bufferData = await bufferRes.json();
      logs = bufferData.lines || bufferData.buffer || [];

      if (errorsRes.ok) {
        const errorsData = await errorsRes.json();
        hasErrors = errorsData.hasErrors || false;
        errorLines = errorsData.errorLines || errorsData.errors || [];
      }

      // Try to get terminal info from the list
      const listRes = await fetch(`${getApiBase()}/terminal/pty`);
      if (listRes.ok) {
        const terminals = await listRes.json();
        const terminal = (terminals.terminals || terminals).find((t: any) => t.id === sourceId);
        if (terminal) {
          terminalInfo = terminal;
        }
      }

      processInfo = null;
      scrollIfNeeded();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load terminal logs";
    } finally {
      loading = false;
    }
  }

  function scrollIfNeeded() {
    if (autoScroll && logsContainer) {
      setTimeout(() => {
        if (logsContainer) {
          logsContainer.scrollTop = logsContainer.scrollHeight;
        }
      }, 10);
    }
  }

  async function fetchLogs() {
    if (sourceType === "terminal") {
      await fetchTerminalLogs();
    } else {
      await fetchProcessLogs();
    }
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    // For processes, only refresh if running. For terminals, always refresh.
    const shouldRefresh = sourceType === "terminal" || processInfo?.status === "running";
    if (autoRefresh && shouldRefresh) {
      refreshTimer = setInterval(fetchLogs, refreshInterval);
    }
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function handleScroll() {
    if (!logsContainer) return;
    const isAtBottom = logsContainer.scrollHeight - logsContainer.scrollTop <= logsContainer.clientHeight + 50;
    autoScroll = isAtBottom;
  }

  function scrollToBottom() {
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
      autoScroll = true;
    }
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  function formatDuration(startTs: number): string {
    const seconds = Math.floor((Date.now() - startTs) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "running": return "text-green-600 bg-green-50";
      case "completed": return "text-blue-600 bg-blue-50";
      case "failed": return "text-red-600 bg-red-50";
      case "killed": return "text-orange-600 bg-orange-50";
      default: return "text-gray-600 bg-gray-50";
    }
  }

  async function copyLogs() {
    const text = logs.map(l => stripAnsi(l)).join("\n");
    await navigator.clipboard.writeText(text);
  }

  async function downloadLogs() {
    const text = logs.map(l => stripAnsi(l)).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = processInfo?.label || terminalInfo?.name || sourceId;
    a.download = `${name}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function isErrorLine(line: string): boolean {
    if (!hasErrors || errorLines.length === 0) return false;
    const stripped = stripAnsi(line);
    return errorLines.some(err => stripped.includes(stripAnsi(err)));
  }

  onMount(() => {
    fetchLogs();
  });

  // Watch for status changes to manage auto-refresh
  $effect(() => {
    if (sourceType === "terminal") {
      // Terminals are always "running"
      if (autoRefresh) startAutoRefresh();
    } else if (processInfo?.status === "running" && autoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  onDestroy(() => {
    stopAutoRefresh();
  });

  // Derived values for display
  let title = $derived(
    processInfo?.label ||
    terminalInfo?.name ||
    (sourceType === "terminal" ? "Terminal" : "Process") + " Logs"
  );

  let subtitle = $derived(
    processInfo?.command?.slice(0, 60) + (processInfo?.command && processInfo.command.length > 60 ? "..." : "") ||
    terminalInfo?.cwd ||
    ""
  );

  let isRunning = $derived(
    sourceType === "terminal" || processInfo?.status === "running"
  );

  let startTime = $derived(
    processInfo?.startedAt || terminalInfo?.createdAt || Date.now()
  );

  let pid = $derived(
    processInfo?.pid || terminalInfo?.pid
  );
</script>

<div class="h-full flex flex-col bg-gray-900 text-gray-100 relative">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between bg-gray-800 shrink-0">
    <div class="flex items-center gap-3 min-w-0 flex-1">
      <div class="p-1.5 bg-gray-700 rounded">
        {#if sourceType === "terminal"}
          <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
        {/if}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium truncate">{title}</span>
          {#if processInfo?.status}
            <span class={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(processInfo.status)}`}>
              {processInfo.status}
            </span>
          {:else if sourceType === "terminal"}
            <span class="text-xs px-1.5 py-0.5 rounded text-green-600 bg-green-50">
              active
            </span>
          {/if}
          {#if hasErrors}
            <span class="text-xs px-1.5 py-0.5 rounded text-red-600 bg-red-50">
              errors
            </span>
          {/if}
        </div>
        {#if subtitle}
          <div class="text-xs text-gray-400 truncate">{subtitle}</div>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-1">
      <button
        onclick={() => showAnsi = !showAnsi}
        class={`p-1.5 rounded transition-colors ${showAnsi ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
        title={showAnsi ? "Hide ANSI colors" : "Show ANSI colors"}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path>
        </svg>
      </button>
      <button
        onclick={scrollToBottom}
        class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        title="Scroll to bottom"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      </button>
      <button
        onclick={copyLogs}
        class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        title="Copy logs"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
        </svg>
      </button>
      <button
        onclick={downloadLogs}
        class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        title="Download logs"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
      </button>
      <button
        onclick={fetchLogs}
        class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        title="Refresh"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
      </button>
      {#if onClose}
        <button
          onclick={onClose}
          class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Info Bar -->
  <div class="px-4 py-2 border-b border-gray-700 bg-gray-800/50 flex items-center gap-4 text-xs text-gray-400 shrink-0 overflow-x-auto">
    {#if pid}
      <div class="flex items-center gap-1.5">
        <span class="text-gray-500">PID:</span>
        <span class="font-mono">{pid}</span>
      </div>
    {/if}
    <div class="flex items-center gap-1.5">
      <span class="text-gray-500">Started:</span>
      <span>{formatTimestamp(startTime)}</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="text-gray-500">Duration:</span>
      <span>{formatDuration(startTime)}</span>
    </div>
    {#if processInfo?.exitCode !== undefined}
      <div class="flex items-center gap-1.5">
        <span class="text-gray-500">Exit:</span>
        <span class={processInfo.exitCode === 0 ? "text-green-400" : "text-red-400"}>{processInfo.exitCode}</span>
      </div>
    {/if}
    {#if processInfo?.ports && processInfo.ports.length > 0}
      <div class="flex items-center gap-1.5">
        <span class="text-gray-500">Ports:</span>
        {#each processInfo.ports as port}
          <a
            href={`http://localhost:${port}`}
            target="_blank"
            class="text-blue-400 hover:text-blue-300 font-mono"
          >
            :{port}
          </a>
        {/each}
      </div>
    {/if}
    <div class="flex items-center gap-1.5 flex-1 justify-end">
      <span class="text-gray-500">{logs.length} lines</span>
      {#if isRunning && autoRefresh}
        <span class="flex items-center gap-1 text-green-400">
          <span class="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
          Live
        </span>
      {/if}
    </div>
  </div>

  <!-- Logs Content -->
  <div
    bind:this={logsContainer}
    onscroll={handleScroll}
    class="flex-1 overflow-auto font-mono text-sm p-4 min-h-0"
  >
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="flex items-center gap-2 text-gray-400">
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading logs...</span>
        </div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-red-900/30 flex items-center justify-center">
            <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <p class="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    {:else if logs.length === 0}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
            <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <p class="text-sm text-gray-500">No output yet</p>
          {#if isRunning}
            <p class="text-xs text-gray-600 mt-1">Waiting for output...</p>
          {/if}
        </div>
      </div>
    {:else}
      <div class="space-y-0">
        {#each logs as line, i}
          {@const isError = isErrorLine(line)}
          <div class="flex hover:bg-gray-800/50 group {isError ? 'bg-red-900/20' : ''}">
            <span class="select-none w-12 text-right pr-3 shrink-0 text-xs leading-5 group-hover:text-gray-500 {isError ? 'text-red-500' : 'text-gray-600'}">{i + 1}</span>
            <pre class="flex-1 whitespace-pre-wrap break-all leading-5 {isError ? 'text-red-300' : 'text-gray-200'}">{#if showAnsi}{@html ansiToHtml(line)}{:else}{stripAnsi(line)}{/if}</pre>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Auto-scroll indicator -->
  {#if !autoScroll && logs.length > 0}
    <button
      onclick={scrollToBottom}
      class="absolute bottom-4 right-6 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-full shadow-lg flex items-center gap-1.5 transition-colors"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
      </svg>
      New output
    </button>
  {/if}
</div>
