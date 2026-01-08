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
  import ContextWarning from "./ContextWarning.svelte";
  import { streamingStore, type StreamingState } from "../handlers";
  import { sessionMessages, loadingSessions, sessionTodos, type ChatMessage, type SessionPaginationState } from "../stores";
  import type { ContentBlock } from "../claude";
  import BackgroundProcessBadge from "./BackgroundProcessBadge.svelte";
  import EmptyStateWelcome from "./EmptyStateWelcome.svelte";
  import SessionBreadcrumbs from "../features/session-hierarchy/components/SessionBreadcrumbs.svelte";
  import EscalationBanner from "../features/session-hierarchy/components/EscalationBanner.svelte";
  import { sessionHierarchyApi, parseEscalation, type Escalation } from "../features/session-hierarchy";
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
    // Context management
    inputTokens?: number;
    contextWindow?: number;
    isPruned?: boolean;
    isCompacting?: boolean;
    onPruneToolResults?: () => void;
    onSDKCompact?: () => void;
    onStartNewChat?: () => void;
    // Background processes
    onOpenProcesses?: () => void;
    onSuggestionClick?: (prompt: string) => void;
    // Project context for suggestions
    projectContext?: { summary: string; suggestions: string[] } | null;
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
    inputTokens = 0,
    contextWindow = 200000,
    isPruned = false,
    isCompacting = false,
    onPruneToolResults,
    onSDKCompact,
    onStartNewChat,
    onOpenProcesses,
    onSuggestionClick,
    projectContext = null,
    worktreeBranch = null,
    worktreeBaseBranch = null,
    sessionTitle = "",
    onMergeComplete,
    sessionHierarchy = null,
    onSelectHierarchySession,
    onEscalationResolved,
  }: Props = $props();

  const usagePercent = $derived(
    contextWindow > 0 ? Math.min(100, Math.round((inputTokens / contextWindow) * 100)) : 0
  );

  let messagesMap = $state<Map<string, ChatMessage[]>>(new Map());
  let streamingMap = $state<Map<string, StreamingState>>(new Map());
  let paginationMap = $state<Map<string, SessionPaginationState>>(new Map());

  // Store unsubscribe functions to prevent memory leaks
  const unsubMessages = sessionMessages.subscribe(v => messagesMap = v);
  const unsubStreaming = streamingStore.subscribe(v => streamingMap = v);
  const unsubPagination = sessionMessages.paginationStore.subscribe(v => paginationMap = v);

  // Clean up subscriptions when component is destroyed
  onDestroy(() => {
    unsubMessages();
    unsubStreaming();
    unsubPagination();
  });

  const messages = $derived(sessionId ? (messagesMap.get(sessionId) || []) : []);
  const streamingState = $derived(sessionId ? streamingMap.get(sessionId) : undefined);
  const pagination = $derived(sessionId ? paginationMap.get(sessionId) : undefined);
  const isLoading = $derived(sessionId ? $loadingSessions.has(sessionId) : false);
  const todos = $derived(sessionId ? ($sessionTodos.get(sessionId) || []) : []);
  const isStreaming = $derived(streamingState?.isStreaming ?? false);

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
    if (subagentMsgs.length > 0) {
      console.log("[ChatView] Found", subagentMsgs.length, "subagent messages:",
        subagentMsgs.map(m => ({ id: m.id, role: m.role, parentToolUseId: m.parentToolUseId })));
    }
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

</script>

<div class="space-y-2">

  <!-- Session hierarchy breadcrumbs - show when session has a parent -->
  {#if sessionHierarchy?.hasParent && sessionId}
    <div class="max-w-3xl mx-auto w-full px-4">
      <SessionBreadcrumbs
        {sessionId}
        onSelectSession={(sess) => onSelectHierarchySession?.(sess)}
      />
    </div>
  {/if}

  <!-- Escalation banner - show when session is blocked -->
  {#if sessionHierarchy?.isBlocked && sessionHierarchy.escalation && sessionId}
    <div class="max-w-3xl mx-auto w-full px-4">
      <EscalationBanner
        {sessionId}
        escalation={sessionHierarchy.escalation}
        sessionTitle={sessionTitle}
        sessionRole={sessionHierarchy.role || undefined}
        onResolved={() => onEscalationResolved?.()}
      />
    </div>
  {/if}

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
      <EmptyStateWelcome {onSuggestionClick} {projectContext} />
    {/if}

    {#each getVisibleMessages() as msg, idx (msg.id)}
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
          <div class="w-full {isError ? 'bg-red-50 border-red-100 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-500'} border rounded-lg px-4 py-2.5 text-xs break-all">
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
          />
        {/if}
      </div>
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

    {#if todos.length > 0}
      <TodoProgress {todos} showWhenEmpty={false} />
    {:else if isLoading && !isStreaming}
    <div class="h-8 flex items-center">
      <WorkingIndicator variant="dots" size="xs" color="gray" label="Thinking..." />
    </div>
    {/if}

    {#if (usagePercent >= 80 || isPruned || isCompacting) && onPruneToolResults && onStartNewChat}
      <div class="mt-4">
        <ContextWarning
          {usagePercent}
          {inputTokens}
          {contextWindow}
          {isPruned}
          {isCompacting}
          {onPruneToolResults}
          {onSDKCompact}
          {onStartNewChat}
        />
      </div>
    {/if}

    <div style="overflow-anchor: auto; height: 1px;"></div>
  </div>
</div>
