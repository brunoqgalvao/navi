/**
 * Agent Type System (Server-side)
 *
 * Defines agent types with their capabilities and system prompts.
 * This is the server-side version used for spawning agents.
 */

export type AgentType =
  | "browser"
  | "coding"
  | "research"
  | "planning"
  | "reviewer"
  | "runner"
  | "general";

export interface AgentDefinition {
  type: AgentType;
  displayName: string;
  description: string;
  tools: string[];
  skills?: string[];
  systemPrompt: string;
}

export const AGENT_DEFINITIONS: Record<AgentType, AgentDefinition> = {
  browser: {
    type: "browser",
    displayName: "Browser Agent",
    description: "Browses the web, researches topics, and gathers information",
    tools: ["WebFetch", "WebSearch", "Read", "Write"],
    skills: ["playwright"],
    systemPrompt: `You are a Browser Agent specialized in web research and information gathering.

## Your Capabilities
- Browse web pages and extract information using WebFetch
- Search the web for specific topics using WebSearch
- Take screenshots of pages (via playwright skill if available)

## Guidelines
1. Always verify information from multiple sources when possible
2. Cite your sources with URLs
3. Extract and summarize key findings
4. Report back with structured findings

## Output Format
When reporting findings:
- **Source**: URL
- **Key Finding**: Summary
- **Relevance**: How it relates to the task`,
  },

  coding: {
    type: "coding",
    displayName: "Coding Agent",
    description: "Implements code changes, creates files, and manages codebases",
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TodoWrite"],
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
When delivering:
- Files created/modified with line counts
- Key changes made
- Any issues encountered`,
  },

  research: {
    type: "research",
    displayName: "Research Agent",
    description: "Conducts deep research and synthesizes findings",
    tools: ["WebFetch", "WebSearch", "Read", "Write"],
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
- Executive Summary (2-3 sentences)
- Key Findings (bulleted)
- Supporting Evidence
- Open Questions / Limitations`,
  },

  planning: {
    type: "planning",
    displayName: "Planning Agent",
    description: "Breaks down complex tasks into actionable steps",
    tools: ["Read", "Glob", "Grep", "TodoWrite"],
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
- Goal Statement
- Prerequisites
- Ordered Task List with descriptions
- Risk/Blockers identified
- Success Criteria`,
  },

  reviewer: {
    type: "reviewer",
    displayName: "Reviewer Agent",
    description: "Reviews code and documents for quality and correctness",
    tools: ["Read", "Glob", "Grep"],
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
- Overall Assessment (approve/needs work)
- Critical Issues (must fix)
- Suggestions (nice to have)
- Questions (need clarification)`,
  },

  runner: {
    type: "runner",
    displayName: "Runner Agent",
    description: "Executes commands, runs tests, and manages processes",
    tools: ["Bash", "Read"],
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
- Command executed
- Exit status
- Output summary (truncated if long)
- Any errors or warnings`,
  },

  general: {
    type: "general",
    displayName: "General Agent",
    description: "General-purpose agent for miscellaneous tasks",
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch"],
    systemPrompt: `You are a General Agent handling miscellaneous tasks.
Focus on completing your assigned task efficiently and reporting results clearly.`,
  },
};

/**
 * Get agent definition by type
 */
export function getAgentDefinition(type: AgentType | string): AgentDefinition {
  return AGENT_DEFINITIONS[type as AgentType] || AGENT_DEFINITIONS.general;
}

/**
 * Infer agent type from role string
 */
export function inferAgentTypeFromRole(role: string): AgentType {
  const roleLower = role.toLowerCase();

  if (roleLower.includes("browser") || roleLower.includes("web") || roleLower.includes("scrape")) {
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
  if (roleLower.includes("plan") || roleLower.includes("architect") || roleLower.includes("design")) {
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

// ============================================================================
// User Agent Loading
// ============================================================================

import { readdir, readFile } from "fs/promises";
import { join } from "path";

export interface UserAgent extends AgentDefinition {
  filePath: string;
  isCustom: true;
}

// Cache for loaded user agents
const userAgentCache = new Map<string, { agents: UserAgent[]; loadedAt: number }>();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Load user-defined agents from .claude/agents/*.md files
 */
export async function loadUserAgents(projectPath: string): Promise<UserAgent[]> {
  const cacheKey = projectPath;
  const cached = userAgentCache.get(cacheKey);

  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.agents;
  }

  const agentsDir = join(projectPath, ".claude", "agents");
  const agents: UserAgent[] = [];

  try {
    const files = await readdir(agentsDir);

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const filePath = join(agentsDir, file);
      const content = await readFile(filePath, "utf-8");
      const parsed = parseAgentMarkdown(content, filePath);

      if (parsed) {
        agents.push(parsed);
      }
    }

    userAgentCache.set(cacheKey, { agents, loadedAt: Date.now() });
  } catch (e) {
    // Directory doesn't exist or can't be read - that's fine
  }

  return agents;
}

/**
 * Parse agent definition from markdown with frontmatter
 */
function parseAgentMarkdown(content: string, filePath: string): UserAgent | null {
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

    const agentType = (data.type as AgentType) || "general";

    return {
      type: agentType,
      displayName: data.name || data.displayName || "Custom Agent",
      description: data.description || "",
      tools: data.tools?.split(",").map((t) => t.trim()) || [],
      skills: data.skills?.split(",").map((s) => s.trim()),
      systemPrompt: body,
      filePath,
      isCustom: true,
    };
  } catch (e) {
    console.error(`Failed to parse agent from ${filePath}:`, e);
    return null;
  }
}

/**
 * Get agent definition, checking user agents first
 */
export async function getAgentDefinitionWithUserAgents(
  type: AgentType | string,
  projectPath: string
): Promise<AgentDefinition> {
  const userAgents = await loadUserAgents(projectPath);
  const userAgent = userAgents.find((a) => a.type === type);

  if (userAgent) {
    return userAgent;
  }

  return AGENT_DEFINITIONS[type as AgentType] || AGENT_DEFINITIONS.general;
}
