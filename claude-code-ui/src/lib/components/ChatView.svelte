<script lang="ts">
  import UserMessage from "./UserMessage.svelte";
  import AssistantMessage from "./AssistantMessage.svelte";
  import PermissionRequest from "./PermissionRequest.svelte";
  import TodoProgress from "./TodoProgress.svelte";
  import StreamingPreview from "./StreamingPreview.svelte";
  import { chatStore, type AgentUpdate, type StreamingState } from "../handlers";
  import { loadingSessions, sessionTodos } from "../stores";
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
    renderMarkdown: (content: string) => string;
    onEditMessage?: (msgId: string) => void;
    onSaveEdit?: (content: string) => void;
    onCancelEdit?: () => void;
    onRollback?: (msgId: string) => void;
    onFork?: (msgId: string) => void;
    onPreview?: (path: string) => void;
    onMessageClick?: (e: MouseEvent) => void;
    onPermissionApprove?: (approveAll?: boolean) => void;
    onPermissionDeny?: () => void;
    editingMessageId?: string | null;
    editingMessageContent?: string;
  }

  let { 
    sessionId,
    projectPath = "",
    activeSubagents = new Map(),
    pendingPermissionRequest = null,
    emptyState = "start",
    jsonBlocksMap = new Map(),
    renderMarkdown,
    onEditMessage,
    onSaveEdit,
    onCancelEdit,
    onRollback,
    onFork,
    onPreview,
    onMessageClick,
    onPermissionApprove,
    onPermissionDeny,
    editingMessageId = null,
    editingMessageContent = $bindable(""),
  }: Props = $props();

  let updatesMap = $state<Map<string, AgentUpdate[]>>(new Map());
  let streamingMap = $state<Map<string, StreamingState>>(new Map());
  
  chatStore.subscribe(v => updatesMap = v);
  chatStore.streaming.subscribe(v => streamingMap = v);
  
  const updates = $derived(sessionId ? (updatesMap.get(sessionId) || []) : []);
  const streamingState = $derived(sessionId ? streamingMap.get(sessionId) : undefined);
  const isLoading = $derived(sessionId ? $loadingSessions.has(sessionId) : false);
  const todos = $derived(sessionId ? ($sessionTodos.get(sessionId) || []) : []);
  const isStreaming = $derived(streamingState?.isStreaming ?? false);

  function getMainUpdates(): AgentUpdate[] {
    return updates
      .filter(u => !u.parentToolUseId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  function getSubagentUpdates(): AgentUpdate[] {
    return updates.filter(u => u.parentToolUseId);
  }

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

<div class="space-y-6">
  <div class="max-w-3xl mx-auto w-full md:pt-10 space-y-8 pb-64" style="overflow-anchor: none;">
    {#if updates.length === 0 && !isStreaming && emptyState !== "none"}
      <div class="flex flex-col items-center justify-center text-gray-400 space-y-4 min-h-[40vh] animate-in fade-in duration-500">
        <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
          <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
          </svg>
        </div>
        {#if emptyState === "continue"}
          <p class="text-sm">Continue the conversation...</p>
        {:else}
          <p class="text-sm">Start the conversation...</p>
        {/if}
      </div>
    {/if}

    {#each getMainUpdates() as update (update.id)}
      <div class="group flex flex-col {update.type === 'user' ? 'items-end' : 'items-start'}">
        {#if update.type === 'user'}
          <UserMessage
            content={formatUserContent(update.content)}
            timestamp={new Date(update.timestamp)}
            isEditing={editingMessageId === update.id}
            bind:editContent={editingMessageContent}
            basePath={projectPath}
            onEdit={() => onEditMessage?.(update.id)}
            {onSaveEdit}
            onCancelEdit={() => onCancelEdit?.()}
            onRollback={() => onRollback?.(update.id)}
            onFork={() => onFork?.(update.id)}
            {onPreview}
          />
        {:else if update.type === 'system'}
          {@const content = typeof update.content === 'string' ? update.content : ''}
          {@const isError = content.startsWith('Error:')}
          <div class="w-full {isError ? 'bg-red-50 border-red-100 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-500'} border rounded-lg px-4 py-2.5 text-xs break-all">
            {content}
          </div>
        {:else if update.type === 'assistant'}
          <AssistantMessage
            content={update.content as ContentBlock[]}
            subagentUpdates={getSubagentUpdates()}
            {activeSubagents}
            basePath={projectPath}
            onRollback={() => onRollback?.(update.id)}
            onFork={() => onFork?.(update.id)}
            {onPreview}
            {onMessageClick}
            {renderMarkdown}
            {jsonBlocksMap}
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

    {#if isLoading || isStreaming}
      <TodoProgress {todos} showWhenEmpty={true} />
    {/if}
    
    <div style="overflow-anchor: auto; height: 1px;"></div>
  </div>
</div>
