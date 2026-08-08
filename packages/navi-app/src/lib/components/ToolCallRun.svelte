<script lang="ts">
  // Aggregated run of consecutive tool calls (same pattern as contador's
  // ToolActivity): collapsed by default showing only the LATEST step, updating
  // in place as new calls stream in; expanding reveals the full ordered
  // timeline — every tool row (individually expandable) plus any intermediate
  // thinking/narration that was folded into the run.
  import { fly } from "svelte/transition";
  import ToolRow from "./ToolRow.svelte";
  import { getToolSummary, getToolIconPath, type ToolRunStep, type ToolRunToolStep } from "./tool-display";

  interface Props {
    steps: ToolRunStep[];
    renderMarkdown?: (content: string) => string;
    onPreview?: (path: string) => void;
    onRunInTerminal?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
  }

  let { steps, renderMarkdown, onPreview, onRunInTerminal, onSendToClaude }: Props = $props();

  let expanded = $state(false);
  let expandedThinking = $state<Set<number>>(new Set());

  function toggleThinking(idx: number) {
    if (expandedThinking.has(idx)) expandedThinking.delete(idx);
    else expandedThinking.add(idx);
    expandedThinking = new Set(expandedThinking);
  }

  const toolSteps = $derived(steps.filter((s): s is ToolRunToolStep => s.kind === "tool"));
  // Latest activity drives the collapsed header — the running step if there is
  // one, otherwise the last completed one.
  const latest = $derived(toolSteps.find((s) => !s.toolResult) ?? toolSteps[toolSteps.length - 1]);
  const latestSummary = $derived(latest ? getToolSummary(latest.toolUse) : "");
  const isRunning = $derived(toolSteps.some((s) => !s.toolResult));
  const errorCount = $derived(toolSteps.filter((s) => s.toolResult?.is_error).length);
</script>

<div class="overflow-hidden">
  <button
    onclick={() => expanded = !expanded}
    aria-expanded={expanded}
    title={expanded ? "Collapse steps" : "Show all steps"}
    class="w-full flex items-center gap-2 py-1 text-left rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors -ml-1 pl-1"
  >
    {#if isRunning}
      <svg class="w-4 h-4 text-gray-400 dark:text-gray-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {:else if latest}
      <svg class="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={getToolIconPath(latest.toolUse.name)} />
      </svg>
    {/if}
    {#if latest}
      <!-- grid-stacked so the fly-in replaces in place without layout shift -->
      <span class="relative inline-grid flex-1 min-w-0 overflow-hidden">
        {#key latest.toolUse.id}
          <span class="col-start-1 row-start-1 flex items-baseline gap-2 min-w-0" in:fly={{ y: 8, duration: 150 }}>
            <span class="text-sm text-gray-600 dark:text-gray-400 shrink-0">{latest.toolUse.name}</span>
            {#if latestSummary}
              <span class="text-sm text-gray-400 dark:text-gray-500 truncate font-mono">{latestSummary}</span>
            {/if}
          </span>
        {/key}
      </span>
    {/if}
    {#if toolSteps.length > 1}
      <span class="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{toolSteps.length} steps</span>
    {/if}
    {#if !isRunning}
      {#if errorCount > 0 && errorCount === toolSteps.length}
        <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      {:else}
        <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      {/if}
    {/if}
    <svg
      class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 transition-transform shrink-0 {expanded ? 'rotate-90' : ''}"
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
  </button>

  {#if expanded}
    <ol class="mt-1 ml-[7px] border-l border-gray-200 dark:border-gray-700 pl-3 space-y-0.5" transition:fly={{ y: -4, duration: 150 }}>
      {#each steps as step (step.kind + "-" + (step.kind === "tool" ? step.toolUse.id : step.originalIndex))}
        {#if step.kind === "tool"}
          <li>
            <ToolRow tool={step.toolUse} result={step.toolResult} {onPreview} {onRunInTerminal} {onSendToClaude} />
          </li>
        {:else if step.kind === "thinking"}
          {#if step.text.trim()}
            <li class="py-0.5">
              <button
                onclick={() => toggleThinking(step.originalIndex)}
                class="flex items-center gap-1.5 max-w-full text-left text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <span class="shrink-0 font-medium">Thinking</span>
                {#if !expandedThinking.has(step.originalIndex)}
                  <span class="truncate text-gray-300 dark:text-gray-600">· {step.text.trim().split("\n")[0].slice(0, 80)}</span>
                {/if}
              </button>
              {#if expandedThinking.has(step.originalIndex)}
                <div class="mt-1 pl-3 border-l border-gray-200 dark:border-gray-700 text-xs leading-relaxed text-gray-500 dark:text-gray-400 whitespace-pre-wrap max-h-64 overflow-y-auto">{step.text.trim()}</div>
              {/if}
            </li>
          {/if}
        {:else}
          <!-- intermediate narration the agent said between steps -->
          <li class="py-0.5 text-[13px] leading-relaxed text-gray-700 dark:text-gray-300 markdown-body">
            {#if renderMarkdown}
              {@html renderMarkdown(step.text)}
            {:else}
              <span class="whitespace-pre-wrap">{step.text}</span>
            {/if}
          </li>
        {/if}
      {/each}
    </ol>
  {/if}
</div>
