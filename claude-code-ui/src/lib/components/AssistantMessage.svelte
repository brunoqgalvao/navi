<script lang="ts">
  import CopyButton from "./CopyButton.svelte";
  import ToolRenderer from "./ToolRenderer.svelte";
  import SubagentBlock from "./SubagentBlock.svelte";
  import type { ToolUseBlock, ContentBlock, TextBlock } from "../claude";
  import type { ChatMessage } from "../stores";

  interface Props {
    content: ContentBlock[] | string;
    contentHistory?: (ContentBlock[] | string)[];
    advancedMode?: boolean;
    subagentMessages?: ChatMessage[];
    activeSubagents?: Map<string, { elapsed: number }>;
    onRollback?: () => void;
    onFork?: () => void;
    onPreview?: (path: string) => void;
    onMessageClick?: (e: MouseEvent) => void;
    renderMarkdown: (content: string) => string;
  }

  let { 
    content, 
    contentHistory,
    advancedMode = false,
    subagentMessages = [],
    activeSubagents = new Map(),
    onRollback, 
    onFork,
    onPreview,
    onMessageClick,
    renderMarkdown
  }: Props = $props();

  let showMenu = $state(false);
  let expandedHistory = $state(false);
  let expandedTools = $state(false);

  function formatContent(c: ContentBlock[] | string): string {
    if (typeof c === "string") return c;
    return c
      .map((block) => {
        if (block.type === "text") return (block as TextBlock).text;
        if (block.type === "tool_use") return `[Using ${(block as ToolUseBlock).name}]`;
        return "";
      })
      .join("\n");
  }

  function getToolCalls(c: ContentBlock[] | string): ToolUseBlock[] {
    if (typeof c === "string") return [];
    return c.filter((b): b is ToolUseBlock => b.type === "tool_use" && b.name !== "TodoWrite");
  }

  function getHistoryToolCalls(history: (ContentBlock[] | string)[] | undefined): ToolUseBlock[] {
    if (!history) return [];
    return history.flatMap(c => {
      if (typeof c === "string") return [];
      return c.filter((b): b is ToolUseBlock => b.type === "tool_use");
    });
  }

  function isTaskTool(tool: ToolUseBlock): boolean {
    return tool.name === "Task";
  }

  function getSubagentMsgs(toolUseId: string): ChatMessage[] {
    return subagentMessages.filter(m => m.parentToolUseId === toolUseId);
  }

  const toolCalls = $derived(getToolCalls(content));
  const historyToolCalls = $derived(getHistoryToolCalls(contentHistory));
  const formattedContent = $derived(formatContent(content));
</script>

<svelte:window onclick={() => showMenu = false} />

<div class="flex gap-4 w-full pr-4 md:pr-0 relative group">
  <div class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center shadow-sm text-gray-900 font-bold text-xs select-none">
    C
  </div>

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 min-w-0 space-y-2 relative" onclick={onMessageClick}>
    <div class="absolute -top-6 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5">
      <CopyButton text={formattedContent} />
      <div class="relative">
        <button 
          onclick={(e) => { e.stopPropagation(); showMenu = !showMenu; }} 
          class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" 
          title="More actions"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
          </svg>
        </button>
        {#if showMenu}
          <div class="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
            <button onclick={() => { onRollback?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
              </svg>
              Rollback to here
            </button>
            <button onclick={() => { onFork?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
              </svg>
              Fork from here
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div class="text-[15px] leading-7 text-gray-800 markdown-body">
      {@html renderMarkdown(formattedContent)}
    </div>

    {#if advancedMode && historyToolCalls.length > 0}
      <div class="mt-3">
        <button
          onclick={() => expandedHistory = !expandedHistory}
          class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg class="w-3 h-3 transition-transform {expandedHistory ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
          <span>{historyToolCalls.length} previous tool {historyToolCalls.length === 1 ? 'call' : 'calls'}</span>
        </button>
        {#if expandedHistory}
          <div class="mt-2 space-y-1 pl-4 border-l-2 border-gray-200 opacity-70">
            {#each historyToolCalls as histTool, idx}
              <ToolRenderer tool={histTool} compact={true} index={idx} onPreview={onPreview} />
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if toolCalls.length > 0}
      {#if advancedMode}
        <div class="mt-3">
          <button
            onclick={() => expandedTools = !expandedTools}
            class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg class="w-3 h-3 transition-transform {expandedTools ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
            <span>{toolCalls.length} tool {toolCalls.length === 1 ? 'call' : 'calls'}</span>
          </button>
          {#if expandedTools}
            <div class="mt-2 space-y-1">
              {#each toolCalls as tool}
                {#if isTaskTool(tool)}
                  <SubagentBlock
                    toolUseId={tool.id}
                    description={tool.input.description || tool.input.prompt?.slice(0, 100) || "Subagent task"}
                    subagentType={tool.input.subagent_type || "general-purpose"}
                    messages={getSubagentMsgs(tool.id)}
                    isActive={activeSubagents.has(tool.id)}
                    elapsedTime={activeSubagents.get(tool.id)?.elapsed}
                    {renderMarkdown}
                    onMessageClick={onMessageClick}
                  />
                {:else}
                  <ToolRenderer {tool} onPreview={onPreview} />
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        {#each toolCalls as tool}
          {#if isTaskTool(tool)}
            <SubagentBlock
              toolUseId={tool.id}
              description={tool.input.description || tool.input.prompt?.slice(0, 100) || "Subagent task"}
              subagentType={tool.input.subagent_type || "general-purpose"}
              messages={getSubagentMsgs(tool.id)}
              isActive={activeSubagents.has(tool.id)}
              elapsedTime={activeSubagents.get(tool.id)?.elapsed}
              {renderMarkdown}
              onMessageClick={onMessageClick}
            />
          {:else}
            <ToolRenderer {tool} onPreview={onPreview} />
          {/if}
        {/each}
      {/if}
    {/if}
  </div>
</div>
