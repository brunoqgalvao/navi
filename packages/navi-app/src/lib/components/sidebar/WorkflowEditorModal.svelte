<script lang="ts">
  import Modal from "../Modal.svelte";
  import type { Agent, Workflow, WorkflowGate, WorkflowSchedule, WorkflowRun } from "../../api";
  import { api } from "../../api";
  import RelativeTime from "../RelativeTime.svelte";

  interface WorkflowInput {
    name: string;
    prompt: string;
    schedule: WorkflowSchedule;
    gate?: WorkflowGate;
    enabled?: boolean;
    collapsed?: boolean;
    learningNotes?: string | null;
    feedbackNotes?: string | null;
    ownerAgentId?: string | null;
  }

  interface Props {
    open: boolean;
    workflow?: Workflow | null;
    agents?: Agent[];
    onClose: () => void;
    onSave: (input: WorkflowInput) => Promise<void>;
    onSelectSession?: (sessionId: string) => void;
  }

  let { open, workflow = null, agents = [], onClose, onSave, onSelectSession }: Props = $props();

  type Tab = "schedule" | "prompt" | "learnings" | "sessions";
  let activeTab = $state<Tab>("prompt");

  let name = $state("");
  let prompt = $state("");
  let enabled = $state(true);
  let ownerAgentId = $state("");
  let learningNotes = $state("");
  let feedbackNotes = $state("");
  let scheduleKind = $state<WorkflowSchedule["kind"]>("every");
  let atTime = $state("");
  let intervalMinutes = $state("60");
  let cronExpression = $state("0 9 * * 1-5");
  let timezone = $state("America/Sao_Paulo");
  let gateCommand = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);

  // Sessions tab state
  let runs = $state<WorkflowRun[]>([]);
  let loadingRuns = $state(false);

  function toLocalInputValue(value: number | string | undefined): string {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function resetForm() {
    name = workflow?.name || "";
    prompt = workflow?.prompt || "";
    enabled = workflow?.enabled ?? true;
    ownerAgentId = workflow?.ownerAgentId || "";
    learningNotes = workflow?.learningNotes || "";
    feedbackNotes = workflow?.feedbackNotes || "";
    scheduleKind = workflow?.schedule.kind || "every";
    if (workflow?.schedule.kind === "at") {
      atTime = toLocalInputValue(workflow.schedule.time);
    } else {
      atTime = "";
    }
    if (workflow?.schedule.kind === "every") {
      intervalMinutes = String(Math.max(1, Math.round(workflow.schedule.interval / 60000)));
    } else {
      intervalMinutes = "60";
    }
    if (workflow?.schedule.kind === "cron") {
      cronExpression = workflow.schedule.expression;
      timezone = workflow.schedule.timezone || "America/Sao_Paulo";
    } else {
      cronExpression = "0 9 * * 1-5";
      timezone = "America/Sao_Paulo";
    }
    gateCommand = workflow?.gate.kind === "command" ? workflow.gate.command : "";
    error = null;
    runs = [];
    activeTab = workflow ? "prompt" : "prompt";
  }

  $effect(() => {
    if (open) resetForm();
  });

  // Load runs when switching to sessions tab
  $effect(() => {
    if (activeTab === "sessions" && workflow?.id && runs.length === 0) {
      loadRuns();
    }
  });

  async function loadRuns() {
    if (!workflow?.id) return;
    loadingRuns = true;
    try {
      const result = await api.workflows.runs(workflow.id, 50);
      runs = result.runs;
    } catch {
      runs = [];
    } finally {
      loadingRuns = false;
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      error = "Name is required";
      activeTab = "prompt";
      return;
    }
    if (!prompt.trim()) {
      error = "Prompt is required";
      activeTab = "prompt";
      return;
    }

    let schedule: WorkflowSchedule;
    if (scheduleKind === "at") {
      if (!atTime) {
        error = "Choose when this workflow should run";
        activeTab = "schedule";
        return;
      }
      schedule = { kind: "at", time: new Date(atTime).toISOString() };
    } else if (scheduleKind === "cron") {
      if (!cronExpression.trim()) {
        error = "Cron expression is required";
        activeTab = "schedule";
        return;
      }
      schedule = { kind: "cron", expression: cronExpression.trim(), timezone: timezone.trim() || undefined };
    } else {
      const minutes = Math.max(1, parseInt(intervalMinutes || "60", 10));
      schedule = { kind: "every", interval: minutes * 60_000 };
    }

    const gate: WorkflowGate = gateCommand.trim()
      ? { kind: "command", command: gateCommand.trim() }
      : { kind: "none" };

    saving = true;
    error = null;
    try {
      await onSave({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule,
        gate,
        enabled,
        ownerAgentId: ownerAgentId || null,
        collapsed: workflow?.collapsed ?? true,
        learningNotes: learningNotes.trim() || null,
        feedbackNotes: feedbackNotes.trim() || null,
      });
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save workflow";
    } finally {
      saving = false;
    }
  }

  function statusColor(status: string): string {
    switch (status) {
      case "success": return "text-emerald-600 dark:text-emerald-400";
      case "failed": return "text-red-500 dark:text-red-400";
      case "running": return "text-blue-500 dark:text-blue-400";
      case "skipped": return "text-amber-500 dark:text-amber-400";
      default: return "text-gray-500";
    }
  }

  function statusDot(status: string): string {
    switch (status) {
      case "success": return "bg-emerald-500";
      case "failed": return "bg-red-500";
      case "running": return "bg-blue-500 animate-pulse";
      case "skipped": return "bg-amber-500";
      default: return "bg-gray-400";
    }
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "prompt", label: "Prompt", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { id: "schedule", label: "Schedule", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "learnings", label: "Learnings", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
    { id: "sessions", label: "Sessions", icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
  ];
</script>

<Modal open={open} {onClose} title="" size="xl">
  {#snippet headerSlot()}
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <!-- Workflow icon -->
      <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 dark:from-violet-500/25 dark:to-fuchsia-500/25 border border-violet-200/60 dark:border-violet-500/30 shrink-0">
        <svg class="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>

      <!-- Inline name input -->
      <input
        bind:value={name}
        class="flex-1 min-w-0 text-base font-semibold bg-transparent border-0 outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-0 p-0"
        placeholder={workflow ? "Workflow name..." : "Name your workflow..."}
      />

      <!-- Enabled toggle pill -->
      <button
        onclick={() => enabled = !enabled}
        class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all {enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-500/30' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600'}"
      >
        <span class="w-1.5 h-1.5 rounded-full {enabled ? 'bg-emerald-500' : 'bg-gray-400'}"></span>
        {enabled ? "Active" : "Paused"}
      </button>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="flex flex-col" style="min-height: 420px;">
      <!-- Tab bar -->
      <div class="flex items-center gap-1 border-b border-gray-100 dark:border-gray-700 -mx-6 px-6 -mt-2 mb-0">
        {#each tabs as tab}
          <button
            onclick={() => activeTab = tab.id}
            class="relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors
              {activeTab === tab.id
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
            {#if tab.id === "sessions" && workflow}
              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{workflow.runCount}</span>
            {/if}
            {#if activeTab === tab.id}
              <span class="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"></span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Tab content -->
      <div class="flex-1 pt-5">
        <!-- PROMPT TAB -->
        {#if activeTab === "prompt"}
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Owner agent</label>
              <select
                bind:value={ownerAgentId}
                class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600 transition-colors"
              >
                <option value="">Workspace</option>
                {#each agents as agent}
                  <option value={agent.id}>{agent.name}</option>
                {/each}
              </select>
              <p class="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                The owning agent becomes the durable identity above this workflow.
              </p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Instructions</label>
              <textarea
                bind:value={prompt}
                rows="10"
                class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600 transition-colors resize-y"
                placeholder="What should this workflow do every run?&#10;&#10;Be specific about what data to gather, what format to use, and any conditions to check."
              ></textarea>
            </div>
            <p class="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
              This prompt runs every time the workflow triggers. The agent gets context about previous runs automatically.
            </p>
          </div>

        <!-- SCHEDULE TAB -->
        {:else if activeTab === "schedule"}
          <div class="space-y-5">
            <!-- Schedule type selector -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Trigger</label>
              <div class="grid grid-cols-3 gap-2">
                {#each [
                  { value: "every", label: "Interval", desc: "Run repeatedly", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
                  { value: "cron", label: "Cron", desc: "Custom schedule", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                  { value: "at", label: "One-time", desc: "Run once", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                ] as opt}
                  <button
                    onclick={() => scheduleKind = opt.value as WorkflowSchedule["kind"]}
                    class="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center
                      {scheduleKind === opt.value
                        ? 'border-violet-400 dark:border-violet-500 bg-violet-50/50 dark:bg-violet-900/20'
                        : 'border-gray-150 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/50'}"
                  >
                    <svg class="w-5 h-5 {scheduleKind === opt.value ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d={opt.icon} />
                    </svg>
                    <span class="text-xs font-medium {scheduleKind === opt.value ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}">{opt.label}</span>
                    <span class="text-[10px] {scheduleKind === opt.value ? 'text-violet-500 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}">{opt.desc}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Schedule config based on type -->
            <div class="p-4 rounded-lg bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50">
              {#if scheduleKind === "every"}
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Run every</label>
                <div class="flex items-center gap-2">
                  <input
                    bind:value={intervalMinutes}
                    type="number"
                    min="1"
                    class="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-center focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600"
                  />
                  <span class="text-sm text-gray-500 dark:text-gray-400">minutes</span>
                </div>
              {:else if scheduleKind === "cron"}
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Cron expression</label>
                    <input
                      bind:value={cronExpression}
                      class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600"
                      placeholder="0 9 * * 1-5"
                    />
                    <p class="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">min hour day month weekday</p>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Timezone</label>
                    <input
                      bind:value={timezone}
                      class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600"
                      placeholder="America/Sao_Paulo"
                    />
                  </div>
                </div>
              {:else}
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Run at</label>
                <input
                  bind:value={atTime}
                  type="datetime-local"
                  class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600"
                />
              {/if}
            </div>

            <!-- Condition gate -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Condition gate</label>
              <textarea
                bind:value={gateCommand}
                rows="2"
                class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600 transition-colors resize-y"
                placeholder="Optional shell command — exit 0 to proceed, non-zero skips."
              ></textarea>
              <p class="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">Runs before each execution. If it returns non-zero, the run is skipped.</p>
            </div>
          </div>

        <!-- LEARNINGS TAB -->
        {:else if activeTab === "learnings"}
          <div class="space-y-5">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Persistent guidance</label>
              <textarea
                bind:value={learningNotes}
                rows="6"
                class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600 transition-colors resize-y"
                placeholder="Things the workflow should always remember.&#10;&#10;Example: Always check the staging branch, not main."
              ></textarea>
              <p class="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Learnings are injected into every run. Use them to teach the workflow about your preferences.
              </p>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Feedback & corrections</label>
              <textarea
                bind:value={feedbackNotes}
                rows="6"
                class="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 dark:focus:border-violet-600 transition-colors resize-y"
                placeholder="Corrections or behavior changes for future runs.&#10;&#10;Example: Don't include weekend data in the weekly report."
              ></textarea>
              <p class="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                After reviewing a run, drop feedback here. The next run will adapt.
              </p>
            </div>
          </div>

        <!-- SESSIONS TAB -->
        {:else if activeTab === "sessions"}
          <div>
            {#if !workflow}
              <!-- Empty state for new workflow -->
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <div class="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <svg class="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400">Create the workflow first to see run history.</p>
              </div>
            {:else if loadingRuns}
              <div class="flex items-center justify-center py-12">
                <div class="w-5 h-5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin"></div>
              </div>
            {:else if runs.length === 0}
              <!-- Empty state for existing workflow with no runs -->
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 dark:from-violet-500/20 dark:to-fuchsia-500/20 flex items-center justify-center mb-3">
                  <svg class="w-6 h-6 text-violet-500 dark:text-violet-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  </svg>
                </div>
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No runs yet</p>
                <p class="text-xs text-gray-400 dark:text-gray-500">Trigger a manual run or wait for the schedule.</p>
              </div>
            {:else}
              <!-- Run history list -->
              <div class="space-y-1">
                {#each runs as run (run.id)}
                  <button
                    onclick={() => {
                      if (run.session_id && onSelectSession) {
                        onSelectSession(run.session_id);
                        onClose();
                      }
                    }}
                    disabled={!run.session_id}
                    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
                      {run.session_id ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer' : 'opacity-60 cursor-default'}"
                  >
                    <!-- Status dot -->
                    <span class="w-2 h-2 rounded-full shrink-0 {statusDot(run.status)}"></span>

                    <!-- Run info -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-medium {statusColor(run.status)} capitalize">{run.status}</span>
                        <span class="text-[10px] text-gray-400 dark:text-gray-500">
                          {run.trigger_source === "manual" ? "Manual" : "Scheduled"}
                        </span>
                      </div>
                      {#if run.error}
                        <p class="text-[10px] text-red-500 dark:text-red-400 truncate mt-0.5">{run.error}</p>
                      {:else if run.skipped_reason}
                        <p class="text-[10px] text-amber-500 dark:text-amber-400 truncate mt-0.5">{run.skipped_reason}</p>
                      {/if}
                    </div>

                    <!-- Timestamp -->
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
                      <RelativeTime timestamp={run.started_at} />
                    </span>

                    <!-- Navigate arrow -->
                    {#if run.session_id}
                      <svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      {#if error}
        <div class="mt-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
          <p class="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="flex items-center justify-between w-full">
      <div class="text-[11px] text-gray-400 dark:text-gray-500">
        {#if workflow}
          {workflow.runCount} run{workflow.runCount === 1 ? '' : 's'}
          {#if workflow.nextRunAt}
            &middot; Next <RelativeTime timestamp={workflow.nextRunAt} />
          {/if}
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <button onclick={onClose} class="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          Cancel
        </button>
        <button
          onclick={handleSubmit}
          disabled={saving}
          class="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50
            bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500
            shadow-sm hover:shadow-md"
        >
          {saving ? "Saving..." : workflow ? "Save" : "Create Workflow"}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>
