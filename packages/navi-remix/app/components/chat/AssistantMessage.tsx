import { useMemo } from "react";
import { CopyButton } from "~/components/ui";
import type { ContentBlock, TextBlock, ToolUseBlock, ThinkingBlock } from "~/lib/claude";

interface AssistantMessageProps {
  content: ContentBlock[];
  timestamp?: Date;
  isStreaming?: boolean;
}

export function AssistantMessage({
  content,
  timestamp,
  isStreaming = false,
}: AssistantMessageProps) {
  const textContent = useMemo(() => {
    return content
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }, [content]);

  const renderBlock = (block: ContentBlock, index: number) => {
    switch (block.type) {
      case "text":
        return (
          <div key={index} className="prose prose-invert prose-sm max-w-none">
            <p className="whitespace-pre-wrap">{block.text}</p>
          </div>
        );

      case "thinking":
        return (
          <details
            key={index}
            className="mt-2 bg-zinc-800/50 rounded-lg border border-zinc-700"
          >
            <summary className="px-3 py-2 cursor-pointer text-sm text-zinc-400 hover:text-zinc-200">
              Thinking...
            </summary>
            <div className="px-3 py-2 text-sm text-zinc-400 border-t border-zinc-700">
              <p className="whitespace-pre-wrap">{(block as ThinkingBlock).thinking}</p>
            </div>
          </details>
        );

      case "tool_use":
        const toolBlock = block as ToolUseBlock;
        return (
          <div
            key={index}
            className="mt-2 bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden"
          >
            <div className="px-3 py-2 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2">
              <span className="text-xs font-mono text-amber-400">
                {toolBlock.name}
              </span>
            </div>
            <pre className="px-3 py-2 text-xs text-zinc-400 overflow-x-auto">
              {JSON.stringify(toolBlock.input, null, 2)}
            </pre>
          </div>
        );

      case "tool_result":
        return (
          <div
            key={index}
            className="mt-2 bg-zinc-800/30 rounded-lg border border-zinc-700/50 p-3"
          >
            <p className="text-xs text-zinc-500 mb-1">Tool Result</p>
            <pre className="text-xs text-zinc-400 whitespace-pre-wrap">
              {typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content, null, 2)}
            </pre>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex mb-4">
      <div className="max-w-[85%] bg-zinc-800 text-zinc-100 rounded-lg px-4 py-3 relative group">
        {/* Copy button */}
        {textContent && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={textContent} />
          </div>
        )}

        {/* Content blocks */}
        <div className="space-y-2">
          {content.map((block, i) => renderBlock(block, i))}
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-1 mt-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            <span
              className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        )}

        {/* Timestamp */}
        {timestamp && !isStreaming && (
          <p className="text-xs text-zinc-500 mt-2">
            {timestamp.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
