<script lang="ts">
  import type { ContentBlock, TextBlock, ToolUseBlock, ThinkingBlock, ToolResultBlock } from "../claude";
  import type { ChatMessage } from "../stores";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import ToolRenderer from "./ToolRenderer.svelte";
  import SubagentBlock from "./SubagentBlock.svelte";
  import SubagentModal from "./SubagentModal.svelte";
  import MediaDisplay from "./MediaDisplay.svelte";
  import GenerativeUI from "./experimental/GenerativeUI.svelte";
  import CopyButton from "./CopyButton.svelte";
  import TodoListPreview from "./tools/TodoListPreview.svelte";
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
    onRunInTerminal?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
    onMessageClick?: (e: MouseEvent) => void;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
    shellBlocksMap?: Map<string, { code: string; language: string }>;
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
    onRunInTerminal,
    onSendToClaude,
    onMessageClick,
    renderMarkdown,
    jsonBlocksMap = new Map(),
    shellBlocksMap = new Map(),
  }: Props = $props();

  let showMenu = $state(false);
  let expandedBlocks = $state<Set<number>>(new Set());
  let openSubagentModal = $state<{ toolUseId: string; description: string; subagentType: string } | null>(null);

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

  const toolIconPaths: Record<string, string> = {
    Read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    Write: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    Edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    MultiEdit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    Bash: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    Glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    Grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    WebFetch: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
    WebSearch: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    Task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    TodoWrite: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  };

  function getToolIconPath(name: string): string {
    return toolIconPaths[name] || "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z";
  }

  function getSubagentForTool(toolUseId: string): ChatMessage[] {
    const filtered = subagentUpdates.filter(u => u.parentToolUseId === toolUseId);
    console.log("[AssistantMessage] getSubagentForTool:", toolUseId);
    console.log("  subagentUpdates total:", subagentUpdates.length);
    console.log("  unique parentToolUseIds:", [...new Set(subagentUpdates.map(u => u.parentToolUseId))]);
    console.log("  filtered for this tool:", filtered.length);
    return filtered;
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
</script>

<svelte:window onclick={() => showMenu = false} />

<!-- Single view - text always visible, tools individually collapsible -->
  <div class="w-full relative group">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flex-1 min-w-0 relative space-y-2" onclick={onMessageClick}>
      <!-- Hover actions -->
      <div class="absolute -top-5 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-20">
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
          {@const taskDescription = tool.input?.description || tool.input?.prompt?.slice(0, 100) || "Subagent task"}
          {@const taskSubagentType = tool.input?.subagent_type || "general-purpose"}
          {@const _ = console.log("[AssistantMessage] Task tool found, id:", tool.id)}
          <SubagentBlock
            toolUseId={tool.id}
            description={taskDescription}
            subagentType={taskSubagentType}
            updates={getSubagentForTool(tool.id)}
            isActive={activeSubagents.has(tool.id)}
            elapsedTime={activeSubagents.get(tool.id)?.elapsed}
            {renderMarkdown}
            {onMessageClick}
            onOpenModal={() => openSubagentModal = { toolUseId: tool.id, description: taskDescription, subagentType: taskSubagentType }}
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
          {@const isLoading = !result}
          <div class="overflow-hidden">
            <button
              onclick={() => toggleBlock(originalIdx)}
              class="w-full flex items-center gap-2 py-1 text-left rounded hover:bg-gray-50 transition-colors -ml-1 pl-1"
            >
              {#if isLoading}
                <svg class="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              {:else}
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={getToolIconPath(tool.name)} />
                </svg>
              {/if}
              <span class="text-sm text-gray-600">{tool.name}</span>
              {#if summary}
                <span class="text-sm text-gray-400 truncate font-mono flex-1">{summary}</span>
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
                class="w-3.5 h-3.5 text-gray-300 transition-transform shrink-0 {expanded ? 'rotate-90' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {#if expanded}
              <div class="pl-6 pt-1 space-y-2">
                <ToolRenderer {tool} toolResult={result ? { content: String(result.content || ''), is_error: result.is_error } : undefined} {onPreview} {onRunInTerminal} {onSendToClaude} hideHeader={true} />
                {#if result && !['Read', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch', 'Bash'].includes(tool.name)}
                  <div class="pt-1">
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
          <MermaidRenderer content={rendered.genuiResult.processedContent} {renderMarkdown} {jsonBlocksMap} {shellBlocksMap} {onRunInTerminal} />
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

<!-- Subagent Modal -->
<SubagentModal
  open={openSubagentModal !== null}
  toolUseId={openSubagentModal?.toolUseId ?? ""}
  description={openSubagentModal?.description ?? ""}
  subagentType={openSubagentModal?.subagentType ?? ""}
  messages={openSubagentModal ? getSubagentForTool(openSubagentModal.toolUseId) : []}
  isActive={openSubagentModal ? activeSubagents.has(openSubagentModal.toolUseId) : false}
  elapsedTime={openSubagentModal ? activeSubagents.get(openSubagentModal.toolUseId)?.elapsed : undefined}
  onClose={() => openSubagentModal = null}
  {renderMarkdown}
  {onPreview}
/>
