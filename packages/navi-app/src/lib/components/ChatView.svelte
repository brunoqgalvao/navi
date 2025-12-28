<script lang="ts">
  import UserMessage from "./UserMessage.svelte";
  import UserCommandMessage from "./UserCommandMessage.svelte";
  import AssistantMessage from "./AssistantMessage.svelte";
  import PermissionRequest from "./PermissionRequest.svelte";
  import TodoProgress from "./TodoProgress.svelte";
  import StreamingPreview from "./StreamingPreview.svelte";
  import WorkingIndicator from "./WorkingIndicator.svelte";
  import ContextWarning from "./ContextWarning.svelte";
  import { streamingStore, type StreamingState } from "../handlers";
  import { sessionMessages, loadingSessions, sessionTodos, type ChatMessage } from "../stores";
  import type { ContentBlock } from "../claude";

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
    editingMessageId?: string | null;
    editingMessageContent?: string;
    // Context management
    inputTokens?: number;
    contextWindow?: number;
    isPruned?: boolean;
    onPruneToolResults?: () => void;
    onStartNewChat?: () => void;
  }

  let { 
    sessionId,
    projectPath = "",
    activeSubagents = new Map(),
    pendingPermissionRequest = null,
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
    editingMessageId = null,
    editingMessageContent = $bindable(""),
    inputTokens = 0,
    contextWindow = 200000,
    isPruned = false,
    onPruneToolResults,
    onStartNewChat,
  }: Props = $props();

  const usagePercent = $derived(
    contextWindow > 0 ? Math.min(100, Math.round((inputTokens / contextWindow) * 100)) : 0
  );

  let messagesMap = $state<Map<string, ChatMessage[]>>(new Map());
  let streamingMap = $state<Map<string, StreamingState>>(new Map());
  
  sessionMessages.subscribe(v => messagesMap = v);
  streamingStore.subscribe(v => streamingMap = v);
  
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
    return messages.filter(m => m.parentToolUseId);
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
    {#if messages.length === 0 && !isStreaming && emptyState !== "none"}
      <div class="flex flex-col items-center justify-center text-gray-400 space-y-6 min-h-[40vh] animate-in fade-in duration-500">
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center shadow-sm">
          <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
          </svg>
        </div>
        <div class="text-center space-y-2">
          <p class="text-xl font-medium text-gray-600">What would you like to build?</p>
          <p class="text-sm text-gray-400">Ask a question, describe a feature, or paste some code</p>
        </div>
      </div>
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

    {#if todos.length > 0}
      <TodoProgress {todos} showWhenEmpty={false} />
    {:else if isLoading && !isStreaming}
    <div class="h-8 flex items-center">
      <WorkingIndicator variant="dots" size="xs" color="gray" label="Thinking..." />
    </div>
    {/if}

    {#if (usagePercent >= 80 || isPruned) && onPruneToolResults && onStartNewChat}
      <div class="mt-4">
        <ContextWarning
          {usagePercent}
          {inputTokens}
          {contextWindow}
          {isPruned}
          {onPruneToolResults}
          {onStartNewChat}
        />
      </div>
    {/if}

    <div style="overflow-anchor: auto; height: 1px;"></div>
  </div>
</div>
