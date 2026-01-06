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
  import { sessionMessages, loadingSessions, sessionTodos, type ChatMessage } from "../stores";
  import type { ContentBlock } from "../claude";
  import BackgroundProcessBadge from "./BackgroundProcessBadge.svelte";
  import EmptyStateWelcome from "./EmptyStateWelcome.svelte";

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
  }: Props = $props();

  const usagePercent = $derived(
    contextWindow > 0 ? Math.min(100, Math.round((inputTokens / contextWindow) * 100)) : 0
  );

  let messagesMap = $state<Map<string, ChatMessage[]>>(new Map());
  let streamingMap = $state<Map<string, StreamingState>>(new Map());

  // Store unsubscribe functions to prevent memory leaks
  const unsubMessages = sessionMessages.subscribe(v => messagesMap = v);
  const unsubStreaming = streamingStore.subscribe(v => streamingMap = v);

  // Clean up subscriptions when component is destroyed
  onDestroy(() => {
    unsubMessages();
    unsubStreaming();
  });

  const messages = $derived(sessionId ? (messagesMap.get(sessionId) || []) : []);
  const streamingState = $derived(sessionId ? streamingMap.get(sessionId) : undefined);
  const isLoading = $derived(sessionId ? $loadingSessions.has(sessionId) : false);
  const todos = $derived(sessionId ? ($sessionTodos.get(sessionId) || []) : []);
  const isStreaming = $derived(streamingState?.isStreaming ?? false);

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
  <div class="max-w-3xl mx-auto w-full md:pt-6 space-y-3 pb-64 px-4" style="overflow-anchor: none;">
    <!-- Background process badge -->
    <div class="flex justify-center">
      <BackgroundProcessBadge {sessionId} onClick={onOpenProcesses} />
    </div>

    {#if messages.length === 0 && !isStreaming && emptyState !== "none"}
      <EmptyStateWelcome {onSuggestionClick} />
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
