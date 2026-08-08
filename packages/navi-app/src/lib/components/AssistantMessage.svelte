<script lang="ts">
  import type { ContentBlock, TextBlock, ToolUseBlock, ThinkingBlock, ToolResultBlock, SubagentEventBlock } from "../claude";
  import type { ChatMessage } from "../stores";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import { AgentCard } from "./agents";
  import SubagentModal from "./SubagentModal.svelte";
  import MediaDisplay from "./MediaDisplay.svelte";
  import GenerativeUI from "./experimental/GenerativeUI.svelte";
  import CopyButton from "./CopyButton.svelte";
  import TodoListPreview from "./tools/TodoListPreview.svelte";
  import EmbeddedMarkdownViewer from "./EmbeddedMarkdownViewer.svelte";
  import { processGenerativeUIContent } from "../generative-ui";
  import { parseMediaContent } from "../media-parser";
  import { parseCopyableContent } from "../copyable-parser";
  import { parseMarkdownFileContent } from "../markdown-file-parser";
  import CopyableText from "./CopyableText.svelte";
  import TextSelectionContextMenu from "./TextSelectionContextMenu.svelte";
  import AgentBrowserWidget from "./widgets/AgentBrowserWidget.svelte";
  import BrowserActionGroup from "./widgets/BrowserActionGroup.svelte";
  import ToolRow from "./ToolRow.svelte";
  import ToolCallRun from "./ToolCallRun.svelte";
  import SubagentInteractionCard from "./SubagentInteractionCard.svelte";
  import { isAgentBrowserCommand } from "$lib/utils/agent-browser-parser";
  import { extractToolResultContent, type ToolRunStep } from "./tool-display";

  interface Props {
    content: ContentBlock[];
    subagentUpdates?: ChatMessage[];
    activeSubagents?: Map<string, { elapsed: number }>;
    basePath?: string;
    toolResults?: Map<string, ContentBlock>;
    onRollback?: () => void;
    onFork?: () => void;
    onDelete?: () => void;
    onPreview?: (path: string) => void;
    onRunInTerminal?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
    onMessageClick?: (e: MouseEvent) => void;
    onQuoteText?: (text: string) => void;
    onForkWithQuote?: (text: string) => void;
    onOpenSubagentSession?: (sessionId: string) => void;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
    shellBlocksMap?: Map<string, { code: string; language: string }>;
    sessionId?: string;
  }

  let {
    content,
    subagentUpdates = [],
    activeSubagents = new Map(),
    basePath = '',
    toolResults = new Map(),
    onRollback,
    onFork,
    onDelete,
    onPreview,
    onRunInTerminal,
    onSendToClaude,
    onMessageClick,
    onQuoteText,
    onForkWithQuote,
    onOpenSubagentSession,
    renderMarkdown,
    jsonBlocksMap = new Map(),
    shellBlocksMap = new Map(),
    sessionId = '',
  }: Props = $props();

  let showMenu = $state(false);
  let showDeleteConfirm = $state(false);
  let expandedBlocks = $state<Set<number>>(new Set());
  let openSubagentModal = $state<{ toolUseId: string; description: string; subagentType: string } | null>(null);

  // Text selection context menu state
  let selectionMenu = $state<{ x: number; y: number; text: string } | null>(null);

  function handleContextMenu(e: MouseEvent) {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0) {
      e.preventDefault();
      selectionMenu = {
        x: e.clientX,
        y: e.clientY,
        text: selectedText,
      };
    }
  }

  function handleQuote(text: string) {
    onQuoteText?.(text);
    selectionMenu = null;
  }

  function handleForkWithQuote(text: string) {
    onForkWithQuote?.(text);
    selectionMenu = null;
  }

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

  function isAgentBrowserTool(block: ToolUseBlock): boolean {
    return block.name === "Bash" && isAgentBrowserCommand(block.input?.command || "");
  }

  function isSkillRead(block: ToolUseBlock): boolean {
    if (block.name !== "Read") return false;
    const path = block.input?.file_path || "";
    return path.includes("/skills/") && path.endsWith("SKILL.md");
  }

  function getSkillName(block: ToolUseBlock): string {
    const path = block.input?.file_path || "";
    const match = path.match(/\/skills\/([^/]+)\/SKILL\.md$/);
    return match ? match[1] : "unknown";
  }

  function getSubagentForTool(toolUseId: string): ChatMessage[] {
    return subagentUpdates.filter(u => u.parentToolUseId === toolUseId);
  }

  function renderTextContent(text: string) {
    const copyableResult = parseCopyableContent(text);
    const mediaResult = parseMediaContent(copyableResult.processedContent);
    const markdownFileResult = parseMarkdownFileContent(mediaResult.processedContent);
    const genuiResult = processGenerativeUIContent(markdownFileResult.processedContent);
    return { copyableResult, mediaResult, markdownFileResult, genuiResult };
  }

  const copyText = $derived(getCopyText());

  interface GroupedBlock {
    toolUse: ToolUseBlock;
    toolResult?: ToolResultBlock;
    originalIndex: number;
  }

  interface BrowserActionGroupBlock {
    type: 'browser_group';
    steps: Array<{
      toolUse: ToolUseBlock;
      toolResult?: ToolResultBlock;
      originalIndex: number;
    }>;
  }

  interface ToolRunBlock {
    type: 'tool_run';
    steps: ToolRunStep[];
  }

  type GroupedItem = ContentBlock | GroupedBlock | BrowserActionGroupBlock | ToolRunBlock;

  // Aggregate ALL consecutive tool calls (any mix of Bash/Grep/Read/…) into one
  // collapsed run (contador-style). Intermediate thinking and narration — text
  // that still has tool work AFTER it — folds into the run's timeline; the
  // final prose, widgets and special tools (Task, TodoWrite, skill reads,
  // browser actions) stay prominent and break the run.
  function groupToolBlocks(blocks: ContentBlock[], externalResults: Map<string, ContentBlock>): GroupedItem[] {
    const grouped: GroupedItem[] = [];
    let browserGroup: BrowserActionGroupBlock | null = null;
    let run: ToolRunStep[] | null = null;
    let pending: ToolRunStep[] = []; // thinking/notes waiting for the run's first tool

    const isStandaloneTool = (t: ToolUseBlock) =>
      t.name === 'Task' || t.name === 'TodoWrite' ||
      (t.name === 'Read' && (t.input?.file_path as string)?.includes('/skills/'));
    const isBrowserTool = (t: ToolUseBlock) =>
      t.name === 'Bash' && isAgentBrowserCommand((t.input?.command as string) || '');

    // hasGroupableAfter[i]: does any run-joinable tool_use appear after index i?
    const hasGroupableAfter: boolean[] = new Array(blocks.length).fill(false);
    for (let i = blocks.length - 2; i >= 0; i--) {
      const next = blocks[i + 1];
      const nextGroupable = next.type === 'tool_use' &&
        !isStandaloneTool(next as ToolUseBlock) && !isBrowserTool(next as ToolUseBlock);
      hasGroupableAfter[i] = nextGroupable || hasGroupableAfter[i + 1];
    }

    const emitStepAsBlock = (s: ToolRunStep) => {
      if (s.kind === 'thinking') grouped.push({ type: 'thinking', thinking: s.text } as ContentBlock);
      else if (s.kind === 'note') grouped.push({ type: 'text', text: s.text } as ContentBlock);
      else grouped.push({ toolUse: s.toolUse, toolResult: s.toolResult, originalIndex: s.originalIndex });
    };

    const flushRun = () => {
      if (run) {
        const toolCount = run.filter((s) => s.kind === 'tool').length;
        if (toolCount >= 2) grouped.push({ type: 'tool_run', steps: run });
        else run.forEach(emitStepAsBlock); // lone tool: plain row + aux blocks
        run = null;
      }
      pending.forEach(emitStepAsBlock);
      pending = [];
    };

    const flushBrowserGroup = () => {
      if (browserGroup) {
        grouped.push(browserGroup);
        browserGroup = null;
      }
    };

    blocks.forEach((block, idx) => {
      if (block.type === "tool_use") {
        const toolUse = block as ToolUseBlock;
        const result = externalResults.get(toolUse.id) as ToolResultBlock | undefined;

        if (isBrowserTool(toolUse)) {
          flushRun();
          if (!browserGroup) {
            browserGroup = { type: 'browser_group', steps: [] };
          }
          browserGroup.steps.push({ toolUse, toolResult: result, originalIndex: idx });
          return;
        }
        flushBrowserGroup();

        if (isStandaloneTool(toolUse)) {
          flushRun();
          grouped.push({ toolUse, toolResult: result, originalIndex: idx });
          return;
        }

        // Run-joinable tool: start (adopting pending narration) or extend the run
        if (!run) {
          run = [...pending];
          pending = [];
        }
        run.push({ kind: 'tool', toolUse, toolResult: result, originalIndex: idx });
      } else if (block.type === "tool_result") {
        // Skip - handled via externalResults
      } else if (block.type === "thinking" && hasGroupableAfter[idx]) {
        const step: ToolRunStep = { kind: 'thinking', text: (block as ThinkingBlock).thinking || '', originalIndex: idx };
        if (run) run.push(step); else pending.push(step);
      } else if (block.type === "text" && hasGroupableAfter[idx] && (block as TextBlock).text?.trim()) {
        const step: ToolRunStep = { kind: 'note', text: (block as TextBlock).text, originalIndex: idx };
        if (run) run.push(step); else pending.push(step);
      } else {
        // Prominent content - flush all groups, render as-is
        flushBrowserGroup();
        flushRun();
        grouped.push(block);
      }
    });

    flushBrowserGroup();
    flushRun();

    return grouped;
  }

  function isGroupedBlock(item: GroupedItem): item is GroupedBlock {
    return 'toolUse' in item && 'originalIndex' in item && !('type' in item);
  }

  function isBrowserGroupBlock(item: GroupedItem): item is BrowserActionGroupBlock {
    return 'type' in item && (item as any).type === 'browser_group';
  }

  function isToolRunBlock(item: GroupedItem): item is ToolRunBlock {
    return 'type' in item && (item as any).type === 'tool_run';
  }

  const groupedContent = $derived(groupToolBlocks(content, toolResults));
</script>

<svelte:window onclick={() => showMenu = false} />

<!-- Single view - text always visible, tools individually collapsible -->
  <div class="w-full relative group/msg">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flex-1 min-w-0 relative space-y-2" onclick={onMessageClick} oncontextmenu={handleContextMenu}>
      <!-- Hover actions -->
      <div class="absolute -top-5 right-0 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm px-1 py-0.5 z-20">
        <CopyButton text={copyText} />
        <div class="relative">
          <button
            onclick={(e) => { e.stopPropagation(); showMenu = !showMenu; }}
            class="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 rounded transition-colors"
            title="More actions"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
            </svg>
          </button>
          {#if showMenu}
            <div class="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
              <button onclick={() => { onRollback?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path>
                </svg>
                Rollback to here
              </button>
              <button onclick={() => { onFork?.(); showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                </svg>
                Fork from here
              </button>
              <div class="border-t border-gray-100 dark:border-gray-700 my-1"></div>
              <button onclick={() => { showDeleteConfirm = true; showMenu = false; }} class="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                Delete message
              </button>
            </div>
          {/if}
          {#if showDeleteConfirm}
            <div class="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50">
              <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">Delete this message?</p>
              <div class="flex justify-end gap-2">
                <button onclick={() => showDeleteConfirm = false} class="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  Cancel
                </button>
                <button onclick={() => { onDelete?.(); showDeleteConfirm = false; }} class="px-2 py-1 text-xs bg-red-600 dark:bg-red-700 text-white rounded hover:bg-red-700 dark:hover:bg-red-800">
                  Delete
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>

    {#each groupedContent as item, idx (idx)}
      {#if isBrowserGroupBlock(item)}
        <!-- Browser action group - multiple consecutive browser commands -->
        <BrowserActionGroup
          steps={item.steps.map(step => ({
            command: step.toolUse.input?.command || "",
            output: step.toolResult ? extractToolResultContent(step.toolResult.content) : "",
            isError: step.toolResult?.is_error,
            isRunning: !step.toolResult
          }))}
        />
      {:else if isToolRunBlock(item)}
        <!-- Aggregated run of consecutive tool calls - collapsed by default -->
        <ToolCallRun
          steps={item.steps}
          {renderMarkdown}
          {onPreview}
          {onRunInTerminal}
          {onSendToClaude}
        />
      {:else if isGroupedBlock(item)}
        {@const tool = item.toolUse}
        {@const result = item.toolResult}
        {@const originalIdx = item.originalIndex}
        {#if isTaskTool(tool)}
          {@const taskDescription = tool.input?.description || tool.input?.prompt?.slice(0, 100) || "Subagent task"}
          {@const taskSubagentType = tool.input?.subagent_type || "general-purpose"}
          {@const taskPrompt = tool.input?.prompt || ""}
          <AgentCard
            toolUseId={tool.id}
            description={taskDescription}
            subagentType={taskSubagentType}
            prompt={taskPrompt}
            updates={getSubagentForTool(tool.id)}
            isActive={activeSubagents.has(tool.id)}
            hasResult={!!result}
            resultPreview={result ? extractToolResultContent(result.content) : ""}
            elapsedTime={activeSubagents.get(tool.id)?.elapsed}
            onExpand={() => openSubagentModal = { toolUseId: tool.id, description: taskDescription, subagentType: taskSubagentType }}
          />
        {:else if isTodoWrite(tool)}
          {@const expanded = expandedBlocks.has(originalIdx)}
          <TodoListPreview
            todos={tool.input?.todos || []}
            {expanded}
            onToggle={() => toggleBlock(originalIdx)}
          />
        {:else if isSkillRead(tool)}
          <!-- Skill reads get first-class rendering -->
          <div class="flex items-center gap-2 py-1">
            <span class="text-xs text-gray-500 dark:text-gray-400">Using skill:</span>
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded-md">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {getSkillName(tool)}
            </span>
            {#if !result}
              <svg class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            {:else}
              <svg class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            {/if}
          </div>
        {:else}
          <ToolRow {tool} {result} {onPreview} {onRunInTerminal} {onSendToClaude} />
        {/if}
      {:else if item.type === "subagent_event"}
        <SubagentInteractionCard
          block={item as SubagentEventBlock}
          onOpenSession={onOpenSubagentSession}
        />

      {:else if item.type === "text"}
        {@const text = (item as TextBlock).text}
        {@const rendered = renderTextContent(text)}
        <div class="text-sm leading-relaxed text-gray-800 dark:text-gray-200 markdown-body">
          <MermaidRenderer content={rendered.genuiResult.processedContent} {renderMarkdown} {jsonBlocksMap} {shellBlocksMap} {onRunInTerminal} {sessionId} />
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
          {#each rendered.copyableResult.items as copyableItem (copyableItem.id)}
            <div class="my-3">
              <CopyableText text={copyableItem.text} label={copyableItem.label} />
            </div>
          {/each}
          {#each rendered.markdownFileResult.items as mdFileItem, idx (idx)}
            <EmbeddedMarkdownViewer
              item={mdFileItem}
              {basePath}
              {renderMarkdown}
              {onPreview}
              {onSendToClaude}
            />
          {/each}
        </div>

      {:else if item.type === "thinking"}
        {@const thinking = ((item as ThinkingBlock).thinking || "").trim()}
        {#if thinking}
          {@const expanded = expandedBlocks.has(idx)}
          {@const preview = thinking.split("\n")[0].slice(0, 80)}
          <div class="group/think py-0.5">
            <button
              onclick={() => toggleBlock(idx)}
              class="flex items-center gap-1.5 max-w-full text-left text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <span class="shrink-0 font-medium">Thinking</span>
              {#if !expanded}
                <span class="truncate text-gray-300 dark:text-gray-600">· {preview}</span>
              {/if}
              <svg
                class="w-3 h-3 shrink-0 opacity-0 group-hover/think:opacity-100 transition-all {expanded ? 'rotate-90 opacity-100' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {#if expanded}
              <div class="relative mt-1.5 pl-3 border-l border-gray-200 dark:border-gray-700">
                <div class="absolute top-0 right-0 opacity-0 group-hover/think:opacity-100 transition-opacity">
                  <CopyButton text={thinking} />
                </div>
                <div class="text-xs leading-relaxed text-gray-500 dark:text-gray-400 whitespace-pre-wrap max-h-64 overflow-y-auto pr-8">{thinking}</div>
              </div>
            {/if}
          </div>
        {/if}

      {/if}
    {/each}
    </div>

  </div>

<!-- Text Selection Context Menu -->
{#if selectionMenu}
  <TextSelectionContextMenu
    x={selectionMenu.x}
    y={selectionMenu.y}
    selectedText={selectionMenu.text}
    onQuote={handleQuote}
    onForkWithQuote={handleForkWithQuote}
    onClose={() => selectionMenu = null}
  />
{/if}

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
