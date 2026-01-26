<script lang="ts">
  /**
   * ToolActionGroup
   *
   * Generic grouped display for consecutive tool operations.
   * Shows a human-readable summary instead of individual tool calls.
   *
   * Examples:
   * - 🔍 Searching in code "useState" (4 operations)
   * - 📝 Editing Button.tsx (3 changes)
   * - 🌐 Researching "React hooks" (2 sources)
   */
  import type { ToolGroup, ToolStep } from '$lib/core';
  import {
    TOOL_GROUP_CONFIG,
    generateGroupSummary,
    getGroupStats,
  } from '$lib/core';
  import DoodlePulse from '../DoodlePulse.svelte';
  import ToolRenderer from '../ToolRenderer.svelte';

  interface Props {
    group: ToolGroup;
    onPreview?: (path: string) => void;
    onRunInTerminal?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
  }

  let { group, onPreview, onRunInTerminal, onSendToClaude }: Props = $props();

  let expanded = $state(false);
  let currentStep = $state(0);

  // Config for this group type
  const config = $derived(TOOL_GROUP_CONFIG[group.type]);
  const stats = $derived(getGroupStats(group));
  const summary = $derived(generateGroupSummary(group));

  // Current step data
  const currentStepData = $derived(group.steps[currentStep]);

  function extractToolResultContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((item: any) => item?.type === 'text' && typeof item?.text === 'string')
        .map((item: any) => item.text)
        .join('\n');
    }
    if (content && typeof content === 'object' && 'text' in content) {
      return String((content as any).text);
    }
    return '';
  }

  function getStepIcon(step: ToolStep): string {
    const icons: Record<string, string> = {
      Grep: '🔍',
      Glob: '📂',
      Read: '📄',
      Write: '✏️',
      Edit: '✏️',
      MultiEdit: '✏️',
      WebSearch: '🔎',
      WebFetch: '🌐',
      Bash: '▶️',
    };
    return icons[step.toolUse.name] || '⚙️';
  }

  function getStepLabel(step: ToolStep): string {
    const { name, input } = step.toolUse;
    switch (name) {
      case 'Grep':
        return `grep "${input?.pattern || ''}"`;
      case 'Glob':
        return `glob ${input?.pattern || ''}`;
      case 'Read':
        return (input?.file_path as string)?.split('/').pop() || 'file';
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
        return (input?.file_path as string)?.split('/').pop() || 'file';
      case 'WebSearch':
        return `"${input?.query || ''}"`;
      case 'WebFetch':
        try {
          return new URL(input?.url as string).hostname;
        } catch {
          return 'url';
        }
      case 'Bash':
        const cmd = (input?.command as string) || '';
        return cmd.length > 25 ? cmd.slice(0, 25) + '...' : cmd;
      default:
        return name;
    }
  }
</script>

<!-- Main container -->
<div class="tool-action-group rounded-xl border-2 overflow-hidden shadow-sm {config.bgColor} {config.borderColor}">
  <!-- Collapsed header -->
  <button
    class="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-90 transition-opacity"
    onclick={() => expanded = !expanded}
  >
    <!-- Icon -->
    <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/60 dark:bg-black/20 text-xl">
      {config.icon}
    </div>

    <!-- Title & summary -->
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {config.label}
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
        {summary}
        {#if stats.total > 1}
          · {stats.total} operations
        {/if}
      </div>
    </div>

    <!-- Status -->
    <div class="shrink-0">
      {#if stats.isRunning}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-white/60 dark:bg-black/20 rounded-full">
          <DoodlePulse size={10} />
          <span class="text-xs font-medium {config.color}">Running</span>
        </div>
      {:else if stats.errors > 0}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-red-100 dark:bg-red-900/40 rounded-full">
          <svg class="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-xs font-medium text-red-700 dark:text-red-300">{stats.errors} error{stats.errors > 1 ? 's' : ''}</span>
        </div>
      {:else}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 rounded-full">
          <svg class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <span class="text-xs font-medium text-emerald-700 dark:text-emerald-300">Done</span>
        </div>
      {/if}
    </div>

    <!-- Expand arrow -->
    <svg
      class="w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform {expanded ? 'rotate-180' : ''}"
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Expanded content -->
  {#if expanded}
    <div class="border-t {config.borderColor}">
      <!-- Step navigation (if multiple steps) -->
      {#if group.steps.length > 1}
        <div class="flex items-center gap-2 px-4 py-2 bg-white/40 dark:bg-black/10 border-b {config.borderColor}">
          <!-- Prev -->
          <button
            class="p-1 rounded hover:bg-white/60 dark:hover:bg-black/20 disabled:opacity-30 disabled:cursor-not-allowed"
            onclick={() => currentStep = Math.max(0, currentStep - 1)}
            disabled={currentStep === 0}
          >
            <svg class="w-4 h-4 {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <!-- Step pills -->
          <div class="flex-1 flex items-center gap-1 overflow-x-auto">
            {#each group.steps as step, idx}
              <button
                class="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all shrink-0
                  {idx === currentStep
                    ? 'bg-white dark:bg-gray-800 shadow-sm ' + config.color + ' font-medium'
                    : 'hover:bg-white/60 dark:hover:bg-black/20 text-gray-600 dark:text-gray-400'}"
                onclick={() => currentStep = idx}
              >
                <span>{getStepIcon(step)}</span>
                <span class="truncate max-w-24">{getStepLabel(step)}</span>
                {#if step.toolResult?.is_error}
                  <svg class="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                {:else if !step.toolResult}
                  <DoodlePulse size={8} />
                {:else}
                  <svg class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                {/if}
              </button>
            {/each}
          </div>

          <!-- Next -->
          <button
            class="p-1 rounded hover:bg-white/60 dark:hover:bg-black/20 disabled:opacity-30 disabled:cursor-not-allowed"
            onclick={() => currentStep = Math.min(group.steps.length - 1, currentStep + 1)}
            disabled={currentStep === group.steps.length - 1}
          >
            <svg class="w-4 h-4 {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <!-- Counter -->
          <span class="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {currentStep + 1}/{group.steps.length}
          </span>
        </div>
      {/if}

      <!-- Current step details -->
      {#if currentStepData}
        <div class="p-4">
          <ToolRenderer
            tool={currentStepData.toolUse}
            toolResult={currentStepData.toolResult ? {
              content: extractToolResultContent(currentStepData.toolResult.content),
              is_error: currentStepData.toolResult.is_error
            } : undefined}
            {onPreview}
            {onRunInTerminal}
            {onSendToClaude}
            hideHeader={false}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>
