<script lang="ts">
  import type { ContentBlock, TextBlock, ToolUseBlock, ThinkingBlock, ToolResultBlock } from "../claude";
  import type { ChatMessage } from "../stores";
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
    subagentUpdates?: ChatMessage[];
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
        <div class="rounded-xl border border-purple-200 bg-purple-50/30 shadow-sm overflow-hidden">
          <button
            onclick={() => toggleBlock(idx)}
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-purple-50 transition-colors"
          >
            <div class="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span class="text-sm">💭</span>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-purple-800">Thinking</span>
              <span class="ml-2 text-xs text-purple-500 truncate">
                {thinking.slice(0, 60)}{thinking.length > 60 ? "..." : ""}
              </span>
            </div>
            <svg
              class="w-4 h-4 text-purple-400 transition-transform flex-shrink-0 {expanded ? 'rotate-90' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {#if expanded}
            <div class="px-4 pb-3 pt-1 border-t border-purple-100 relative">
              <div class="absolute top-2 right-4">
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
        {:else if isTodoWrite(block)}
          {@const expanded = expandedBlocks.has(idx)}
          {@const todos = tool.input?.todos || []}
          {@const completedCount = todos.filter((t: any) => t.status === "completed").length}
          <div class="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
            <button
              onclick={() => toggleBlock(idx)}
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 transition-colors"
            >
              <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
              </svg>
              <span class="text-xs font-medium text-gray-600">{completedCount}/{todos.length}</span>
              <svg
                class="w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ml-auto {expanded ? 'rotate-180' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if expanded}
              <div class="px-3 pb-2 pt-1 border-t border-gray-200 space-y-1.5 max-h-32 overflow-y-auto">
                {#each todos as todo}
                  <div class="flex items-start gap-2">
                    <div class="mt-0.5 shrink-0">
                      {#if todo.status === "completed"}
                        <div class="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
                          <svg class="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                          </svg>
                        </div>
                      {:else if todo.status === "in_progress"}
                        <div class="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></div>
                      {:else}
                        <div class="w-4 h-4 rounded-full border-2 border-gray-300"></div>
                      {/if}
                    </div>
                    <span class={`text-xs ${todo.status === "completed" ? "text-gray-400 line-through" : todo.status === "in_progress" ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                      {todo.content}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          {@const expanded = expandedBlocks.has(idx)}
          {@const summary = getToolSummary(tool)}
          <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <button
              onclick={() => toggleBlock(idx)}
              class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div class="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <span class="text-sm">{getToolIcon(tool.name)}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-900">{tool.name}</span>
                  {#if summary}
                    <span class="text-xs text-gray-400 truncate font-mono">{summary}</span>
                  {/if}
                </div>
              </div>
              <svg
                class="w-4 h-4 text-gray-400 transition-transform flex-shrink-0 {expanded ? 'rotate-90' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {#if expanded}
              <div class="px-4 pb-3 pt-2 border-t border-gray-100">
                <ToolRenderer {tool} {onPreview} hideHeader={true} />
              </div>
            {/if}
          </div>
        {/if}

      {:else if block.type === "tool_result"}
        {@const result = block as ToolResultBlock}
        {@const expanded = expandedBlocks.has(idx)}
        {@const resultPreview = typeof result.content === 'string' ? result.content.slice(0, 60) : ''}
        <div class="rounded-xl border {result.is_error ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'} shadow-sm overflow-hidden">
          <button
            onclick={() => toggleBlock(idx)}
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left {result.is_error ? 'hover:bg-red-50' : 'hover:bg-gray-50'} transition-colors"
          >
            <div class="w-7 h-7 rounded-lg {result.is_error ? 'bg-red-100' : 'bg-teal-100'} flex items-center justify-center flex-shrink-0">
              <span class="text-sm">{result.is_error ? '❌' : '✓'}</span>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium {result.is_error ? 'text-red-700' : 'text-gray-900'}">
                {result.is_error ? 'Error' : 'Result'}
              </span>
              {#if resultPreview && !result.is_error}
                <span class="ml-2 text-xs text-gray-400 truncate font-mono">
                  {resultPreview}{result.content.length > 60 ? '...' : ''}
                </span>
              {/if}
            </div>
            <svg
              class="w-4 h-4 text-gray-400 transition-transform flex-shrink-0 {expanded ? 'rotate-90' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {#if expanded}
            <div class="px-4 pb-3 pt-1 border-t {result.is_error ? 'border-red-100' : 'border-gray-100'}">
              <pre class="text-xs {result.is_error ? 'text-red-700 bg-red-50' : 'text-gray-700 bg-gray-50'} rounded-lg p-3 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">{result.content}</pre>
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>
