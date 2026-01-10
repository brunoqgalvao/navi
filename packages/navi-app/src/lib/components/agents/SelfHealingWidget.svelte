<script lang="ts">
  import { getServerUrl } from "$lib/api";
  import { currentProject } from "$lib/stores";
  import { showError, showSuccess } from "$lib/errorHandler";
  import {
    HeartPulse,
    Play,
    Pause,
    Square,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Loader2,
    ChevronDown,
    ChevronUp,
  } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";

  interface HealingSession {
    running: boolean;
    status?: "idle" | "watching" | "healing" | "paused";
    errorCount?: number;
    attemptCount?: number;
    errors?: Array<{
      id: string;
      type: string;
      file?: string;
      line?: number;
      message: string;
      severity: "error" | "warning";
    }>;
    lastErrorAt?: number;
    lastHealAt?: number;
  }

  let session = $state<HealingSession>({ running: false });
  let isLoading = $state(false);
  let isExpanded = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function fetchStatus() {
    if (!$currentProject) return;

    try {
      const res = await fetch(
        `${getServerUrl()}/api/experimental/healing/${$currentProject.id}`
      );
      if (res.ok) {
        session = await res.json();
      }
    } catch (err) {
      console.error("Failed to fetch healing status:", err);
    }
  }

  async function startHealing() {
    if (!$currentProject) return;
    isLoading = true;

    try {
      const res = await fetch(`${getServerUrl()}/api/experimental/healing/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: $currentProject.id }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      showSuccess("Self-Healing Started", "Watching for build errors");
      await fetchStatus();
    } catch (err: any) {
      showError({ title: "Start Failed", message: err.message });
    } finally {
      isLoading = false;
    }
  }

  async function stopHealing() {
    if (!$currentProject) return;
    isLoading = true;

    try {
      const res = await fetch(`${getServerUrl()}/api/experimental/healing/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: $currentProject.id }),
      });

      if (!res.ok) throw new Error(await res.text());

      session = { running: false };
      showSuccess("Self-Healing Stopped");
    } catch (err: any) {
      showError({ title: "Stop Failed", message: err.message });
    } finally {
      isLoading = false;
    }
  }

  async function pauseHealing() {
    if (!$currentProject) return;

    try {
      await fetch(`${getServerUrl()}/api/experimental/healing/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: $currentProject.id }),
      });
      await fetchStatus();
    } catch (err: any) {
      showError({ title: "Pause Failed", message: err.message });
    }
  }

  async function resumeHealing() {
    if (!$currentProject) return;

    try {
      await fetch(`${getServerUrl()}/api/experimental/healing/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: $currentProject.id }),
      });
      await fetchStatus();
    } catch (err: any) {
      showError({ title: "Resume Failed", message: err.message });
    }
  }

  async function runCheck() {
    if (!$currentProject) return;
    isLoading = true;

    try {
      const res = await fetch(`${getServerUrl()}/api/experimental/healing/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: $currentProject.id }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      showSuccess("Check Complete", `Found ${data.errorCount} error${data.errorCount !== 1 ? "s" : ""}`);
      await fetchStatus();
    } catch (err: any) {
      showError({ title: "Check Failed", message: err.message });
    } finally {
      isLoading = false;
    }
  }

  function getStatusColor(status?: string) {
    switch (status) {
      case "watching":
        return "text-emerald-500";
      case "healing":
        return "text-amber-500";
      case "paused":
        return "text-gray-400";
      default:
        return "text-gray-500";
    }
  }

  function getStatusLabel(status?: string) {
    switch (status) {
      case "watching":
        return "Watching";
      case "healing":
        return "Healing...";
      case "paused":
        return "Paused";
      default:
        return "Idle";
    }
  }

  onMount(() => {
    fetchStatus();
    pollInterval = setInterval(fetchStatus, 5000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  // Re-fetch when project changes
  $effect(() => {
    if ($currentProject) {
      fetchStatus();
    }
  });
</script>

<div class="border border-gray-200 rounded-lg bg-white overflow-hidden">
  <!-- Header -->
  <button
    onclick={() => (isExpanded = !isExpanded)}
    class="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
  >
    <div class="flex items-center gap-2">
      <HeartPulse
        class="w-4 h-4 {session.running && session.status === 'healing'
          ? 'text-pink-500 animate-pulse'
          : session.running
            ? 'text-emerald-500'
            : 'text-gray-400'}"
      />
      <span class="text-sm font-medium text-gray-700">Self-Healing</span>
      {#if session.running}
        <span class="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          {getStatusLabel(session.status)}
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      {#if session.running && session.errorCount !== undefined}
        <span
          class="text-xs font-medium {session.errorCount > 0
            ? 'text-red-500'
            : 'text-emerald-500'}"
        >
          {session.errorCount} error{session.errorCount !== 1 ? "s" : ""}
        </span>
      {/if}
      {#if isExpanded}
        <ChevronUp class="w-4 h-4 text-gray-400" />
      {:else}
        <ChevronDown class="w-4 h-4 text-gray-400" />
      {/if}
    </div>
  </button>

  <!-- Expanded Content -->
  {#if isExpanded}
    <div class="px-3 pb-3 border-t border-gray-100">
      <!-- Controls -->
      <div class="flex gap-1 py-2">
        {#if !session.running}
          <button
            onclick={startHealing}
            disabled={isLoading || !$currentProject}
            class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
          >
            {#if isLoading}
              <Loader2 class="w-3 h-3 animate-spin" />
            {:else}
              <Play class="w-3 h-3" />
            {/if}
            Start
          </button>
        {:else}
          {#if session.status === "paused"}
            <button
              onclick={resumeHealing}
              class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
            >
              <Play class="w-3 h-3" />
              Resume
            </button>
          {:else}
            <button
              onclick={pauseHealing}
              class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors"
            >
              <Pause class="w-3 h-3" />
              Pause
            </button>
          {/if}

          <button
            onclick={runCheck}
            disabled={isLoading}
            class="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            {#if isLoading}
              <Loader2 class="w-3 h-3 animate-spin" />
            {:else}
              <RefreshCw class="w-3 h-3" />
            {/if}
            Check
          </button>

          <button
            onclick={stopHealing}
            disabled={isLoading}
            class="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
          >
            <Square class="w-3 h-3" />
            Stop
          </button>
        {/if}
      </div>

      <!-- Error List -->
      {#if session.running && session.errors && session.errors.length > 0}
        <div class="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {#each session.errors.slice(0, 5) as error}
            <div
              class="flex items-start gap-2 p-2 rounded text-xs {error.severity === 'error'
                ? 'bg-red-50'
                : 'bg-amber-50'}"
            >
              {#if error.severity === "error"}
                <AlertCircle class="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
              {:else}
                <AlertCircle class="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
              {/if}
              <div class="flex-1 min-w-0">
                {#if error.file}
                  <div class="text-gray-500 truncate">
                    {error.file}{error.line ? `:${error.line}` : ""}
                  </div>
                {/if}
                <div class="text-gray-700 line-clamp-2">{error.message}</div>
              </div>
            </div>
          {/each}
          {#if session.errors.length > 5}
            <div class="text-xs text-gray-500 text-center py-1">
              +{session.errors.length - 5} more errors
            </div>
          {/if}
        </div>
      {:else if session.running && session.errorCount === 0}
        <div class="flex items-center gap-2 p-2 rounded bg-emerald-50 text-xs text-emerald-700">
          <CheckCircle2 class="w-3 h-3" />
          All clear! No errors detected.
        </div>
      {:else if !session.running}
        <p class="text-xs text-gray-500 py-2">
          Enable self-healing to automatically watch for and fix build errors.
        </p>
      {/if}
    </div>
  {/if}
</div>
