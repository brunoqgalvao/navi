<script lang="ts">
  import type { ContentBlock, TextBlock, ToolUseBlock, ThinkingBlock, ToolResultBlock } from "../claude";
  import type { ChatMessage } from "../stores";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import ToolRenderer from "./ToolRenderer.svelte";
  import SubagentBlock from "./SubagentBlock.svelte";
  import MediaDisplay from "./MediaDisplay.svelte";
  import GenerativeUI from "./experimental/GenerativeUI.svelte";
  import CopyButton from "./CopyButton.svelte";
  import TodoListPreview from "./tools/TodoListPreview.svelte";
  import CompactToolCall from "./CompactToolCall.svelte";
  import { processGenerativeUIContent } from "../generative-ui";
  import { parseMediaContent } from "../media-parser";

  interface Props {
    content: ContentBlock[];
    subagentUpdates?: ChatMessage[];
    activeSubagents?: Map<string, { elapsed: number }>;
    basePath?: string;
    toolResults?: Map<string, ContentBlock>;
    onRollback?: () => void;
    onFork?: () => void;
    onPreview?: (path: string) => void;
    onMessageClick?: (e: MouseEvent) => void;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
    isFinal?: boolean;
    showAvatar?: boolean;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
  }

  let {
    content,
    subagentUpdates = [],
    activeSubagents = new Map(),
    basePath = '',
    toolResults = new Map(),
    onRollback,
    onFork,
    onPreview,
    onMessageClick,
    renderMarkdown,
    jsonBlocksMap = new Map(),
    isFinal = false,
    showAvatar = true,
    collapsed = false,
    onToggleCollapse
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

  function isTaskTool(block: ToolUseBlock): boolean {
    return block.name === "Task";
  }

  function isTodoWrite(block: ToolUseBlock): boolean {
    return block.name === "TodoWrite";
  }

  function getToolSummary(tool: ToolUseBlock): string {
    const input = tool.input || {};
    switch (tool.name) {
      case "Read":
        return input.file_path?.split("/").pop() || "";
      case "Write":
        return input.file_path?.split("/").pop() || "";
      case "Edit":
      case "MultiEdit":
        return input.file_path?.split("/").pop() || "";
      case "Bash":
        const cmd = input.command || "";
        return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
      case "Glob":
        return input.pattern || "";
      case "Grep":
        return input.pattern || "";
      case "WebFetch":
        try { return new URL(input.url || "").hostname; } catch { return ""; }
      case "WebSearch":
        return input.query || "";
      default:
        return "";
    }
  }

  const toolIcons: Record<string, string> = {
    Read: "📄",
    Write: "✏️",
    Edit: "🔧",
    MultiEdit: "🔧",
    Bash: "⚡",
    Glob: "🔍",
    Grep: "🔎",
    WebFetch: "🌐",
    WebSearch: "🔍",
    Task: "🤖",
  };

  function getToolIcon(name: string): string {
    return toolIcons[name] || "⚙️";
  }

  function getSubagentForTool(toolUseId: string): ChatMessage[] {
    return subagentUpdates.filter(u => u.parentToolUseId === toolUseId);
  }

  function renderTextContent(text: string) {
    const mediaResult = parseMediaContent(text);
    const genuiResult = processGenerativeUIContent(mediaResult.processedContent);
    return { mediaResult, genuiResult };
  }

  const copyText = $derived(getCopyText());

  interface GroupedBlock {
    toolUse: ToolUseBlock;
    toolResult?: ToolResultBlock;
    originalIndex: number;
  }

  function groupToolBlocks(blocks: ContentBlock[], externalResults: Map<string, ContentBlock>): (ContentBlock | GroupedBlock)[] {
    const grouped: (ContentBlock | GroupedBlock)[] = [];

    blocks.forEach((block, idx) => {
      if (block.type === "tool_use") {
        const toolUse = block as ToolUseBlock;
        const result = externalResults.get(toolUse.id) as ToolResultBlock | undefined;
        grouped.push({
          toolUse,
          toolResult: result,
          originalIndex: idx,
        });
      } else if (block.type === "tool_result") {
        // Skip tool_result blocks in the content array - they're handled via externalResults
      } else {
        grouped.push(block);
      }
    });

    return grouped;
  }

  function isGroupedBlock(item: ContentBlock | GroupedBlock): item is GroupedBlock {
    return 'toolUse' in item && 'originalIndex' in item;
  }

  const groupedContent = $derived(groupToolBlocks(content, toolResults));

  // Collapsed view helpers
  function getTextSummary(): string {
    const textBlocks = content.filter((b): b is TextBlock => b.type === "text");
    const allText = textBlocks.map(b => b.text).join(" ");
    const firstLine = allText.split("\n").find(l => l.trim().length > 0) || "";
    const cleaned = firstLine.replace(/[#*`_\[\]]/g, "").trim();
    return cleaned.length > 100 ? cleaned.slice(0, 100) + "..." : cleaned;
  }

  function getToolBlocks(): ToolUseBlock[] {
    return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
  }

  function getThinkingBlocks(): ThinkingBlock[] {
    return content.filter((b): b is ThinkingBlock => b.type === "thinking");
  }

  const textSummary = $derived(getTextSummary());
  const toolBlocks = $derived(getToolBlocks());
  const thinkingBlocks = $derived(getThinkingBlocks());
  const hasThinking = $derived(thinkingBlocks.length > 0);
</script>

<svelte:window onclick={() => showMenu = false} />

{#if collapsed}
  <!-- Collapsed view - compact single-line summary -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <button
    onclick={() => onToggleCollapse?.()}
    class="w-full text-left group"
  >
    <div class="flex flex-col gap-1.5 py-2 px-3 rounded-lg border border-gray-100 bg-gray-50/30 hover:bg-gray-50 transition-colors">
      <!-- Text summary row -->
      {#if textSummary}
        <div class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <span class="text-sm text-gray-600 truncate">{textSummary}</span>
        </div>
      {/if}

      <!-- Tool calls row -->
      {#if toolBlocks.length > 0}
        <div class="flex items-center gap-1.5 flex-wrap pl-5">
          {#each toolBlocks.slice(0, 6) as tool (tool.id)}
            <CompactToolCall
              {tool}
              result={toolResults.get(tool.id) as ToolResultBlock | undefined}
              {onPreview}
            />
          {/each}
          {#if toolBlocks.length > 6}
            <span class="text-xs text-gray-400">+{toolBlocks.length - 6} more</span>
          {/if}
        </div>
      {/if}

      <!-- Thinking indicator -->
      {#if hasThinking}
        <div class="flex items-center gap-1.5 pl-5">
          <span class="text-xs text-purple-500 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Extended thinking
          </span>
        </div>
      {/if}
    </div>
  </button>
{:else}
  <!-- Expanded view -->
  <div class="w-full relative group">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flex-1 min-w-0 relative space-y-2" onclick={onMessageClick}>
      <!-- Hover actions - only show on non-collapsed -->
      <div class="absolute -top-5 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-20">
        {#if onToggleCollapse && !isFinal}
          <button
            onclick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
            class="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            title="Collapse"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        {/if}
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

    {#each groupedContent as item, idx (idx)}
      {#if isGroupedBlock(item)}
        {@const tool = item.toolUse}
        {@const result = item.toolResult}
        {@const originalIdx = item.originalIndex}
        {#if isTaskTool(tool)}
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
        {:else if isTodoWrite(tool)}
          {@const expanded = expandedBlocks.has(originalIdx)}
          <TodoListPreview
            todos={tool.input?.todos || []}
            {expanded}
            onToggle={() => toggleBlock(originalIdx)}
          />
        {:else}
          {@const expanded = expandedBlocks.has(originalIdx)}
          {@const summary = getToolSummary(tool)}
          <div class="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <button
              onclick={() => toggleBlock(originalIdx)}
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div class="w-5 h-5 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                <span class="text-xs">{getToolIcon(tool.name)}</span>
              </div>
              <span class="text-xs font-medium text-gray-700">{tool.name}</span>
              {#if summary}
                <span class="text-xs text-gray-400 truncate font-mono flex-1">{summary}</span>
              {/if}
              {#if result}
                <span class="text-xs {result.is_error ? 'text-red-500' : 'text-green-500'} shrink-0">
                  {result.is_error ? '✗' : '✓'}
                </span>
              {:else}
                <div class="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin shrink-0"></div>
              {/if}
              <svg
                class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 {expanded ? 'rotate-90' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {#if expanded}
              <div class="px-3 pb-2 pt-1 border-t border-gray-100 space-y-2">
                <ToolRenderer {tool} toolResult={result ? { content: String(result.content || ''), is_error: result.is_error } : undefined} {onPreview} hideHeader={true} />
                {#if result}
                  <div class="pt-1.5 border-t border-gray-100">
                    <pre class="text-xs {result.is_error ? 'text-red-700 bg-red-50' : 'text-gray-600 bg-gray-50'} rounded p-2 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{result.content}</pre>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {:else if item.type === "text"}
        {@const text = (item as TextBlock).text}
        {@const rendered = renderTextContent(text)}
        <div class="text-sm leading-relaxed text-gray-800 markdown-body">
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

      {:else if item.type === "thinking"}
        {@const thinking = (item as ThinkingBlock).thinking}
        {@const expanded = expandedBlocks.has(idx)}
        <div class="rounded-lg border border-purple-200 bg-purple-50/20 overflow-hidden">
          <button
            onclick={() => toggleBlock(idx)}
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-purple-50 transition-colors"
          >
            <span class="text-xs">💭</span>
            <span class="text-xs font-medium text-purple-700">Thinking</span>
            <span class="text-xs text-purple-400 truncate flex-1">
              {thinking.slice(0, 60)}{thinking.length > 60 ? "..." : ""}
            </span>
            <svg
              class="w-3.5 h-3.5 text-purple-400 transition-transform shrink-0 {expanded ? 'rotate-90' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {#if expanded}
            <div class="px-3 pb-2 pt-1 border-t border-purple-100 relative">
              <div class="absolute top-1 right-3">
                <CopyButton text={thinking} />
              </div>
              <pre class="text-xs text-purple-700 whitespace-pre-wrap font-mono bg-purple-50 rounded p-2 pr-8 max-h-48 overflow-y-auto">{thinking}</pre>
            </div>
          {/if}
        </div>

      {/if}
    {/each}
    </div>
  </div>
{/if}
