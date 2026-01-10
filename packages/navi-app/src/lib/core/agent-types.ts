/**
 * Agent Type System
 *
 * Defines predefined agent types with their capabilities and UI mappings.
 * Built-in agents can be extended by user-defined agents in .claude/agents/
 */

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Core agent types with native UI support
 */
export type AgentType =
  | "browser" // Native UI: URL bar, visited links, page preview
  | "coding" // Native UI: file changes, diff preview, file tree
  | "research" // Semi-native: findings list, sources
  | "planning" // Semi-native: task breakdown, checklist
  | "reviewer" // Semi-native: review checklist, issues
  | "runner" // Native UI: command output, progress bar
  | "general"; // Generic fallback

/**
 * Agent capability definition
 */
export interface AgentCapabilities {
  /** Tools this agent can use */
  tools: string[];
  /** MCP servers to connect (by name from settings) */
  mcps?: string[];
  /** Skills to load (by name) */
  skills?: string[];
  /** Additional allowed tool patterns (for auto-approval) */
  allowedToolPatterns?: string[];
}

/**
 * Full agent definition
 */
export interface AgentDefinition {
  /** Unique agent type identifier */
  type: AgentType;
  /** Human-readable name */
  displayName: string;
  /** Short description */
  description: string;
  /** Emoji or icon identifier */
  icon: string;
  /** Tailwind color name (blue, emerald, purple, etc.) */
  color: string;
  /** Whether this agent has specialized native UI */
  nativeUI: boolean;
  /** Agent capabilities */
  capabilities: AgentCapabilities;
  /** System prompt additions for this agent type */
  systemPrompt: string;
}

// ============================================================================
// Built-in Agent Definitions
// ============================================================================

export const BUILTIN_AGENTS: Record<AgentType, AgentDefinition> = {
  browser: {
    type: "browser",
    displayName: "Browser Agent",
    description:
      "Browses the web, researches topics, and gathers information from URLs",
    icon: "🌐",
    color: "blue",
    nativeUI: true,
    capabilities: {
      tools: ["WebFetch", "WebSearch", "Read", "Write"],
      skills: ["playwright"],
      allowedToolPatterns: ["WebFetch:*", "WebSearch:*"],
    },
    systemPrompt: `You are a Browser Agent specialized in web research and information gathering.

## Your Capabilities
- Browse web pages and extract information
- Search the web for specific topics
- Take screenshots of pages (via playwright skill)
- Navigate and interact with web applications

## Guidelines
1. Always verify information from multiple sources when possible
2. Cite your sources with URLs
3. Extract and summarize key findings
4. Report back with structured findings

## Output Format
When reporting findings, structure them as:
- **Source**: URL
- **Key Finding**: Summary
- **Relevance**: How it relates to the task`,
  },

  coding: {
    type: "coding",
    displayName: "Coding Agent",
    description:
      "Implements code changes, creates files, runs commands, and manages codebases",
    icon: "🔧",
    color: "emerald",
    nativeUI: true,
    capabilities: {
      tools: [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "TodoWrite",
      ],
      allowedToolPatterns: [
        "Read:*",
        "Write:*",
        "Edit:*",
        "Glob:*",
        "Grep:*",
      ],
    },
    systemPrompt: `You are a Coding Agent specialized in implementing code changes.

## Your Capabilities
- Read and understand existing code
- Write new files and modify existing ones
- Run shell commands for builds, tests, installs
- Search codebases efficiently

## Guidelines
1. Read before writing - understand context first
2. Make minimal, focused changes
3. Follow existing code style and patterns
4. Test your changes when possible
5. Report files changed and lines modified

## Output Format
When delivering, include:
- Files created/modified with line counts
- Key changes made
- Any issues encountered
- Suggested follow-ups if needed`,
  },

  research: {
    type: "research",
    displayName: "Research Agent",
    description:
      "Conducts deep research on topics, analyzes information, and synthesizes findings",
    icon: "🔍",
    color: "purple",
    nativeUI: false,
    capabilities: {
      tools: ["WebFetch", "WebSearch", "Read", "Write"],
    },
    systemPrompt: `You are a Research Agent specialized in deep analysis and information synthesis.

## Your Capabilities
- Search and analyze multiple sources
- Compare and contrast information
- Identify patterns and insights
- Create structured research reports

## Guidelines
1. Cast a wide net initially, then focus
2. Cross-reference claims across sources
3. Note confidence levels for findings
4. Highlight uncertainties and gaps

## Output Format
Structure your research as:
- Executive Summary (2-3 sentences)
- Key Findings (bulleted)
- Supporting Evidence
- Open Questions / Limitations`,
  },

  planning: {
    type: "planning",
    displayName: "Planning Agent",
    description:
      "Breaks down complex tasks into actionable steps and creates implementation plans",
    icon: "📋",
    color: "amber",
    nativeUI: false,
    capabilities: {
      tools: ["Read", "Glob", "Grep", "TodoWrite"],
    },
    systemPrompt: `You are a Planning Agent specialized in task breakdown and project planning.

## Your Capabilities
- Analyze requirements and scope
- Break down complex tasks into steps
- Identify dependencies and risks
- Create actionable implementation plans

## Guidelines
1. Start with understanding the goal
2. Identify constraints and dependencies
3. Order tasks by priority and dependencies
4. Include clear success criteria for each step

## Output Format
Plans should include:
- Goal Statement
- Prerequisites
- Ordered Task List with descriptions
- Risk/Blockers identified
- Success Criteria`,
  },

  reviewer: {
    type: "reviewer",
    displayName: "Reviewer Agent",
    description:
      "Reviews code, documents, or plans for quality, correctness, and improvements",
    icon: "👀",
    color: "rose",
    nativeUI: false,
    capabilities: {
      tools: ["Read", "Glob", "Grep"],
    },
    systemPrompt: `You are a Reviewer Agent specialized in quality review and feedback.

## Your Capabilities
- Review code for bugs, style, and best practices
- Analyze documents for clarity and completeness
- Identify potential issues and improvements
- Provide constructive, actionable feedback

## Guidelines
1. Be thorough but focused on important issues
2. Distinguish between critical issues and suggestions
3. Provide specific, actionable feedback
4. Acknowledge what's done well

## Output Format
Reviews should include:
- Overall Assessment (approve/needs work)
- Critical Issues (must fix)
- Suggestions (nice to have)
- Questions (need clarification)`,
  },

  runner: {
    type: "runner",
    displayName: "Runner Agent",
    description:
      "Executes commands, runs tests, builds projects, and manages processes",
    icon: "▶️",
    color: "cyan",
    nativeUI: true,
    capabilities: {
      tools: ["Bash", "Read"],
      allowedToolPatterns: ["Bash:*"],
    },
    systemPrompt: `You are a Runner Agent specialized in executing commands and managing processes.

## Your Capabilities
- Run shell commands and scripts
- Execute builds and tests
- Monitor command output
- Handle errors and retries

## Guidelines
1. Always show command being run
2. Capture and report output clearly
3. Handle errors gracefully
4. Report success/failure clearly

## Output Format
Command results should include:
- Command executed
- Exit status
- Output summary (truncated if long)
- Any errors or warnings`,
  },

  general: {
    type: "general",
    displayName: "General Agent",
    description: "General-purpose agent for miscellaneous tasks",
    icon: "🤖",
    color: "gray",
    nativeUI: false,
    capabilities: {
      tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch"],
    },
    systemPrompt: `You are a General Agent handling miscellaneous tasks.

Focus on completing your assigned task efficiently and reporting results clearly.`,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get agent definition by type
 */
export function getAgentDefinition(type: AgentType): AgentDefinition {
  return BUILTIN_AGENTS[type] || BUILTIN_AGENTS.general;
}

/**
 * Get all built-in agent types
 */
export function getBuiltinAgentTypes(): AgentType[] {
  return Object.keys(BUILTIN_AGENTS) as AgentType[];
}

/**
 * Check if an agent type has native UI
 */
export function hasNativeUI(type: AgentType): boolean {
  return BUILTIN_AGENTS[type]?.nativeUI ?? false;
}

/**
 * Infer agent type from role string (for backwards compatibility)
 */
export function inferAgentTypeFromRole(role: string): AgentType {
  const roleLower = role.toLowerCase();

  if (
    roleLower.includes("browser") ||
    roleLower.includes("web") ||
    roleLower.includes("scrape")
  ) {
    return "browser";
  }
  if (
    roleLower.includes("code") ||
    roleLower.includes("frontend") ||
    roleLower.includes("backend") ||
    roleLower.includes("implement") ||
    roleLower.includes("develop")
  ) {
    return "coding";
  }
  if (roleLower.includes("research") || roleLower.includes("analyze")) {
    return "research";
  }
  if (
    roleLower.includes("plan") ||
    roleLower.includes("architect") ||
    roleLower.includes("design")
  ) {
    return "planning";
  }
  if (roleLower.includes("review") || roleLower.includes("check")) {
    return "reviewer";
  }
  if (
    roleLower.includes("run") ||
    roleLower.includes("test") ||
    roleLower.includes("build") ||
    roleLower.includes("deploy")
  ) {
    return "runner";
  }

  return "general";
}

/**
 * Get display config for agent type (used by AgentCard)
 */
export function getAgentDisplayConfig(type: AgentType) {
  const def = getAgentDefinition(type);
  return {
    label: def.displayName,
    icon: def.icon,
    color: def.color,
    borderColor: `border-${def.color}-200`,
    bgColor: `bg-${def.color}-50`,
    accentColor: `text-${def.color}-600`,
  };
}

// ============================================================================
// User Agent Loading (from .claude/agents/)
// ============================================================================

export interface UserAgentDefinition extends AgentDefinition {
  /** File path to the agent definition */
  filePath: string;
  /** Whether this is a user-defined agent (vs built-in) */
  isCustom: true;
}

/**
 * Parse a user agent definition from markdown frontmatter
 * This is used by the server to load .claude/agents/*.md files
 */
export function parseUserAgentFrontmatter(
  content: string,
  filePath: string
): Partial<UserAgentDefinition> | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  try {
    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split("\n");
    const data: Record<string, string> = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        data[key] = value;
      }
    }

    // Extract body (after frontmatter) as system prompt
    const body = content.slice(frontmatterMatch[0].length).trim();

    return {
      type: (data.type as AgentType) || "general",
      displayName: data.name || data.displayName || "Custom Agent",
      description: data.description || "",
      icon: data.icon || "🤖",
      color: data.color || "gray",
      nativeUI: data.nativeUI === "true",
      capabilities: {
        tools: data.tools?.split(",").map((t) => t.trim()) || [],
        mcps: data.mcps?.split(",").map((m) => m.trim()),
        skills: data.skills?.split(",").map((s) => s.trim()),
      },
      systemPrompt: body,
      filePath,
      isCustom: true,
    };
  } catch (e) {
    console.error(`Failed to parse agent frontmatter from ${filePath}:`, e);
    return null;
  }
}
