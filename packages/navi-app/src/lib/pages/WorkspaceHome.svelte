<script lang="ts">
  import type { Project, Session } from "../api";
  import RelativeTime from "../components/RelativeTime.svelte";
  import { attentionItems, projectStatus, sessionStatus } from "../stores";

  interface Props {
    projects: Project[];
    recentChats: Session[];
    onSelectProject: (project: Project) => void;
    onSelectSession: (session: Session) => void;
    onNewProject: () => void;
  }

  type WorkspaceNotificationKind =
    | "running"
    | "permission"
    | "awaiting_input"
    | "unread"
    | "review"
    | "update"
    | "project-running"
    | "project-attention";

  interface WorkspaceNotificationItem {
    key: string;
    kind: WorkspaceNotificationKind;
    summary: string;
    description: string;
    timestamp: number;
    session?: Session;
  }

  interface WorkspaceNotificationGroup {
    project: Project;
    items: WorkspaceNotificationItem[];
    runningCount: number;
    attentionCount: number;
    latestTimestamp: number;
  }

  const RECENT_PROJECT_LIMIT = 6;
  const NOTIFICATION_PROJECT_LIMIT = 4;
  const ITEMS_PER_PROJECT = 3;
  const SESSION_NOTIFICATION_PRIORITY: Record<WorkspaceNotificationKind, number> = {
    permission: 0,
    awaiting_input: 1,
    unread: 2,
    running: 3,
    review: 4,
    update: 5,
    "project-attention": 6,
    "project-running": 7,
  };

  const notificationStyles: Record<
    WorkspaceNotificationKind,
    { label: string; dot: string; badge: string; hover: string }
  > = {
    running: {
      label: "Running",
      dot: "bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.16)]",
      badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200",
      hover: "hover:border-cyan-200 hover:bg-cyan-50/70 dark:hover:border-cyan-400/20 dark:hover:bg-cyan-400/10",
    },
    permission: {
      label: "Approval",
      dot: "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
      hover: "hover:border-amber-200 hover:bg-amber-50/70 dark:hover:border-amber-400/20 dark:hover:bg-amber-400/10",
    },
    awaiting_input: {
      label: "Needs Input",
      dot: "bg-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.18)]",
      badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200",
      hover: "hover:border-orange-200 hover:bg-orange-50/70 dark:hover:border-orange-400/20 dark:hover:bg-orange-400/10",
    },
    unread: {
      label: "New Output",
      dot: "bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.16)]",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
      hover: "hover:border-blue-200 hover:bg-blue-50/70 dark:hover:border-blue-400/20 dark:hover:bg-blue-400/10",
    },
    review: {
      label: "Review",
      dot: "bg-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.18)]",
      badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200",
      hover: "hover:border-indigo-200 hover:bg-indigo-50/70 dark:hover:border-indigo-400/20 dark:hover:bg-indigo-400/10",
    },
    update: {
      label: "Recent",
      dot: "bg-slate-400 shadow-[0_0_0_4px_rgba(148,163,184,0.18)]",
      badge: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200",
      hover: "hover:border-slate-200 hover:bg-slate-50/70 dark:hover:border-slate-400/20 dark:hover:bg-slate-400/10",
    },
    "project-running": {
      label: "Running",
      dot: "bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.16)]",
      badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200",
      hover: "hover:border-cyan-200 hover:bg-cyan-50/70 dark:hover:border-cyan-400/20 dark:hover:bg-cyan-400/10",
    },
    "project-attention": {
      label: "Attention",
      dot: "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.16)]",
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
      hover: "hover:border-rose-200 hover:bg-rose-50/70 dark:hover:border-rose-400/20 dark:hover:bg-rose-400/10",
    },
  };

  let { projects, recentChats, onSelectProject, onSelectSession, onNewProject }: Props = $props();

  function getProjectActivity(project: Project): number {
    return project.last_activity ?? project.updated_at ?? project.created_at ?? 0;
  }

  function pluralize(count: number, label: string): string {
    return `${count} ${label}${count === 1 ? "" : "s"}`;
  }

  function attentionSummary(count: number): string {
    return count === 1 ? "1 chat needs attention" : `${count} chats need attention`;
  }

  function runningSummary(count: number): string {
    return count === 1 ? "1 chat is currently running" : `${count} chats are currently running`;
  }

  function getStatusTimestamp(sessionId: string, fallback: number): number {
    const status = $sessionStatus.get(sessionId);
    const lastActivity = status?.lastActivity;
    return lastActivity instanceof Date ? lastActivity.getTime() : fallback;
  }

  function createSessionNotification(session: Session): WorkspaceNotificationItem {
    const liveStatus = $sessionStatus.get(session.id)?.status;
    const timestamp = getStatusTimestamp(session.id, session.updated_at);

    if (liveStatus === "permission") {
      return {
        key: `${session.id}-permission`,
        kind: "permission",
        summary: session.title,
        description: "Waiting on an approval before the run can continue.",
        timestamp,
        session,
      };
    }

    if (liveStatus === "awaiting_input") {
      return {
        key: `${session.id}-awaiting-input`,
        kind: "awaiting_input",
        summary: session.title,
        description: "The agent asked a follow-up question and is blocked on your reply.",
        timestamp,
        session,
      };
    }

    if (liveStatus === "unread") {
      return {
        key: `${session.id}-unread`,
        kind: "unread",
        summary: session.title,
        description: "Fresh output landed in this chat since you last looked at it.",
        timestamp,
        session,
      };
    }

    if (liveStatus === "running") {
      return {
        key: `${session.id}-running`,
        kind: "running",
        summary: session.title,
        description: "A run is still in progress right now.",
        timestamp,
        session,
      };
    }

    if (session.marked_for_review) {
      return {
        key: `${session.id}-review`,
        kind: "review",
        summary: session.title,
        description: "Flagged for a closer pass before you move on.",
        timestamp: session.updated_at,
        session,
      };
    }

    return {
      key: `${session.id}-recent`,
      kind: "update",
      summary: session.title,
      description: "Recent work happened here and it is ready to revisit.",
      timestamp: session.updated_at,
      session,
    };
  }

  function handleNotificationClick(project: Project, item: WorkspaceNotificationItem) {
    if (item.session) {
      onSelectSession(item.session);
      return;
    }

    onSelectProject(project);
  }

  const recentProjects = $derived.by(() => {
    return [...projects]
      .sort((a, b) => getProjectActivity(b) - getProjectActivity(a))
      .slice(0, RECENT_PROJECT_LIMIT);
  });

  const totalNeedsAttention = $derived(
    $attentionItems.totalNeedsApproval +
      $attentionItems.totalNeedsInput +
      $attentionItems.totalNeedsReview
  );

  const activeWorkspaceCount = $derived.by(() => {
    let count = 0;

    for (const status of $projectStatus.values()) {
      if (status.runningCount > 0 || status.attentionCount > 0) {
        count += 1;
      }
    }

    return count;
  });

  const workspaceNotificationGroups = $derived.by(() => {
    const chatsByProject = new Map<string, Session[]>();

    for (const chat of recentChats) {
      if (chat.archived) continue;
      const existing = chatsByProject.get(chat.project_id) ?? [];
      existing.push(chat);
      chatsByProject.set(chat.project_id, existing);
    }

    return recentProjects
      .filter((project) => {
        const status = $projectStatus.get(project.id);
        return (
          chatsByProject.has(project.id) ||
          !!status?.runningCount ||
          !!status?.attentionCount
        );
      })
      .map((project): WorkspaceNotificationGroup => {
        const projectChats = [...(chatsByProject.get(project.id) ?? [])].sort((a, b) => {
          const aItem = createSessionNotification(a);
          const bItem = createSessionNotification(b);

          const priorityDelta =
            SESSION_NOTIFICATION_PRIORITY[aItem.kind] - SESSION_NOTIFICATION_PRIORITY[bItem.kind];

          if (priorityDelta !== 0) {
            return priorityDelta;
          }

          return bItem.timestamp - aItem.timestamp;
        });

        const status = $projectStatus.get(project.id);
        const items = projectChats
          .map((chat) => createSessionNotification(chat))
          .slice(0, ITEMS_PER_PROJECT);

        const visibleRunning = items.filter((item) => item.kind === "running").length;
        const visibleAttention = items.filter((item) =>
          ["permission", "awaiting_input", "unread", "review"].includes(item.kind)
        ).length;

        if ((status?.attentionCount ?? 0) > visibleAttention && items.length < ITEMS_PER_PROJECT) {
          const hiddenAttention = (status?.attentionCount ?? 0) - visibleAttention;
          items.push({
            key: `${project.id}-project-attention`,
            kind: "project-attention",
            summary: attentionSummary(hiddenAttention),
            description: "Approvals, unread output, or follow-up questions are waiting in this workspace.",
            timestamp: getProjectActivity(project),
          });
        }

        if ((status?.runningCount ?? 0) > visibleRunning && items.length < ITEMS_PER_PROJECT) {
          const hiddenRunning = (status?.runningCount ?? 0) - visibleRunning;
          items.push({
            key: `${project.id}-project-running`,
            kind: "project-running",
            summary: runningSummary(hiddenRunning),
            description: "Open this workspace to jump back into the latest active runs.",
            timestamp: getProjectActivity(project),
          });
        }

        if (items.length === 0) {
          items.push({
            key: `${project.id}-recent-update`,
            kind: "update",
            summary: "Recent workspace activity",
            description: "Open the workspace to see the latest chats, files, and context.",
            timestamp: getProjectActivity(project),
          });
        }

        const latestTimestamp = Math.max(
          getProjectActivity(project),
          ...items.map((item) => item.timestamp)
        );

        return {
          project,
          items,
          runningCount: status?.runningCount ?? 0,
          attentionCount: status?.attentionCount ?? 0,
          latestTimestamp,
        };
      })
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
      .slice(0, NOTIFICATION_PROJECT_LIMIT);
  });
</script>

<div class="flex-1 overflow-y-auto bg-[linear-gradient(180deg,hsl(25,60%,98%)_0%,#ffffff_42%,hsl(25,40%,97%)_100%)] dark:bg-[linear-gradient(180deg,#09111f_0%,#0f172a_42%,#111827_100%)]">
  <div class="relative isolate min-h-full overflow-hidden">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,hsl(25,90%,60%,0.12),transparent_50%),radial-gradient(circle_at_top_right,hsl(25,90%,50%,0.10),transparent_40%),radial-gradient(circle_at_bottom_left,hsl(25,80%,70%,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_top_left,hsl(25,90%,50%,0.14),transparent_50%),radial-gradient(circle_at_top_right,hsl(25,90%,60%,0.10),transparent_40%)]"></div>

    <div class="relative mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-6 py-8 md:px-8 lg:gap-8 lg:py-10">
      <section class="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div class="rounded-[28px] border border-accent-200/50 bg-white/85 p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35),0_0_0_1px_hsl(25,90%,85%,0.15)] backdrop-blur dark:border-accent-400/10 dark:bg-white/6 md:p-8">
          <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div class="max-w-2xl">
              <div class="inline-flex items-center gap-2 rounded-full border border-accent-200/80 bg-accent-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-700 shadow-sm dark:border-accent-400/20 dark:bg-accent-500/10 dark:text-accent-200">
                <span class="h-2 w-2 rounded-full bg-accent-500"></span>
                Workspace Pulse
              </div>

              <h1 class="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-4xl">
                Recent work should stay visible after a run ends.
              </h1>

              <p class="mt-4 max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                Keep the active workspaces, approvals, unread output, and fresh updates in one place so the dashboard feels alive instead of empty.
              </p>
            </div>

            <button
              onclick={onNewProject}
              class="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-accent-600/25 transition-all hover:-translate-y-0.5 hover:bg-accent-700 dark:bg-accent-500 dark:text-white dark:shadow-accent-500/20 dark:hover:bg-accent-400"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Workspace
            </button>
          </div>

          <div class="mt-8 grid gap-3 sm:grid-cols-3">
            <div class="rounded-2xl border border-cyan-100 bg-cyan-50/80 p-4 dark:border-cyan-400/15 dark:bg-cyan-400/8">
              <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-200">
                Running Now
              </div>
              <div class="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">
                {$attentionItems.totalRunning}
              </div>
              <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Active runs still moving through your recent chats.
              </p>
            </div>

            <div class="rounded-2xl border border-amber-100 bg-amber-50/85 p-4 dark:border-amber-400/15 dark:bg-amber-400/8">
              <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-200">
                Need Eyes
              </div>
              <div class="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">
                {totalNeedsAttention}
              </div>
              <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Approvals, questions, and review items waiting for you.
              </p>
            </div>

            <div class="rounded-2xl border border-accent-200 bg-accent-50/90 p-4 dark:border-accent-400/15 dark:bg-accent-500/8">
              <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-700 dark:text-accent-200">
                Live Workspaces
              </div>
              <div class="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">
                {activeWorkspaceCount}
              </div>
              <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Recent workspaces with active runs or outstanding attention.
              </p>
            </div>
          </div>
        </div>

        <div class="rounded-[28px] border border-slate-200/80 bg-white/88 p-5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/6 md:p-6">
          <div class="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-white/10">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-600 dark:text-accent-400">
                Notification Center
              </p>
              <h2 class="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Recent workspace activity
              </h2>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Runs, approvals, unread output, and updates from the workspaces you touched most recently.
              </p>
            </div>

            <div class="rounded-full bg-accent-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white dark:bg-accent-500 dark:text-white">
              {workspaceNotificationGroups.length > 0
                ? `${workspaceNotificationGroups.length} live`
                : "Quiet"}
            </div>
          </div>

          {#if workspaceNotificationGroups.length > 0}
            <div class="mt-4 space-y-4">
              {#each workspaceNotificationGroups as group}
                <article class="rounded-3xl border border-slate-200/80 bg-slate-50/75 p-4 dark:border-white/10 dark:bg-slate-950/20">
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                      <button
                        onclick={() => onSelectProject(group.project)}
                        class="text-left transition-opacity hover:opacity-80"
                      >
                        <div class="text-sm font-semibold text-slate-950 dark:text-white">
                          {group.project.name}
                        </div>
                        <div
                          class="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400"
                          title={group.project.path}
                        >
                          {group.project.path}
                        </div>
                      </button>

                      <div class="mt-3 flex flex-wrap gap-2">
                        <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm dark:bg-white/8 dark:text-slate-300">
                          {pluralize(group.project.session_count || 0, "chat")}
                        </span>
                        {#if group.runningCount > 0}
                          <span class="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200">
                            {pluralize(group.runningCount, "run")}
                          </span>
                        {/if}
                        {#if group.attentionCount > 0}
                          <span class="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                            {pluralize(group.attentionCount, "alert")}
                          </span>
                        {/if}
                      </div>
                    </div>

                    <div class="shrink-0 text-right">
                      <div class="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        Latest
                      </div>
                      <RelativeTime
                        timestamp={group.latestTimestamp}
                        class="mt-1 text-xs text-slate-500 dark:text-slate-400"
                      />
                    </div>
                  </div>

                  <div class="mt-4 space-y-2.5">
                    {#each group.items as item}
                      {@const style = notificationStyles[item.kind]}
                      <button
                        onclick={() => handleNotificationClick(group.project, item)}
                        class={`w-full rounded-2xl border border-white/80 bg-white/80 p-3 text-left transition-all dark:border-white/8 dark:bg-white/[0.04] ${style.hover}`}
                      >
                        <div class="flex items-center gap-2">
                          <span class={`h-2.5 w-2.5 rounded-full ${style.dot}`}></span>
                          <span
                            class={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${style.badge}`}
                          >
                            {style.label}
                          </span>
                          <span class="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                            <RelativeTime timestamp={item.timestamp} />
                          </span>
                        </div>

                        <div class="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                          {item.summary}
                        </div>
                        <div class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {item.description}
                        </div>
                      </button>
                    {/each}
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <div class="mt-6 rounded-3xl border border-dashed border-accent-200/60 bg-accent-50/40 px-6 py-10 text-center dark:border-accent-400/10 dark:bg-accent-500/[0.03]">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-white/8">
                <svg class="h-6 w-6 text-accent-400 dark:text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3h5.25m-7.5 8.25h13.5A2.25 2.25 0 0021 17.25V6.75A2.25 2.25 0 0018.75 4.5H5.25A2.25 2.25 0 003 6.75v10.5A2.25 2.25 0 005.25 19.5z" />
                </svg>
              </div>
              <h3 class="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
                No recent notifications yet
              </h3>
              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Start a workspace or let a run finish, and the latest activity will land here.
              </p>
            </div>
          {/if}
        </div>
      </section>

      {#if recentProjects.length > 0}
        <section class="rounded-[28px] border border-accent-200/40 bg-white/88 p-5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.3)] backdrop-blur dark:border-accent-400/10 dark:bg-white/6 md:p-6">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-600 dark:text-accent-400">
                Recent Workspaces
              </p>
              <h2 class="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Jump back into your latest context
              </h2>
            </div>

            <p class="text-sm text-slate-500 dark:text-slate-400">
              Ranked by actual workspace activity instead of sidebar order.
            </p>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {#each recentProjects as project}
              {@const status = $projectStatus.get(project.id)}
              <button
                onclick={() => onSelectProject(project)}
                class="group rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-[0_8px_30px_-8px_hsl(25,90%,50%,0.15)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.42))] dark:hover:border-accent-400/20 dark:hover:shadow-[0_8px_30px_-8px_hsl(25,90%,50%,0.1)]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-slate-950 dark:text-white">
                      {project.name}
                    </div>
                    <div
                      class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400"
                      title={project.path}
                    >
                      {project.path}
                    </div>
                  </div>

                  <div class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-white/8 dark:text-slate-300">
                    <RelativeTime timestamp={getProjectActivity(project)} />
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-white/8 dark:text-slate-200">
                    {pluralize(project.session_count || 0, "chat")}
                  </span>
                  {#if status?.runningCount}
                    <span class="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200">
                      {pluralize(status.runningCount, "run")}
                    </span>
                  {/if}
                  {#if status?.attentionCount}
                    <span class="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                      {pluralize(status.attentionCount, "alert")}
                    </span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>
