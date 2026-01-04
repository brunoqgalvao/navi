import type { ToolUseBlock, ToolResultBlock } from "~/lib/types";
import { WritePreview } from "./WritePreview";
import { EditPreview } from "./EditPreview";
import { BashPreview } from "./BashPreview";
import { TodoPreview } from "./TodoPreview";
import { WebSearchPreview } from "./WebSearchPreview";
import { WebFetchPreview } from "./WebFetchPreview";
import { Badge } from "~/components/ui/Badge";

interface ToolRendererProps {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  isExpanded?: boolean;
  onToggle?: () => void;
  hideHeader?: boolean;
}

const TOOL_COLORS: Record<string, string> = {
  Read: "text-blue-400",
  Write: "text-emerald-400",
  Edit: "text-amber-400",
  Bash: "text-purple-400",
  Glob: "text-cyan-400",
  Grep: "text-cyan-400",
  WebFetch: "text-orange-400",
  WebSearch: "text-pink-400",
  TodoWrite: "text-indigo-400",
  Task: "text-violet-400",
  AskFollowupQuestion: "text-teal-400",
};

const TOOL_ICONS: Record<string, string> = {
  Read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  Write: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  Edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  Bash: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  Glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  Grep: "M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z",
  WebFetch: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
  WebSearch: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  TodoWrite: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  Task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
};

export function ToolRenderer({
  toolUse,
  toolResult,
  isExpanded = false,
  onToggle,
  hideHeader = false,
}: ToolRendererProps) {
  const toolName = toolUse.name;
  const toolColor = TOOL_COLORS[toolName] || "text-zinc-400";
  const iconPath = TOOL_ICONS[toolName] || TOOL_ICONS.Task;

  // Get result content
  const resultContent =
    toolResult?.content && Array.isArray(toolResult.content)
      ? toolResult.content
          .map((c) => (c.type === "text" ? c.text : ""))
          .join("\n")
      : typeof toolResult?.content === "string"
      ? toolResult.content
      : "";

  const isError = toolResult?.is_error;

  // Render specific tool preview
  const renderToolPreview = () => {
    const input = toolUse.input as Record<string, unknown>;

    switch (toolName) {
      case "Write":
        return (
          <WritePreview
            filePath={input.file_path as string}
            content={input.content as string}
          />
        );
      case "Edit":
        return (
          <EditPreview
            filePath={input.file_path as string}
            oldString={input.old_string as string}
            newString={input.new_string as string}
          />
        );
      case "Bash":
        return (
          <BashPreview
            command={input.command as string}
            output={resultContent}
            isError={isError}
          />
        );
      case "TodoWrite":
        return (
          <TodoPreview
            todos={(input.todos as Array<{ content: string; status: string }>) || []}
          />
        );
      case "WebSearch":
        return (
          <WebSearchPreview
            query={input.query as string}
            results={resultContent}
          />
        );
      case "WebFetch":
        return (
          <WebFetchPreview
            url={input.url as string}
            content={resultContent}
          />
        );
      default:
        return null;
    }
  };

  const preview = renderToolPreview();
  const showContent = hideHeader || isExpanded;
  const containerClasses = hideHeader
    ? "rounded-lg overflow-hidden"
    : "my-2 rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden";

  return (
    <div className={containerClasses}>
      {!hideHeader && (
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700/50"
        >
          <svg
            className={`h-4 w-4 ${toolColor}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={iconPath}
            />
          </svg>
          <span className={`font-mono text-sm ${toolColor}`}>{toolName}</span>

          {/* File path or command preview */}
          {toolUse.input?.file_path && (
            <span className="flex-1 truncate text-sm text-zinc-400">
              {String(toolUse.input.file_path)}
            </span>
          )}
          {toolUse.input?.command && (
            <span className="flex-1 truncate font-mono text-sm text-zinc-400">
              {String(toolUse.input.command)}
            </span>
          )}

          {/* Status */}
          {toolResult && (
            <Badge variant={isError ? "error" : "success"}>
              {isError ? "Error" : "Done"}
            </Badge>
          )}

          {/* Expand icon */}
          <svg
            className={`h-4 w-4 text-zinc-500 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      )}

      {/* Content */}
      {showContent && (
        <div className={hideHeader ? "" : "border-t border-zinc-700"}>
          {preview || (
            <div className="p-3">
              {/* Generic input display */}
              <pre className="overflow-x-auto rounded bg-zinc-900 p-2 text-xs text-zinc-300">
                {JSON.stringify(toolUse.input, null, 2)}
              </pre>

              {/* Result */}
              {resultContent && (
                <div className="mt-2">
                  <div className="mb-1 text-xs text-zinc-500">Result:</div>
                  <pre
                    className={`overflow-x-auto rounded p-2 text-xs ${
                      isError
                        ? "bg-red-900/20 text-red-300"
                        : "bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    {resultContent.slice(0, 500)}
                    {resultContent.length > 500 && "..."}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
