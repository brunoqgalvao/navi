<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { processApi, type ProcessInfo } from "../api";

  interface Props {
    sessionId?: string | null;
    compact?: boolean;
  }

  let { sessionId = null, compact = false }: Props = $props();

  let allProcesses: ProcessInfo[] = $state([]);
  let loading = $state(true);
  let killingId: string | null = $state(null);
  let showDropdown = $state(false);

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Filter processes by sessionId if provided, and exclude the main "query" (agent) process
  // since it's obvious the agent is running - we only want to show child processes that might be stuck
  let processes = $derived(
    (sessionId
      ? allProcesses.filter(p => p.sessionId === sessionId)
      : allProcesses
    ).filter(p => p.type !== "query") // Hide the agent process itself
  );

  async function loadProcesses() {
    try {
      allProcesses = await processApi.list();
    } catch (e) {
      console.error("Failed to load processes:", e);
    } finally {
      loading = false;
    }
  }

  async function killProcess(id: string, e?: Event) {
    e?.stopPropagation();
    killingId = id;
    try {
      await processApi.kill(id);
      await loadProcesses();
    } catch (e) {
      console.error("Failed to kill process:", e);
    } finally {
      killingId = null;
    }
  }

  async function killAll(e?: Event) {
    e?.stopPropagation();
    killingId = "all";
    try {
      // Kill only processes for this session
      for (const proc of processes) {
        await processApi.kill(proc.id);
      }
      await loadProcesses();
    } catch (e) {
      console.error("Failed to kill processes:", e);
    } finally {
      killingId = null;
    }
  }

  function getTypeLabel(type: ProcessInfo["type"]): string {
    switch (type) {
      case "query": return "Agent";
      case "exec": return "Cmd";
      case "pty": return "Term";
      case "child": return "Process";
      default: return type;
    }
  }

  function getTypeClass(type: ProcessInfo["type"]): string {
    switch (type) {
      case "query": return "bg-blue-100 text-blue-700";
      case "exec": return "bg-green-100 text-green-700";
      case "pty": return "bg-yellow-100 text-yellow-700";
      case "child": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  }

  onMount(() => {
    loadProcesses();
    pollInterval = setInterval(loadProcesses, 2000);
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });
</script>

{#if processes.length > 0}
  <div class="process-indicator" class:compact>
    <button
      class="trigger"
      onclick={() => showDropdown = !showDropdown}
      title="Active processes for this chat"
    >
      <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
      </svg>
      <span class="count">{processes.length}</span>
      <span class="label">running</span>
      <svg class="chevron" class:open={showDropdown} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </button>

    {#if showDropdown}
      <div class="modal-backdrop" onclick={() => showDropdown = false}></div>
      <div class="modal">
        <div class="modal-header">
          <span>Running Processes</span>
          <div class="modal-header-actions">
            {#if processes.length > 1}
              <button
                class="kill-all"
                onclick={killAll}
                disabled={killingId === "all"}
              >
                {killingId === "all" ? "..." : "Stop All"}
              </button>
            {/if}
            <button class="close-btn" onclick={() => showDropdown = false}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="modal-content">
          {#each processes as proc (proc.id)}
            <div class="process-item">
              <div class="process-info">
                <span class="type-badge {getTypeClass(proc.type)}">
                  {getTypeLabel(proc.type)}
                </span>
                <span class="command" title={proc.command || ""}>
                  {#if proc.command}
                    {proc.command}
                  {:else if proc.type === "query"}
                    Claude Agent
                  {:else if proc.type === "pty"}
                    Terminal session
                  {:else if proc.type === "child"}
                    Child process{proc.pid ? ` (${proc.pid})` : ""}
                  {:else}
                    Process
                  {/if}
                </span>
                {#if proc.pid && proc.command}
                  <span class="pid">PID {proc.pid}</span>
                {/if}
              </div>
              <button
                class="kill-btn"
                onclick={(e) => killProcess(proc.id, e)}
                disabled={killingId === proc.id}
                title="Stop process"
              >
                {#if killingId === proc.id}
                  <svg class="spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                {:else}
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                  </svg>
                {/if}
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .process-indicator {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .trigger:hover {
    background: #f9fafb;
    border-color: #d1d5db;
    color: #374151;
  }

  .icon {
    width: 14px;
    height: 14px;
  }

  .count {
    font-weight: 600;
  }

  .label {
    opacity: 0.9;
  }

  .chevron {
    width: 12px;
    height: 12px;
    transition: transform 0.15s;
    opacity: 0.7;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .compact .trigger {
    padding: 4px 8px;
    font-size: 11px;
    gap: 4px;
  }

  .compact .icon {
    width: 12px;
    height: 12px;
  }

  .compact .label {
    display: none;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.3);
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 101;
    width: 90%;
    max-width: 400px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }

  .modal-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
  }

  .kill-all {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .kill-all:hover:not(:disabled) {
    background: #fee2e2;
  }

  .kill-all:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-content {
    max-height: 300px;
    overflow-y: auto;
  }

  .process-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid #f3f4f6;
  }

  .process-item:last-child {
    border-bottom: none;
  }

  .process-item:hover {
    background: #f9fafb;
  }

  .process-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .type-badge {
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .command {
    font-size: 13px;
    color: #374151;
    font-family: ui-monospace, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pid {
    font-size: 11px;
    color: #9ca3af;
    flex-shrink: 0;
  }

  .kill-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .kill-btn:hover:not(:disabled) {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .kill-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .kill-btn svg {
    width: 14px;
    height: 14px;
  }

  .spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
