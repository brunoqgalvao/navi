<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getUpdateStatus, applyUpdate, type UpdateStatus } from "../api";
  import { showError } from "$lib/errorHandler";
  import { api } from "$lib/api";

  let status = $state<UpdateStatus | null>(null);
  let open = $state(false);
  let updating = $state(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function check() {
    try {
      status = await getUpdateStatus();
    } catch {
      // server unreachable or endpoint missing — stay hidden
    }
  }

  onMount(() => {
    check();
    pollTimer = setInterval(check, 10 * 60_000);
  });
  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  async function handleUpdate() {
    // Updating restarts the whole service, which kills running agent sessions
    try {
      const active = await api.sessions.active();
      const running = active.length;
      if (running > 0 && !confirm(`${running} session${running === 1 ? " is" : "s are"} still running — updating will restart Navi and stop ${running === 1 ? "it" : "them"}. Continue?`)) {
        return;
      }
    } catch {
      // If we can't check, proceed — the user asked for the update
    }
    updating = true;
    try {
      const res = await applyUpdate();
      if (!res.restarting) {
        showError({ title: "Updated, restart needed", message: res.message || "Restart Navi manually." });
        updating = false;
        open = false;
        check();
      }
      // If restarting, keep the "updating…" state — the server will drop the
      // connection and the app reconnects to the new version on its own.
    } catch (e) {
      updating = false;
      showError({ title: "Update failed", message: e instanceof Error ? e.message : String(e) });
    }
  }
</script>

<svelte:window
  onclick={(e) => {
    if (open && !(e.target as HTMLElement).closest?.("[data-update-badge]")) open = false;
  }}
/>

{#if status && status.behind > 0}
  <div class="relative" data-update-badge>
    <button
      onclick={() => (open = !open)}
      class="p-2 h-full border rounded-lg shadow-sm transition-all flex items-center gap-1.5 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50"
      title="Update available"
    >
      <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      <span class="text-xs font-medium text-blue-600 dark:text-blue-300">Update ({status.behind})</span>
    </button>

    {#if open}
      <div class="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 p-3">
        <div class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">
          {status.behind} new {status.behind === 1 ? "commit" : "commits"} on main
        </div>
        <div class="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
          v{status.version} · {status.commit}{status.branch !== "main" ? ` · on branch '${status.branch}'` : ""}
        </div>
        <div class="max-h-40 overflow-y-auto space-y-1 mb-3">
          {#each status.commits as c (c.hash)}
            <div class="text-xs text-gray-600 dark:text-gray-300 flex gap-2">
              <span class="font-mono text-gray-400 dark:text-gray-500 shrink-0">{c.hash}</span>
              <span class="truncate">{c.subject}</span>
            </div>
          {/each}
        </div>
        {#if status.branch !== "main"}
          <div class="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Not on main — update from the terminal instead.
          </div>
        {:else}
          <button
            onclick={handleUpdate}
            disabled={updating}
            class="w-full px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-60 transition-colors"
          >
            {#if updating}
              Updating — Navi will restart…
            {:else}
              Update & Restart
            {/if}
          </button>
          <div class="text-[10px] text-gray-300 dark:text-gray-600 text-center mt-1.5">
            pulls origin/main, reinstalls deps, restarts the service
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
