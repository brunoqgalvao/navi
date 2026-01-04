import { useState, useMemo } from "react";
import type { ChatMessage } from "~/lib/types";
import type { ContentBlock, TextBlock, ToolUseBlock } from "~/lib/claude";

interface SubagentBlockProps {
  toolUseId: string;
  description: string;
  subagentType: string;
  updates: ChatMessage[];
  isActive: boolean;
  elapsedTime?: number;
  renderMarkdown?: (content: string) => string;
  onMessageClick?: (e: React.MouseEvent) => void;
}

const toolIcons: Record<string, string> = {
  Read: "📄",
  Write: "✏️",
  Edit: "🔧",
  Bash: "⚡",
  Glob: "🔍",
  Grep: "🔎",
  WebFetch: "🌐",
  WebSearch: "🔍",
};

function getToolSummary(tool: ToolUseBlock): string {
  const input = tool.input || {};
  switch (tool.name) {
    case "Read":
      return input.file_path?.split("/").pop() || "";
    case "Write":
    case "Edit":
      return input.file_path?.split("/").pop() || "";
    case "Bash":
      const cmd = input.command || "";
      return cmd.length > 30 ? cmd.slice(0, 30) + "..." : cmd;
    case "Glob":
    case "Grep":
      return input.pattern || "";
    default:
      return "";
  }
}

export function SubagentBlock({
  toolUseId,
  description,
  subagentType,
  updates,
  isActive,
  elapsedTime,
  renderMarkdown,
  onMessageClick,
}: SubagentBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const formatContent = (msg: ChatMessage): string => {
    if (msg.role !== "assistant") return "";
    const content = msg.content as ContentBlock[];
    return content
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .filter(Boolean)
      .join("\n");
  };

  const getToolCalls = (msg: ChatMessage): ToolUseBlock[] => {
    if (msg.role !== "assistant") return [];
    const content = msg.content as ContentBlock[];
    return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
  };

  const latestActivity = useMemo(() => {
    for (let i = updates.length - 1; i >= 0; i--) {
      const update = updates[i];
      if (update.role === "assistant") {
        const tools = getToolCalls(update);
        if (tools.length > 0) {
          return { type: "tool" as const, tool: tools[tools.length - 1] };
        }
        const text = formatContent(update);
        if (text) {
          return {
            type: "text" as const,
            text: text.slice(0, 80) + (text.length > 80 ? "..." : ""),
          };
        }
      }
    }
    return null;
  }, [updates]);

  const toolCount = useMemo(() => {
    return updates.reduce((count, update) => {
      if (update.role === "assistant") {
        return count + getToolCalls(update).length;
      }
      return count;
    }, 0);
  }, [updates]);

  return (
    <div className="rounded-xl border border-indigo-200 bg-white shadow-sm overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-indigo-50/50 transition-colors"
      >
        {/* Icon */}
        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <svg
            className="w-4 h-4 text-indigo-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">Subagent</span>
            <span className="text-xs text-indigo-500 font-mono">{subagentType}</span>
          </div>
          {!expanded && latestActivity && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {latestActivity.type === "tool" ? (
                <>
                  <span className="text-orange-600">{latestActivity.tool.name}</span>
                  <span className="text-gray-400 ml-1">
                    {getToolSummary(latestActivity.tool)}
                  </span>
                </>
              ) : (
                latestActivity.text
              )}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 shrink-0">
          {toolCount > 0 && (
            <span className="text-[10px] text-gray-400">{toolCount} tools</span>
          )}
          {isActive ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[10px] font-medium text-indigo-700">
                {elapsedTime ? `${elapsedTime}s` : "working"}
              </span>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-teal-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Expand icon */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-indigo-100">
          {/* Description */}
          <div className="px-4 py-2 bg-indigo-50/30 border-b border-indigo-100">
            <div className="text-xs text-indigo-700">{description}</div>
          </div>

          {/* Updates timeline */}
          <div className="px-4 py-2 max-h-64 overflow-y-auto space-y-2">
            {updates.map((update) => {
              if (update.role !== "assistant") return null;
              const textContent = formatContent(update);
              const tools = getToolCalls(update);

              return (
                <div key={update.id}>
                  {textContent && (
                    <div
                      className="text-xs leading-relaxed text-gray-700 pl-3 border-l-2 border-indigo-200 py-1"
                      onClick={onMessageClick}
                    >
                      {renderMarkdown ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(textContent),
                          }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap">{textContent}</p>
                      )}
                    </div>
                  )}
                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center gap-2 pl-3 border-l-2 border-orange-200 py-1"
                    >
                      <span className="text-sm">{toolIcons[tool.name] || "⚙️"}</span>
                      <span className="text-xs font-medium text-orange-600">
                        {tool.name}
                      </span>
                      <span className="text-xs text-gray-400 truncate">
                        {getToolSummary(tool)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}

            {isActive && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                <span className="text-xs text-indigo-600">Processing...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
