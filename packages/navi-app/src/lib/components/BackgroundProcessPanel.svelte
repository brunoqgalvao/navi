<script lang="ts">
  /**
   * ProcessPanel - Manage and monitor ALL processes (background + active)
   *
   * Features:
   * - View ALL running processes: query workers, terminals, exec, background
   * - Stop/restart processes
   * - Auto-detect ports and offer preview
   * - Show process output in expandable view
   */
  import { onMount, onDestroy } from "svelte";
  import {
    backgroundProcessApi,
    type BackgroundProcess,
    type BackgroundProcessStatus,
    type BackgroundProcessEvent,
  } from "../api";
  import { backgroundProcessEvents } from "../stores/backgroundProcessEvents";
  import { getApiBase } from "../config";

  interface Props {
    projectId?: string | null;
    sessionId?: string | null;
    onOpenPreview?: (url: string) => void;
  }

  let { projectId = null, sessionId = null, onOpenPreview }: Props = $props();

  // Unified process type that covers both background and active processes
  interface UnifiedProcess {
    id: string;
    type: "query" | "exec" | "pty" | "child" | "bash" | "task" | "dev_server";
    command?: string;
    cwd?: string;
    pid?: number;
    sessionId?: string;
    sessionTitle?: string;
    projectId?: string;
    startedAt: number;
    status: "running" | "completed" | "failed" | "killed";
    exitCode?: number;
    output: string[];
    outputSize: number;
    ports: number[];
    label?: string;
    source: "active" | "background"; // Track which API it came from
  }

  let processes: UnifiedProcess[] = $state([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let expandedProcessId = $state<string | null>(null);
  let actionInProgress = $state<string | null>(null);
  let liveOutput = $state<Map<string, string[]>>(new Map());

  // Polling interval for process list
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Load active processes from /api/processes
  async function loadActiveProcesses(): Promise<UnifiedProcess[]> {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/processes`);
      if (!res.ok) return [];
      const data = await res.json();

      // Filter by sessionId if provided, but always include "global" processes
      const filtered = sessionId
        ? data.filter((p: any) => p.sessionId === sessionId || p.sessionId === "global")
        : data;

      return filtered.map((p: any) => ({
        id: p.id,
        type: p.type,
        command: p.command,
        cwd: p.cwd,
        pid: p.pid,
        sessionId: p.sessionId,
        sessionTitle: p.sessionTitle,
        startedAt: p.startedAt,
        status: "running" as const,
        output: [],
        outputSize: 0,
        ports: [],
        label: getLabelForActiveProcess(p),
        source: "active" as const,
      }));
    } catch (e) {
      console.error("[ProcessPanel] Failed to load active processes:", e);
      return [];
    }
  }

  function getLabelForActiveProcess(p: any): string {
    switch (p.type) {
      case "query":
        return p.sessionTitle || "Claude Agent";
      case "pty":
        return "Terminal";
      case "exec":
        return "Command";
      case "child":
        return p.command?.split("/").pop() || "Child Process";
      default:
        return p.type;
    }
  }

  async function loadProcesses() {
    try {
      console.log("[ProcessPanel] Loading processes for sessionId:", sessionId);
      // Load both active and background processes in parallel
      const [activeProcs, bgProcs] = await Promise.all([
        loadActiveProcesses(),
        backgroundProcessApi.list(sessionId ? { sessionId } : undefined).catch(() => [] as BackgroundProcess[]),
      ]);
      console.log("[ProcessPanel] Active processes:", activeProcs.length, "Background processes:", bgProcs.length);

      // Convert background processes to unified format
      // Only include processes that match our sessionId (if we have one), plus "global" processes
      const bgUnified: UnifiedProcess[] = bgProcs
        .filter((p) => !sessionId || p.sessionId === sessionId || p.sessionId === "global")
        .map((p): UnifiedProcess => ({
          id: p.id,
          type: p.type,
          command: p.command,
          cwd: p.cwd,
          pid: p.pid,
          sessionId: p.sessionId,
          projectId: p.projectId,
          startedAt: p.startedAt,
          status: p.status,
          exitCode: p.exitCode,
          output: p.output,
          outputSize: p.outputSize,
          ports: p.ports,
          label: p.label,
          source: "background",
        }));

      // Merge and deduplicate (background processes take precedence if same ID)
      const bgIds = new Set(bgUnified.map((p) => p.id));
      const merged = [
        ...bgUnified,
        ...activeProcs.filter((p) => !bgIds.has(p.id)),
      ];

      // Sort: running first, then by startedAt descending
      processes = merged.sort((a, b) => {
        if (a.status === "running" && b.status !== "running") return -1;
        if (b.status === "running" && a.status !== "running") return 1;
        return b.startedAt - a.startedAt;
      });

      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load processes";
      console.error("[ProcessPanel] Load error:", e);
    } finally {
      loading = false;
    }
  }

  async function killProcess(proc: UnifiedProcess) {
    actionInProgress = proc.id;
    try {
      if (proc.source === "background") {
        await backgroundProcessApi.kill(proc.id);
      } else {
        // Kill active process via /api/processes/:id
        const apiBase = getApiBase();
        await fetch(`${apiBase}/processes/${proc.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: proc.type }),
        });
      }
      await loadProcesses();
    } catch (e) {
      console.error("[ProcessPanel] Kill error:", e);
    } finally {
      actionInProgress = null;
    }
  }

  async function restartProcess(proc: UnifiedProcess) {
    if (proc.source !== "background") return; // Only background processes can be restarted
    actionInProgress = proc.id;
    try {
      await backgroundProcessApi.restart(proc.id);
      await loadProcesses();
    } catch (e) {
      console.error("[ProcessPanel] Restart error:", e);
    } finally {
      actionInProgress = null;
    }
  }

  async function removeProcess(proc: UnifiedProcess) {
    if (proc.source !== "background") return; // Only background processes can be removed from list
    actionInProgress = proc.id;
    try {
      await backgroundProcessApi.remove(proc.id);
      await loadProcesses();
    } catch (e) {
      console.error("[ProcessPanel] Remove error:", e);
    } finally {
      actionInProgress = null;
    }
  }

  async function loadOutput(proc: UnifiedProcess) {
    if (proc.source !== "background") return; // Only background processes have output
    try {
      const result = await backgroundProcessApi.getOutput(proc.id, 100);
      liveOutput.set(proc.id, result.output);
      liveOutput = new Map(liveOutput); // Trigger reactivity
    } catch (e) {
      console.error("[ProcessPanel] Load output error:", e);
    }
  }

  function toggleExpand(proc: UnifiedProcess) {
    if (expandedProcessId === proc.id) {
      expandedProcessId = null;
    } else {
      expandedProcessId = proc.id;
      if (proc.source === "background") {
        loadOutput(proc);
      }
    }
  }

  function openPort(port: number) {
    const url = `http://localhost:${port}`;
    if (onOpenPreview) {
      onOpenPreview(url);
    } else {
      window.open(url, "_blank");
    }
  }

  function formatDuration(startedAt: number): string {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "running":
        return "bg-green-100 text-green-700 border-green-200";
      case "completed":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "failed":
        return "bg-red-100 text-red-700 border-red-200";
      case "killed":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case "running":
        return "●";
      case "completed":
        return "✓";
      case "failed":
        return "✗";
      case "killed":
        return "■";
      default:
        return "○";
    }
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case "query":
        return "🤖";
      case "pty":
        return "⬛";
      case "exec":
      case "bash":
        return "⚡";
      case "child":
        return "↳";
      case "dev_server":
        return "🌐";
      case "task":
        return "📋";
      default:
        return "○";
    }
  }

  function getTypeLabel(type: string): string {
    switch (type) {
      case "query":
        return "Agent";
      case "pty":
        return "Terminal";
      case "exec":
        return "Exec";
      case "bash":
        return "Bash";
      case "child":
        return "Child";
      case "dev_server":
        return "Server";
      case "task":
        return "Task";
      default:
        return type;
    }
  }

  // Handle WebSocket events for real-time updates
  function handleBgProcessEvent(bgEvent: BackgroundProcessEvent) {
    try {

        switch (bgEvent.type) {
          case "process_started":
            if (bgEvent.process) {
              // Add to list if matches filter
              if (!projectId || bgEvent.process.projectId === projectId) {
                const newProc: UnifiedProcess = {
                  ...bgEvent.process,
                  source: "background",
                };
                processes = [...processes, newProc];
              }
            }
            break;

          case "process_output":
            if (bgEvent.processId && bgEvent.data) {
              const existing = liveOutput.get(bgEvent.processId) || [];
              const newLines = bgEvent.data.split("\n").filter((l) => l.trim());
              liveOutput.set(bgEvent.processId, [...existing.slice(-90), ...newLines]);
              liveOutput = new Map(liveOutput);

              // Also update the process in the list
              const proc = processes.find((p) => p.id === bgEvent.processId);
              if (proc) {
                proc.output = [...proc.output.slice(-90), ...newLines];
              }
            }
            break;

          case "process_status":
            if (bgEvent.processId) {
              const proc = processes.find((p) => p.id === bgEvent.processId);
              if (proc && bgEvent.status) {
                proc.status = bgEvent.status;
                if (bgEvent.exitCode !== undefined) {
                  proc.exitCode = bgEvent.exitCode;
                }
                processes = [...processes]; // Trigger reactivity
              }
            }
            break;

          case "process_port_detected":
            if (bgEvent.processId && bgEvent.port) {
              const proc = processes.find((p) => p.id === bgEvent.processId);
              if (proc && !proc.ports.includes(bgEvent.port)) {
                proc.ports.push(bgEvent.port);
                processes = [...processes];
              }
            }
            break;

          case "process_removed":
            if (bgEvent.processId) {
              processes = processes.filter((p) => p.id !== bgEvent.processId);
              liveOutput.delete(bgEvent.processId);
              liveOutput = new Map(liveOutput);
            }
            break;
        }
    } catch {}
  }

  onMount(() => {
    loadProcesses();
    pollInterval = setInterval(loadProcesses, 5000);

    // Listen for WebSocket messages
    window.addEventListener("message", handleWsMessage);
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
    window.removeEventListener("message", handleWsMessage);
  });

  // Computed stats
  let runningCount = $derived(processes.filter((p) => p.status === "running").length);
  let totalPorts = $derived(processes.flatMap((p) => p.ports).length);
</script>

<div class="h-full flex flex-col bg-white">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
    <div class="flex items-center gap-2">
      <h2 class="font-medium text-gray-900">Processes</h2>
      {#if runningCount > 0}
        <span class="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
          {runningCount} running
        </span>
      {/if}
    </div>
    <button
      onclick={loadProcesses}
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
  <div class="flex-1 overflow-y-auto">
    {#if loading && processes.length === 0}
      <div class="flex items-center justify-center h-32 text-gray-500">
        <svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading...
      </div>
    {:else if error}
      <div class="p-4 text-red-600 text-sm">
        {error}
      </div>
    {:else if processes.length === 0}
      <div class="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
        <svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p class="font-medium text-gray-600">No processes in this chat</p>
        <p class="text-gray-400 mt-1">Processes started in this session will appear here</p>
      </div>
    {:else}
      <div class="divide-y divide-gray-100">
        {#each processes as proc (proc.id)}
          <div class="group">
            <!-- Process Row -->
            <div
              class="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
              onclick={() => toggleExpand(proc)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === "Enter" && toggleExpand(proc)}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <!-- Type, Label and Status -->
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <!-- Type badge -->
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600 border border-gray-200">
                      <span class="text-[10px]">{getTypeIcon(proc.type)}</span>
                      {getTypeLabel(proc.type)}
                    </span>
                    <!-- Status badge -->
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border {getStatusColor(
                        proc.status
                      )}"
                    >
                      <span class="text-[10px]">{getStatusIcon(proc.status)}</span>
                      {proc.status}
                    </span>
                    {#if proc.label}
                      <span class="text-sm font-medium text-gray-900">{proc.label}</span>
                    {/if}
                    {#if proc.pid}
                      <span class="text-xs text-gray-400">PID {proc.pid}</span>
                    {/if}
                  </div>

                  <!-- Command or Session Title -->
                  {#if proc.command}
                    <p
                      class="text-xs font-mono text-gray-600 truncate max-w-[300px]"
                      title={proc.command}
                    >
                      {proc.command}
                    </p>
                  {:else if proc.sessionTitle}
                    <p class="text-xs text-gray-600">
                      Session: {proc.sessionTitle}
                    </p>
                  {/if}

                  <!-- Ports -->
                  {#if proc.ports.length > 0}
                    <div class="flex items-center gap-1 mt-2">
                      {#each proc.ports as port}
                        <button
                          onclick={(e) => {
                            e.stopPropagation();
                            openPort(port);
                          }}
                          class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                        >
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          :{port}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {#if proc.status === "running"}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        killProcess(proc);
                      }}
                      disabled={actionInProgress === proc.id}
                      class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Stop"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    </button>
                  {:else if proc.source === "background"}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        restartProcess(proc);
                      }}
                      disabled={actionInProgress === proc.id}
                      class="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                      title="Restart"
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
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        removeProcess(proc);
                      }}
                      disabled={actionInProgress === proc.id}
                      class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  {/if}

                  <!-- Expand chevron -->
                  <svg
                    class="w-4 h-4 text-gray-400 transition-transform {expandedProcessId === proc.id
                      ? 'rotate-180'
                      : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <!-- Duration -->
              <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
                <span>Started {formatDuration(proc.startedAt)} ago</span>
                {#if proc.outputSize > 0}
                  <span>•</span>
                  <span>{Math.round(proc.outputSize / 1024)}KB output</span>
                {/if}
              </div>
            </div>

            <!-- Expanded Output / Details -->
            {#if expandedProcessId === proc.id}
              <div class="px-4 pb-3">
                {#if proc.source === "background"}
                  <!-- Background process output -->
                  <div
                    class="bg-gray-900 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs text-gray-300"
                  >
                    {#if liveOutput.get(proc.id)?.length}
                      {#each liveOutput.get(proc.id) || [] as line}
                        <div class="whitespace-pre-wrap break-all leading-relaxed">{line}</div>
                      {/each}
                    {:else if proc.output.length > 0}
                      {#each proc.output.slice(-50) as line}
                        <div class="whitespace-pre-wrap break-all leading-relaxed">{line}</div>
                      {/each}
                    {:else}
                      <span class="text-gray-500 italic">No output captured</span>
                    {/if}
                  </div>
                {:else}
                  <!-- Active process details -->
                  <div class="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                    <div><span class="font-medium">Type:</span> {getTypeLabel(proc.type)}</div>
                    {#if proc.pid}<div><span class="font-medium">PID:</span> {proc.pid}</div>{/if}
                    {#if proc.cwd}<div><span class="font-medium">CWD:</span> {proc.cwd}</div>{/if}
                    {#if proc.sessionId}<div><span class="font-medium">Session:</span> {proc.sessionId}</div>{/if}
                    <div class="text-gray-400 italic mt-2">
                      Output not available for active processes. Use Terminal panel for interactive output.
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer with quick actions -->
  {#if totalPorts > 0}
    <div class="px-4 py-2 border-t border-gray-200 bg-gray-50/50">
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
          />
        </svg>
        <span>{totalPorts} port{totalPorts > 1 ? "s" : ""} detected</span>
      </div>
    </div>
  {/if}
</div>
