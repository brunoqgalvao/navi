<script lang="ts">
  import type { ToolUseBlock, ToolResultBlock } from "../claude";
  import ToolRenderer from "./ToolRenderer.svelte";
  import { getToolSummary, getToolIconPath, extractToolResultContent } from "./tool-display";

  interface Props {
    tool: ToolUseBlock;
    result?: ToolResultBlock;
    onPreview?: (path: string) => void;
    onRunInTerminal?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
  }

  let { tool, result, onPreview, onRunInTerminal, onSendToClaude }: Props = $props();

  let expanded = $state(false);

  const summary = $derived(getToolSummary(tool));
  const isLoading = $derived(!result);
</script>

<div class="overflow-hidden">
  <button
    onclick={() => expanded = !expanded}
    class="w-full flex items-center gap-2 py-1 text-left rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors -ml-1 pl-1"
  >
    {#if isLoading}
      <svg class="w-4 h-4 text-gray-400 dark:text-gray-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {:else}
      <svg class="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={getToolIconPath(tool.name)} />
      </svg>
    {/if}
    <span class="text-sm text-gray-600 dark:text-gray-400">{tool.name}</span>
    {#if summary}
      <span class="text-sm text-gray-400 dark:text-gray-500 truncate font-mono flex-1">{summary}</span>
    {/if}
    {#if result}
      {#if result.is_error}
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
    {@const resultContent = result ? extractToolResultContent(result.content) : ''}
    <div class="pl-6 pt-1 space-y-2">
      <ToolRenderer {tool} toolResult={result ? { content: resultContent, is_error: result.is_error } : undefined} {onPreview} {onRunInTerminal} {onSendToClaude} hideHeader={true} />
      {#if result && !['Read', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch', 'Bash', 'AskUserQuestion'].includes(tool.name) && !tool.name.startsWith('mcp__multi-session__') && !tool.name.startsWith('mcp__user-interaction__') && !tool.name.startsWith('mcp__navi-context__')}
        <div class="pt-1">
          <pre class="text-xs {result.is_error ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20' : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'} rounded p-2 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{resultContent}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>
