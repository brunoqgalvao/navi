import { useMemo } from "react";
import type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
} from "~/lib/claude";
import { WorkingIndicator } from "./WorkingIndicator";
import { MermaidRenderer } from "./MermaidRenderer";

interface StreamingPreviewProps {
  blocks: ContentBlock[];
  partialText: string;
  partialThinking?: string;
  renderMarkdown: (content: string) => string;
  jsonBlocksMap?: Map<string, any>;
}

interface DisplayBlock {
  block: ContentBlock;
  isStreaming: boolean;
  streamingContent?: string;
}

const toolIcons: Record<string, string> = {
  Read: "📄",
  Write: "✏️",
  Edit: "🔧",
  MultiEdit: "🔧",
  Bash: "⚡",
  Glob: "🔍",
  Grep: "🔎",
  WebFetch: "🌐",
  WebSearch: "🔍",
};

export function StreamingPreview({
  blocks,
  partialText,
  partialThinking = "",
  renderMarkdown,
  jsonBlocksMap = new Map(),
}: StreamingPreviewProps) {
  const displayBlocks = useMemo((): DisplayBlock[] => {
    return blocks.map((block, idx) => {
      const isLast = idx === blocks.length - 1;
      if (isLast) {
        if (block.type === "text") {
          return {
            block,
            isStreaming: true,
            streamingContent: partialText || (block as TextBlock).text,
          };
        }
        if (block.type === "thinking") {
          return {
            block,
            isStreaming: true,
            streamingContent: partialThinking || (block as ThinkingBlock).thinking,
          };
        }
        if (block.type === "tool_use") {
          return { block, isStreaming: true };
        }
      }
      return { block, isStreaming: false };
    });
  }, [blocks, partialText, partialThinking]);

  return (
    <div className="flex gap-4 w-full pr-4 md:pr-0 animate-in fade-in duration-150">
      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center shadow-sm">
        <WorkingIndicator variant="spinner" size="md" color="gray" />
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {displayBlocks.map(({ block, isStreaming, streamingContent }, idx) => (
          <div key={idx} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
            {block.type === "text" && (
              <div className="text-[15px] leading-7 text-gray-800 markdown-body">
                <MermaidRenderer
                  content={streamingContent || (block as TextBlock).text || ""}
                  renderMarkdown={renderMarkdown}
                  jsonBlocksMap={jsonBlocksMap}
                />
                {isStreaming && (
                  <span className="inline-block w-0.5 h-5 bg-blue-500 ml-0.5 align-middle animate-pulse" />
                )}
              </div>
            )}

            {block.type === "thinking" && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/30 shadow-sm p-4 transition-all duration-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">💭</span>
                  </div>
                  <span className="text-sm font-medium text-purple-800">
                    Thinking
                  </span>
                  <WorkingIndicator variant="dots" size="xs" color="purple" />
                </div>
                <pre className="text-xs text-purple-700 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto pl-10">
                  {streamingContent || (block as ThinkingBlock).thinking || ""}
                </pre>
              </div>
            )}

            {block.type === "tool_use" && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">
                      {toolIcons[(block as ToolUseBlock).name] || "⚙️"}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {(block as ToolUseBlock).name}
                  </span>
                  <WorkingIndicator variant="dots" size="xs" color="gray" />
                </div>
              </div>
            )}
          </div>
        ))}

        {blocks.length === 0 && (
          <div className="h-8 flex items-center">
            <WorkingIndicator
              variant="dots"
              size="xs"
              color="gray"
              label="Thinking..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
