<script lang="ts">
  import type { Project, Session } from "../api";
  import { api } from "../api";
  import RelativeTime from "../components/RelativeTime.svelte";
  import { attentionItems, projectStatus, sessionStatus } from "../stores";

  interface Props {
    projects: Project[];
    recentChats: Session[];
    onSelectProject: (project: Project) => void;
    onSelectSession: (session: Session) => void;
    onNewProject: () => void;
  }

  let { projects, recentChats, onSelectProject, onSelectSession, onNewProject }: Props = $props();

  const COLLAPSED_LIMIT = 3;

  let expandedCells = $state(new Set<string>());
  let collapsedRows = $state(new Set<string>());
  let newTaskModal = $state<{ projectId: string; projectName: string } | null>(null);
  let newTaskTitle = $state("");

  function toggleCellExpand(key: string) {
    const next = new Set(expandedCells);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedCells = next;
  }

  function toggleRow(projectId: string) {
    const next = new Set(collapsedRows);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    collapsedRows = next;
  }

  function openNewTask(project: Project) {
    newTaskModal = { projectId: project.id, projectName: project.name };
    newTaskTitle = "";
  }

  async function createTask() {
    if (!newTaskModal || !newTaskTitle.trim()) return;
    try {
      const session = await api.sessions.create(newTaskModal.projectId, { title: newTaskTitle.trim() });
      if (session) {
        await api.sessions.setBacklog(session.id, true, newTaskTitle.trim());
      }
    } catch (e) {
      console.error("Failed to create task:", e);
    }
    newTaskModal = null;
    newTaskTitle = "";
  }

  function getProjectActivity(project: Project): number {
    return project.last_activity ?? project.updated_at ?? project.created_at ?? 0;
  }

  function shortPath(path?: string): string {
    return path?.replace(/^\/Users\/[^/]+\//, "~/") ?? "";
  }

  type LaneId = "backlog" | "running" | "needs_input" | "done" | "idle";

  function getSessionLane(session: Session): LaneId {
    if (session.in_backlog) return "backlog";
    const liveStatus = $sessionStatus.get(session.id)?.status;
    if (liveStatus === "running") return "running";
    if (liveStatus === "permission" || liveStatus === "awaiting_input") return "needs_input";
    if (liveStatus === "unread" || session.marked_for_review) return "done";
    return "idle";
  }

  interface Lane {
    id: LaneId;
    label: string;
    dot: string;
    bg: string;
    text: string;
    border: string;
    animate: boolean;
  }

  const lanes: Lane[] = [
    { id: "backlog", label: "Backlog", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-500/8", text: "text-violet-600 dark:text-violet-400", border: "border-violet-200/60 dark:border-violet-500/20", animate: false },
    { id: "running", label: "Running", dot: "bg-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-500/8", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-200/60 dark:border-cyan-500/20", animate: true },
    { id: "needs_input", label: "Needs Input", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-500/8", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200/60 dark:border-amber-500/20", animate: false },
    { id: "done", label: "Done", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/8", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200/60 dark:border-emerald-500/20", animate: false },
    { id: "idle", label: "Idle", dot: "bg-slate-400 dark:bg-slate-500", bg: "bg-slate-50 dark:bg-slate-800/50", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200/60 dark:border-slate-600/30", animate: false },
  ];

  interface ProjectRow {
    project: Project;
    cells: Map<LaneId, Session[]>;
    totalSessions: number;
    latestTimestamp: number;
  }

  const projectRows = $derived.by(() => {
    const chatsByProject = new Map<string, Session[]>();
    for (const chat of recentChats) {
      if (chat.archived) continue;
      const list = chatsByProject.get(chat.project_id) ?? [];
      list.push(chat);
      chatsByProject.set(chat.project_id, list);
    }

    return [...projects]
      .sort((a, b) => getProjectActivity(b) - getProjectActivity(a))
      .map((project): ProjectRow => {
        const allSessions = chatsByProject.get(project.id) ?? [];
        const cells = new Map<LaneId, Session[]>();
        for (const lane of lanes) cells.set(lane.id, []);
        for (const s of allSessions) cells.get(getSessionLane(s))!.push(s);
        for (const [, list] of cells) list.sort((a, b) => b.updated_at - a.updated_at);

        return {
          project,
          cells,
          totalSessions: allSessions.length,
          latestTimestamp: getProjectActivity(project),
        };
      })
      .filter((row) => {
        const status = $projectStatus.get(row.project.id);
        return row.totalSessions > 0 || !!status?.runningCount || !!status?.attentionCount;
      });
  });

  const laneTotals = $derived.by(() => {
    const totals = new Map<LaneId, number>();
    for (const lane of lanes) totals.set(lane.id, 0);
    for (const row of projectRows) {
      for (const [laneId, sessions] of row.cells) {
        totals.set(laneId, (totals.get(laneId) ?? 0) + sessions.length);
      }
    }
    return totals;
  });

  const totalNeedsAttention = $derived(
    $attentionItems.totalNeedsApproval + $attentionItems.totalNeedsInput + $attentionItems.totalNeedsReview
  );

</script>

<div class="flex-1 overflow-hidden bg-white dark:bg-slate-950">
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-slate-200/80 px-5 py-3 dark:border-white/8">
      <div class="flex items-center gap-3">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-600 text-white">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </div>
        <div class="text-sm font-semibold text-slate-900 dark:text-white">Workspaces</div>
        <span class="text-xs text-slate-400 dark:text-slate-500">{projects.length}</span>

        {#if $attentionItems.totalRunning > 0}
          <div class="ml-2 flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500"></span>
            {$attentionItems.totalRunning} running
          </div>
        {/if}
        {#if totalNeedsAttention > 0}
          <div class="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            {totalNeedsAttention} blocked
          </div>
        {/if}
      </div>

      <button
        onclick={onNewProject}
        class="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent-700 dark:bg-accent-500 dark:hover:bg-accent-400"
      >
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New Workspace
      </button>
    </div>

    {#if projectRows.length > 0}
      <div class="flex-1 overflow-auto">
        <div style="min-width: 1000px;">
          <div class="sticky top-0 z-20 grid border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-sm dark:border-white/8 dark:bg-slate-900/95" style="grid-template-columns: 240px repeat(5, minmax(0, 1fr));">
            <div class="px-4 py-2.5">
              <span class="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Project</span>
            </div>
            {#each lanes as lane}
              {@const total = laneTotals.get(lane.id) ?? 0}
              <div class="flex items-center gap-2 px-3 py-2.5">
                <span class={`h-2 w-2 rounded-full ${lane.dot} ${lane.animate ? "animate-pulse" : ""}`}></span>
                <span class="text-[10px] font-semibold uppercase tracking-wider {lane.text}">{lane.label}</span>
                {#if total > 0}
                  <span class="ml-auto rounded bg-slate-200/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/8 dark:text-slate-400">{total}</span>
                {/if}
              </div>
            {/each}
          </div>

          {#each projectRows as row}
            {@const isCollapsed = collapsedRows.has(row.project.id)}

            <div class="grid border-b border-slate-100 dark:border-white/5" style="grid-template-columns: 240px repeat(5, minmax(0, 1fr));">
              <div class="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-3 dark:border-white/5 dark:bg-slate-950">
                <div class="flex items-start gap-2">
                  <button
                    onclick={() => toggleRow(row.project.id)}
                    class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title={isCollapsed ? "Expand" : "Collapse"}
                  >
                    <svg class="h-3 w-3 transition-transform {isCollapsed ? '-rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  <div class="min-w-0 flex-1">
                    <button
                      onclick={() => onSelectProject(row.project)}
                      class="block w-full text-left transition-opacity hover:opacity-70"
                    >
                      <div class="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{row.project.name}</div>
                      <div class="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500" title={row.project.path}>{shortPath(row.project.path)}</div>
                    </button>

                    {#if !isCollapsed}
                      <div class="mt-2 flex items-center gap-1.5">
                        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/8 dark:text-slate-400">
                          {row.totalSessions} chat{row.totalSessions === 1 ? "" : "s"}
                        </span>
                        <span class="text-[10px] text-slate-300 dark:text-slate-600">
                          <RelativeTime timestamp={row.latestTimestamp} />
                        </span>
                      </div>
                    {/if}
                  </div>

                  <button
                    onclick={() => openNewTask(row.project)}
                    class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:bg-accent-50 hover:text-accent-600 dark:text-slate-600 dark:hover:bg-accent-500/10 dark:hover:text-accent-400"
                    title="Add task to backlog"
                  >
                    <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              {#each lanes as lane}
                {@const sessions = row.cells.get(lane.id) ?? []}
                {@const cellKey = `${row.project.id}:${lane.id}`}
                {@const isExpanded = expandedCells.has(cellKey)}
                {@const visible = isCollapsed ? [] : (isExpanded ? sessions : sessions.slice(0, COLLAPSED_LIMIT))}
                {@const hasMore = sessions.length > COLLAPSED_LIMIT && !isCollapsed}

                <div class="border-r border-slate-100/60 px-2 py-2 last:border-r-0 dark:border-white/[0.03]">
                  {#if isCollapsed}
                    <div class="flex h-full items-center justify-center">
                      {#if sessions.length > 0}
                        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium {lane.text} dark:bg-white/6">{sessions.length}</span>
                      {:else}
                        <span class="text-[10px] text-slate-200 dark:text-slate-700">-</span>
                      {/if}
                    </div>
                  {:else if sessions.length > 0}
                    <div class="space-y-0.5">
                      {#each visible as session}
                        <button
                          onclick={() => onSelectSession(session)}
                          class="group/s flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                          <span class={`h-1.5 w-1.5 shrink-0 rounded-full ${lane.dot} ${lane.animate ? "animate-pulse" : ""}`}></span>
                          <span class="min-w-0 flex-1 truncate text-[12px] text-slate-700 group-hover/s:text-slate-900 dark:text-slate-300 dark:group-hover/s:text-white">{session.title}</span>
                          <span class="shrink-0 text-[10px] text-slate-300 dark:text-slate-600">
                            <RelativeTime timestamp={session.updated_at} />
                          </span>
                        </button>
                      {/each}

                      {#if hasMore}
                        <button
                          onclick={() => toggleCellExpand(cellKey)}
                          class="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                        >
                          <svg class="h-3 w-3 {isExpanded ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                          {isExpanded ? "less" : `${sessions.length - COLLAPSED_LIMIT} more`}
                        </button>
                      {/if}
                    </div>
                  {:else}
                    <div class="flex h-full items-center justify-center py-2">
                      <span class="text-[10px] text-slate-200 dark:text-slate-700">-</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 dark:bg-accent-500/10">
          <svg class="h-6 w-6 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </div>
        <h3 class="mt-4 text-sm font-semibold text-slate-900 dark:text-white">No workspaces yet</h3>
        <p class="mt-1.5 max-w-xs text-xs text-slate-500 dark:text-slate-400">Create a workspace to start working with Claude on a project.</p>
        <button
          onclick={onNewProject}
          class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-accent-700 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Workspace
        </button>
      </div>
    {/if}
  </div>
</div>

{#if newTaskModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    onclick={() => newTaskModal = null}
  >
    <div
      class="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900"
      onclick={(e) => e.stopPropagation()}
    >
      <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
        New task in {newTaskModal.projectName}
      </h3>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Creates a session in the backlog. Run it when you're ready.
      </p>

      <input
        type="text"
        bind:value={newTaskTitle}
        placeholder="What needs to be done?"
        class="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:border-accent-500"
        onkeydown={(e) => { if (e.key === "Enter") createTask(); }}
      />

      <div class="mt-4 flex justify-end gap-2">
        <button
          onclick={() => newTaskModal = null}
          class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/8"
        >
          Cancel
        </button>
        <button
          onclick={createTask}
          disabled={!newTaskTitle.trim()}
          class="rounded-lg bg-accent-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Add to Backlog
        </button>
      </div>
    </div>
  </div>
{/if}
