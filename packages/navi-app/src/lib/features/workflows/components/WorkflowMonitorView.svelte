<script lang="ts">
  import RelativeTime from "$lib/components/RelativeTime.svelte";
  import Markdown from "$lib/components/Markdown.svelte";
  import { api, type Workflow, type WorkflowRun } from "$lib/api";
  import { sessionHierarchyApi } from "$lib/features/session-hierarchy/api";
  import {
    parseDeliverable,
    isActiveStatus,
    type AgentStatus,
    type Deliverable,
    type SessionArtifact,
    type SessionTreeNode,
  } from "$lib/features/session-hierarchy/types";

  interface Props {
    workflow: Workflow;
    onRunNow?: () => Promise<void> | void;
    onSelectSession?: (sessionId: string) => void;
    onOpenArtifact?: (path: string) => void;
  }

  interface DeliverableEntry {
    session: SessionTreeNode;
    deliverable: Deliverable;
    summaryPreview: string;
    contentPreview: string;
    deliveredAt: number;
    runId: string;
  }

  interface AttentionEntry {
    session: SessionTreeNode;
    runId: string;
    reason: string;
  }

  interface RunCard {
    run: WorkflowRun;
    runNode: SessionTreeNode | null;
    agentSessions: SessionTreeNode[];
    deliverables: DeliverableEntry[];
    artifacts: SessionArtifact[];
    activeAgents: number;
    blockedAgents: number;
    failedAgents: number;
    waitingAgents: number;
    deliveredAgents: number;
    attentionAgents: AttentionEntry[];
    lastActivityAt: number | null;
  }

  let {
    workflow,
    onRunNow,
    onSelectSession,
    onOpenArtifact,
  }: Props = $props();

  let loading = $state(true);
  let refreshing = $state(false);
  let runningNow = $state(false);
  let error = $state<string | null>(null);
  let lastLoadedAt = $state<number | null>(null);
  let runs = $state<WorkflowRun[]>([]);
  let tree = $state<SessionTreeNode | null>(null);
  let artifacts = $state<SessionArtifact[]>([]);
  let expandedRuns = $state<Set<string>>(new Set());

  function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  function previewText(value: unknown, max = 180): string {
    if (value === null || value === undefined) return "";
    const raw =
      typeof value === "string"
        ? value
        : Array.isArray(value)
          ? value
              .map((entry) =>
                typeof entry === "string" ? entry : JSON.stringify(entry)
              )
              .join(" ")
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);

    const compact = normalizeWhitespace(raw);
    if (compact.length <= max) return compact;
    return `${compact.slice(0, max - 1)}...`;
  }

  function flattenTree(node: SessionTreeNode): SessionTreeNode[] {
    return [node, ...node.children.flatMap(flattenTree)];
  }

  function formatSchedule(schedule: Workflow["schedule"]): string {
    switch (schedule.kind) {
      case "every":
        return `Every ${Math.max(1, Math.round(schedule.interval / 60000))} min`;
      case "cron":
        return schedule.timezone
          ? `${schedule.expression} (${schedule.timezone})`
          : schedule.expression;
      case "at":
        return new Date(schedule.time).toLocaleString();
    }
  }

  function formatDuration(startedAt: number, completedAt: number | null): string {
    const end = completedAt ?? Date.now();
    const delta = Math.max(0, end - startedAt);
    const seconds = Math.floor(delta / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function runStatusColor(status: WorkflowRun["status"]): string {
    switch (status) {
      case "success":
        return "bg-emerald-500/15 text-emerald-400";
      case "failed":
        return "bg-rose-500/15 text-rose-400";
      case "skipped":
        return "bg-amber-500/15 text-amber-400";
      case "running":
      default:
        return "bg-accent-500/15 text-accent-400";
    }
  }

  function runStatusDot(status: WorkflowRun["status"]): string {
    switch (status) {
      case "success":
        return "bg-emerald-400";
      case "failed":
        return "bg-rose-400";
      case "skipped":
        return "bg-amber-400";
      case "running":
      default:
        return "bg-accent-400 animate-pulse";
    }
  }

  function toneForAgentStatus(status: string | null | undefined): string {
    switch (status) {
      case "blocked":
        return "border-amber-500/30 bg-amber-500/10 text-amber-200";
      case "failed":
        return "border-rose-500/30 bg-rose-500/10 text-rose-200";
      case "pending_review":
      case "clarification_requested":
        return "border-violet-500/30 bg-violet-500/10 text-violet-200";
      case "waiting":
        return "border-orange-500/30 bg-orange-500/10 text-orange-200";
      case "delivered":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
      case "working":
      default:
        return "border-gray-700 bg-gray-800/70 text-gray-200";
    }
  }

  function openSession(sessionId: string | null | undefined) {
    if (!sessionId) return;
    onSelectSession?.(sessionId);
  }

  function toggleRun(runId: string) {
    const next = new Set(expandedRuns);
    if (next.has(runId)) {
      next.delete(runId);
    } else {
      next.add(runId);
    }
    expandedRuns = next;
  }

  async function triggerManualRun() {
    if (!onRunNow || runningNow) return;
    runningNow = true;
    try {
      await onRunNow();
      await loadMonitorData(false);
    } finally {
      runningNow = false;
    }
  }

  async function loadMonitorData(initialLoad: boolean) {
    if (!workflow?.id) return;
    if (initialLoad) {
      loading = true;
    } else {
      refreshing = true;
    }

    try {
      const [runResponse, treeResponse, artifactResponse] = await Promise.all([
        api.workflows.runs(workflow.id, 24),
        sessionHierarchyApi.getSessionTree(workflow.rootSessionId),
        sessionHierarchyApi.getArtifacts(workflow.rootSessionId),
      ]);

      runs = runResponse.runs;
      tree = treeResponse;
      artifacts = artifactResponse;
      error = null;
      lastLoadedAt = Date.now();

      if (expandedRuns.size === 0 && runResponse.runs[0]?.id) {
        expandedRuns = new Set([runResponse.runs[0].id]);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load workflow monitor";
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  $effect(() => {
    if (!workflow?.id) return;

    expandedRuns = new Set();
    void loadMonitorData(true);
    const timer = setInterval(() => {
      void loadMonitorData(false);
    }, 5000);

    return () => clearInterval(timer);
  });

  const runNodeBySessionId = $derived.by(() => {
    const map = new Map<string, SessionTreeNode>();
    for (const child of tree?.children || []) {
      map.set(child.id, child);
    }
    return map;
  });

  const runCards = $derived.by(() => {
    return runs.map((run): RunCard => {
      const runNode = run.session_id ? runNodeBySessionId.get(run.session_id) ?? null : null;
      const descendants = runNode ? flattenTree(runNode) : [];
      const agentSessions = runNode
        ? descendants.filter((session) => session.id !== runNode.id)
        : [];
      const descendantIds = new Set(descendants.map((session) => session.id));
      const runArtifacts = artifacts.filter((artifact) => descendantIds.has(artifact.session_id));

      const deliverableEntries =
        agentSessions
          .map((session) => {
            const deliverable = parseDeliverable(session.deliverable ?? null);
            if (!deliverable) return null;
            return {
              session,
              deliverable,
              summaryPreview: previewText(deliverable.summary, 160),
              contentPreview: previewText(deliverable.content, 220),
              deliveredAt: session.delivered_at || session.updated_at,
              runId: run.id,
            } satisfies DeliverableEntry;
          })
          .filter(Boolean) as DeliverableEntry[];

      if (deliverableEntries.length === 0 && runNode) {
        const rootDeliverable = parseDeliverable(runNode.deliverable ?? null);
        if (rootDeliverable) {
          deliverableEntries.push({
            session: runNode,
            deliverable: rootDeliverable,
            summaryPreview: previewText(rootDeliverable.summary, 160),
            contentPreview: previewText(rootDeliverable.content, 220),
            deliveredAt: runNode.delivered_at || runNode.updated_at,
            runId: run.id,
          });
        }
      }

      const attentionAgents = agentSessions
        .filter((session) =>
          ["blocked", "pending_review", "clarification_requested", "failed"].includes(
            session.agent_status || ""
          )
        )
        .map((session) => ({
          session,
          runId: run.id,
          reason:
            parseDeliverable(session.deliverable ?? null)?.summary ||
            previewText(session.task || session.title || session.escalation || "Needs attention", 120),
        }));

      const activeAgents = agentSessions.filter((session) =>
        isActiveStatus((session.agent_status || "working") as AgentStatus)
      ).length;

      return {
        run,
        runNode,
        agentSessions,
        deliverables: deliverableEntries.sort((a, b) => b.deliveredAt - a.deliveredAt),
        artifacts: runArtifacts.sort((a, b) => b.created_at - a.created_at),
        activeAgents,
        blockedAgents: agentSessions.filter((session) => session.agent_status === "blocked").length,
        failedAgents: agentSessions.filter((session) => session.agent_status === "failed").length,
        waitingAgents: agentSessions.filter((session) => session.agent_status === "waiting").length,
        deliveredAgents: agentSessions.filter((session) => session.agent_status === "delivered").length,
        attentionAgents,
        lastActivityAt:
          descendants.length > 0
            ? Math.max(...descendants.map((session) => session.updated_at))
            : run.completed_at || run.started_at,
      };
    });
  });

  const overallAttention = $derived.by(() => {
    return runCards
      .flatMap((card) => card.attentionAgents)
      .sort((a, b) => b.session.updated_at - a.session.updated_at)
      .slice(0, 8);
  });

  const recentDeliverables = $derived.by(() => {
    return runCards
      .flatMap((card) => card.deliverables)
      .sort((a, b) => b.deliveredAt - a.deliveredAt)
      .slice(0, 8);
  });

  const recentArtifacts = $derived.by(() => {
    return artifacts.slice().sort((a, b) => b.created_at - a.created_at).slice(0, 10);
  });

  const liveRunCount = $derived(
    runCards.filter((card) => card.run.status === "running" || card.activeAgents > 0).length
  );

  const completedRuns = $derived(
    runs.filter((run) => run.status === "success" || run.status === "failed").length
  );

  const successfulRuns = $derived(runs.filter((run) => run.status === "success").length);

  const successRate = $derived(
    completedRuns > 0 ? Math.round((successfulRuns / completedRuns) * 100) : 0
  );

  const latestCard = $derived(runCards[0] ?? null);
</script>

<!-- Full-width workflow monitor -->
<div class="flex h-full flex-col overflow-y-auto bg-gray-950">

  <!-- ── Compact header bar ── -->
  <header class="sticky top-0 z-10 border-b border-gray-800/80 bg-gray-950/95 backdrop-blur-sm">
    <div class="flex items-center justify-between gap-4 px-5 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/15">
          <span class="text-sm text-accent-400">W</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="truncate text-base font-semibold text-white">{workflow.name}</h1>
            <span class={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${workflow.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-800 text-gray-400"}`}>
              <span class={`h-1.5 w-1.5 rounded-full ${workflow.enabled ? "bg-emerald-400" : "bg-gray-500"}`}></span>
              {workflow.enabled ? "Active" : "Paused"}
            </span>
            {#if refreshing}
              <span class="flex items-center gap-1 text-[10px] text-gray-500">
                <span class="h-1 w-1 rounded-full bg-accent-400 animate-pulse"></span>
                syncing
              </span>
            {/if}
          </div>
          <p class="truncate text-xs text-gray-500">{formatSchedule(workflow.schedule)} &middot; {successRate}% health &middot; {runs.length} runs</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if runs[0]?.session_id}
          <button
            onclick={() => openSession(runs[0]?.session_id)}
            class="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
          >
            Open latest run
          </button>
        {/if}
        <button
          onclick={triggerManualRun}
          disabled={runningNow}
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-white/80"></span>
          {runningNow ? "Running..." : "Run now"}
        </button>
      </div>
    </div>
  </header>

  <!-- ── Main content ── -->
  <div class="flex-1 px-5 py-5">

    <!-- Error/status banner (only when something's wrong) -->
    {#if workflow.lastError}
      <div class="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
        <span class="font-medium">Last run failed:</span> {workflow.lastError}
      </div>
    {:else if workflow.lastSkipReason}
      <div class="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
        <span class="font-medium">Last run skipped:</span> {workflow.lastSkipReason}
      </div>
    {:else if !workflow.enabled}
      <div class="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2.5 text-sm text-gray-400">
        Workflow paused. Runs are preserved; the scheduler is idle.
      </div>
    {/if}

    <!-- Attention items (only if any exist) -->
    {#if overallAttention.length > 0}
      <div class="mb-5">
        <h2 class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-amber-400">Needs attention</h2>
        <div class="flex flex-wrap gap-2">
          {#each overallAttention as item (item.session.id)}
            <button
              onclick={() => openSession(item.session.id)}
              class={`rounded-lg border px-3 py-2 text-left text-xs transition hover:translate-y-[-1px] ${toneForAgentStatus(item.session.agent_status)}`}
            >
              <span class="font-medium">{item.session.role || item.session.title || "Agent"}</span>
              <span class="ml-1.5 opacity-70">{item.session.agent_status}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── PRIMARY: Latest Update ── -->
    {#if latestCard}
      <section class="mb-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-accent-400">Latest Update</h2>
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <span class={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${runStatusColor(latestCard.run.status)}`}>
              <span class={`h-1.5 w-1.5 rounded-full ${runStatusDot(latestCard.run.status)}`}></span>
              {latestCard.run.status}
            </span>
            <span>{formatDuration(latestCard.run.started_at, latestCard.run.completed_at)}</span>
            {#if latestCard.lastActivityAt}
              <span>&middot; <RelativeTime timestamp={latestCard.lastActivityAt} /></span>
            {/if}
          </div>
        </div>

        <!-- Latest deliverables - the star of the show -->
        {#if latestCard.deliverables.length > 0}
          <div class="space-y-3">
            {#each latestCard.deliverables as item (item.session.id)}
              <div class="group rounded-xl border border-gray-800 bg-gray-900/80 p-4 transition hover:border-gray-700">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                        {item.session.role || item.session.title || "Agent"}
                      </span>
                      <span class="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-400">
                        {item.deliverable.type}
                      </span>
                      <span class="text-[11px] text-gray-600">
                        <RelativeTime timestamp={item.deliveredAt} />
                      </span>
                    </div>
                    <div class="mt-2 text-sm font-medium leading-relaxed text-gray-100 wf-md wf-md-summary">
                      <Markdown content={item.deliverable.summary || item.summaryPreview} />
                    </div>
                    {#if item.deliverable.content}
                      <div class="mt-1.5 text-sm leading-relaxed text-gray-400 wf-md wf-md-content line-clamp-4">
                        <Markdown content={typeof item.deliverable.content === 'string' ? item.deliverable.content : item.contentPreview} />
                      </div>
                    {/if}
                  </div>
                  <button
                    onclick={() => openSession(item.session.id)}
                    class="shrink-0 rounded-lg border border-gray-700 px-2.5 py-1 text-[11px] font-medium text-gray-400 opacity-0 transition group-hover:opacity-100 hover:border-gray-600 hover:text-white"
                  >
                    Open
                  </button>
                </div>

                {#if item.deliverable.artifacts && item.deliverable.artifacts.length > 0}
                  <div class="mt-3 flex flex-wrap gap-1.5">
                    {#each item.deliverable.artifacts.slice(0, 4) as artifact}
                      <button
                        onclick={() => onOpenArtifact?.(artifact.path)}
                        class="inline-flex items-center gap-1 rounded-md border border-gray-800 bg-gray-950 px-2 py-0.5 font-mono text-[11px] text-gray-400 hover:border-gray-700 hover:text-gray-200"
                      >
                        {artifact.path}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else if latestCard.run.error}
          <div class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">
            {latestCard.run.error}
          </div>
        {:else}
          <div class="rounded-xl border border-dashed border-gray-800 bg-gray-900/40 px-4 py-6 text-center text-sm text-gray-500">
            No deliverables from this run yet.
          </div>
        {/if}

        <!-- Agent pulse for latest run -->
        {#if latestCard.agentSessions.length > 0}
          <div class="mt-3 flex flex-wrap gap-1.5">
            {#each latestCard.agentSessions as session (session.id)}
              <button
                onclick={() => openSession(session.id)}
                class={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition hover:translate-y-[-1px] ${toneForAgentStatus(session.agent_status)}`}
              >
                <span class="truncate max-w-[10rem]">{session.role || session.title || "Agent"}</span>
                <span class="opacity-60">{session.agent_status || "working"}</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- ── SECONDARY: Two-column layout ── -->
    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">

      <!-- Run History (left/main column) -->
      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Run History</h2>
          <span class="text-[11px] text-gray-600">{runs.length} total</span>
        </div>

        {#if loading}
          <div class="space-y-2">
            {#each Array(3) as _, index}
              <div class="animate-pulse rounded-lg border border-gray-800 bg-gray-900/50 p-3" data-skeleton={index}>
                <div class="h-3 w-32 rounded bg-gray-800"></div>
                <div class="mt-2 h-2.5 w-48 rounded bg-gray-800/60"></div>
              </div>
            {/each}
          </div>
        {:else if error}
          <div class="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">
            {error}
          </div>
        {:else if runCards.length === 0}
          <div class="rounded-lg border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
            No workflow runs yet. Trigger one manually or wait for the schedule.
          </div>
        {:else}
          <div class="space-y-1">
            {#each runCards as card, index (card.run.id)}
              {@const isLatest = index === 0}
              <div class="group rounded-lg border border-gray-800/60 bg-gray-900/40 transition hover:border-gray-700 hover:bg-gray-900/70">
                <!-- Run row - always visible -->
                <button
                  onclick={() => toggleRun(card.run.id)}
                  class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
                >
                  <!-- Status dot -->
                  <span class={`h-2 w-2 shrink-0 rounded-full ${runStatusDot(card.run.status)}`}></span>

                  <!-- Run info -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-gray-200">
                        Run {runs.length - index}
                      </span>
                      {#if isLatest}
                        <span class="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-400">latest</span>
                      {/if}
                      <span class="text-[11px] text-gray-500">
                        {card.run.trigger_source === "manual" ? "manual" : "scheduled"}
                      </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                      <span><RelativeTime timestamp={card.run.started_at} /></span>
                      <span class="text-gray-700">&middot;</span>
                      <span>{formatDuration(card.run.started_at, card.run.completed_at)}</span>
                      {#if card.deliveredAgents > 0}
                        <span class="text-gray-700">&middot;</span>
                        <span class="text-emerald-500">{card.deliveredAgents} delivered</span>
                      {/if}
                      {#if card.blockedAgents + card.failedAgents > 0}
                        <span class="text-gray-700">&middot;</span>
                        <span class="text-amber-400">{card.blockedAgents + card.failedAgents} attention</span>
                      {/if}
                    </div>
                  </div>

                  <!-- Quick stats -->
                  <div class="hidden shrink-0 items-center gap-3 sm:flex">
                    {#if card.agentSessions.length > 0}
                      <span class="text-[11px] text-gray-500">{card.agentSessions.length} agents</span>
                    {/if}
                    {#if card.artifacts.length > 0}
                      <span class="text-[11px] text-gray-500">{card.artifacts.length} files</span>
                    {/if}
                  </div>

                  <!-- Expand indicator -->
                  <span class="shrink-0 text-[11px] text-gray-600 transition group-hover:text-gray-400">
                    {expandedRuns.has(card.run.id) ? "▼" : "▶"}
                  </span>
                </button>

                <!-- Expanded detail -->
                {#if expandedRuns.has(card.run.id)}
                  <div class="border-t border-gray-800/60 px-3.5 py-3 space-y-3">
                    {#if card.run.error || card.run.skipped_reason}
                      <div class="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">
                        {card.run.error || card.run.skipped_reason}
                      </div>
                    {/if}

                    <!-- Deliverables -->
                    {#if card.deliverables.length > 0}
                      <div>
                        <div class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Deliverables</div>
                        <div class="space-y-2">
                          {#each card.deliverables as item (item.session.id)}
                            <button
                              onclick={() => openSession(item.session.id)}
                              class="w-full rounded-lg border border-gray-800 bg-gray-950/60 p-3 text-left transition hover:border-gray-700"
                            >
                              <div class="flex items-center gap-2">
                                <span class="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                                  {item.session.role || item.session.title || "Agent"}
                                </span>
                                <span class="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-400">
                                  {item.deliverable.type}
                                </span>
                              </div>
                              <div class="mt-1.5 text-sm text-gray-200 wf-md wf-md-summary">
                                <Markdown content={item.deliverable.summary || item.summaryPreview} />
                              </div>
                              {#if item.deliverable.content}
                                <div class="mt-1 text-xs text-gray-500 leading-relaxed wf-md wf-md-content line-clamp-3">
                                  <Markdown content={typeof item.deliverable.content === 'string' ? item.deliverable.content : item.contentPreview} />
                                </div>
                              {/if}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    <!-- Agents -->
                    {#if card.agentSessions.length > 0}
                      <div>
                        <div class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Agents</div>
                        <div class="flex flex-wrap gap-1.5">
                          {#each card.agentSessions as session (session.id)}
                            <button
                              onclick={() => openSession(session.id)}
                              class={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition hover:translate-y-[-1px] ${toneForAgentStatus(session.agent_status)}`}
                            >
                              <span class="max-w-[12rem] truncate">{session.role || session.title || "Agent"}</span>
                              <span class="opacity-60">{session.agent_status || "working"}</span>
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    <!-- Artifacts -->
                    {#if card.artifacts.length > 0}
                      <div>
                        <div class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Artifacts</div>
                        <div class="space-y-1">
                          {#each card.artifacts.slice(0, 5) as artifact (artifact.id)}
                            <button
                              onclick={() => onOpenArtifact?.(artifact.path)}
                              class="flex w-full items-center justify-between gap-2 rounded-md border border-gray-800 bg-gray-950/60 px-2.5 py-1.5 text-left transition hover:border-gray-700"
                            >
                              <span class="min-w-0 truncate font-mono text-[11px] text-gray-300">{artifact.path}</span>
                              <span class="shrink-0 text-[10px] text-gray-600"><RelativeTime timestamp={artifact.created_at} /></span>
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    <!-- Open run button -->
                    {#if card.run.session_id}
                      <div class="flex justify-end pt-1">
                        <button
                          onclick={() => openSession(card.run.session_id)}
                          class="rounded-lg border border-gray-700 px-3 py-1.5 text-[11px] font-medium text-gray-400 transition hover:border-gray-600 hover:text-white"
                        >
                          Open full run
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Right sidebar: Quick-glance panels -->
      <aside class="space-y-4">

        <!-- Recent deliverables (cross-run) -->
        <section class="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Recent Deliverables</h3>
            <span class="text-[10px] text-gray-600">{recentDeliverables.length}</span>
          </div>

          {#if recentDeliverables.length === 0}
            <p class="text-xs text-gray-600">Deliverables will appear here once runs complete.</p>
          {:else}
            <div class="space-y-2">
              {#each recentDeliverables as item (item.session.id)}
                <button
                  onclick={() => openSession(item.session.id)}
                  class="w-full rounded-lg border border-gray-800/60 bg-gray-950/40 px-3 py-2.5 text-left transition hover:border-gray-700 hover:bg-gray-950/70"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                      <span class="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-400">
                        {item.deliverable.type}
                      </span>
                      <span class="text-[10px] text-gray-500">
                        {item.session.role || item.session.title || "Agent"}
                      </span>
                    </div>
                    <span class="text-[10px] text-gray-600">
                      <RelativeTime timestamp={item.deliveredAt} />
                    </span>
                  </div>
                  <div class="mt-1.5 text-xs font-medium text-gray-200 leading-relaxed wf-md wf-md-summary">
                    <Markdown content={item.deliverable.summary || item.summaryPreview} />
                  </div>
                  {#if item.deliverable.content}
                    <div class="mt-1 text-[11px] text-gray-500 leading-relaxed wf-md wf-md-content line-clamp-2">
                      <Markdown content={typeof item.deliverable.content === 'string' ? item.deliverable.content : item.contentPreview} />
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </section>

        <!-- Artifact shelf -->
        {#if recentArtifacts.length > 0}
          <section class="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Artifact Shelf</h3>
              <span class="text-[10px] text-gray-600">{artifacts.length}</span>
            </div>
            <div class="space-y-1">
              {#each recentArtifacts.slice(0, 6) as artifact (artifact.id)}
                <button
                  onclick={() => onOpenArtifact?.(artifact.path)}
                  class="flex w-full items-center justify-between gap-2 rounded-md border border-gray-800/60 bg-gray-950/40 px-2.5 py-2 text-left transition hover:border-gray-700"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-mono text-[11px] text-gray-300">{artifact.path}</div>
                    {#if artifact.description}
                      <div class="mt-0.5 text-[10px] text-gray-500 truncate">{artifact.description}</div>
                    {/if}
                  </div>
                  <span class="shrink-0 text-[10px] text-gray-600"><RelativeTime timestamp={artifact.created_at} /></span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Mission brief (collapsed by default, expandable) -->
        <details class="group rounded-xl border border-gray-800 bg-gray-900/50">
          <summary class="flex cursor-pointer items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-400">
            Mission Brief
            <span class="text-gray-600 transition group-open:rotate-90">▶</span>
          </summary>
          <div class="border-t border-gray-800/60 px-4 py-3 space-y-3">
            <div class="rounded-lg bg-gray-950/60 p-3">
              <div class="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Prompt</div>
              <p class="text-xs leading-relaxed text-gray-300">{previewText(workflow.prompt, 420)}</p>
            </div>

            {#if workflow.learningNotes}
              <div class="rounded-lg bg-gray-950/60 p-3">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Learnings</div>
                <p class="text-xs leading-relaxed text-gray-300">{previewText(workflow.learningNotes, 260)}</p>
              </div>
            {/if}

            {#if workflow.feedbackNotes}
              <div class="rounded-lg bg-gray-950/60 p-3">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Feedback</div>
                <p class="text-xs leading-relaxed text-gray-300">{previewText(workflow.feedbackNotes, 260)}</p>
              </div>
            {/if}

            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-lg bg-gray-950/60 px-3 py-2">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Last run</div>
                <div class="mt-1 text-xs font-medium text-gray-300">
                  {#if workflow.lastRunAt}
                    <RelativeTime timestamp={workflow.lastRunAt} />
                  {:else}
                    Never
                  {/if}
                </div>
              </div>
              <div class="rounded-lg bg-gray-950/60 px-3 py-2">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Gate</div>
                <div class="mt-1 text-xs font-medium text-gray-300">
                  {#if workflow.gate.kind === "command"}
                    <span class="font-mono">{workflow.gate.command}</span>
                  {:else}
                    None
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </details>
      </aside>
    </div>
  </div>
</div>

<style>
  /* -- Markdown inside workflow cards (dark bg) -- */
  .wf-md :global(.markdown-content) {
    color: inherit;
  }

  .wf-md :global(.markdown-content p) {
    margin: 0.25rem 0;
  }

  .wf-md :global(.markdown-content p:first-child) {
    margin-top: 0;
  }

  .wf-md :global(.markdown-content p:last-child) {
    margin-bottom: 0;
  }

  /* Summary: keep it inline / compact */
  .wf-md-summary :global(.markdown-content) {
    display: inline;
  }

  .wf-md-summary :global(.markdown-content p) {
    display: inline;
    margin: 0;
  }

  .wf-md-summary :global(.markdown-content h1),
  .wf-md-summary :global(.markdown-content h2),
  .wf-md-summary :global(.markdown-content h3) {
    display: inline;
    font-size: inherit;
    margin: 0;
  }

  /* Content preview: compact rendering */
  .wf-md-content :global(.markdown-content h1) {
    font-size: 0.8125rem;
    font-weight: 600;
    margin: 0.375rem 0 0.125rem;
    color: rgb(209 213 219); /* gray-300 */
  }

  .wf-md-content :global(.markdown-content h2) {
    font-size: 0.75rem;
    font-weight: 600;
    margin: 0.375rem 0 0.125rem;
    color: rgb(209 213 219);
  }

  .wf-md-content :global(.markdown-content h3) {
    font-size: 0.75rem;
    font-weight: 500;
    margin: 0.25rem 0 0.125rem;
    color: rgb(209 213 219);
  }

  .wf-md-content :global(.markdown-content ul),
  .wf-md-content :global(.markdown-content ol) {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
  }

  .wf-md-content :global(.markdown-content li) {
    margin: 0.0625rem 0;
  }

  .wf-md-content :global(.markdown-content code) {
    font-size: 0.6875rem;
    padding: 0.0625rem 0.25rem;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
    color: rgb(209 213 219);
  }

  .wf-md-content :global(.markdown-content pre) {
    font-size: 0.6875rem;
    padding: 0.375rem;
    margin: 0.25rem 0;
    border-radius: 0.375rem;
    background: rgba(255, 255, 255, 0.05);
  }

  .wf-md-content :global(.markdown-content pre code) {
    background: transparent;
    padding: 0;
  }

  .wf-md-content :global(.markdown-content blockquote) {
    margin: 0.25rem 0;
    padding-left: 0.625rem;
    border-left: 2px solid rgba(255, 255, 255, 0.15);
    color: rgb(156 163 175); /* gray-400 */
  }

  .wf-md-content :global(.markdown-content a) {
    color: var(--accent-400, rgb(96 165 250));
    text-decoration: underline;
  }

  .wf-md-content :global(.markdown-content strong) {
    color: rgb(229 231 235); /* gray-200 */
    font-weight: 600;
  }

  .wf-md-content :global(.markdown-content table) {
    font-size: 0.6875rem;
  }

  .wf-md-content :global(.markdown-content th),
  .wf-md-content :global(.markdown-content td) {
    padding: 0.25rem 0.5rem;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .wf-md-content :global(.markdown-content th) {
    background: rgba(255, 255, 255, 0.05);
  }

  /* Bold in summaries */
  .wf-md-summary :global(.markdown-content strong) {
    font-weight: 600;
  }

  .wf-md-summary :global(.markdown-content code) {
    font-size: inherit;
    padding: 0.0625rem 0.25rem;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
  }
</style>
