// Shared display helpers for rendering tool_use blocks in chat
// (ToolRow, ToolCallRun, AssistantMessage).
import type { ToolUseBlock, ToolResultBlock } from "../claude";

export interface ToolRunToolStep {
  kind: "tool";
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  originalIndex: number;
}

export interface ToolRunThinkingStep {
  kind: "thinking";
  text: string;
  originalIndex: number;
}

// Intermediate narration the agent emitted between tool calls — folded into
// the run's expanded timeline; only the final prose stays prominent.
export interface ToolRunNoteStep {
  kind: "note";
  text: string;
  originalIndex: number;
}

export type ToolRunStep = ToolRunToolStep | ToolRunThinkingStep | ToolRunNoteStep;

export function getToolSummary(tool: ToolUseBlock): string {
  const input = tool.input || {};
  switch (tool.name) {
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
      return (input.file_path as string)?.split("/").pop() || "";
    case "Bash": {
      const cmd = (input.command as string) || "";
      return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
    }
    case "Glob":
    case "Grep":
      return (input.pattern as string) || "";
    case "WebFetch":
      try { return new URL((input.url as string) || "").hostname; } catch { return ""; }
    case "WebSearch":
      return (input.query as string) || "";
    case "TodoWrite":
      return `${(input.todos as unknown[])?.length || 0} items`;
    case "Task":
      return (input.description as string)?.slice(0, 40) || "";
    default:
      return "";
  }
}

const toolIconPaths: Record<string, string> = {
  Read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  Write: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  Edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  MultiEdit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  Bash: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  Glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  Grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  WebFetch: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
  WebSearch: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  Task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  TodoWrite: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
};

export function getToolIconPath(name: string): string {
  return toolIconPaths[name] || "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z";
}

export function extractToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((item: unknown) => {
        const i = item as { type?: string; text?: string };
        return i?.type === "text" && typeof i?.text === "string";
      })
      .map((item: unknown) => (item as { text: string }).text)
      .join("\n");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text);
  }
  return "";
}
