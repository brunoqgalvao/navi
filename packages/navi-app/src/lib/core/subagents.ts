/**
 * Subagent Type System
 *
 * Utilities for inferring agent types, extracting display info,
 * and configuring visual treatments for different agent types.
 */

import type {
  SubagentType,
  SubagentTypeConfig,
  SubagentActivityType,
  SubagentDisplayInfo,
} from "./types";

// =============================================================================
// SUBAGENT TYPE CONFIGURATIONS
// =============================================================================

export const SUBAGENT_CONFIGS: Record<SubagentType, SubagentTypeConfig> = {
  browser: {
    type: "browser",
    label: "Browser",
    icon: "globe",
    color: "cyan",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
    accentColor: "text-cyan-600",
  },
  coding: {
    type: "coding",
    label: "Coding",
    icon: "code-2",
    color: "emerald",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    accentColor: "text-emerald-600",
  },
  research: {
    type: "research",
    label: "Research",
    icon: "search",
    color: "violet",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    accentColor: "text-violet-600",
  },
  runner: {
    type: "runner",
    label: "Runner",
    icon: "terminal",
    color: "amber",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    accentColor: "text-amber-600",
  },
  reviewer: {
    type: "reviewer",
    label: "Reviewer",
    icon: "git-pull-request",
    color: "rose",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200",
    accentColor: "text-rose-600",
  },
  // Experimental agent types
  "red-team": {
    type: "red-team",
    label: "Red Team",
    icon: "shield-alert",
    color: "red",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    accentColor: "text-red-600",
  },
  "goal-agent": {
    type: "goal-agent",
    label: "Goal Agent",
    icon: "target",
    color: "emerald",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-300",
    accentColor: "text-emerald-700",
  },
  "healer-agent": {
    type: "healer-agent",
    label: "Healer",
    icon: "heart-pulse",
    color: "pink",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    accentColor: "text-pink-600",
  },
  consensus: {
    type: "consensus",
    label: "Consensus",
    icon: "users",
    color: "purple",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    accentColor: "text-purple-600",
  },
  general: {
    type: "general",
    label: "Agent",
    icon: "bot",
    color: "indigo",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    accentColor: "text-indigo-600",
  },
};

// =============================================================================
// TYPE INFERENCE
// =============================================================================

/**
 * Keywords that suggest browser/research agent
 */
const BROWSER_KEYWORDS = [
  "browse", "browser", "web", "url", "fetch", "scrape", "visit",
  "navigate", "website", "page", "http", "research", "explore",
];

/**
 * Keywords that suggest coding agent
 */
const CODING_KEYWORDS = [
  "code", "coding", "implement", "write", "create", "build",
  "frontend", "backend", "component", "function", "class",
  "refactor", "fix", "bug", "feature", "develop",
];

/**
 * Keywords that suggest runner agent
 */
const RUNNER_KEYWORDS = [
  "run", "execute", "command", "bash", "shell", "deploy",
  "build", "test", "install", "script", "process",
];

/**
 * Keywords that suggest reviewer agent
 */
const REVIEWER_KEYWORDS = [
  "review", "check", "analyze", "audit", "inspect",
  "pr", "pull request", "diff", "quality",
];

/**
 * Keywords that suggest red-team agent
 */
const RED_TEAM_KEYWORDS = [
  "security", "vulnerability", "exploit", "attack", "pentest",
  "edge case", "break", "hack", "injection", "xss", "sql",
  "red team", "adversarial", "threat", "owasp",
];

/**
 * Keywords that suggest goal agent
 */
const GOAL_KEYWORDS = [
  "goal", "objective", "target", "achieve", "accomplish",
  "complete", "finish", "until", "verify", "ensure",
  "declarative", "keep going", "persistent",
];

/**
 * Keywords that suggest healer agent
 */
const HEALER_KEYWORDS = [
  "fix", "heal", "error", "bug", "type error", "build",
  "compile", "lint", "broken", "failing", "repair",
];

/**
 * Keywords that suggest consensus agent
 */
const CONSENSUS_KEYWORDS = [
  "consensus", "vote", "ensemble", "multiple", "models",
  "agree", "disagree", "opinion", "second opinion", "confidence",
];

/**
 * Infer agent type from subagent_type string or prompt content
 */
export function inferSubagentType(
  subagentType: string,
  prompt?: string
): SubagentType {
  const typeStr = subagentType.toLowerCase();
  const promptStr = (prompt || "").toLowerCase();
  const combined = `${typeStr} ${promptStr}`;

  // Explicit type matches (check experimental types first)
  if (typeStr.includes("red-team") || typeStr.includes("redteam") || typeStr.includes("security")) return "red-team";
  if (typeStr.includes("goal-agent") || typeStr.includes("goal agent")) return "goal-agent";
  if (typeStr.includes("healer") || typeStr.includes("heal")) return "healer-agent";
  if (typeStr.includes("consensus") || typeStr.includes("ensemble")) return "consensus";
  if (typeStr.includes("browser") || typeStr.includes("explore")) return "browser";
  if (typeStr.includes("frontend") || typeStr.includes("backend") || typeStr.includes("code")) return "coding";
  if (typeStr.includes("runner") || typeStr.includes("deploy")) return "runner";
  if (typeStr.includes("review")) return "reviewer";
  if (typeStr.includes("research") || typeStr.includes("plan")) return "research";

  // Keyword-based inference from prompt
  const browserScore = BROWSER_KEYWORDS.filter(k => combined.includes(k)).length;
  const codingScore = CODING_KEYWORDS.filter(k => combined.includes(k)).length;
  const runnerScore = RUNNER_KEYWORDS.filter(k => combined.includes(k)).length;
  const reviewerScore = REVIEWER_KEYWORDS.filter(k => combined.includes(k)).length;
  const redTeamScore = RED_TEAM_KEYWORDS.filter(k => combined.includes(k)).length;
  const goalScore = GOAL_KEYWORDS.filter(k => combined.includes(k)).length;
  const healerScore = HEALER_KEYWORDS.filter(k => combined.includes(k)).length;
  const consensusScore = CONSENSUS_KEYWORDS.filter(k => combined.includes(k)).length;

  const scores = [
    { type: "browser" as SubagentType, score: browserScore },
    { type: "coding" as SubagentType, score: codingScore },
    { type: "runner" as SubagentType, score: runnerScore },
    { type: "reviewer" as SubagentType, score: reviewerScore },
    { type: "red-team" as SubagentType, score: redTeamScore * 1.5 }, // Boost security-related
    { type: "goal-agent" as SubagentType, score: goalScore },
    { type: "healer-agent" as SubagentType, score: healerScore * 1.5 }, // Boost fix-related
    { type: "consensus" as SubagentType, score: consensusScore },
  ];

  const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
  if (best.score >= 2) return best.type;

  return "general";
}

/**
 * Get configuration for a subagent type
 */
export function getSubagentConfig(type: SubagentType): SubagentTypeConfig {
  return SUBAGENT_CONFIGS[type] || SUBAGENT_CONFIGS.general;
}

// =============================================================================
// ACTIVITY EXTRACTION
// =============================================================================

interface ToolUse {
  name: string;
  input?: Record<string, unknown>;
}

/**
 * Infer current activity from the latest tool calls
 */
export function inferActivity(tools: ToolUse[]): SubagentActivityType {
  if (tools.length === 0) return "thinking";

  const lastTool = tools[tools.length - 1];
  switch (lastTool.name) {
    case "WebFetch":
    case "WebSearch":
      return "browsing";
    case "Read":
      return "reading";
    case "Write":
    case "Edit":
      return "writing";
    case "Bash":
      return "running";
    case "Glob":
    case "Grep":
      return "searching";
    default:
      return "thinking";
  }
}

/**
 * Extract display info from subagent messages
 */
export function extractDisplayInfo(
  subagentType: string,
  prompt: string,
  tools: ToolUse[],
  isComplete: boolean
): SubagentDisplayInfo {
  const type = inferSubagentType(subagentType, prompt);
  const activity = isComplete ? "complete" : inferActivity(tools);

  const info: SubagentDisplayInfo = { type, activity };

  // Extract type-specific info
  for (const tool of tools) {
    switch (tool.name) {
      case "WebFetch":
      case "WebSearch":
        if (tool.input?.url) {
          info.currentUrl = String(tool.input.url);
        } else if (tool.input?.query) {
          info.currentUrl = `search: ${tool.input.query}`;
        }
        break;

      case "Read":
      case "Write":
      case "Edit":
        const filePath = tool.input?.file_path;
        if (filePath) {
          const fileName = String(filePath).split("/").pop() || String(filePath);
          if (!info.activeFiles) info.activeFiles = [];
          if (!info.activeFiles.includes(fileName)) {
            info.activeFiles.push(fileName);
          }
        }
        break;

      case "Bash":
        if (tool.input?.command) {
          const cmd = String(tool.input.command);
          info.currentCommand = cmd.length > 50 ? cmd.slice(0, 47) + "..." : cmd;
        }
        break;
    }
  }

  // Limit active files display
  if (info.activeFiles && info.activeFiles.length > 3) {
    const count = info.activeFiles.length;
    info.activeFiles = [...info.activeFiles.slice(0, 2), `+${count - 2} more`];
  }

  return info;
}

// =============================================================================
// ACTIVITY LABELS
// =============================================================================

export const ACTIVITY_LABELS: Record<SubagentActivityType, string> = {
  browsing: "Browsing",
  reading: "Reading",
  writing: "Writing",
  running: "Running",
  thinking: "Thinking",
  searching: "Searching",
  complete: "Complete",
};

export const ACTIVITY_ICONS: Record<SubagentActivityType, string> = {
  browsing: "globe",
  reading: "file-text",
  writing: "pencil",
  running: "terminal",
  thinking: "brain",
  searching: "search",
  complete: "check-circle",
};
