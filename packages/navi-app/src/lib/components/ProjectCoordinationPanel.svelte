<script lang="ts">
  import { showError, showSuccess } from "../errorHandler";
  import {
    api,
    agentsApi,
    type Agent,
    type InboxItem,
    type InboxItemKind,
    type InboxItemPriority,
    type InboxItemStatus,
    type Session,
    type WorkItem,
    type WorkItemEvent,
    type WorkItemPriority,
    type WorkItemStatus,
    type Workflow,
  } from "../api";
  import AgentEditor from "./AgentEditor.svelte";
  import Modal from "./Modal.svelte";
  import RelativeTime from "./RelativeTime.svelte";

  interface Props {
    projectId: string;
    sessions: Session[];
    workflows: Workflow[];
    onOpenSession?: (sessionId: string) => void;
  }

  const PROJECT_AGENTS_UPDATED_EVENT = "navi:project-agents-updated";

  let { projectId, sessions, workflows, onOpenSession }: Props = $props();

  let loading = $state(true);
  let workItems = $state<WorkItem[]>([]);
  let inboxItems = $state<InboxItem[]>([]);
  let agents = $state<Agent[]>([]);

  let workItemModalOpen = $state(false);
  let editingWorkItem = $state<WorkItem | null>(null);
  let workItemEvents = $state<WorkItemEvent[]>([]);
  let loadingWorkItemEvents = $state(false);
  let workItemNote = $state("");
  let workItemTitle = $state("");
  let workItemDescription = $state("");
  let workItemStatus = $state<WorkItemStatus>("todo");
  let workItemPriority = $state<WorkItemPriority>("medium");
  let workItemAssigneeId = $state("");
  let workItemAcceptanceCriteria = $state("");

  let inboxModalOpen = $state(false);
  let editingInboxItem = $state<InboxItem | null>(null);
  let inboxKind = $state<InboxItemKind>("report");
  let inboxTitle = $state("");
  let inboxBody = $state("");
  let inboxPriority = $state<InboxItemPriority>("medium");
  let inboxStatus = $state<InboxItemStatus>("open");
  let inboxRequiresResponse = $state(false);
  let inboxLinkedWorkItemId = $state("");

  let agentEditorOpen = $state(false);
  let editingAgent = $state<Agent | null>(null);

  const workItemStatusLabels: Record<WorkItemStatus, string> = {
    todo: "Todo",
    triaged: "Triaged",
    in_progress: "In progress",
    blocked: "Blocked",
    waiting_human: "Waiting human",
    in_review: "In review",
    done: "Done",
    cancelled: "Cancelled",
  };

  const workItemStatusClasses: Record<WorkItemStatus, string> = {
    todo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    triaged: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    in_progress: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    blocked: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    waiting_human: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    in_review: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  };

  const priorityClasses: Record<WorkItemPriority | InboxItemPriority, string> = {
    low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    urgent: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };

  const inboxKindClasses: Record<InboxItemKind, string> = {
    report: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    question: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    attention: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    approval: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    delivery: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  };

  const inboxStatusClasses: Record<InboxItemStatus, string> = {
    open: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    acknowledged: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    dismissed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  async function loadAll(activeProjectId: string) {
    loading = true;
    try {
      const [nextWorkItems, nextInboxItems, nextAgents] = await Promise.all([
        api.workItems.list(activeProjectId),
        api.inbox.list(activeProjectId),
        agentsApi.listForProject(activeProjectId),
      ]);

      if (activeProjectId !== projectId) return;
      workItems = nextWorkItems;
      inboxItems = nextInboxItems;
      agents = nextAgents;
    } catch (error) {
      console.error("Failed to load project coordination state:", error);
      showError({
        title: "Failed to load coordination",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (activeProjectId === projectId) {
        loading = false;
      }
    }
  }

  function broadcastAgentsUpdated() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(PROJECT_AGENTS_UPDATED_EVENT, {
        detail: { projectId },
      })
    );
  }

  function upsertWorkItem(item: WorkItem) {
    const existingIndex = workItems.findIndex((candidate) => candidate.id === item.id);
    if (existingIndex >= 0) {
      workItems = workItems.map((candidate) => (candidate.id === item.id ? item : candidate));
      return;
    }
    workItems = [item, ...workItems];
  }

  function upsertInboxItem(item: InboxItem) {
    const existingIndex = inboxItems.findIndex((candidate) => candidate.id === item.id);
    if (existingIndex >= 0) {
      inboxItems = inboxItems.map((candidate) => (candidate.id === item.id ? item : candidate));
      return;
    }
    inboxItems = [item, ...inboxItems];
  }

  function upsertAgent(agent: Agent) {
    const existingIndex = agents.findIndex((candidate) => candidate.id === agent.id);
    if (existingIndex >= 0) {
      agents = agents.map((candidate) => (candidate.id === agent.id ? agent : candidate));
      return;
    }
    agents = [agent, ...agents];
  }

  function resetWorkItemForm(item: WorkItem | null = null) {
    editingWorkItem = item;
    workItemTitle = item?.title ?? "";
    workItemDescription = item?.description ?? "";
    workItemStatus = item?.status ?? "todo";
    workItemPriority = item?.priority ?? "medium";
    workItemAssigneeId = item?.assignee_agent_id ?? "";
    workItemAcceptanceCriteria = item?.acceptance_criteria ?? "";
    workItemEvents = [];
    workItemNote = "";
  }

  function resetInboxForm(item: InboxItem | null = null) {
    editingInboxItem = item;
    inboxKind = item?.kind ?? "report";
    inboxTitle = item?.title ?? "";
    inboxBody = item?.body ?? "";
    inboxPriority = item?.priority ?? "medium";
    inboxStatus = item?.status ?? "open";
    inboxRequiresResponse = Boolean(item?.requires_response);
    inboxLinkedWorkItemId = item?.work_item_id ?? "";
  }

  async function openWorkItemEditor(item: WorkItem | null = null) {
    resetWorkItemForm(item);
    workItemModalOpen = true;
    if (!item) return;

    loadingWorkItemEvents = true;
    try {
      workItemEvents = await api.workItems.listEvents(item.id);
    } catch (error) {
      console.error("Failed to load work item trace:", error);
      workItemEvents = [];
    } finally {
      loadingWorkItemEvents = false;
    }
  }

  function openInboxEditor(item: InboxItem | null = null) {
    resetInboxForm(item);
    inboxModalOpen = true;
  }

  async function saveWorkItem() {
    if (!workItemTitle.trim()) {
      showError({ title: "Ticket title required", message: "Give the ticket a short title first." });
      return;
    }

    try {
      const payload = {
        title: workItemTitle.trim(),
        description: workItemDescription.trim() || null,
        status: workItemStatus,
        priority: workItemPriority,
        assigneeAgentId: workItemAssigneeId || null,
        acceptanceCriteria: workItemAcceptanceCriteria.trim() || null,
      };

      const saved = editingWorkItem
        ? await api.workItems.update(editingWorkItem.id, payload)
        : await api.workItems.create(projectId, payload);

      upsertWorkItem(saved);
      workItemModalOpen = false;
      showSuccess(editingWorkItem ? "Ticket updated" : "Ticket created");
    } catch (error) {
      console.error("Failed to save work item:", error);
      showError({
        title: "Failed to save ticket",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function deleteWorkItem() {
    if (!editingWorkItem) return;
    const currentItem = editingWorkItem;
    if (!confirm(`Delete "${currentItem.title}"?`)) return;

    try {
      await api.workItems.delete(currentItem.id);
      workItems = workItems.filter((item) => item.id !== currentItem.id);
      workItemModalOpen = false;
      showSuccess("Ticket deleted");
    } catch (error) {
      console.error("Failed to delete work item:", error);
      showError({
        title: "Failed to delete ticket",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function addWorkItemNote() {
    if (!editingWorkItem || !workItemNote.trim()) return;

    try {
      const event = await api.workItems.createEvent(editingWorkItem.id, {
        eventType: "comment",
        actorType: "user",
        content: workItemNote.trim(),
      });
      workItemEvents = [event, ...workItemEvents];
      workItemNote = "";
      showSuccess("Trace note added");
    } catch (error) {
      console.error("Failed to append trace note:", error);
      showError({
        title: "Failed to add trace note",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function openOrCreateSessionForWorkItem(item: WorkItem) {
    try {
      if (item.primary_session_id) {
        onOpenSession?.(item.primary_session_id);
        return;
      }

      const session = await api.sessions.create(projectId, {
        title: item.title,
        agentId: item.assignee_agent_id,
        workItemId: item.id,
      });

      const updated: WorkItem = { ...item, primary_session_id: session.id, updated_at: Date.now() };
      upsertWorkItem(updated);
      onOpenSession?.(session.id);
      showSuccess("Thread started");
    } catch (error) {
      console.error("Failed to open work item thread:", error);
      showError({
        title: "Failed to open thread",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function saveInboxItem() {
    if (!inboxTitle.trim()) {
      showError({ title: "Inbox title required", message: "Give the inbox item a short title first." });
      return;
    }

    try {
      const payload = {
        kind: inboxKind,
        title: inboxTitle.trim(),
        body: inboxBody.trim() || null,
        priority: inboxPriority,
        status: inboxStatus,
        requiresResponse: inboxRequiresResponse,
        workItemId: inboxLinkedWorkItemId || null,
      };

      const saved = editingInboxItem
        ? await api.inbox.update(editingInboxItem.id, payload)
        : await api.inbox.create(projectId, payload);

      upsertInboxItem(saved);
      inboxModalOpen = false;
      showSuccess(editingInboxItem ? "Inbox item updated" : "Inbox item created");
    } catch (error) {
      console.error("Failed to save inbox item:", error);
      showError({
        title: "Failed to save inbox item",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function updateInboxStatus(item: InboxItem, status: InboxItemStatus) {
    try {
      const updated = await api.inbox.update(item.id, { status });
      upsertInboxItem(updated);
    } catch (error) {
      console.error("Failed to update inbox item:", error);
      showError({
        title: "Failed to update inbox item",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function deleteInboxItem() {
    if (!editingInboxItem) return;
    const currentItem = editingInboxItem;
    if (!confirm(`Delete "${currentItem.title}"?`)) return;

    try {
      await api.inbox.delete(currentItem.id);
      inboxItems = inboxItems.filter((item) => item.id !== currentItem.id);
      inboxModalOpen = false;
      showSuccess("Inbox item deleted");
    } catch (error) {
      console.error("Failed to delete inbox item:", error);
      showError({
        title: "Failed to delete inbox item",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function openCreateAgent() {
    editingAgent = null;
    agentEditorOpen = true;
  }

  function openEditAgent(agent: Agent) {
    editingAgent = agent;
    agentEditorOpen = true;
  }

  async function deleteAgent(agent: Agent) {
    if (!confirm(`Delete agent "${agent.name}"?`)) return;

    try {
      await agentsApi.delete(agent.id);
      agents = agents.filter((candidate) => candidate.id !== agent.id);
      broadcastAgentsUpdated();
      showSuccess("Agent deleted");
    } catch (error) {
      console.error("Failed to delete agent:", error);
      showError({
        title: "Failed to delete agent",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const agentNameById = $derived.by(() => {
    const map = new Map<string, string>();
    for (const agent of agents) {
      map.set(agent.id, agent.name);
    }
    return map;
  });

  const sessionTitleById = $derived.by(() => {
    const map = new Map<string, string>();
    for (const session of sessions) {
      map.set(session.id, session.title || "Untitled");
    }
    return map;
  });

  const openWorkItems = $derived.by(() =>
    workItems.filter((item) => item.status !== "done" && item.status !== "cancelled")
  );

  const recentlyClosedWorkItems = $derived.by(() =>
    workItems
      .filter((item) => item.status === "done" || item.status === "cancelled")
      .slice(0, 4)
  );

  const activeInboxItems = $derived.by(() =>
    inboxItems.filter((item) => item.status === "open" || item.status === "acknowledged")
  );

  const workflowCountByAgent = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const workflow of workflows) {
      if (!workflow.ownerAgentId) continue;
      counts.set(workflow.ownerAgentId, (counts.get(workflow.ownerAgentId) ?? 0) + 1);
    }
    return counts;
  });

  const taskCountByAgent = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const item of openWorkItems) {
      if (!item.assignee_agent_id) continue;
      counts.set(item.assignee_agent_id, (counts.get(item.assignee_agent_id) ?? 0) + 1);
    }
    return counts;
  });

  const workflowsByAgent = $derived.by(() => {
    const map = new Map<string, Workflow[]>();
    for (const workflow of workflows) {
      const key = workflow.ownerAgentId ?? "__workspace__";
      const existing = map.get(key) ?? [];
      existing.push(workflow);
      map.set(key, existing);
    }
    return map;
  });

  const agentCards = $derived.by(() =>
    agents.map((agent) => ({
      agent,
      workflowCount: workflowCountByAgent.get(agent.id) ?? 0,
      taskCount: taskCountByAgent.get(agent.id) ?? 0,
      workflows: workflowsByAgent.get(agent.id) ?? [],
    }))
  );

  const coordinationStats = $derived.by(() => {
    const blockedCount = openWorkItems.filter((item) => item.status === "blocked").length;
    const waitingHumanCount = openWorkItems.filter((item) => item.status === "waiting_human").length;
    const openInboxCount = activeInboxItems.length;
    return [
      { label: "Open tickets", value: openWorkItems.length, tone: "text-slate-900 dark:text-white" },
      { label: "Need human", value: waitingHumanCount + openInboxCount, tone: "text-amber-700 dark:text-amber-300" },
      { label: "Blocked", value: blockedCount, tone: "text-rose-700 dark:text-rose-300" },
      { label: "Agents", value: agents.length, tone: "text-indigo-700 dark:text-indigo-300" },
    ];
  });

  $effect(() => {
    if (!projectId) return;
    void loadAll(projectId);
  });
</script>

<div class="px-4 pb-6 md:px-6">
  <div class="rounded-[28px] border border-slate-200/80 bg-white/85 p-4 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.6)] backdrop-blur md:p-5 dark:border-white/10 dark:bg-slate-900/75">
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-indigo-500/20 text-sky-600 dark:text-sky-300">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01" />
            </svg>
          </span>
          <h2 class="text-base font-semibold text-slate-900 dark:text-white">Coordination</h2>
        </div>
        <p class="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Tickets hold durable work, inbox items collect attention, and agents own workflows. Sessions still stay available for ad hoc execution.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          onclick={() => openWorkItemEditor()}
          class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-sky-500/50 dark:hover:text-sky-300"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New ticket
        </button>
        <button
          onclick={() => openInboxEditor()}
          class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-amber-300 hover:text-amber-700 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-amber-500/50 dark:hover:text-amber-300"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Log inbox item
        </button>
        <button
          onclick={openCreateAgent}
          class="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          New agent
        </button>
      </div>
    </div>

    {#if loading}
      <div class="flex h-48 items-center justify-center">
        <div class="text-sm text-slate-400 dark:text-slate-500">Loading coordination...</div>
      </div>
    {:else}
      <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {#each coordinationStats as stat}
          <div class="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div class="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{stat.label}</div>
            <div class={`mt-2 text-2xl font-semibold ${stat.tone}`}>{stat.value}</div>
          </div>
        {/each}
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[1.65fr_minmax(0,1fr)]">
        <section class="rounded-3xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white">Tickets</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">Assign durable work, link a primary thread, and keep a trace.</p>
            </div>
            <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
              {openWorkItems.length} open
            </span>
          </div>

          <div class="mt-4 space-y-3">
            {#if openWorkItems.length === 0}
              <div class="rounded-2xl border border-dashed border-slate-300/80 bg-white/70 px-4 py-8 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-slate-950/20 dark:text-slate-500">
                No open tickets yet.
              </div>
            {:else}
              {#each openWorkItems.slice(0, 6) as item}
                <div class="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-950/30">
                  <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${workItemStatusClasses[item.status]}`}>
                          {workItemStatusLabels[item.status]}
                        </span>
                        <span class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${priorityClasses[item.priority]}`}>
                          {item.priority}
                        </span>
                        <span class="text-[11px] text-slate-400 dark:text-slate-500">
                          Updated <RelativeTime timestamp={item.updated_at} />
                        </span>
                      </div>
                      <button
                        onclick={() => openWorkItemEditor(item)}
                        class="mt-2 text-left text-sm font-semibold text-slate-900 transition-colors hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
                      >
                        {item.title}
                      </button>
                      {#if item.description}
                        <p class="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                      {/if}
                    </div>

                    <div class="flex flex-wrap items-center gap-2 lg:justify-end">
                      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        {item.assignee_agent_id ? `@${agentNameById.get(item.assignee_agent_id) ?? "unknown"}` : "Unassigned"}
                      </span>
                      {#if item.primary_session_id}
                        <button
                          onclick={() => onOpenSession?.(item.primary_session_id!)}
                          class="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
                        >
                          Open thread
                        </button>
                      {:else}
                        <button
                          onclick={() => openOrCreateSessionForWorkItem(item)}
                          class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                        >
                          Start thread
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          {#if recentlyClosedWorkItems.length > 0}
            <div class="mt-4 border-t border-slate-200/80 pt-4 dark:border-white/10">
              <div class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Recently closed</div>
              <div class="space-y-2">
                {#each recentlyClosedWorkItems as item}
                  <button
                    onclick={() => openWorkItemEditor(item)}
                    class="flex w-full items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:text-slate-900 dark:bg-slate-950/20 dark:text-slate-300 dark:hover:text-white"
                  >
                    <span class="truncate">{item.title}</span>
                    <span class={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${workItemStatusClasses[item.status]}`}>
                      {workItemStatusLabels[item.status]}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </section>

        <section class="rounded-3xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white">Inbox</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">Reports, approvals, questions, and anything that needs attention.</p>
            </div>
            <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
              {activeInboxItems.length} active
            </span>
          </div>

          <div class="mt-4 space-y-3">
            {#if activeInboxItems.length === 0}
              <div class="rounded-2xl border border-dashed border-slate-300/80 bg-white/70 px-4 py-8 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-slate-950/20 dark:text-slate-500">
                No open inbox items.
              </div>
            {:else}
              {#each activeInboxItems.slice(0, 6) as item}
                <div class="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-950/30">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${inboxKindClasses[item.kind]}`}>
                          {item.kind}
                        </span>
                        <span class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${inboxStatusClasses[item.status]}`}>
                          {item.status}
                        </span>
                        <span class={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${priorityClasses[item.priority]}`}>
                          {item.priority}
                        </span>
                      </div>
                      <button
                        onclick={() => openInboxEditor(item)}
                        class="mt-2 text-left text-sm font-semibold text-slate-900 transition-colors hover:text-amber-700 dark:text-white dark:hover:text-amber-300"
                      >
                        {item.title}
                      </button>
                      {#if item.body}
                        <p class="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.body}</p>
                      {/if}
                      <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                        <span>Created <RelativeTime timestamp={item.created_at} /></span>
                        {#if item.work_item_id}
                          <span class="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">
                            linked to {workItems.find((workItem) => workItem.id === item.work_item_id)?.title ?? "ticket"}
                          </span>
                        {/if}
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2">
                      {#if item.status === "open"}
                        <button
                          onclick={() => updateInboxStatus(item, "acknowledged")}
                          class="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
                        >
                          Acknowledge
                        </button>
                      {/if}
                      <button
                        onclick={() => updateInboxStatus(item, "resolved")}
                        class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </section>
      </div>

      <section class="mt-4 rounded-3xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white">Agents</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Each agent can own workflows and receive assigned tickets inside this workspace.</p>
          </div>
          <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            {agents.length} agent{agents.length === 1 ? "" : "s"}
          </span>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div class="rounded-2xl border border-dashed border-slate-300/80 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-950/20">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-900 dark:text-white">Workspace pool</div>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Unassigned work and workflows live here until an agent owns them.</p>
              </div>
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {(workflowsByAgent.get("__workspace__") ?? []).length} workflows
              </span>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {openWorkItems.filter((item) => !item.assignee_agent_id).length} open tickets
              </span>
              {#each (workflowsByAgent.get("__workspace__") ?? []).slice(0, 3) as workflow}
                <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                  {workflow.name}
                </span>
              {/each}
            </div>
          </div>

          {#each agentCards as card}
            <div class="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/30">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h4 class="truncate text-sm font-semibold text-slate-900 dark:text-white">{card.agent.name}</h4>
                    <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {card.agent.scope}
                    </span>
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {card.agent.format === "bundle" ? "bundle" : "single file"}
                    </span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{card.agent.description}</p>
                </div>

                <div class="flex items-center gap-1">
                  <button
                    onclick={() => openEditAgent(card.agent)}
                    class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    onclick={() => deleteAgent(card.agent)}
                    class="rounded-full border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {card.taskCount} ticket{card.taskCount === 1 ? "" : "s"}
                </span>
                <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {card.workflowCount} workflow{card.workflowCount === 1 ? "" : "s"}
                </span>
                {#if card.agent.model}
                  <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {card.agent.model}
                  </span>
                {/if}
              </div>

              {#if card.workflows.length > 0}
                <div class="mt-3 flex flex-wrap gap-2">
                  {#each card.workflows.slice(0, 4) as workflow}
                    <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {workflow.name}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</div>

<Modal open={workItemModalOpen} onClose={() => (workItemModalOpen = false)} title={editingWorkItem ? "Edit Ticket" : "New Ticket"} size="xl">
  {#snippet children()}
    <div class="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Title</label>
            <input
              bind:value={workItemTitle}
              placeholder="What should get done?"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-sky-500"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Status</label>
            <select
              bind:value={workItemStatus}
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-sky-500"
            >
              {#each Object.entries(workItemStatusLabels) as [value, label]}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Priority</label>
            <select
              bind:value={workItemPriority}
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-sky-500"
            >
              {#each ["low", "medium", "high", "urgent"] as value}
                <option value={value}>{value}</option>
              {/each}
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Assignee</label>
            <select
              bind:value={workItemAssigneeId}
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-sky-500"
            >
              <option value="">Unassigned</option>
              {#each agents as agent}
                <option value={agent.id}>{agent.name}</option>
              {/each}
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Description</label>
            <textarea
              bind:value={workItemDescription}
              rows="5"
              placeholder="Clarify the goal, constraints, and important context."
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-sky-500"
            ></textarea>
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Acceptance criteria</label>
            <textarea
              bind:value={workItemAcceptanceCriteria}
              rows="4"
              placeholder="What must be true for this ticket to be done?"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-sky-500"
            ></textarea>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-sm font-semibold text-slate-900 dark:text-white">Trace</h4>
          {#if editingWorkItem?.primary_session_id}
            <button
              onclick={() => onOpenSession?.(editingWorkItem?.primary_session_id!)}
              class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
            >
              Open thread
            </button>
          {/if}
        </div>

        {#if !editingWorkItem}
          <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Save the ticket first to get a trace and attach notes.
          </p>
        {:else}
          <div class="mt-3 space-y-3">
            <div class="rounded-2xl border border-slate-200/70 bg-white p-3 dark:border-white/10 dark:bg-slate-950/20">
              <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Add note</label>
              <textarea
                bind:value={workItemNote}
                rows="3"
                placeholder="Capture a decision, blocker, or useful context."
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-sky-500"
              ></textarea>
              <div class="mt-2 flex justify-end">
                <button
                  onclick={addWorkItemNote}
                  disabled={!workItemNote.trim()}
                  class="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Add to trace
                </button>
              </div>
            </div>

            <div class="space-y-2">
              {#if loadingWorkItemEvents}
                <div class="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-center text-sm text-slate-400 dark:border-white/10 dark:text-slate-500">
                  Loading trace...
                </div>
              {:else if workItemEvents.length === 0}
                <div class="rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-center text-sm text-slate-400 dark:border-white/10 dark:text-slate-500">
                  No trace entries yet.
                </div>
              {:else}
                {#each workItemEvents as event}
                  <div class="rounded-2xl border border-slate-200/70 bg-white p-3 dark:border-white/10 dark:bg-slate-950/20">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{event.event_type}</div>
                      <div class="text-[11px] text-slate-400"><RelativeTime timestamp={event.created_at} /></div>
                    </div>
                    {#if event.content}
                      <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">{event.content}</p>
                    {/if}
                    {#if event.session_id}
                      <button
                        onclick={() => onOpenSession?.(event.session_id!)}
                        class="mt-2 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        {sessionTitleById.get(event.session_id) ?? "Open linked session"}
                      </button>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex w-full items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        {#if editingWorkItem}
          <button
            onclick={deleteWorkItem}
            class="rounded-full border border-rose-200 px-3.5 py-2 text-sm font-medium text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            Delete
          </button>
          <button
            onclick={() => openOrCreateSessionForWorkItem(editingWorkItem!)}
            class="rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
          >
            {editingWorkItem.primary_session_id ? "Open thread" : "Start thread"}
          </button>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={() => (workItemModalOpen = false)}
          class="rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          onclick={saveWorkItem}
          class="rounded-full bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {editingWorkItem ? "Save ticket" : "Create ticket"}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

<Modal open={inboxModalOpen} onClose={() => (inboxModalOpen = false)} title={editingInboxItem ? "Edit Inbox Item" : "New Inbox Item"}>
  {#snippet children()}
    <div class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Kind</label>
          <select
            bind:value={inboxKind}
            class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
          >
            {#each ["report", "question", "attention", "approval", "delivery"] as value}
              <option value={value}>{value}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Priority</label>
          <select
            bind:value={inboxPriority}
            class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
          >
            {#each ["low", "medium", "high", "urgent"] as value}
              <option value={value}>{value}</option>
            {/each}
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Title</label>
          <input
            bind:value={inboxTitle}
            placeholder="What needs attention?"
            class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
          />
        </div>
        <div class="sm:col-span-2">
          <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Body</label>
          <textarea
            bind:value={inboxBody}
            rows="5"
            placeholder="Summarize the question, approval, or report."
            class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
          ></textarea>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Status</label>
          <select
            bind:value={inboxStatus}
            class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
          >
            {#each ["open", "acknowledged", "resolved", "dismissed"] as value}
              <option value={value}>{value}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Linked ticket</label>
          <select
            bind:value={inboxLinkedWorkItemId}
            class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-400/15 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
          >
            <option value="">None</option>
            {#each workItems as item}
              <option value={item.id}>{item.title}</option>
            {/each}
          </select>
        </div>
      </div>

      <label class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
        <input type="checkbox" bind:checked={inboxRequiresResponse} class="rounded border-slate-300 text-amber-500 focus:ring-amber-400/20" />
        Requires explicit user response
      </label>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex w-full items-center justify-between gap-3">
      <div>
        {#if editingInboxItem}
          <button
            onclick={deleteInboxItem}
            class="rounded-full border border-rose-200 px-3.5 py-2 text-sm font-medium text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            Delete
          </button>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={() => (inboxModalOpen = false)}
          class="rounded-full border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          onclick={saveInboxItem}
          class="rounded-full bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {editingInboxItem ? "Save inbox item" : "Create inbox item"}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

<AgentEditor
  open={agentEditorOpen}
  onClose={() => {
    agentEditorOpen = false;
    editingAgent = null;
  }}
  agent={editingAgent}
  {projectId}
  onSave={(agent) => {
    upsertAgent(agent);
    broadcastAgentsUpdated();
  }}
/>
