<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getAccountsStatus, getUsage, swapAccount } from "../api";
  import type { AccountsStatus, UsageResponse, AccountGauge } from "../types";
  import { showError, showSuccess } from "$lib/errorHandler";

  let status = $state<AccountsStatus | null>(null);
  let usage = $state<UsageResponse | null>(null);
  let open = $state(false);
  let swapping = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function refresh(force = false) {
    try {
      status = await getAccountsStatus(force);
    } catch {
      status = null;
    }
  }

  async function loadUsage() {
    try {
      usage = await getUsage();
    } catch {
      usage = null;
    }
  }

  onMount(() => {
    refresh();
    pollTimer = setInterval(() => refresh(), 60_000);
  });
  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  function toggle() {
    open = !open;
    if (open) {
      refresh();
      if (!usage) loadUsage();
    }
  }

  function severityColor(severity: string): string {
    if (severity === "critical") return "bg-red-500";
    if (severity === "warning") return "bg-amber-500";
    return "bg-emerald-500";
  }

  function barColor(percent: number): string {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  }

  function gaugeLabel(g: AccountGauge): string {
    if (g.kind === "session") return "5h session";
    if (g.kind === "weekly_all") return "weekly";
    if (g.kind === "weekly_scoped") return `weekly ${g.scopeModel ?? ""}`.trim();
    return g.kind;
  }

  function formatReset(resetsAt: string | number | null | undefined): string {
    if (!resetsAt) return "";
    const ts = typeof resetsAt === "number" ? resetsAt * 1000 : Date.parse(resetsAt);
    if (Number.isNaN(ts)) return "";
    const diff = ts - Date.now();
    if (diff <= 0) return "resetting…";
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(h / 24);
    if (d > 0) return `resets in ${d}d ${h % 24}h`;
    if (h > 0) return `resets in ${h}h ${Math.floor((diff % 3_600_000) / 60_000)}m`;
    return `resets in ${Math.max(1, Math.floor(diff / 60_000))}m`;
  }

  // Worst (highest-percent) gauge of the active account, for the compact badge
  const activeSummary = $derived.by(() => {
    if (!status?.available || !status.activeAccount || !status.accounts) return null;
    const account = status.accounts[status.activeAccount];
    const gauges = account?.snapshot?.gauges ?? [];
    if (gauges.length === 0) return { name: status.activeAccount, percent: null, severity: "normal" };
    const worst = gauges.reduce((a, b) => (b.percent > a.percent ? b : a));
    return { name: status.activeAccount, percent: worst.percent, severity: worst.severity };
  });

  async function handleSwap(name: string) {
    swapping = name;
    try {
      await swapAccount(name);
      showSuccess("Account swapped", `Live slot now on '${name}'. Running sessions switch over on their next token refresh.`);
      await refresh(true);
    } catch (e) {
      showError({ title: "Swap failed", message: e instanceof Error ? e.message : String(e) });
    } finally {
      swapping = null;
    }
  }
</script>

<svelte:window
  onclick={(e) => {
    if (open && !(e.target as HTMLElement).closest?.("[data-accounts-badge]")) open = false;
  }}
/>

{#if status?.available}
  <div class="relative" data-accounts-badge>
    <button
      onclick={toggle}
      class="p-2 h-full border rounded-lg shadow-sm transition-all flex items-center gap-1.5 {open
        ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}"
      title="Claude accounts & usage"
    >
      {#if activeSummary}
        <span class="w-2 h-2 rounded-full {severityColor(activeSummary.severity)}"></span>
        <span class="text-xs font-medium text-gray-600 dark:text-gray-300">{activeSummary.name}</span>
        {#if activeSummary.percent !== null}
          <span class="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{activeSummary.percent}%</span>
        {/if}
      {:else}
        <span class="text-xs text-gray-400">accounts</span>
      {/if}
    </button>

    {#if open}
      <div
        class="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 p-3 space-y-3"
      >
        <!-- Claude accounts -->
        {#if status.accounts}
          {#each Object.entries(status.accounts) as [name, account] (name)}
            {@const isActive = name === status.activeAccount}
            <div class="rounded-lg border {isActive ? 'border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30' : 'border-gray-100 dark:border-gray-700'} p-2.5">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{name}</span>
                {#if isActive}
                  <span class="text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">active</span>
                {/if}
                {#if account.needsLogin}
                  <span class="text-[10px] font-medium uppercase tracking-wide text-red-500">needs login</span>
                {/if}
                <span class="flex-1"></span>
                {#if !isActive && !account.needsLogin}
                  <button
                    onclick={() => handleSwap(name)}
                    disabled={swapping !== null}
                    class="text-xs px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {swapping === name ? "swapping…" : "swap"}
                  </button>
                {/if}
              </div>
              <div class="text-[11px] text-gray-400 dark:text-gray-500 truncate">{account.email}</div>
              {#if account.snapshot?.gauges}
                <div class="mt-2 space-y-1.5">
                  {#each account.snapshot.gauges as g (g.kind + (g.scopeModel ?? ""))}
                    <div class="flex items-center gap-2">
                      <span class="text-[11px] text-gray-500 dark:text-gray-400 w-24 shrink-0">{gaugeLabel(g)}</span>
                      <div class="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div class="h-full rounded-full {barColor(g.percent)}" style="width: {Math.min(100, g.percent)}%"></div>
                      </div>
                      <span class="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 w-8 text-right">{g.percent}%</span>
                    </div>
                    {#if g.resetsAt && g.percent > 0}
                      <div class="text-[10px] text-gray-300 dark:text-gray-600 pl-[6.5rem] -mt-1">{formatReset(g.resetsAt)}</div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        {/if}

        <!-- Codex usage -->
        {#if usage?.codex?.available}
          {@const codex = usage.codex}
          <div class="rounded-lg border border-gray-100 dark:border-gray-700 p-2.5">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-800 dark:text-gray-100">codex</span>
              {#if codex.planType}
                <span class="text-[10px] font-medium uppercase tracking-wide text-gray-400">{codex.planType}</span>
              {/if}
            </div>
            {#if codex.primary}
              <div class="mt-2 flex items-center gap-2">
                <span class="text-[11px] text-gray-500 dark:text-gray-400 w-24 shrink-0">
                  {codex.primary.windowMinutes >= 10080 ? "weekly" : `${Math.round(codex.primary.windowMinutes / 60)}h window`}
                </span>
                <div class="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div class="h-full rounded-full {barColor(codex.primary.usedPercent)}" style="width: {Math.min(100, codex.primary.usedPercent)}%"></div>
                </div>
                <span class="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 w-8 text-right">{Math.round(codex.primary.usedPercent)}%</span>
              </div>
              <div class="text-[10px] text-gray-300 dark:text-gray-600 pl-[6.5rem]">{formatReset(codex.primary.resetsAt)}</div>
            {/if}
          </div>
        {/if}

        <!-- 7d history sparklines -->
        {#if usage?.claude?.available}
          <div class="rounded-lg border border-gray-100 dark:border-gray-700 p-2.5">
            <div class="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">last 7 days</div>
            <div class="space-y-1">
              {#each Object.entries(usage.claude.accounts) as [name, gauges] (name)}
                {@const weekly = gauges.find((g) => g.kind === "weekly_scoped") ?? gauges.find((g) => g.kind === "weekly_all")}
                {#if weekly}
                  <div class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span class="w-10 shrink-0">{name}</span>
                    <span class="font-mono text-gray-400 dark:text-gray-500">{weekly.sparkline ?? ""}</span>
                    <span class="flex-1"></span>
                    <span class="tabular-nums">peak {weekly.peak}%</span>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        <div class="text-[10px] text-gray-300 dark:text-gray-600 text-center">
          swaps apply to new sessions · powered by ccx
        </div>
      </div>
    {/if}
  </div>
{/if}
