<script lang="ts">
  import type { Escalation, EscalationResponse } from "../types";
  import { sessionHierarchyApi } from "../api";

  interface Props {
    sessionId: string;
    escalation: Escalation;
    sessionTitle?: string;
    sessionRole?: string;
    onResolved?: () => void;
  }

  let {
    sessionId,
    escalation,
    sessionTitle = "Session",
    sessionRole,
    onResolved,
  }: Props = $props();

  let responseText = $state("");
  let selectedOption = $state<string | null>(null);
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let expanded = $state(true);

  const hasOptions = $derived(escalation.options && escalation.options.length > 0);

  function getTypeLabel(type: string): string {
    switch (type) {
      case "question":
        return "Question";
      case "decision_needed":
        return "Decision Needed";
      case "blocker":
        return "Blocked";
      case "permission":
        return "Permission Required";
      default:
        return "Help Needed";
    }
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case "question":
        return "?";
      case "decision_needed":
        return "!";
      case "blocker":
        return "X";
      case "permission":
        return "K";
      default:
        return "!";
    }
  }

  async function handleSubmit(action: EscalationResponse["action"]) {
    if (action === "decide" && hasOptions && !selectedOption) {
      error = "Please select an option";
      return;
    }

    if (action === "answer" && !responseText.trim()) {
      error = "Please provide a response";
      return;
    }

    const content = action === "decide" && selectedOption
      ? selectedOption
      : responseText.trim();

    if (!content && action !== "abort" && action !== "escalate_further") {
      error = "Please provide a response";
      return;
    }

    submitting = true;
    error = null;

    try {
      await sessionHierarchyApi.resolveEscalation(sessionId, {
        action,
        content: content || action,
      });
      onResolved?.();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to resolve escalation";
    } finally {
      submitting = false;
    }
  }

  function handleOptionClick(option: string) {
    selectedOption = selectedOption === option ? null : option;
  }
</script>

<div class="escalation-banner bg-orange-50 border border-orange-200 rounded-lg overflow-hidden">
  <!-- Header -->
  <button
    onclick={() => expanded = !expanded}
    class="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-100/50 transition-colors"
  >
    <div class="flex items-center justify-center w-6 h-6 rounded-full bg-orange-200 text-orange-700 text-sm font-bold shrink-0">
      {getTypeIcon(escalation.type)}
    </div>
    <div class="flex-1 text-left">
      <div class="flex items-center gap-2">
        <span class="font-medium text-orange-800">{getTypeLabel(escalation.type)}</span>
        {#if sessionRole}
          <span class="text-[10px] px-1.5 py-0.5 bg-orange-200 text-orange-700 rounded uppercase tracking-wide">
            {sessionRole}
          </span>
        {/if}
      </div>
      <div class="text-sm text-orange-700">{sessionTitle}</div>
    </div>
    <svg
      class="w-4 h-4 text-orange-500 transition-transform {expanded ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if expanded}
    <div class="px-3 pb-3 space-y-3">
      <!-- Summary -->
      <div class="text-sm text-orange-800 font-medium">{escalation.summary}</div>

      <!-- Context -->
      {#if escalation.context}
        <div class="text-xs text-orange-600 bg-orange-100/50 rounded p-2">
          <div class="font-medium mb-1">Context:</div>
          <div class="whitespace-pre-wrap">{escalation.context}</div>
        </div>
      {/if}

      <!-- Options (for decision_needed) -->
      {#if hasOptions}
        <div class="space-y-1.5">
          <div class="text-xs font-medium text-orange-700">Select an option:</div>
          <div class="flex flex-wrap gap-2">
            {#each escalation.options as option}
              <button
                onclick={() => handleOptionClick(option)}
                class="px-3 py-1.5 rounded-md text-sm transition-colors
                  {selectedOption === option
                    ? 'bg-orange-500 text-white'
                    : 'bg-white border border-orange-300 text-orange-700 hover:bg-orange-100'}"
              >
                {option}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Response input -->
      <div class="space-y-2">
        <textarea
          bind:value={responseText}
          placeholder={hasOptions ? "Add additional context (optional)..." : "Type your response..."}
          class="w-full px-3 py-2 text-sm border border-orange-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
          rows="2"
          disabled={submitting}
        ></textarea>

        {#if error}
          <div class="text-red-600 text-xs">{error}</div>
        {/if}

        <!-- Actions -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button
              onclick={() => handleSubmit("abort")}
              disabled={submitting}
              class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Abort task
            </button>
            <button
              onclick={() => handleSubmit("escalate_further")}
              disabled={submitting}
              class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Escalate to human
            </button>
          </div>
          <div class="flex items-center gap-2">
            {#if hasOptions}
              <button
                onclick={() => handleSubmit("decide")}
                disabled={submitting || !selectedOption}
                class="px-4 py-1.5 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : "Confirm Decision"}
              </button>
            {:else}
              <button
                onclick={() => handleSubmit("answer")}
                disabled={submitting || !responseText.trim()}
                class="px-4 py-1.5 bg-orange-500 text-white text-sm rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : "Send Response"}
              </button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
