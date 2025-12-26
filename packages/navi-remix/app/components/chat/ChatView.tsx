import { useEffect, useRef } from "react";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import type { ChatMessage } from "~/lib/types";
import type { StreamingState } from "~/lib/types";

interface ChatViewProps {
  messages: ChatMessage[];
  streamingState?: StreamingState;
  autoScroll?: boolean;
}

export function ChatView({
  messages,
  streamingState,
  autoScroll = true,
}: ChatViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingState, autoScroll]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
      {messages.length === 0 && !streamingState?.isStreaming ? (
        <div className="flex items-center justify-center h-full text-zinc-500">
          <p>No messages yet. Start a conversation!</p>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto">
          {messages.map((message) => {
            if (message.role === "user") {
              return (
                <UserMessage
                  key={message.id}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              );
            }

            if (message.role === "assistant") {
              return (
                <AssistantMessage
                  key={message.id}
                  content={
                    Array.isArray(message.content) ? message.content : []
                  }
                  timestamp={message.timestamp}
                />
              );
            }

            if (message.role === "system") {
              return (
                <div
                  key={message.id}
                  className="flex justify-center mb-4"
                >
                  <div className="text-xs text-zinc-500 bg-zinc-800/50 px-3 py-1 rounded-full">
                    {typeof message.content === "string"
                      ? message.content
                      : "System message"}
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Streaming content */}
          {streamingState?.isStreaming &&
            streamingState.currentBlocks.length > 0 && (
              <AssistantMessage
                content={streamingState.currentBlocks}
                isStreaming={true}
              />
            )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
