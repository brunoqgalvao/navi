import type { ToolUseBlock, ToolResultBlock } from "~/lib/claude";

interface CompactToolCallProps {
  tool: ToolUseBlock;
  result?: ToolResultBlock;
  onPreview?: (path: string) => void;
  onClick?: () => void;
}

const toolConfig: Record<string, { icon: string; color: string }> = {
  Read: {
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    color: "text-blue-500",
  },
  Write: {
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    color: "text-green-500",
  },
  Edit: {
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    color: "text-amber-500",
  },
  MultiEdit: {
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    color: "text-amber-500",
  },
  Bash: {
    icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    color: "text-purple-500",
  },
  Glob: {
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    color: "text-cyan-500",
  },
  Grep: {
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    color: "text-cyan-500",
  },
  WebFetch: {
    icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
    color: "text-indigo-500",
  },
  WebSearch: {
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    color: "text-indigo-500",
  },
  Task: {
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    color: "text-orange-500",
  },
  TodoWrite: {
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    color: "text-pink-500",
  },
};

const defaultConfig = {
  icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  color: "text-gray-500",
};

function getConfig(name: string) {
  return toolConfig[name] || defaultConfig;
}

function getSummary(tool: ToolUseBlock): string {
  const input = tool.input || {};
  switch (tool.name) {
    case "Read":
      const readPath = input.file_path || "";
      if (readPath.includes("/skills/") && readPath.endsWith("SKILL.md")) {
        const match = readPath.match(/\/skills\/([^/]+)\/SKILL\.md$/);
        return match ? `skill:${match[1]}` : readPath.split("/").pop() || "";
      }
      return readPath.split("/").pop() || "";
    case "Write":
    case "Edit":
    case "MultiEdit":
      return (input.file_path || "").split("/").pop() || "";
    case "Bash":
      const cmd = input.command || "";
      return cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
    case "Glob":
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
    case "TodoWrite":
      return `${input.todos?.length || 0} items`;
    case "Task":
      return input.description?.slice(0, 40) || "";
    default:
      return "";
  }
}

export function CompactToolCall({
  tool,
  result,
  onPreview,
  onClick,
}: CompactToolCallProps) {
  const config = getConfig(tool.name);
  const summary = getSummary(tool);
  const hasError = result?.is_error === true;
  const isComplete = !!result;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-colors ${
        hasError
          ? "border-red-200 bg-red-50/50 hover:bg-red-50"
          : "border-gray-200 bg-gray-50/50 hover:bg-gray-100"
      }`}
    >
      <svg
        className={`w-3 h-3 ${config.color} shrink-0`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d={config.icon}
        />
      </svg>
      <span className="font-medium text-gray-600">{tool.name}</span>
      {summary && (
        <span className="text-gray-400 truncate max-w-[200px] font-mono">
          {summary}
        </span>
      )}
      {isComplete ? (
        <span className={`shrink-0 ${hasError ? "text-red-500" : "text-green-500"}`}>
          {hasError ? "✗" : "✓"}
        </span>
      ) : (
        <span className="w-2.5 h-2.5 border border-gray-300 border-t-transparent rounded-full animate-spin shrink-0" />
      )}
    </button>
  );
}
