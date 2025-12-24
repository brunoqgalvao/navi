<script lang="ts">
  import type { ContentBlock, TextBlock, ToolUseBlock, ThinkingBlock, ToolResultBlock } from "../claude";
  import type { AgentUpdate } from "../handlers";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import ToolRenderer from "./ToolRenderer.svelte";
  import SubagentBlock from "./SubagentBlock.svelte";
  import MediaDisplay from "./MediaDisplay.svelte";
  import GenerativeUI from "./experimental/GenerativeUI.svelte";
  import CopyButton from "./CopyButton.svelte";
  import { processGenerativeUIContent } from "../generative-ui";
  import { parseMediaContent } from "../media-parser";

  interface Props {
    content: ContentBlock[];
    subagentUpdates?: AgentUpdate[];
    activeSubagents?: Map<string, { elapsed: number }>;
    basePath?: string;
    onRollback?: () => void;
    onFork?: () => void;
    onPreview?: (path: string) => void;
    onMessageClick?: (e: MouseEvent) => void;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
  }

  let { 
    content,
    subagentUpdates = [],
    activeSubagents = new Map(),
    basePath = '',
    onRollback, 
    onFork,
    onPreview,
    onMessageClick,
    renderMarkdown,
    jsonBlocksMap = new Map()
  }: Props = $props();

  let showMenu = $state(false);
  let expandedBlocks = $state<Set<number>>(new Set());

  function toggleBlock(idx: number) {
    if (expandedBlocks.has(idx)) {
      expandedBlocks.delete(idx);
    } else {
      expandedBlocks.add(idx);
    }
    expandedBlocks = new Set(expandedBlocks);
  }

  function getCopyText(): string {
    return content
      .filter((b): b is TextBlock => b.type === "text")
      .map(b => b.text)
      .filter(Boolean)
      .join("\n");
  }

  function isTaskTool(block: ContentBlock): boolean {
    return block.type === "tool_use" && (block as ToolUseBlock).name === "Task";
  }

  function isTodoWrite(block: ContentBlock): boolean {
    return block.type === "tool_use" && (block as ToolUseBlock).name === "TodoWrite";
  }

  function getSubagentForTool(toolUseId: string): AgentUpdate[] {
    return subagentUpdates.filter(u => u.parentToolUseId === toolUseId);
  }

  function renderTextContent(text: string) {
    const mediaResult = parseMediaContent(text);
    const genuiResult = processGenerativeUIContent(mediaResult.processedContent);
    return { mediaResult, genuiResult };
  }

  const copyText = $derived(getCopyText());
</script>

<svelte:window onclick={() => showMenu = false} />

<div class="flex gap-4 w-full pr-4 md:pr-0 relative group">
  <div class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center shadow-sm text-gray-900 font-bold text-xs select-none">
    C
  </div>

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 min-w-0 relative space-y-3" onclick={onMessageClick}>
    <div class="absolute -top-6 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-20">
      <CopyButton text={copyText} />
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

    {#each content as block, idx (idx)}
      {#if block.type === "text"}
        {@const text = (block as TextBlock).text}
        {@const rendered = renderTextContent(text)}
        <div class="text-[15px] leading-7 text-gray-800 markdown-body">
          <MermaidRenderer content={rendered.genuiResult.processedContent} {renderMarkdown} {jsonBlocksMap} />
          {#if rendered.mediaResult.items.length > 0}
            <div class="my-4">
              <MediaDisplay items={rendered.mediaResult.items} layout={rendered.mediaResult.items.length === 1 ? 'single' : 'grid'} {basePath} />
            </div>
          {/if}
          {#each rendered.genuiResult.blocks as genuiBlock (genuiBlock.id)}
            <div class="my-4">
              <GenerativeUI html={genuiBlock.html} id={genuiBlock.id} />
            </div>
          {/each}
        </div>

      {:else if block.type === "thinking"}
        {@const thinking = (block as ThinkingBlock).thinking}
        {@const expanded = expandedBlocks.has(idx)}
        <div class="rounded-lg border-l-2 border-l-purple-300 bg-gray-50/30 overflow-hidden">
          <button
            onclick={() => toggleBlock(idx)}
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-50/50 transition-colors"
          >
            <span class="text-sm">💭</span>
            <span class="flex-1 min-w-0 text-sm text-purple-700 truncate">
              {thinking.slice(0, 80)}{thinking.length > 80 ? "..." : ""}
            </span>
            <svg
              class="w-4 h-4 text-purple-400 transition-transform {expanded ? 'rotate-90' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {#if expanded}
            <div class="px-3 pb-3 relative">
              <div class="absolute top-0 right-3">
                <CopyButton text={thinking} />
              </div>
              <pre class="text-xs text-purple-700 whitespace-pre-wrap font-mono bg-purple-50 rounded-lg p-3 pr-10 max-h-64 overflow-y-auto">{thinking}</pre>
            </div>
          {/if}
        </div>

      {:else if block.type === "tool_use"}
        {@const tool = block as ToolUseBlock}
        {#if isTaskTool(block)}
          <SubagentBlock
            toolUseId={tool.id}
            description={tool.input?.description || tool.input?.prompt?.slice(0, 100) || "Subagent task"}
            subagentType={tool.input?.subagent_type || "general-purpose"}
            updates={getSubagentForTool(tool.id)}
            isActive={activeSubagents.has(tool.id)}
            elapsedTime={activeSubagents.get(tool.id)?.elapsed}
            {renderMarkdown}
            {onMessageClick}
          />
        {:else if !isTodoWrite(block)}
          {@const expanded = expandedBlocks.has(idx)}
          <div class="rounded-lg border-l-2 border-l-orange-300 bg-gray-50/30 overflow-hidden">
            <button
              onclick={() => toggleBlock(idx)}
              class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50/30 transition-colors"
            >
              <span class="text-sm">🔧</span>
              <span class="text-sm text-gray-700 font-medium">{tool.name}</span>
              <svg
                class="w-4 h-4 text-gray-400 transition-transform {expanded ? 'rotate-90' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {#if expanded}
              <div class="px-3 pb-3">
                <ToolRenderer {tool} {onPreview} />
              </div>
            {/if}
          </div>
        {/if}

      {:else if block.type === "tool_result"}
        {@const result = block as ToolResultBlock}
        {@const expanded = expandedBlocks.has(idx)}
        <div class="rounded-lg border-l-2 border-l-teal-300 bg-gray-50/30 overflow-hidden">
          <button
            onclick={() => toggleBlock(idx)}
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-teal-50/30 transition-colors"
          >
            <span class="text-sm">📋</span>
            <span class="flex-1 min-w-0 text-sm text-gray-600 truncate">
              {#if result.is_error}
                <span class="text-red-600">Error</span>
              {:else}
                Result
              {/if}
            </span>
            <svg
              class="w-4 h-4 text-gray-400 transition-transform {expanded ? 'rotate-90' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {#if expanded}
            <div class="px-3 pb-3">
              <pre class="text-xs {result.is_error ? 'text-red-700 bg-red-50' : 'text-gray-700 bg-gray-50'} rounded-lg p-3 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">{result.content}</pre>
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>
