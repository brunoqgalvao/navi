<script lang="ts">
  import { onDestroy } from "svelte";
  import UserMessage from "./UserMessage.svelte";
  import UserCommandMessage from "./UserCommandMessage.svelte";
  import AssistantMessage from "./AssistantMessage.svelte";
  import PermissionRequest from "./PermissionRequest.svelte";
  import QuestionPrompt from "./QuestionPrompt.svelte";
  import TodoProgress from "./TodoProgress.svelte";
  import StreamingPreview from "./StreamingPreview.svelte";
  import WorkingIndicator from "./WorkingIndicator.svelte";
  import { streamingStore, type StreamingState } from "../handlers";
  import { sessionMessages, loadingSessions, sessionTodos, type ChatMessage, type SessionPaginationState } from "../stores";
  import type { ContentBlock } from "../claude";
  import BackgroundProcessBadge from "./BackgroundProcessBadge.svelte";
  import EmptyStateWelcome from "./EmptyStateWelcome.svelte";
  import SessionBreadcrumbs from "../features/session-hierarchy/components/SessionBreadcrumbs.svelte";
  import EscalationBanner from "../features/session-hierarchy/components/EscalationBanner.svelte";
  import ChildSessionsPanel from "../features/session-hierarchy/components/ChildSessionsPanel.svelte";
  import ChildSessionCard from "../features/session-hierarchy/components/ChildSessionCard.svelte";
  import { sessionHierarchyApi, parseEscalation, type Escalation, type HierarchySession, isActiveStatus } from "../features/session-hierarchy";
  import { loadMoreMessages } from "../actions/session-actions";

  interface Props {
    sessionId: string | null;
    projectPath?: string;
    activeSubagents?: Map<string, { elapsed: number }>;
    pendingPermissionRequest?: {
      requestId: string;
      tools: string[];
      toolInput?: Record<string, unknown>;
      message: string;
    } | null;
    pendingQuestion?: {
      requestId: string;
      questions: Array<{
        question: string;
        header: string;
        options: Array<{ label: string; description: string }>;
        multiSelect: boolean;
      }>;
    } | null;
    emptyState?: "start" | "continue" | "none";
    jsonBlocksMap?: Map<string, any>;
    shellBlocksMap?: Map<string, { code: string; language: string }>;
    renderMarkdown: (content: string) => string;
    onEditMessage?: (msgId: string) => void;
    onSaveEdit?: (content: string) => void;
    onCancelEdit?: () => void;
    onRollback?: (msgId: string) => void;
    onFork?: (msgId: string) => void;
    onDelete?: (msgId: string) => void;
    onPreview?: (path: string) => void;
    onRunInTerminal?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
    onMessageClick?: (e: MouseEvent) => void;
    onPermissionApprove?: (approveAll?: boolean) => void;
    onPermissionDeny?: () => void;
    onQuestionAnswer?: (answers: Record<string, string | string[]>) => void;
    editingMessageId?: string | null;
    editingMessageContent?: string;
    // Background processes
    onOpenProcesses?: () => void;
    onSuggestionClick?: (prompt: string) => void;
    // Project context for suggestions
    projectContext?: { summary: string; suggestions: string[] } | null;
    // Project info for empty state
    projectDescription?: string | null;
    isGitRepo?: boolean;
    // Worktree mode
    worktreeBranch?: string | null;
    worktreeBaseBranch?: string | null;
    sessionTitle?: string;
    onMergeComplete?: () => void;
    // Session hierarchy (multi-agent)
    sessionHierarchy?: {
      hasParent: boolean;
      isBlocked: boolean;
      escalation?: Escalation | null;
      role?: string | null;
    } | null;
    onSelectHierarchySession?: (session: any) => void;
    onEscalationResolved?: () => void;
  }

  let {
    sessionId,
    projectPath = "",
    activeSubagents = new Map(),
    pendingPermissionRequest = null,
    pendingQuestion = null,
    emptyState = "start",
    jsonBlocksMap = new Map(),
    shellBlocksMap = new Map(),
    renderMarkdown,
    onEditMessage,
    onSaveEdit,
    onCancelEdit,
    onRollback,
    onFork,
    onDelete,
    onPreview,
    onRunInTerminal,
    onSendToClaude,
    onMessageClick,
    onPermissionApprove,
    onPermissionDeny,
    onQuestionAnswer,
    editingMessageId = null,
    editingMessageContent = $bindable(""),
    onOpenProcesses,
    onSuggestionClick,
    projectContext = null,
    projectDescription = null,
    isGitRepo = false,
    worktreeBranch = null,
    worktreeBaseBranch = null,
    sessionTitle = "",
    onMergeComplete,
    sessionHierarchy = null,
    onSelectHierarchySession,
    onEscalationResolved,
  }: Props = $props();

  let messagesMap = $state<Map<string, ChatMessage[]>>(new Map());
  let streamingMap = $state<Map<string, StreamingState>>(new Map());
  let paginationMap = $state<Map<string, SessionPaginationState>>(new Map());
  let childSessions = $state<HierarchySession[]>([]);
  let childSessionsRefreshInterval: ReturnType<typeof setInterval> | null = null;

  // Store unsubscribe functions to prevent memory leaks
  const unsubMessages = sessionMessages.subscribe(v => messagesMap = v);
  const unsubStreaming = streamingStore.subscribe(v => streamingMap = v);
  const unsubPagination = sessionMessages.paginationStore.subscribe(v => paginationMap = v);

  // Load child sessions for inline display
  async function loadChildSessions() {
    if (!sessionId || sessionHierarchy?.hasParent) return;
    try {
      childSessions = await sessionHierarchyApi.getChildren(sessionId);
    } catch (e) {
      console.error("Failed to load child sessions:", e);
    }
  }

  // Clean up subscriptions when component is destroyed
  onDestroy(() => {
    unsubMessages();
    unsubStreaming();
    unsubPagination();
    if (childSessionsRefreshInterval) clearInterval(childSessionsRefreshInterval);
  });

  // Load child sessions on mount and refresh periodically
  $effect(() => {
    if (sessionId && (!sessionHierarchy || !sessionHierarchy.hasParent)) {
      loadChildSessions();
      // Clear any existing interval first
      if (childSessionsRefreshInterval) clearInterval(childSessionsRefreshInterval);
      // Refresh every 3 seconds to catch updates
      childSessionsRefreshInterval = setInterval(loadChildSessions, 3000);
    }

    // Cleanup when sessionId changes or hasParent changes
    return () => {
      if (childSessionsRefreshInterval) {
        clearInterval(childSessionsRefreshInterval);
        childSessionsRefreshInterval = null;
      }
    };
  });

  const messages = $derived(sessionId ? (messagesMap.get(sessionId) || []) : []);
  const streamingState = $derived(sessionId ? streamingMap.get(sessionId) : undefined);
  const pagination = $derived(sessionId ? paginationMap.get(sessionId) : undefined);
  const isLoading = $derived(sessionId ? $loadingSessions.has(sessionId) : false);
  const todos = $derived(sessionId ? ($sessionTodos.get(sessionId) || []) : []);
  const isStreaming = $derived(streamingState?.isStreaming ?? false);

  // Split children into active (show inline) and completed (show in panel at bottom)
  const activeChildSessions = $derived(childSessions.filter(c => isActiveStatus(c.agent_status)));
  const completedChildSessions = $derived(childSessions.filter(c => !isActiveStatus(c.agent_status)));

  // Handle loading more messages
  async function handleLoadMore() {
    if (sessionId) {
      await loadMoreMessages(sessionId);
    }
  }

  function getMainMessages(): ChatMessage[] {
    return messages
      .filter(m => !m.parentToolUseId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  function getVisibleMessages(): ChatMessage[] {
    return getMainMessages().filter(m => !isToolResultMessage(m));
  }

  function isFirstInGroup(msg: ChatMessage, visibleMsgs: ChatMessage[], idx: number): boolean {
    if (idx === 0) return true;
    const prevMsg = visibleMsgs[idx - 1];
    if (!prevMsg) return true;
    return prevMsg.role !== msg.role;
  }

  function getSubagentMessages(): ChatMessage[] {
    const subagentMsgs = messages.filter(m => m.parentToolUseId);
    return subagentMsgs;
  }

  function isToolResultMessage(msg: ChatMessage): boolean {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return false;
    const blocks = msg.content as ContentBlock[];
    if (blocks.length === 0) return false;
    const hasToolResult = blocks.some((b) => b.type === "tool_result");
    const hasOtherBlocks = blocks.some((b) => b.type !== "tool_result");
    return hasToolResult && !hasOtherBlocks;
  }

  function getAllToolResults(): Map<string, ContentBlock> {
    const results = new Map<string, ContentBlock>();
    for (const msg of messages) {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === "tool_result") {
            results.set((block as any).tool_use_id, block);
          }
        }
      }
    }
    return results;
  }

  const allToolResults = $derived(getAllToolResults());

  function formatUserContent(content: ContentBlock[] | string): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text || "")
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }

  // Type for mixed timeline items
  type TimelineItem =
    | { type: "message"; data: ChatMessage }
    | { type: "child"; data: HierarchySession };

  // Create a mixed timeline of messages and active child sessions
  function getMixedTimeline(): TimelineItem[] {
    const visibleMsgs = getVisibleMessages();
    const items: TimelineItem[] = [];

    // Convert messages to timeline items
    const messageItems: TimelineItem[] = visibleMsgs.map(m => ({
      type: "message" as const,
      data: m,
    }));

    // Convert active child sessions to timeline items
    const childItems: TimelineItem[] = activeChildSessions.map(c => ({
      type: "child" as const,
      data: c,
    }));

    // Merge and sort by timestamp
    items.push(...messageItems, ...childItems);
    items.sort((a, b) => {
      const timeA = a.type === "message"
        ? a.data.timestamp.getTime()
        : a.data.created_at;
      const timeB = b.type === "message"
        ? b.data.timestamp.getTime()
        : b.data.created_at;
      return timeA - timeB;
    });

    return items;
  }

  const mixedTimeline = $derived(getMixedTimeline());

</script>

<div class="flex flex-col h-full">
  <!-- Fixed header section - only show when inside a child agent session -->
  {#if sessionHierarchy?.hasParent && sessionId}
    <div class="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-3xl mx-auto w-full px-4 py-2">
        <SessionBreadcrumbs
          {sessionId}
          onSelectSession={(sess) => onSelectHierarchySession?.(sess)}
        />
      </div>

      <!-- Escalation banner - show when this child session is blocked -->
      {#if sessionHierarchy.isBlocked && sessionHierarchy.escalation}
        <div class="max-w-3xl mx-auto w-full px-4 py-2">
          <EscalationBanner
            {sessionId}
            escalation={sessionHierarchy.escalation}
            sessionTitle={sessionTitle}
            sessionRole={sessionHierarchy.role || undefined}
            onResolved={() => onEscalationResolved?.()}
          />
        </div>
      {/if}
    </div>
  {/if}

  <!-- Content area - scrolling handled by parent container in App.svelte -->
  <div class="flex-1">
    <div class="max-w-3xl mx-auto w-full md:pt-6 space-y-3 pb-64 px-4" style="overflow-anchor: none;">
    <!-- Background process badge -->
    <div class="flex justify-center">
      <BackgroundProcessBadge {sessionId} onClick={onOpenProcesses} />
    </div>

    <!-- Load more older messages button -->
    {#if pagination?.hasMore}
      <div class="flex justify-center py-3">
        <button
          onclick={handleLoadMore}
          disabled={pagination.isLoadingMore}
          class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {#if pagination.isLoadingMore}
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading...</span>
          {:else}
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
            </svg>
            <span>Load older messages ({pagination.total - pagination.loadedCount} more)</span>
          {/if}
        </button>
      </div>
    {/if}

    {#if messages.length === 0 && !isStreaming && emptyState !== "none"}
      <EmptyStateWelcome {onSuggestionClick} {projectContext} {projectDescription} {isGitRepo} />
    {/if}

    {#each mixedTimeline as item, idx (item.type === 'message' ? item.data.id : `child-${item.data.id}`)}
      {#if item.type === 'child'}
        <!-- Inline child session card -->
        <div class="w-full my-2">
          <ChildSessionCard
            session={item.data}
            onSelect={() => onSelectHierarchySession?.(item.data)}
            onResolveEscalation={() => onEscalationResolved?.()}
          />
        </div>
      {:else}
        {@const msg = item.data}
        <div class="group flex flex-col {msg.role === 'user' && !msg.inlineCommand ? 'items-end' : 'items-start'}">
          {#if msg.role === 'user' && msg.inlineCommand}
            <UserCommandMessage
              command={msg.inlineCommand.command}
              cwd={msg.inlineCommand.cwd || projectPath}
              timestamp={msg.timestamp}
              onOpenInDock={onRunInTerminal}
              {onSendToClaude}
            />
          {:else if msg.role === 'user'}
            <UserMessage
              content={formatUserContent(msg.content)}
              timestamp={msg.timestamp}
              isEditing={editingMessageId === msg.id}
              bind:editContent={editingMessageContent}
              basePath={projectPath}
              onEdit={() => onEditMessage?.(msg.id)}
              {onSaveEdit}
              onCancelEdit={() => onCancelEdit?.()}
              onRollback={() => onRollback?.(msg.id)}
              onFork={() => onFork?.(msg.id)}
              onDelete={() => onDelete?.(msg.id)}
              {onPreview}
            />
          {:else if msg.role === 'system'}
            {@const content = typeof msg.content === 'string' ? msg.content : ''}
            {@const isError = content.startsWith('Error:')}
            <div class="w-full {isError ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 text-red-800 dark:text-red-300' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'} border rounded-lg px-4 py-2.5 text-xs break-all">
              {content}
            </div>
          {:else if msg.role === 'assistant'}
            <AssistantMessage
              content={msg.content as ContentBlock[]}
              subagentUpdates={getSubagentMessages()}
              {activeSubagents}
              basePath={projectPath}
              toolResults={allToolResults}
              onRollback={() => onRollback?.(msg.id)}
              onFork={() => onFork?.(msg.id)}
              onDelete={() => onDelete?.(msg.id)}
              {onPreview}
              {onRunInTerminal}
              {onSendToClaude}
              {onMessageClick}
              {renderMarkdown}
              {jsonBlocksMap}
              {shellBlocksMap}
              sessionId={sessionId ?? ''}
            />
          {/if}
        </div>
      {/if}
    {/each}

    {#if isStreaming && streamingState}
      <div class="group flex flex-col items-start">
        <StreamingPreview
          blocks={streamingState.currentBlocks}
          partialText={streamingState.partialText}
          partialThinking={streamingState.partialThinking}
          {renderMarkdown}
          {jsonBlocksMap}
          {shellBlocksMap}
          {onRunInTerminal}
        />
      </div>
    {/if}

    {#if pendingPermissionRequest}
      <PermissionRequest
        requestId={pendingPermissionRequest.requestId}
        toolName={pendingPermissionRequest.tools[0]}
        toolInput={pendingPermissionRequest.toolInput}
        message={pendingPermissionRequest.message}
        onApprove={(approveAll) => onPermissionApprove?.(approveAll)}
        onDeny={() => onPermissionDeny?.()}
      />
    {/if}

    {#if pendingQuestion}
      <QuestionPrompt
        requestId={pendingQuestion.requestId}
        questions={pendingQuestion.questions}
        onAnswer={(answers) => onQuestionAnswer?.(answers)}
      />
    {/if}

    <!-- Completed child sessions panel - show at bottom for completed agents only -->
    {#if completedChildSessions.length > 0}
      <details class="completed-children-panel my-4 group" open={false}>
        <summary class="flex items-center gap-2 mb-2 cursor-pointer select-none list-none">
          <svg class="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
          </svg>
          <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">
            {completedChildSessions.length} Completed Agent{completedChildSessions.length > 1 ? 's' : ''}
          </span>
        </summary>
        <div class="space-y-2 mt-2 border-l-2 border-gray-200 pl-3">
          {#each completedChildSessions as child (child.id)}
            <ChildSessionCard
              session={child}
              onSelect={() => onSelectHierarchySession?.(child)}
            />
          {/each}
        </div>
      </details>
    {/if}

    {#if todos.length > 0}
      <TodoProgress {todos} showWhenEmpty={false} />
    {:else if isLoading && !isStreaming}
      <div class="h-8 flex items-center">
        <WorkingIndicator variant="doodle" size="md" label="Thinking..." />
      </div>
    {/if}

    <div style="overflow-anchor: auto; height: 1px;"></div>
    </div>
  </div>
</div>
