<script lang="ts">
  import type { ContentBlock, TextBlock, ToolUseBlock, ThinkingBlock, ToolResultBlock } from "../claude";
  import type { ChatMessage } from "../stores";
  import MermaidRenderer from "./MermaidRenderer.svelte";
  import ToolRenderer from "./ToolRenderer.svelte";
  import SubagentBlock from "./SubagentBlock.svelte";
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
  import ToolActionGroup from "./widgets/ToolActionGroup.svelte";
  import { isAgentBrowserCommand } from "$lib/utils/agent-browser-parser";
  import {
    type ToolGroup,
    type ToolGroupType,
    getToolGroupType,
    shouldGroupTogether,
    TOOL_GROUP_CONFIG,
    generateGroupSummary,
  } from "$lib/core";
  // Comments feature @experimental
  import { commentsStore, showComments, createMessageThreadsStore } from "$lib/features/comments";
  import CommentThread from "$lib/features/comments/components/CommentThread.svelte";
  import CommentInput from "$lib/features/comments/components/CommentInput.svelte";
  import CommentIndicator from "$lib/features/comments/components/CommentIndicator.svelte";

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
    onAskCouncil?: (text: string) => void;
    renderMarkdown: (content: string) => string;
    jsonBlocksMap?: Map<string, any>;
    shellBlocksMap?: Map<string, { code: string; language: string }>;
    sessionId?: string;
    messageId?: string;
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
    onAskCouncil,
    renderMarkdown,
    jsonBlocksMap = new Map(),
    shellBlocksMap = new Map(),
    sessionId = '',
    messageId = '',
  }: Props = $props();

  let showMenu = $state(false);
  let showDeleteConfirm = $state(false);
  let expandedBlocks = $state<Set<number>>(new Set());
  let openSubagentModal = $state<{ toolUseId: string; description: string; subagentType: string } | null>(null);

  // Text selection context menu state
  let selectionMenu = $state<{ x: number; y: number; text: string } | null>(null);

  // Comments state @experimental
  let commentInput = $state<{ x: number; y: number; text: string } | null>(null);
  let expandedThreadId = $state<string | null>(null);
  let localThreads = $state<import("$lib/features/comments").CommentThread[]>([]);

  // Subscribe to comment threads reactively
  $effect(() => {
    if (sessionId && messageId) {
      // Subscribe to the store and filter for this message
      const unsubscribe = commentsStore.subscribe((map) => {
        const sessionThreads = map.get(sessionId) || [];
        localThreads = sessionThreads.filter((t) => t.message_id === messageId);
      });
      return unsubscribe;
    }
    localThreads = [];
    return undefined;
  });

  // Use local state for reactivity
  const messageThreads = $derived(localThreads);

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

  function handleAddComment(text: string) {
    if (!selectionMenu) return;
    // Open comment input at the selection position
    commentInput = {
      x: selectionMenu.x,
      y: selectionMenu.y,
      text,
    };
    selectionMenu = null;
  }

  function handleCommentCreated(threadId: string) {
    // Expand the newly created thread
    expandedThreadId = threadId;
  }

  async function handleAskAI(threadId: string, question: string) {
    // Get the message content as context and ask AI
    const context = getCopyText();
    await commentsStore.askAI(sessionId, threadId, question, context);
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

  interface ToolActionGroupBlock {
    type: 'tool_group';
    groupType: ToolGroupType;
    group: ToolGroup;
  }

  type GroupedItem = ContentBlock | GroupedBlock | BrowserActionGroupBlock | ToolActionGroupBlock;

  function groupToolBlocks(blocks: ContentBlock[], externalResults: Map<string, ContentBlock>): GroupedItem[] {
    const grouped: GroupedItem[] = [];
    let currentBrowserGroup: BrowserActionGroupBlock | null = null;
    let currentToolGroup: ToolActionGroupBlock | null = null;
    let prevToolUse: ToolUseBlock | null = null;
    let prevGroupType: ToolGroupType | null = null;

    const flushGroups = () => {
      if (currentBrowserGroup) {
        grouped.push(currentBrowserGroup);
        currentBrowserGroup = null;
      }
      if (currentToolGroup && currentToolGroup.group.steps.length > 0) {
        // Only push as a group if we have multiple steps, otherwise push as individual
        if (currentToolGroup.group.steps.length > 1) {
          // Finalize the group
          currentToolGroup.group.summary = generateGroupSummary(currentToolGroup.group);
          currentToolGroup.group.label = TOOL_GROUP_CONFIG[currentToolGroup.groupType].label;
          currentToolGroup.group.icon = TOOL_GROUP_CONFIG[currentToolGroup.groupType].icon;
          grouped.push(currentToolGroup);
        } else {
          // Single tool, push as regular grouped block
          const step = currentToolGroup.group.steps[0];
          grouped.push({
            toolUse: step.toolUse,
            toolResult: step.toolResult,
            originalIndex: step.originalIndex,
          });
        }
        currentToolGroup = null;
      }
      prevToolUse = null;
      prevGroupType = null;
    };

    blocks.forEach((block, idx) => {
      if (block.type === "tool_use") {
        const toolUse = block as ToolUseBlock;
        const result = externalResults.get(toolUse.id) as ToolResultBlock | undefined;
        const isBrowser = toolUse.name === "Bash" && isAgentBrowserCommand(toolUse.input?.command || "");

        if (isBrowser) {
          // Flush any pending tool group before browser actions
          if (currentToolGroup) {
            flushGroups();
          }
          // Add to current browser group or start a new one
          if (!currentBrowserGroup) {
            currentBrowserGroup = { type: 'browser_group', steps: [] };
          }
          currentBrowserGroup.steps.push({
            toolUse,
            toolResult: result,
            originalIndex: idx,
          });
        } else {
          // Flush browser group if we have one
          if (currentBrowserGroup) {
            grouped.push(currentBrowserGroup);
            currentBrowserGroup = null;
          }

          // Check if this tool can be grouped
          const groupType = getToolGroupType(toolUse.name, toolUse.input as Record<string, unknown>);

          // Skip grouping for certain tools that have special rendering
          const skipGrouping = toolUse.name === 'Task' || toolUse.name === 'TodoWrite' ||
            (toolUse.name === 'Read' && (toolUse.input?.file_path as string)?.includes('/skills/'));

          if (skipGrouping) {
            flushGroups();
            grouped.push({
              toolUse,
              toolResult: result,
              originalIndex: idx,
            });
          } else if (groupType && prevToolUse && prevGroupType &&
                     shouldGroupTogether(prevToolUse, toolUse, prevGroupType, groupType)) {
            // Continue current group
            currentToolGroup!.group.steps.push({
              toolUse,
              toolResult: result,
              originalIndex: idx,
            });
          } else {
            // Start a new group (flush previous first)
            flushGroups();

            if (groupType) {
              currentToolGroup = {
                type: 'tool_group',
                groupType,
                group: {
                  type: groupType,
                  steps: [{
                    toolUse,
                    toolResult: result,
                    originalIndex: idx,
                  }],
                  summary: '',
                  icon: TOOL_GROUP_CONFIG[groupType].icon,
                  label: TOOL_GROUP_CONFIG[groupType].label,
                },
              };
              prevToolUse = toolUse;
              prevGroupType = groupType;
            } else {
              // Non-groupable tool
              grouped.push({
                toolUse,
                toolResult: result,
                originalIndex: idx,
              });
            }
          }

          // Update prev tracking for groupable tools
          if (groupType && !skipGrouping) {
            prevToolUse = toolUse;
            prevGroupType = groupType;
          }
        }
      } else if (block.type === "tool_result") {
        // Skip tool_result blocks in the content array - they're handled via externalResults
      } else {
        // Non-tool content, flush all groups
        flushGroups();
        grouped.push(block);
      }
    });

    // Flush any remaining groups
    flushGroups();

    return grouped;
  }

  function isGroupedBlock(item: GroupedItem): item is GroupedBlock {
    return 'toolUse' in item && 'originalIndex' in item && !('type' in item);
  }

  function isBrowserGroupBlock(item: GroupedItem): item is BrowserActionGroupBlock {
    return 'type' in item && (item as any).type === 'browser_group';
  }

  function isToolActionGroupBlock(item: GroupedItem): item is ToolActionGroupBlock {
    return 'type' in item && (item as any).type === 'tool_group';
  }

  /**
   * Extract text content from tool result content.
   * MCP tools return content as [{type: "text", text: "..."}] arrays.
   * Regular tools may return a string directly.
   */
  function extractToolResultContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
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

  const groupedContent = $derived(groupToolBlocks(content, toolResults));
</script>

<svelte:window onclick={() => showMenu = false} />

<!-- Single view - text always visible, tools individually collapsible -->
  <div class="w-full relative group">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flex-1 min-w-0 relative space-y-2" onclick={onMessageClick} oncontextmenu={handleContextMenu}>
      <!-- Hover actions -->
      <div class="absolute -top-5 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm px-1 py-0.5 z-20">
        <!-- Comment indicator @experimental -->
        {#if $showComments && messageThreads.length > 0}
          <button
            onclick={(e) => { e.stopPropagation(); expandedThreadId = expandedThreadId ? null : messageThreads[0].thread_id; }}
            class="p-1 text-amber-500 hover:text-amber-600 rounded transition-colors"
            title="{messageThreads.length} comment{messageThreads.length > 1 ? 's' : ''}"
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
            </svg>
          </button>
        {/if}
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
      {:else if isToolActionGroupBlock(item)}
        <!-- Tool action group - search, file ops, web research, etc. -->
        <ToolActionGroup
          group={item.group}
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
          {@const expanded = expandedBlocks.has(originalIdx)}
          {@const summary = getToolSummary(tool)}
          {@const isLoading = !result}
          <div class="overflow-hidden">
            <button
              onclick={() => toggleBlock(originalIdx)}
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
                {#if result && !['Read', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch', 'Bash'].includes(tool.name) && !tool.name.startsWith('mcp__multi-session__') && !tool.name.startsWith('mcp__user-interaction__') && !tool.name.startsWith('mcp__navi-context__')}
                  <div class="pt-1">
                    <pre class="text-xs {result.is_error ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20' : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'} rounded p-2 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{resultContent}</pre>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
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
        {@const thinking = (item as ThinkingBlock).thinking}
        {@const expanded = expandedBlocks.has(idx)}
        <div class="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-900/20 overflow-hidden">
          <button
            onclick={() => toggleBlock(idx)}
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
          >
            <span class="text-xs">💭</span>
            <span class="text-xs font-medium text-purple-700 dark:text-purple-300">Thinking</span>
            <span class="text-xs text-purple-400 dark:text-purple-500 truncate flex-1">
              {thinking.slice(0, 60)}{thinking.length > 60 ? "..." : ""}
            </span>
            <svg
              class="w-3.5 h-3.5 text-purple-400 dark:text-purple-600 transition-transform shrink-0 {expanded ? 'rotate-90' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {#if expanded}
            <div class="px-3 pb-2 pt-1 border-t border-purple-100 dark:border-purple-800 relative">
              <div class="absolute top-1 right-3">
                <CopyButton text={thinking} />
              </div>
              <pre class="text-xs text-purple-700 dark:text-purple-300 whitespace-pre-wrap font-mono bg-purple-50 dark:bg-purple-900/30 rounded p-2 pr-8 max-h-48 overflow-y-auto">{thinking}</pre>
            </div>
          {/if}
        </div>

      {/if}
    {/each}
    </div>

  </div>

  <!-- Comment Threads (shown inline below message) @experimental -->
  {#if $showComments && messageThreads.length > 0}
    <div class="mt-3 ml-4 flex flex-col gap-2 max-w-sm">
      {#each messageThreads as thread (thread.thread_id)}
        <CommentThread
          {thread}
          {sessionId}
          onClose={() => {}}
          onAskAI={handleAskAI}
        />
      {/each}
    </div>
  {/if}

<!-- Text Selection Context Menu -->
{#if selectionMenu}
  <TextSelectionContextMenu
    x={selectionMenu.x}
    y={selectionMenu.y}
    selectedText={selectionMenu.text}
    onQuote={handleQuote}
    onForkWithQuote={handleForkWithQuote}
    onAddComment={messageId ? handleAddComment : undefined}
    onAskCouncil={onAskCouncil}
    onClose={() => selectionMenu = null}
  />
{/if}

<!-- Comment Input (when adding new comment) @experimental -->
{#if commentInput && messageId && sessionId}
  <CommentInput
    {messageId}
    {sessionId}
    selectionText={commentInput.text}
    x={commentInput.x}
    y={commentInput.y}
    onClose={() => commentInput = null}
    onCreated={handleCommentCreated}
    onAskAI={handleAskAI}
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
