<script lang="ts">
  import type { ProjectCanvasSessionData } from "../../types";
  import { relativeTime } from "$lib/utils/formatting";

  interface Props {
    data: ProjectCanvasSessionData;
    selected?: boolean;
  }

  let { data, selected = false }: Props = $props();

  const statusMeta: Record<ProjectCanvasSessionData["status"], { label: string; dot: string; badge: string }> = {
    running: {
      label: "Running",
      dot: "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    permission: {
      label: "Approval",
      dot: "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.16)]",
      badge: "bg-amber-50 text-amber-700 border-amber-200",
    },
    awaiting_input: {
      label: "Needs Input",
      dot: "bg-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.16)]",
      badge: "bg-orange-50 text-orange-700 border-orange-200",
    },
    unread: {
      label: "Unread",
      dot: "bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.16)]",
      badge: "bg-blue-50 text-blue-700 border-blue-200",
    },
    review: {
      label: "Review",
      dot: "bg-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.16)]",
      badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    idle: {
      label: "Idle",
      dot: "bg-slate-400 shadow-[0_0_0_4px_rgba(148,163,184,0.14)]",
      badge: "bg-slate-50 text-slate-600 border-slate-200",
    },
  };

  const modelLabel = $derived(
    data.model
      ? data.model.replace("claude-", "").replace("-latest", "").replace(/-/g, " ")
      : "default model"
  );

  const status = $derived(statusMeta[data.status] ?? statusMeta.idle);
  const costLabel = $derived(data.totalCostUsd > 0 ? `$${data.totalCostUsd.toFixed(2)}` : "No cost yet");
</script>

<article
  class={`w-[290px] rounded-[24px] border bg-white/95 backdrop-blur shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition-all ${
    selected
      ? "border-slate-900 ring-2 ring-slate-900/10"
      : "border-slate-200 hover:border-slate-300"
  }`}
>
  <div class="p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class={`h-2.5 w-2.5 rounded-full ${status.dot}`}></span>
          <span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${status.badge}`}>
            {status.label}
          </span>
        </div>
        <h3 class="mt-3 text-[15px] font-semibold leading-5 text-slate-900 line-clamp-2">
          {data.title || "Untitled chat"}
        </h3>
      </div>

      <button
        type="button"
        class="nodrag inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
        onclick={(event) => {
          event.stopPropagation();
          data.onOpen?.(data.sessionId);
        }}
        title="Open chat"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M8 5l8 7-8 7" />
        </svg>
      </button>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div class="uppercase tracking-[0.14em] text-[10px] text-slate-400">Updated</div>
        <div class="mt-1 font-medium text-slate-700">{relativeTime(data.updatedAt)}</div>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div class="uppercase tracking-[0.14em] text-[10px] text-slate-400">Turns</div>
        <div class="mt-1 font-medium text-slate-700">{data.totalTurns}</div>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
      <span class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
        {modelLabel}
      </span>
      {#if data.worktreeBranch}
        <span class="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
          {data.worktreeBranch}
        </span>
      {/if}
      <span class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
        {costLabel}
      </span>
    </div>
  </div>
</article>
