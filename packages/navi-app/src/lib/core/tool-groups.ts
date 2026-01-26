/**
 * Tool Groups - Human-readable abstractions for tool activity
 *
 * Instead of showing individual tool calls like:
 *   Grep "useState" → Read file1.ts → Read file2.ts
 *
 * We group them into semantic actions:
 *   🔍 Searching in code (3 operations)
 *
 * This is a core UX abstraction for making Claude's tool activity readable.
 */

import type { ToolUseBlock, ToolResultBlock, ContentBlock } from "../claude";

// =============================================================================
// TYPES
// =============================================================================

export type ToolGroupType =
  | "search"     // Grep, Glob, Read (for scanning)
  | "file_edit"  // Read + Edit/Write on same file
  | "web"        // WebSearch + WebFetch
  | "browser"    // agent-browser commands
  | "execute"    // Bash commands
  | "agent";     // Task/spawn_agent

export interface ToolStep {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  originalIndex: number;
}

export interface ToolGroup {
  type: ToolGroupType;
  steps: ToolStep[];
  summary: string;
  icon: string;
  label: string;
}

export interface ToolGroupConfig {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  tools: string[];
}

// =============================================================================
// GROUP CONFIGURATIONS
// =============================================================================

export const TOOL_GROUP_CONFIG: Record<ToolGroupType, ToolGroupConfig> = {
  search: {
    label: "Searching in code",
    icon: "🔍",
    color: "text-violet-700 dark:text-violet-300",
    bgColor: "bg-violet-50 dark:bg-violet-900/30",
    borderColor: "border-violet-200 dark:border-violet-800",
    tools: ["Grep", "Glob"],
  },
  file_edit: {
    label: "Editing files",
    icon: "📝",
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-50 dark:bg-amber-900/30",
    borderColor: "border-amber-200 dark:border-amber-800",
    tools: ["Read", "Write", "Edit", "MultiEdit"],
  },
  web: {
    label: "Researching",
    icon: "🌐",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-900/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    tools: ["WebSearch", "WebFetch"],
  },
  browser: {
    label: "Browsing",
    icon: "🌐",
    color: "text-cyan-700 dark:text-cyan-300",
    bgColor: "bg-cyan-50 dark:bg-cyan-900/30",
    borderColor: "border-cyan-200 dark:border-cyan-800",
    tools: [], // Handled by isAgentBrowserCommand
  },
  execute: {
    label: "Running commands",
    icon: "▶️",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/30",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    tools: ["Bash"],
  },
  agent: {
    label: "Agent task",
    icon: "🤖",
    color: "text-purple-700 dark:text-purple-300",
    bgColor: "bg-purple-50 dark:bg-purple-900/30",
    borderColor: "border-purple-200 dark:border-purple-800",
    tools: ["Task"],
  },
};

// =============================================================================
// GROUPING LOGIC
// =============================================================================

/**
 * Determine which group type a tool belongs to
 */
export function getToolGroupType(
  toolName: string,
  _input?: Record<string, unknown>
): ToolGroupType | null {
  // Search tools
  if (toolName === "Grep" || toolName === "Glob") {
    return "search";
  }

  // Web research
  if (toolName === "WebSearch" || toolName === "WebFetch") {
    return "web";
  }

  // File editing (Read is contextual - could be search or edit prep)
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
    return "file_edit";
  }

  // Bash (non-browser) - group if part of a sequence
  if (toolName === "Bash") {
    return "execute";
  }

  // Agent tasks
  if (toolName === "Task") {
    return "agent";
  }

  return null;
}

/**
 * Check if two consecutive tools should be grouped together
 */
export function shouldGroupTogether(
  prev: ToolUseBlock,
  curr: ToolUseBlock,
  prevType: ToolGroupType | null,
  currType: ToolGroupType | null
): boolean {
  // Must have matching group types
  if (!prevType || !currType || prevType !== currType) {
    return false;
  }

  // Search: always group consecutive Grep/Glob
  if (currType === "search") {
    return true;
  }

  // Web: always group WebSearch + WebFetch sequences
  if (currType === "web") {
    return true;
  }

  // File edit: only group if operating on same file
  if (currType === "file_edit") {
    const prevFile = prev.input?.file_path as string | undefined;
    const currFile = curr.input?.file_path as string | undefined;
    return prevFile === currFile;
  }

  // Execute: group consecutive bash commands (but not long-running ones)
  if (currType === "execute") {
    // Don't group if command looks like a long-running server
    const cmd = (curr.input?.command as string) || "";
    const isLongRunning = /npm run (dev|start|serve)|node.*server|python.*app/.test(cmd);
    return !isLongRunning;
  }

  return false;
}

/**
 * Generate a human-readable summary for a tool group
 */
export function generateGroupSummary(group: ToolGroup): string {
  const { type, steps } = group;

  switch (type) {
    case "search": {
      const patterns = steps
        .filter((s) => s.toolUse.name === "Grep")
        .map((s) => s.toolUse.input?.pattern as string)
        .filter(Boolean);
      const globs = steps
        .filter((s) => s.toolUse.name === "Glob")
        .map((s) => s.toolUse.input?.pattern as string)
        .filter(Boolean);

      if (patterns.length > 0) {
        return `"${patterns[0]}"${patterns.length > 1 ? ` +${patterns.length - 1} more` : ""}`;
      }
      if (globs.length > 0) {
        return globs[0];
      }
      return `${steps.length} operations`;
    }

    case "file_edit": {
      const files = [
        ...new Set(
          steps
            .map((s) => {
              const path = s.toolUse.input?.file_path as string;
              return path?.split("/").pop() || path;
            })
            .filter(Boolean)
        ),
      ];
      return files.length === 1 ? files[0] : `${files.length} files`;
    }

    case "web": {
      const query = steps.find((s) => s.toolUse.name === "WebSearch")?.toolUse
        .input?.query as string;
      const urls = steps
        .filter((s) => s.toolUse.name === "WebFetch")
        .map((s) => {
          try {
            return new URL(s.toolUse.input?.url as string).hostname;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      if (query) return `"${query}"`;
      if (urls.length > 0) return urls[0] + (urls.length > 1 ? ` +${urls.length - 1}` : "");
      return `${steps.length} requests`;
    }

    case "execute": {
      const cmds = steps.map((s) => {
        const cmd = (s.toolUse.input?.command as string) || "";
        const match = cmd.match(/^(npm run \w+|\w+)/);
        return match ? match[1] : cmd.slice(0, 20);
      });
      return cmds[0] + (cmds.length > 1 ? ` +${cmds.length - 1}` : "");
    }

    default:
      return `${steps.length} operations`;
  }
}

/**
 * Count results/matches across a group
 */
export function getGroupStats(group: ToolGroup): {
  total: number;
  completed: number;
  errors: number;
  isRunning: boolean;
} {
  let completed = 0;
  let errors = 0;

  for (const step of group.steps) {
    if (step.toolResult) {
      completed++;
      if (step.toolResult.is_error) {
        errors++;
      }
    }
  }

  return {
    total: group.steps.length,
    completed,
    errors,
    isRunning: completed < group.steps.length,
  };
}

// =============================================================================
// CONTENT GROUPING
// =============================================================================

/**
 * Result types from groupToolBlocks
 */
export type GroupedContentItem =
  | ContentBlock
  | ToolGroup
  | { toolUse: ToolUseBlock; toolResult?: ToolResultBlock; originalIndex: number };

/**
 * Group consecutive tool calls into semantic groups
 */
export function groupToolBlocks(
  blocks: ContentBlock[],
  toolResults: Map<string, ContentBlock>,
  isAgentBrowserCommand?: (cmd: string) => boolean
): GroupedContentItem[] {
  const result: GroupedContentItem[] = [];

  // Track current groups
  let currentBrowserGroup: {
    steps: ToolStep[];
  } | null = null;

  let currentToolGroup: {
    type: ToolGroupType;
    steps: ToolStep[];
  } | null = null;

  function flushBrowserGroup() {
    if (currentBrowserGroup && currentBrowserGroup.steps.length > 0) {
      // Browser groups always render, even with 1 step
      const config = TOOL_GROUP_CONFIG.browser;
      result.push({
        type: "browser",
        steps: currentBrowserGroup.steps,
        summary: `${currentBrowserGroup.steps.length} action${currentBrowserGroup.steps.length > 1 ? "s" : ""}`,
        icon: config.icon,
        label: config.label,
      });
      currentBrowserGroup = null;
    }
  }

  function flushToolGroup() {
    if (currentToolGroup && currentToolGroup.steps.length > 0) {
      // Only create group if 2+ steps, otherwise render individually
      if (currentToolGroup.steps.length >= 2) {
        const config = TOOL_GROUP_CONFIG[currentToolGroup.type];
        const group: ToolGroup = {
          type: currentToolGroup.type,
          steps: currentToolGroup.steps,
          summary: "",
          icon: config.icon,
          label: config.label,
        };
        group.summary = generateGroupSummary(group);
        result.push(group);
      } else {
        // Single step - add as individual tool
        result.push(currentToolGroup.steps[0]);
      }
      currentToolGroup = null;
    }
  }

  blocks.forEach((block, idx) => {
    if (block.type === "tool_use") {
      const toolUse = block as ToolUseBlock;
      const toolResult = toolResults.get(toolUse.id) as ToolResultBlock | undefined;

      const step: ToolStep = {
        toolUse,
        toolResult,
        originalIndex: idx,
      };

      // Check if it's a browser command
      const isBrowser =
        toolUse.name === "Bash" &&
        isAgentBrowserCommand &&
        isAgentBrowserCommand(toolUse.input?.command as string || "");

      if (isBrowser) {
        // Flush any pending tool group first
        flushToolGroup();

        // Add to browser group
        if (!currentBrowserGroup) {
          currentBrowserGroup = { steps: [] };
        }
        currentBrowserGroup.steps.push(step);
        return;
      }

      // Flush browser group if we hit a non-browser tool
      flushBrowserGroup();

      // Check for other groupable tools
      const groupType = getToolGroupType(toolUse.name, toolUse.input as Record<string, unknown>);

      if (groupType) {
        // Try to add to current group
        if (
          currentToolGroup &&
          currentToolGroup.steps.length > 0 &&
          shouldGroupTogether(
            currentToolGroup.steps[currentToolGroup.steps.length - 1].toolUse,
            toolUse,
            currentToolGroup.type,
            groupType
          )
        ) {
          currentToolGroup.steps.push(step);
          return;
        }

        // Flush old group and start new one
        flushToolGroup();
        currentToolGroup = {
          type: groupType,
          steps: [step],
        };
      } else {
        // Non-groupable tool
        flushToolGroup();
        result.push(step);
      }
    } else if (block.type === "tool_result") {
      // Skip - handled via toolResults map
    } else {
      // Non-tool content - flush groups and add
      flushBrowserGroup();
      flushToolGroup();
      result.push(block);
    }
  });

  // Flush remaining groups
  flushBrowserGroup();
  flushToolGroup();

  return result;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isToolGroup(item: GroupedContentItem): item is ToolGroup {
  return "steps" in item && "type" in item && "summary" in item;
}

export function isSingleTool(
  item: GroupedContentItem
): item is { toolUse: ToolUseBlock; toolResult?: ToolResultBlock; originalIndex: number } {
  return "toolUse" in item && !("summary" in item);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract text from tool result content
 */
export function extractToolResultText(content: unknown): string {
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
