import { useState, useMemo } from "react";
import { CopyButton } from "~/components/ui";
import type {
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
  ToolResultBlock,
} from "~/lib/claude";
import type { ChatMessage } from "~/lib/types";
import { ToolRenderer } from "~/components/tools/ToolRenderer";
import { SubagentBlock } from "./SubagentBlock";
import { MermaidRenderer } from "./MermaidRenderer";
import { MediaDisplay } from "./MediaDisplay";
import { parseMediaContent } from "~/lib/media-parser";

interface AssistantMessageProps {
  content: ContentBlock[];
  basePath?: string;
  toolResults?: Map<string, ContentBlock>;
  subagentUpdates?: ChatMessage[];
  activeSubagents?: Map<string, { elapsed: number }>;
  isStreaming?: boolean;
  partialText?: string;
  renderMarkdown?: (content: string) => string;
  jsonBlocksMap?: Map<string, any>;
  onPreview?: (path: string) => void;
  onRollback?: () => void;
  onFork?: () => void;
  onMessageClick?: (e: React.MouseEvent) => void;
}

interface GroupedBlock {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  originalIndex: number;
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
  Task: "🤖",
  TodoWrite: "📋",
};

const toolColors: Record<string, { bg: string; text: string; border: string }> = {
  Read: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  Write: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  Edit: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  MultiEdit: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  Bash: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  Glob: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  Grep: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  WebFetch: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  WebSearch: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  Task: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  TodoWrite: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
};

function getToolIcon(name: string): string {
  return toolIcons[name] || "⚙️";
}

function getToolColor(name: string) {
  return toolColors[name] || { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" };
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
      try {
        return new URL(input.url || "").hostname;
      } catch {
        return "";
      }
    case "WebSearch":
      return input.query || "";
    default:
      return "";
  }
}

function isGroupedBlock(
  item: ContentBlock | GroupedBlock
): item is GroupedBlock {
  return "toolUse" in item && "originalIndex" in item;
}

export function AssistantMessage({
  content,
  basePath = "",
  toolResults = new Map(),
  subagentUpdates = [],
  activeSubagents = new Map(),
  isStreaming = false,
  partialText = "",
  renderMarkdown,
  jsonBlocksMap = new Map(),
  onPreview,
  onRollback,
  onFork,
  onMessageClick,
}: AssistantMessageProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());

  const toggleBlock = (idx: number) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const copyText = useMemo(() => {
    return content
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .filter(Boolean)
      .join("\n");
  }, [content]);

  // Group tool blocks with their results
  const groupedContent = useMemo(() => {
    const grouped: (ContentBlock | GroupedBlock)[] = [];

    content.forEach((block, idx) => {
      if (block.type === "tool_use") {
        const toolUse = block as ToolUseBlock;
        const result = toolResults.get(toolUse.id) as ToolResultBlock | undefined;
        grouped.push({
          toolUse,
          toolResult: result,
          originalIndex: idx,
        });
      } else if (block.type === "tool_result") {
        // Skip - handled via toolResults map
      } else {
        grouped.push(block);
      }
    });

    return grouped;
  }, [content, toolResults]);

  const renderTextWithMarkdown = (text: string) => {
    // Parse media content from the text
    const { items: mediaItems, processedContent } = parseMediaContent(text);

    if (renderMarkdown) {
      return (
        <>
          <div
            className="markdown-body"
            onClick={onMessageClick}
          >
            <MermaidRenderer
              content={processedContent}
              renderMarkdown={renderMarkdown}
              jsonBlocksMap={jsonBlocksMap}
            />
          </div>
          {mediaItems.length > 0 && (
            <div className="my-4">
              <MediaDisplay
                items={mediaItems}
                layout={mediaItems.length === 1 ? "single" : "grid"}
                basePath={basePath}
              />
            </div>
          )}
        </>
      );
    }
    return <p className="whitespace-pre-wrap text-gray-800">{processedContent}</p>;
  };

  // Get subagent updates for a specific tool use ID
  const getSubagentUpdates = (toolUseId: string): ChatMessage[] => {
    return subagentUpdates.filter((m) => m.parentToolUseId === toolUseId);
  };

  return (
    <div className="w-full relative group">
      <div className="flex-1 min-w-0 relative space-y-2">
        {/* Hover actions */}
        <div className="absolute -top-5 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-20">
          <CopyButton text={copyText} />
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              title="More actions"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                <button
                  onClick={() => {
                    onRollback?.();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg
                    className="w-3.5 h-3.5 text-amber-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  Rollback to here
                </button>
                <button
                  onClick={() => {
                    onFork?.();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg
                    className="w-3.5 h-3.5 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  Fork from here
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content blocks */}
        {groupedContent.map((item, idx) => {
          if (isGroupedBlock(item)) {
            const tool = item.toolUse;
            const result = item.toolResult;
            const originalIdx = item.originalIndex;
            const expanded = expandedBlocks.has(originalIdx);
            const summary = getToolSummary(tool);
            const isLoading = !result;

            // Handle TodoWrite specially
            if (tool.name === "TodoWrite") {
              const todos = tool.input?.todos || [];
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 bg-white overflow-hidden"
                >
                  <button
                    onClick={() => toggleBlock(originalIdx)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs">📋</span>
                    <span className="text-xs font-medium text-gray-700">
                      TodoWrite
                    </span>
                    <span className="text-xs text-gray-400">
                      {todos.length} tasks
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ml-auto ${
                        expanded ? "rotate-90" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-2 pt-1 border-t border-gray-100">
                      <div className="space-y-1">
                        {todos.map((todo: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs"
                          >
                            {todo.status === "completed" ? (
                              <svg
                                className="w-3.5 h-3.5 text-green-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ) : todo.status === "in_progress" ? (
                              <svg
                                className="w-3.5 h-3.5 text-blue-500 animate-spin"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  fill="none"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                              </svg>
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-gray-300" />
                            )}
                            <span
                              className={
                                todo.status === "completed"
                                  ? "text-gray-400 line-through"
                                  : "text-gray-700"
                              }
                            >
                              {todo.content}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Handle Task (subagent) with SubagentBlock
            if (tool.name === "Task") {
              const subagentData = activeSubagents.get(tool.id);
              const updates = getSubagentUpdates(tool.id);

              return (
                <SubagentBlock
                  key={idx}
                  toolUseId={tool.id}
                  description={tool.input?.description || tool.input?.prompt?.slice(0, 100) || ""}
                  subagentType={tool.input?.subagent_type || "general-purpose"}
                  updates={updates}
                  isActive={isLoading}
                  elapsedTime={subagentData?.elapsed}
                  renderMarkdown={renderMarkdown}
                  onMessageClick={onMessageClick}
                />
              );
            }

            // Regular tool with color coding
            const toolColor = getToolColor(tool.name);

            return (
              <div
                key={idx}
                className={`rounded-lg border overflow-hidden transition-colors ${
                  isLoading
                    ? `${toolColor.border} ${toolColor.bg}`
                    : "border-gray-200 bg-white"
                }`}
              >
                <button
                  onClick={() => toggleBlock(originalIdx)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    isLoading ? `hover:${toolColor.bg}` : "hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                      isLoading ? toolColor.bg : "bg-gray-100"
                    }`}
                  >
                    {isLoading ? (
                      <svg
                        className={`w-3.5 h-3.5 ${toolColor.text} animate-spin`}
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      <span className="text-xs">{getToolIcon(tool.name)}</span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isLoading ? toolColor.text : "text-gray-700"
                    }`}
                  >
                    {tool.name}
                  </span>
                  {summary && (
                    <span
                      className={`text-xs truncate font-mono flex-1 ${
                        isLoading ? "text-blue-400" : "text-gray-400"
                      }`}
                    >
                      {summary}
                    </span>
                  )}
                  {result && (
                    <span
                      className={`flex items-center gap-1 text-xs shrink-0 font-medium ${
                        result.is_error ? "text-red-500" : "text-green-600"
                      }`}
                    >
                      {result.is_error ? (
                        <>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                          Failed
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Done
                        </>
                      )}
                    </span>
                  )}
                  {!result && (
                    <span className="text-xs text-blue-500 shrink-0">
                      Running...
                    </span>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 transition-transform shrink-0 ${
                      isLoading ? "text-blue-400" : "text-gray-400"
                    } ${expanded ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                {expanded && (
                  <div className="px-3 pb-2 pt-1 border-t border-gray-100 space-y-2">
                    <ToolRenderer
                      toolUse={tool}
                      toolResult={result}
                      hideHeader
                      isExpanded
                    />
                  </div>
                )}
              </div>
            );
          }

          // Text block
          if (item.type === "text") {
            const textBlock = item as TextBlock;
            return (
              <div key={idx} className="text-sm leading-relaxed text-gray-800">
                {renderTextWithMarkdown(textBlock.text)}
              </div>
            );
          }

          // Thinking block
          if (item.type === "thinking") {
            const thinkingBlock = item as ThinkingBlock;
            const thinking = thinkingBlock.thinking;
            const expanded = expandedBlocks.has(idx);

            return (
              <div
                key={idx}
                className="rounded-lg border border-purple-200 bg-purple-50/20 overflow-hidden"
              >
                <button
                  onClick={() => toggleBlock(idx)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-purple-50 transition-colors"
                >
                  <span className="text-xs">💭</span>
                  <span className="text-xs font-medium text-purple-700">
                    Thinking
                  </span>
                  <span className="text-xs text-purple-400 truncate flex-1">
                    {thinking.slice(0, 60)}
                    {thinking.length > 60 ? "..." : ""}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-purple-400 transition-transform shrink-0 ${
                      expanded ? "rotate-90" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                {expanded && (
                  <div className="px-3 pb-2 pt-1 border-t border-purple-100 relative">
                    <div className="absolute top-1 right-3">
                      <CopyButton text={thinking} />
                    </div>
                    <pre className="text-xs text-purple-700 whitespace-pre-wrap font-mono bg-purple-50 rounded p-2 pr-8 max-h-48 overflow-y-auto">
                      {thinking}
                    </pre>
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Streaming partial text */}
        {isStreaming && partialText && (
          <div className="text-sm leading-relaxed text-gray-800">
            {renderTextWithMarkdown(partialText)}
            <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
          </div>
        )}

        {/* Streaming indicator when no content yet */}
        {isStreaming && content.length === 0 && !partialText && (
          <div className="flex items-center gap-1">
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
      </div>
    </div>
  );
}
