<script lang="ts">
  import RelativeTime from "$lib/components/RelativeTime.svelte";
  import Markdown from "$lib/components/Markdown.svelte";
  import { api, type InboxItemWithProject } from "$lib/api";

  interface Props {
    onOpenSession?: (sessionId: string) => void;
    onOpenProject?: (projectId: string) => void;
  }

  let { onOpenSession, onOpenProject }: Props = $props();

  const REFRESH_MS = 10000;

  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let items = $state<InboxItemWithProject[]>([]);

  function parseJsonRecord(value: string | null): Record<string, unknown> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  function priorityRank(priority: InboxItemWithProject["priority"]): number {
    switch (priority) {
      case "urgent": return 3;
      case "high": return 2;
      case "medium": return 1;
      case "low": default: return 0;
    }
  }

  function labelForKind(kind: InboxItemWithProject["kind"]): string {
    switch (kind) {
      case "approval": return "Approval";
      case "attention": return "Attention";
      case "delivery": return "Delivery";
      case "question": return "Question";
      case "report": default: return "Report";
    }
  }

  function toneForPriority(priority: InboxItemWithProject["priority"]): string {
    switch (priority) {
      case "urgent":
        return "border-rose-500/30 bg-rose-500/10 text-rose-200";
      case "high":
        return "border-amber-500/30 bg-amber-500/10 text-amber-200";
      case "low":
        return "border-slate-700 bg-slate-800/70 text-slate-300";
      case "medium": default:
        return "border-blue-500/30 bg-blue-500/10 text-blue-200";
    }
  }

  function sourceLabel(item: InboxItemWithProject): string | null {
    const metadata = parseJsonRecord(item.metadata);
    if (typeof metadata.workflowName === "string" && metadata.workflowName.trim()) {
      return metadata.workflowName;
    }
    if (typeof metadata.sessionTitle === "string" && metadata.sessionTitle.trim()) {
      return metadata.sessionTitle;
    }
    return null;
  }

  function workspaceName(item: InboxItemWithProject): string {
    return item.project_name?.trim() || "Workspace";
  }

  async function loadInbox(initialLoad: boolean) {
    if (initialLoad) loading = true;
    else refreshing = true;

    try {
      items = await api.inbox.listAll();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load shared inbox";
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function updateItemStatus(item: InboxItemWithProject, status: InboxItemWithProject["status"]) {
    try {
      const updated = await api.inbox.update(item.id, { status });
      items = items.map((candidate) => (candidate.id === updated.id ? { ...candidate, ...updated } : candidate));
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update inbox item";
    }
  }

  function openSource(item: InboxItemWithProject) {
    if (item.source_session_id) {
      onOpenSession?.(item.source_session_id);
      return;
    }
    if (item.project_id) {
      onOpenProject?.(item.project_id);
    }
  }

  $effect(() => {
    void loadInbox(true);
    const timer = setInterval(() => {
      void loadInbox(false);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  });

  const activeItems = $derived.by(() =>
    items
      .filter((item) => item.status === "open" || item.status === "acknowledged")
      .sort((a, b) => {
        const pd = priorityRank(b.priority) - priorityRank(a.priority);
        if (pd !== 0) return pd;
        return b.updated_at - a.updated_at;
      })
  );

  const archivedItems = $derived.by(() =>
    items
      .filter((item) => item.status === "resolved" || item.status === "dismissed")
      .slice(0, 8)
  );

  const needsResponseCount = $derived(
    activeItems.filter((item) => Boolean(item.requires_response)).length
  );

  const workspaceCount = $derived(
    new Set(activeItems.map((item) => item.project_id)).size
  );
</script>

<div class="flex h-full flex-col overflow-hidden bg-gray-950 text-gray-100">
  <header class="border-b border-gray-800/80 bg-gray-950/95 px-4 py-3 backdrop-blur-sm">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold text-white">Shared Inbox</h2>
          <span class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            {activeItems.length} active
          </span>
          {#if refreshing}
            <span class="text-[10px] text-gray-500">syncing</span>
          {/if}
        </div>
        <p class="mt-1 text-xs text-gray-500">Follow-ups waiting across all workspaces.</p>
      </div>

      <button
        onclick={() => void loadInbox(false)}
        class="rounded-lg border border-gray-700 px-2.5 py-1 text-[11px] font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
      >
        Refresh
      </button>
    </div>

    {#if activeItems.length > 0}
      <div class="mt-3 grid grid-cols-2 gap-2">
        <div class="rounded-xl border border-gray-800/80 bg-gray-900/50 px-3 py-2">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Needs response</div>
          <div class="mt-1 text-lg font-semibold text-white">{needsResponseCount}</div>
        </div>
        <div class="rounded-xl border border-gray-800/80 bg-gray-900/50 px-3 py-2">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Workspaces</div>
          <div class="mt-1 text-lg font-semibold text-white">{workspaceCount}</div>
        </div>
      </div>
    {/if}
  </header>

  <div class="flex-1 overflow-y-auto px-4 py-4">
    {#if loading}
      <div class="space-y-3">
        {#each Array(3) as _, index}
          <div class="animate-pulse rounded-xl border border-gray-800 bg-gray-900/40 p-4" data-skeleton={index}>
            <div class="h-3 w-24 rounded bg-gray-800"></div>
            <div class="mt-3 h-4 w-48 rounded bg-gray-800/80"></div>
            <div class="mt-2 h-3 w-full rounded bg-gray-800/60"></div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div class="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
        {error}
      </div>
    {:else}
      <section>
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Active</h3>
          {#if activeItems.length > 0}
            <span class="text-[11px] text-gray-600">{activeItems.length} open</span>
          {/if}
        </div>

        {#if activeItems.length === 0}
          <div class="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
            No open inbox items across workspaces.
          </div>
        {:else}
          <div class="space-y-3">
            {#each activeItems as item (item.id)}
              {@const label = sourceLabel(item)}
              <article class="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-4">
                <div class="flex flex-col gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <button
                        onclick={() => onOpenProject?.(item.project_id)}
                        class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-300 transition hover:bg-gray-700"
                      >
                        {workspaceName(item)}
                      </button>
                      <span class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-300">
                        {labelForKind(item.kind)}
                      </span>
                      <span class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${toneForPriority(item.priority)}`}>
                        {item.priority}
                      </span>
                      {#if item.requires_response}
                        <span class="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                          Response needed
                        </span>
                      {/if}
                      {#if label}
                        <span class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                          {label}
                        </span>
                      {/if}
                    </div>

                    <h4 class="mt-3 text-sm font-semibold text-white">{item.title}</h4>

                    {#if item.body}
                      <div class="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-300 wf-md wf-md-content">
                        <Markdown content={item.body} />
                      </div>
                    {/if}

                    <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <span>Updated <RelativeTime timestamp={item.updated_at} /></span>
                      {#if item.status === "acknowledged"}
                        <span class="rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">Acknowledged</span>
                      {/if}
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      onclick={() => openSource(item)}
                      class="rounded-lg border border-gray-700 px-2.5 py-1 text-[11px] font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
                    >
                      {item.source_session_id ? "Open source" : "Open workspace"}
                    </button>
                    {#if item.status === "open"}
                      <button
                        onclick={() => void updateItemStatus(item, "acknowledged")}
                        class="rounded-lg border border-gray-700 px-2.5 py-1 text-[11px] font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
                      >
                        Acknowledge
                      </button>
                    {/if}
                    <button
                      onclick={() => void updateItemStatus(item, "resolved")}
                      class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/15"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      {#if archivedItems.length > 0}
        <section class="mt-6">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Recent</h3>
            <span class="text-[11px] text-gray-600">{archivedItems.length} closed</span>
          </div>

          <div class="space-y-2">
            {#each archivedItems as item (item.id)}
              <button
                onclick={() => openSource(item)}
                class="flex w-full items-center justify-between rounded-xl border border-gray-800/70 bg-gray-900/40 px-3 py-2 text-left transition hover:border-gray-700 hover:bg-gray-900/60"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="rounded-full bg-gray-800 px-1.5 py-0.5 text-[9px] font-medium text-gray-400">
                      {workspaceName(item)}
                    </span>
                    <span class="truncate text-sm font-medium text-gray-200">{item.title}</span>
                  </div>
                  <div class="mt-1 text-[11px] text-gray-500">
                    {item.status} <RelativeTime timestamp={item.updated_at} />
                  </div>
                </div>
                <span class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                  {item.priority}
                </span>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</div>
