<script lang="ts">
  import { sessionPlans, type Plan, type PlanStep } from "../../stores";
  import { createEventDispatcher } from "svelte";

  interface Props {
    plan: Plan;
    sessionId: string;
    readonly?: boolean;
    compact?: boolean;
  }

  let { plan, sessionId, readonly = false, compact = false }: Props = $props();

  const dispatch = createEventDispatcher<{
    approve: void;
    reject: void;
    execute: void;
    refine: string;
    stepUpdate: { stepId: string; status: PlanStep["status"] };
    stepModify: { stepId: string; content: string };
    stepRemove: { stepId: string };
    stepAdd: { content: string; afterStepId?: string };
  }>();

  // Local state
  let expanded = $state(!compact);
  let editingStepId = $state<string | null>(null);
  let editingContent = $state("");
  let addingAfterStepId = $state<string | null>(null);
  let newStepContent = $state("");
  let showRefineInput = $state(false);
  let refineText = $state("");

  // Computed
  const stats = $derived.by(() => {
    const approved = plan.steps.filter(s => s.status === "approved").length;
    const rejected = plan.steps.filter(s => s.status === "rejected").length;
    const modified = plan.steps.filter(s => s.status === "modified").length;
    const pending = plan.steps.filter(s => s.status === "pending").length;
    const total = plan.steps.length;
    return { approved, rejected, modified, pending, total };
  });

  const canApprove = $derived(
    plan.status === "draft" || plan.status === "reviewing"
  );

  const canExecute = $derived(plan.status === "approved");

  const statusColors: Record<Plan["status"], string> = {
    draft: "bg-amber-100 text-amber-800",
    reviewing: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    executing: "bg-purple-100 text-purple-800",
    completed: "bg-gray-100 text-gray-600",
    rejected: "bg-red-100 text-red-800",
  };

  const stepStatusIcons: Record<PlanStep["status"], { icon: string; color: string }> = {
    pending: { icon: "○", color: "text-gray-400" },
    approved: { icon: "✓", color: "text-green-500" },
    rejected: { icon: "✗", color: "text-red-500" },
    modified: { icon: "✎", color: "text-blue-500" },
  };

  // Handlers
  function handleApprove() {
    sessionPlans.approvePlan(sessionId);
    dispatch("approve");
  }

  function handleReject() {
    sessionPlans.rejectPlan(sessionId);
    dispatch("reject");
  }

  function handleExecute() {
    sessionPlans.startExecution(sessionId);
    dispatch("execute");
  }

  function handleRefine() {
    if (refineText.trim()) {
      sessionPlans.addRefinement(sessionId, refineText.trim());
      dispatch("refine", refineText.trim());
      refineText = "";
      showRefineInput = false;
    }
  }

  function handleStepStatusToggle(stepId: string) {
    const step = plan.steps.find(s => s.id === stepId);
    if (!step || readonly) return;

    // Toggle between pending -> approved -> rejected -> pending
    const nextStatus: Record<PlanStep["status"], PlanStep["status"]> = {
      pending: "approved",
      approved: "rejected",
      rejected: "pending",
      modified: "approved",
    };

    sessionPlans.updateStepStatus(sessionId, stepId, nextStatus[step.status]);
    dispatch("stepUpdate", { stepId, status: nextStatus[step.status] });
  }

  function startEditing(step: PlanStep) {
    if (readonly) return;
    editingStepId = step.id;
    editingContent = step.content;
  }

  function saveEdit() {
    if (editingStepId && editingContent.trim()) {
      sessionPlans.modifyStep(sessionId, editingStepId, editingContent.trim());
      dispatch("stepModify", { stepId: editingStepId, content: editingContent.trim() });
    }
    cancelEdit();
  }

  function cancelEdit() {
    editingStepId = null;
    editingContent = "";
  }

  function startAddStep(afterStepId?: string) {
    if (readonly) return;
    addingAfterStepId = afterStepId ?? null;
    newStepContent = "";
  }

  function saveNewStep() {
    if (newStepContent.trim()) {
      sessionPlans.addStep(sessionId, newStepContent.trim(), addingAfterStepId ?? undefined);
      dispatch("stepAdd", { content: newStepContent.trim(), afterStepId: addingAfterStepId ?? undefined });
    }
    cancelAddStep();
  }

  function cancelAddStep() {
    addingAfterStepId = null;
    newStepContent = "";
  }

  function removeStep(stepId: string) {
    if (readonly) return;
    sessionPlans.removeStep(sessionId, stepId);
    dispatch("stepRemove", { stepId });
  }
</script>

<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
  <!-- Header -->
  <button
    onclick={() => expanded = !expanded}
    class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
  >
    <!-- Plan icon -->
    <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
      <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
      </svg>
    </div>

    <!-- Title and status -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium text-gray-900 truncate">{plan.title || "Implementation Plan"}</span>
        <span class="text-xs px-2 py-0.5 rounded-full {statusColors[plan.status]}">
          {plan.status}
        </span>
      </div>
      <div class="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
        <span>{stats.total} steps</span>
        {#if stats.approved > 0}
          <span class="text-green-600">{stats.approved} approved</span>
        {/if}
        {#if stats.modified > 0}
          <span class="text-blue-600">{stats.modified} modified</span>
        {/if}
      </div>
    </div>

    <!-- Expand icon -->
    <svg
      class="w-5 h-5 text-gray-400 transition-transform shrink-0 {expanded ? 'rotate-180' : ''}"
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if expanded}
    <!-- Steps list -->
    <div class="px-4 pb-3 border-t border-gray-100">
      {#if plan.description}
        <p class="text-sm text-gray-600 py-3 border-b border-gray-100">{plan.description}</p>
      {/if}

      <div class="divide-y divide-gray-50">
        {#each plan.steps.sort((a, b) => a.order - b.order) as step, idx (step.id)}
          <div class="py-2.5 group">
            {#if editingStepId === step.id}
              <!-- Edit mode -->
              <div class="flex items-start gap-2">
                <span class="w-6 text-center text-sm text-gray-400 pt-1">{idx + 1}.</span>
                <div class="flex-1 space-y-2">
                  <textarea
                    bind:value={editingContent}
                    class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows="2"
                    onkeydown={(e) => {
                      if (e.key === "Enter" && e.metaKey) saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  ></textarea>
                  <div class="flex gap-2">
                    <button
                      onclick={saveEdit}
                      class="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      Save
                    </button>
                    <button
                      onclick={cancelEdit}
                      class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            {:else}
              <!-- View mode -->
              <div class="flex items-start gap-2">
                <span class="w-6 text-center text-sm text-gray-400">{idx + 1}.</span>

                <!-- Status indicator (clickable) -->
                <button
                  onclick={() => handleStepStatusToggle(step.id)}
                  class="shrink-0 mt-0.5 {stepStatusIcons[step.status].color} hover:opacity-70 transition-opacity"
                  disabled={readonly}
                  title="Click to change status"
                >
                  {stepStatusIcons[step.status].icon}
                </button>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <span class="text-sm text-gray-800 {step.status === 'rejected' ? 'line-through text-gray-400' : ''}">
                    {step.content}
                  </span>
                  {#if step.description}
                    <p class="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  {/if}
                  {#if step.estimatedComplexity}
                    <span class="text-[10px] px-1.5 py-0.5 mt-1 inline-block rounded bg-gray-100 text-gray-500">
                      {step.estimatedComplexity}
                    </span>
                  {/if}
                </div>

                <!-- Actions (on hover) -->
                {#if !readonly}
                  <div class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onclick={() => startEditing(step)}
                      class="p-1 text-gray-400 hover:text-gray-600"
                      title="Edit step"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                      </svg>
                    </button>
                    <button
                      onclick={() => startAddStep(step.id)}
                      class="p-1 text-gray-400 hover:text-gray-600"
                      title="Add step after"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                      </svg>
                    </button>
                    <button
                      onclick={() => removeStep(step.id)}
                      class="p-1 text-gray-400 hover:text-red-500"
                      title="Remove step"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </button>
                  </div>
                {/if}
              </div>

              <!-- Add step after this one -->
              {#if addingAfterStepId === step.id}
                <div class="mt-2 ml-8 flex items-start gap-2">
                  <input
                    type="text"
                    bind:value={newStepContent}
                    placeholder="New step..."
                    class="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    onkeydown={(e) => {
                      if (e.key === "Enter") saveNewStep();
                      if (e.key === "Escape") cancelAddStep();
                    }}
                  />
                  <button
                    onclick={saveNewStep}
                    class="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    Add
                  </button>
                  <button
                    onclick={cancelAddStep}
                    class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

      <!-- Add step at end -->
      {#if !readonly && addingAfterStepId === null && editingStepId === null}
        <button
          onclick={() => startAddStep()}
          class="mt-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          Add step
        </button>
      {/if}

      <!-- Add step at end (when addingAfterStepId is "") -->
      {#if addingAfterStepId === null && editingStepId === null && newStepContent === ""}
        <!-- nothing - handled by button above -->
      {:else if addingAfterStepId === "" || (addingAfterStepId === null && plan.steps.length === 0)}
        <div class="mt-2 flex items-start gap-2">
          <input
            type="text"
            bind:value={newStepContent}
            placeholder="New step..."
            class="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            onkeydown={(e) => {
              if (e.key === "Enter") saveNewStep();
              if (e.key === "Escape") cancelAddStep();
            }}
          />
          <button
            onclick={saveNewStep}
            class="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Add
          </button>
          <button
            onclick={cancelAddStep}
            class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      {/if}

      <!-- Refine input -->
      {#if showRefineInput}
        <div class="mt-3 pt-3 border-t border-gray-100">
          <textarea
            bind:value={refineText}
            placeholder="Describe how you'd like to refine this plan..."
            class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            rows="2"
            onkeydown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleRefine();
              if (e.key === "Escape") { showRefineInput = false; refineText = ""; }
            }}
          ></textarea>
          <div class="flex gap-2 mt-2">
            <button
              onclick={handleRefine}
              class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Refine Plan
            </button>
            <button
              onclick={() => { showRefineInput = false; refineText = ""; }}
              class="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}

      <!-- Actions -->
      {#if !readonly && (canApprove || canExecute)}
        <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
          {#if canApprove}
            <button
              onclick={handleApprove}
              class="flex-1 text-sm px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              Approve Plan
            </button>
            <button
              onclick={() => showRefineInput = true}
              class="flex-1 text-sm px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              Refine
            </button>
            <button
              onclick={handleReject}
              class="text-sm px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Reject plan"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          {:else if canExecute}
            <button
              onclick={handleExecute}
              class="flex-1 text-sm px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Execute Plan
            </button>
          {/if}
        </div>
      {/if}

      <!-- Execution status -->
      {#if plan.status === "executing"}
        <div class="mt-3 pt-3 border-t border-gray-100">
          <div class="flex items-center gap-2 text-sm text-purple-600">
            <div class="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            Executing plan...
          </div>
        </div>
      {/if}

      {#if plan.status === "completed"}
        <div class="mt-3 pt-3 border-t border-gray-100">
          <div class="flex items-center gap-2 text-sm text-green-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Plan completed
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
