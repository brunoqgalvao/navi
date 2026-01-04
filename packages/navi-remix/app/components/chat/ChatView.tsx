import { useEffect, useRef, useMemo, useState } from "react";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { TodoProgress } from "./TodoProgress";
import { WorkingIndicator } from "./WorkingIndicator";
import { StreamingPreview } from "./StreamingPreview";
import { PermissionRequest } from "./PermissionRequest";
import type { ChatMessage, StreamingState, Todo } from "~/lib/types";
import type { ContentBlock } from "~/lib/claude";

interface PendingPermissionRequest {
  requestId: string;
  tools: string[];
  toolInput?: Record<string, unknown>;
  message: string;
}

interface ChatViewProps {
  messages: ChatMessage[];
  streamingState?: StreamingState;
  projectPath?: string;
  renderMarkdown?: (content: string) => string;
  jsonBlocksMap?: Map<string, any>;
  todos?: Todo[];
  isLoading?: boolean;
  autoScroll?: boolean;
  activeSubagents?: Map<string, { elapsed: number }>;
  pendingPermissionRequest?: PendingPermissionRequest | null;
  emptyState?: "start" | "continue" | "none";
  editingMessageId?: string | null;
  editingMessageContent?: string;
  onEditMessage?: (msgId: string) => void;
  onSaveEdit?: (content: string) => void;
  onCancelEdit?: () => void;
  onEditContentChange?: (content: string) => void;
  onRollback?: (msgId: string) => void;
  onFork?: (msgId: string) => void;
  onPreview?: (path: string) => void;
  onMessageClick?: (e: React.MouseEvent) => void;
  onPermissionApprove?: (approveAll?: boolean) => void;
  onPermissionDeny?: () => void;
}

export function ChatView({
  messages,
  streamingState,
  projectPath = "",
  renderMarkdown,
  jsonBlocksMap = new Map(),
  todos = [],
  isLoading = false,
  autoScroll = true,
  activeSubagents = new Map(),
  pendingPermissionRequest = null,
  emptyState = "start",
  editingMessageId = null,
  editingMessageContent = "",
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onRollback,
  onFork,
  onPreview,
  onMessageClick,
  onPermissionApprove,
  onPermissionDeny,
}: ChatViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Filter out tool_result only messages
  const visibleMessages = useMemo(() => {
    return messages.filter((m) => {
      // Filter out subagent messages (those with parentToolUseId)
      if (m.parentToolUseId) return false;
      // Filter out tool_result only user messages
      if (m.role === "user" && Array.isArray(m.content)) {
        const blocks = m.content as ContentBlock[];
        if (blocks.length === 0) return true;
        const hasToolResult = blocks.some((b) => b.type === "tool_result");
        const hasOtherBlocks = blocks.some((b) => b.type !== "tool_result");
        return !hasToolResult || hasOtherBlocks;
      }
      return true;
    });
  }, [messages]);

  // Get all tool results from messages
  const allToolResults = useMemo(() => {
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
  }, [messages]);

  // Get subagent messages
  const subagentMessages = useMemo(() => {
    return messages.filter((m) => m.parentToolUseId);
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingState, autoScroll]);

  const isStreaming = streamingState?.isStreaming ?? false;

  const formatUserContent = (content: ContentBlock[] | string): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text || "")
        .filter(Boolean)
        .join("\n");
    }
    return "";
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full md:pt-6 space-y-3 pb-64 px-4">
        {/* Empty state */}
        {visibleMessages.length === 0 && !isStreaming && emptyState !== "none" && (
          <div className="flex flex-col items-center justify-center text-gray-400 space-y-4 min-h-[40vh] animate-in fade-in duration-500">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <p className="text-sm">
              {emptyState === "continue"
                ? "Continue the conversation..."
                : "Start the conversation..."}
            </p>
          </div>
        )}

        {/* Messages */}
        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className={`group flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            {msg.role === "user" && (
              <UserMessage
                content={formatUserContent(msg.content)}
                timestamp={msg.timestamp}
                basePath={projectPath}
                isEditing={editingMessageId === msg.id}
                editContent={editingMessageContent}
                onEdit={() => onEditMessage?.(msg.id)}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onEditContentChange={onEditContentChange}
                onRollback={() => onRollback?.(msg.id)}
                onFork={() => onFork?.(msg.id)}
                onPreview={onPreview}
              />
            )}

            {msg.role === "system" && (
              <div
                className={`w-full border rounded-lg px-4 py-2.5 text-xs break-all ${
                  typeof msg.content === "string" &&
                  msg.content.startsWith("Error:")
                    ? "bg-red-50 border-red-100 text-red-800"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                }`}
              >
                {typeof msg.content === "string" ? msg.content : "System message"}
              </div>
            )}

            {msg.role === "assistant" && (
              <AssistantMessage
                content={Array.isArray(msg.content) ? msg.content : []}
                basePath={projectPath}
                toolResults={allToolResults}
                subagentUpdates={subagentMessages}
                activeSubagents={activeSubagents}
                renderMarkdown={renderMarkdown}
                jsonBlocksMap={jsonBlocksMap}
                onPreview={onPreview}
                onRollback={() => onRollback?.(msg.id)}
                onFork={() => onFork?.(msg.id)}
                onMessageClick={onMessageClick}
              />
            )}
          </div>
        ))}

        {/* Streaming preview */}
        {isStreaming && streamingState && renderMarkdown && (
          <div className="group flex flex-col items-start">
            <StreamingPreview
              blocks={streamingState.currentBlocks}
              partialText={streamingState.partialText}
              partialThinking={streamingState.partialThinking}
              renderMarkdown={renderMarkdown}
              jsonBlocksMap={jsonBlocksMap}
            />
          </div>
        )}

        {/* Permission request */}
        {pendingPermissionRequest && (
          <PermissionRequest
            requestId={pendingPermissionRequest.requestId}
            toolName={pendingPermissionRequest.tools[0]}
            toolInput={pendingPermissionRequest.toolInput}
            message={pendingPermissionRequest.message}
            onApprove={(approveAll) => onPermissionApprove?.(approveAll)}
            onDeny={() => onPermissionDeny?.()}
          />
        )}

        {/* Todo progress */}
        {todos.length > 0 && <TodoProgress todos={todos} />}

        {/* Loading indicator */}
        {isLoading && !isStreaming && (
          <div className="h-8 flex items-center">
            <WorkingIndicator label="Thinking..." />
          </div>
        )}

        {/* Anchor for scrolling */}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>
    </div>
  );
}
