/**
 * Unified Agent Bundle Loader
 *
 * This module handles two distinct agent concepts:
 *
 * 1. SDK SUBAGENTS - Lightweight agents spawned via Task tool within a Claude session
 *    - Defined in `agents:` section of agent.yaml
 *    - Ephemeral, run within parent's context window
 *    - Used for quick, focused subtasks
 *
 * 2. NAVI AGENTS - Full-featured agent bundles that create independent sessions
 *    - Defined as .md files or directory bundles in .claude/agents/
 *    - Persistent sessions with their own lifecycle
 *    - Support skills, MCPs, UI customization, deployment
 *
 * Loading order (later overrides earlier):
 * 1. Built-in agents (hardcoded defaults)
 * 2. Global agents (~/.claude/agents/)
 * 3. Project agents (.claude/agents/)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";

// ============================================================================
// Shared Types
// ============================================================================

export type AgentModel = "haiku" | "sonnet" | "opus";

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface AgentToolsConfig {
  allowed?: string[];
  disallowed?: string[];
}

export interface HookConfig {
  matcher: string;
  action: string; // "log" | "file:path/to/hook.ts" | inline function ref
}

export interface HooksConfig {
  PreToolUse?: HookConfig[];
  PostToolUse?: HookConfig[];
  Stop?: HookConfig[];
  SessionStart?: HookConfig[];
  SessionEnd?: HookConfig[];
}

// ============================================================================
// SDK Subagent Types (ephemeral, in-process)
// ============================================================================

/**
 * SDK Subagent - spawned via Task tool, lives within parent session
 * This matches the Claude Agent SDK AgentDefinition format
 */
export interface SDKSubagent {
  description: string;
  prompt: string;
  tools?: string[]; // Simple array for SDK compatibility
  model?: AgentModel;
}

/**
 * Collection of SDK subagents (used in agents: section of agent.yaml)
 */
export type SDKSubagents = Record<string, SDKSubagent>;

// ============================================================================
// Navi Agent Types (persistent, independent sessions)
// ============================================================================

/**
 * Navi Agent UI Configuration
 */
export interface NaviUIConfig {
  icon?: string;
  color?: string;
  nativeUI?: boolean;
  widget?: string;
  panel?: {
    showPreview?: boolean;
    showTerminal?: boolean;
    defaultTab?: string;
  };
}

export interface IntegrationRequirement {
  name: string;
  reason: string;
  scopes?: string[];
}

export interface NaviSetupConfig {
  script?: string;
  requirements?: string[];
  install?: {
    npm?: string[];
    pip?: string[];
  };
}

export interface NaviDeployConfig {
  targets?: string[];
  resources?: {
    memory?: string;
    timeout?: string;
  };
  secrets?: string[];
}

export interface NaviMetaConfig {
  author?: string;
  version?: string;
  license?: string;
  repository?: string;
  tags?: string[];
}

export interface NaviExtensions {
  ui?: NaviUIConfig;
  skills?: string[];
  integrations?: {
    required?: IntegrationRequirement[];
    optional?: IntegrationRequirement[];
  };
  env?: {
    required?: string[];
    optional?: string[];
  };
  commands?: string[];
  setup?: NaviSetupConfig;
  deploy?: NaviDeployConfig;
  meta?: NaviMetaConfig;
}

/**
 * Navi Agent Bundle - A full-featured agent that creates independent sessions
 *
 * This is the main agent type in Navi. It supports:
 * - Custom system prompts and model preferences
 * - Tool restrictions
 * - MCP server connections
 * - SDK Subagents (for in-process Task tool spawning)
 * - Skills, integrations, and deployment configuration
 */
export interface NaviAgent {
  // Identity
  id: string; // slug/name used to reference the agent
  name: string; // Display name
  description: string;

  // Source info
  source: "builtin" | "global" | "project";
  path?: string; // File/directory path if loaded from disk

  // SDK-compatible core
  prompt: string;
  model?: AgentModel;
  tools?: AgentToolsConfig;
  permissionMode?: "default" | "bypassPermissions" | "acceptEdits";
  mcpServers?: Record<string, MCPServerConfig>;
  hooks?: HooksConfig;

  // SDK Subagents - spawned via Task tool within this agent's session
  subagents?: SDKSubagents;

  // Navi extensions
  navi?: NaviExtensions;

  // Legacy fields (for backwards compatibility)
  type?: string; // "browser" | "coding" | etc.
}

// Alias for backwards compatibility
export type AgentBundle = NaviAgent;

/**
 * Resolved agent ready for execution
 */
export interface ResolvedAgent extends AgentBundle {
  // Resolved allowed tools list (combining defaults + agent config)
  resolvedAllowedTools: string[];
  // Resolved disallowed tools list
  resolvedDisallowedTools: string[];
  // Resolved model (agent override or default)
  resolvedModel: AgentModel;
  // Resolved skills (paths to skill directories)
  resolvedSkills: string[];
}

// ============================================================================
// Built-in Agent Definitions
// ============================================================================

const BUILTIN_AGENTS: Record<string, Omit<AgentBundle, "id" | "source">> = {
  browser: {
    name: "Browser Agent",
    description:
      "Browses the web, researches topics, gathers information from URLs, and can interact with web pages",
    type: "browser",
    model: "sonnet",
    tools: {
      allowed: ["WebFetch", "WebSearch", "Read", "Write"],
    },
    prompt: `You are a Browser Agent specialized in web research and information gathering.

## Your Capabilities
- **Web Browsing**: Fetch and analyze web pages using WebFetch
- **Web Search**: Search for information using WebSearch
- **Screenshots**: Take screenshots of pages using the playwright skill
- **Page Interaction**: Navigate, click, fill forms via playwright

## Guidelines
- Always cite your sources with URLs
- Extract key information, don't just dump page content
- If a page is paywalled or inaccessible, note it and try alternatives
- Summarize findings at the end`,
    navi: {
      ui: {
        icon: "🌐",
        color: "blue",
        nativeUI: true,
      },
      skills: ["global:playwright"],
    },
  },

  coding: {
    name: "Coding Agent",
    description: "Implements code changes, creates files, runs commands, and manages codebases",
    type: "coding",
    model: "sonnet",
    tools: {
      allowed: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TodoWrite"],
    },
    prompt: `You are a Coding Agent specialized in implementing code changes.

## Your Capabilities
- **Read Code**: Understand existing codebases using Read, Glob, Grep
- **Write Code**: Create and modify files using Write and Edit
- **Run Commands**: Execute builds, tests, installs via Bash
- **Track Progress**: Use TodoWrite to manage multi-step implementations

## Guidelines
- **Read before writing** - Always understand existing code first
- **Follow existing patterns** - Match the codebase's style
- **Minimal changes** - Only modify what's necessary
- **Don't over-engineer** - Simple solutions preferred
- **Test when possible** - Run existing tests after changes`,
    navi: {
      ui: {
        icon: "🔧",
        color: "emerald",
        nativeUI: true,
      },
    },
  },

  runner: {
    name: "Runner Agent",
    description: "Executes commands, runs tests, builds projects, and manages processes",
    type: "runner",
    model: "sonnet",
    tools: {
      allowed: ["Bash", "Read"],
    },
    prompt: `You are a Runner Agent specialized in executing commands and managing processes.

## Your Capabilities
- Run shell commands and scripts
- Execute builds and tests
- Monitor command output
- Handle errors and retries

## Guidelines
- Always show command being run
- Capture and report output clearly
- Handle errors gracefully
- Report success/failure clearly`,
    navi: {
      ui: {
        icon: "▶️",
        color: "cyan",
        nativeUI: true,
      },
    },
  },

  research: {
    name: "Research Agent",
    description: "Conducts deep research and synthesizes findings",
    type: "research",
    model: "sonnet",
    tools: {
      allowed: ["WebFetch", "WebSearch", "Read", "Write"],
    },
    prompt: `You are a Research Agent specialized in deep analysis and information synthesis.

## Your Capabilities
- Search and analyze multiple sources
- Compare and contrast information
- Identify patterns and insights
- Create structured research reports

## Guidelines
- Cast a wide net initially, then focus
- Cross-reference claims across sources
- Note confidence levels for findings
- Highlight uncertainties and gaps`,
    navi: {
      ui: {
        icon: "🔍",
        color: "purple",
      },
    },
  },

  planning: {
    name: "Planning Agent",
    description: "Breaks down complex tasks into actionable steps",
    type: "planning",
    model: "sonnet",
    tools: {
      allowed: ["Read", "Glob", "Grep", "TodoWrite"],
    },
    prompt: `You are a Planning Agent specialized in task breakdown and project planning.

## Your Capabilities
- Analyze requirements and scope
- Break down complex tasks into steps
- Identify dependencies and risks
- Create actionable implementation plans

## Guidelines
- Start with understanding the goal
- Identify constraints and dependencies
- Order tasks by priority and dependencies
- Include clear success criteria for each step`,
    navi: {
      ui: {
        icon: "📋",
        color: "amber",
      },
    },
  },

  reviewer: {
    name: "Reviewer Agent",
    description: "Reviews code and documents for quality and correctness",
    type: "reviewer",
    model: "sonnet",
    tools: {
      allowed: ["Read", "Glob", "Grep"],
    },
    prompt: `You are a Reviewer Agent specialized in quality review and feedback.

## Your Capabilities
- Review code for bugs, style, and best practices
- Analyze documents for clarity and completeness
- Identify potential issues and improvements
- Provide constructive, actionable feedback

## Guidelines
- Be thorough but focused on important issues
- Distinguish between critical issues and suggestions
- Provide specific, actionable feedback
- Acknowledge what's done well`,
    navi: {
      ui: {
        icon: "👀",
        color: "rose",
      },
    },
  },

  general: {
    name: "General Agent",
    description: "General-purpose agent for miscellaneous tasks",
    type: "general",
    model: "sonnet",
    tools: {
      allowed: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "TodoWrite"],
    },
    prompt: `You are a General Agent handling miscellaneous tasks.
Focus on completing your assigned task efficiently and reporting results clearly.`,
    navi: {
      ui: {
        icon: "🤖",
        color: "gray",
      },
    },
  },
};

// ============================================================================
// Agent Loader Class
// ============================================================================

export class AgentLoader {
  private cache = new Map<string, { bundle: AgentBundle; loadedAt: number }>();
  private cacheTTL = 30000; // 30 seconds

  /**
   * Load all agents from all sources, merged by precedence
   */
  async loadAllAgents(projectPath: string): Promise<Map<string, AgentBundle>> {
    const agents = new Map<string, AgentBundle>();

    // 1. Load built-in agents
    for (const [id, def] of Object.entries(BUILTIN_AGENTS)) {
      agents.set(id, { ...def, id, source: "builtin" });
    }

    // 2. Load global agents (~/.claude/agents/)
    const globalAgentsDir = path.join(os.homedir(), ".claude", "agents");
    const globalAgents = await this.loadAgentsFromDirectory(globalAgentsDir, "global");
    for (const agent of globalAgents) {
      agents.set(agent.id, agent);
    }

    // 3. Load project agents (.claude/agents/)
    const projectAgentsDir = path.join(projectPath, ".claude", "agents");
    const projectAgents = await this.loadAgentsFromDirectory(projectAgentsDir, "project");
    for (const agent of projectAgents) {
      agents.set(agent.id, agent);
    }

    return agents;
  }

  /**
   * Load a specific agent by ID
   */
  async loadAgent(
    agentId: string,
    projectPath: string
  ): Promise<AgentBundle | null> {
    // Check cache first
    const cacheKey = `${projectPath}:${agentId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < this.cacheTTL) {
      return cached.bundle;
    }

    // Try loading from different sources
    // 1. Project agents (highest priority)
    const projectAgentsDir = path.join(projectPath, ".claude", "agents");
    const projectAgent = await this.loadAgentFromSource(agentId, projectAgentsDir, "project");
    if (projectAgent) {
      this.cache.set(cacheKey, { bundle: projectAgent, loadedAt: Date.now() });
      return projectAgent;
    }

    // 2. Global agents
    const globalAgentsDir = path.join(os.homedir(), ".claude", "agents");
    const globalAgent = await this.loadAgentFromSource(agentId, globalAgentsDir, "global");
    if (globalAgent) {
      this.cache.set(cacheKey, { bundle: globalAgent, loadedAt: Date.now() });
      return globalAgent;
    }

    // 3. Built-in agents
    if (BUILTIN_AGENTS[agentId]) {
      const builtinAgent: AgentBundle = {
        ...BUILTIN_AGENTS[agentId],
        id: agentId,
        source: "builtin",
      };
      this.cache.set(cacheKey, { bundle: builtinAgent, loadedAt: Date.now() });
      return builtinAgent;
    }

    return null;
  }

  /**
   * Resolve an agent for execution - fills in defaults and resolves references
   */
  async resolveAgent(
    agentId: string,
    projectPath: string,
    defaultModel: AgentModel = "sonnet"
  ): Promise<ResolvedAgent | null> {
    const bundle = await this.loadAgent(agentId, projectPath);
    if (!bundle) return null;

    // Default tools if none specified
    const defaultTools = [
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "WebFetch", "WebSearch", "TodoWrite", "Task", "TaskOutput"
    ];

    // Resolve allowed tools
    const allowedTools = bundle.tools?.allowed || defaultTools;
    const disallowedTools = bundle.tools?.disallowed || [];

    // Resolve skills
    const resolvedSkills = await this.resolveSkills(
      bundle.navi?.skills || [],
      projectPath
    );

    return {
      ...bundle,
      resolvedAllowedTools: allowedTools.filter(t => !disallowedTools.includes(t)),
      resolvedDisallowedTools: disallowedTools,
      resolvedModel: bundle.model || defaultModel,
      resolvedSkills,
    };
  }

  /**
   * Load agents from a directory (supports both simple and complex formats)
   */
  private async loadAgentsFromDirectory(
    agentsDir: string,
    source: "global" | "project"
  ): Promise<AgentBundle[]> {
    const agents: AgentBundle[] = [];

    if (!fs.existsSync(agentsDir)) {
      return agents;
    }

    try {
      const entries = fs.readdirSync(agentsDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip non-agent files
        if (entry.name.startsWith(".")) continue;
        if (entry.name === "AGENTS.md") continue;

        const fullPath = path.join(agentsDir, entry.name);

        if (entry.isFile() && entry.name.endsWith(".md")) {
          // Simple format: single .md file
          const agent = await this.loadSimpleAgent(fullPath, source);
          if (agent) agents.push(agent);
        } else if (entry.isDirectory()) {
          // Complex format: directory bundle
          const agent = await this.loadComplexAgent(fullPath, source);
          if (agent) agents.push(agent);
        }
      }
    } catch (e) {
      console.error(`[AgentLoader] Error loading from ${agentsDir}:`, e);
    }

    return agents;
  }

  /**
   * Load a specific agent from a source directory
   */
  private async loadAgentFromSource(
    agentId: string,
    agentsDir: string,
    source: "global" | "project"
  ): Promise<AgentBundle | null> {
    if (!fs.existsSync(agentsDir)) return null;

    // Try simple format first: {agentId}.md
    const simplePath = path.join(agentsDir, `${agentId}.md`);
    if (fs.existsSync(simplePath)) {
      return this.loadSimpleAgent(simplePath, source);
    }

    // Try complex format: {agentId}/ directory
    const complexPath = path.join(agentsDir, agentId);
    if (fs.existsSync(complexPath) && fs.statSync(complexPath).isDirectory()) {
      return this.loadComplexAgent(complexPath, source);
    }

    return null;
  }

  /**
   * Load a simple agent from a single .md file
   */
  private async loadSimpleAgent(
    filePath: string,
    source: "global" | "project"
  ): Promise<AgentBundle | null> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = this.parseMarkdownAgent(content);
      if (!parsed) return null;

      const id = path.basename(filePath, ".md");

      return {
        id,
        source,
        path: filePath,
        ...parsed,
      };
    } catch (e) {
      console.error(`[AgentLoader] Error loading simple agent from ${filePath}:`, e);
      return null;
    }
  }

  /**
   * Load a complex agent from a directory bundle
   */
  private async loadComplexAgent(
    dirPath: string,
    source: "global" | "project"
  ): Promise<AgentBundle | null> {
    try {
      const id = path.basename(dirPath);

      // Check for agent.yaml (primary) or agent.md (fallback)
      const agentYamlPath = path.join(dirPath, "agent.yaml");
      const agentMdPath = path.join(dirPath, "agent.md");

      let bundle: Partial<AgentBundle> = { id, source, path: dirPath };

      if (fs.existsSync(agentYamlPath)) {
        // Load from agent.yaml
        const yamlContent = fs.readFileSync(agentYamlPath, "utf-8");
        const parsed = yaml.parse(yamlContent);
        bundle = { ...bundle, ...this.normalizeYamlConfig(parsed) };

        // Load prompt from file reference or prompt.md
        if (bundle.prompt?.startsWith("file:")) {
          const promptPath = path.join(dirPath, bundle.prompt.slice(5));
          if (fs.existsSync(promptPath)) {
            bundle.prompt = fs.readFileSync(promptPath, "utf-8");
          }
        } else {
          const promptMdPath = path.join(dirPath, "prompt.md");
          if (fs.existsSync(promptMdPath)) {
            bundle.prompt = fs.readFileSync(promptMdPath, "utf-8");
          }
        }
      } else if (fs.existsSync(agentMdPath)) {
        // Fallback to agent.md (simple format in a directory)
        const content = fs.readFileSync(agentMdPath, "utf-8");
        const parsed = this.parseMarkdownAgent(content);
        if (parsed) {
          bundle = { ...bundle, ...parsed };
        }
      } else {
        return null;
      }

      // Load navi.yaml extensions if present
      const naviYamlPath = path.join(dirPath, "navi.yaml");
      if (fs.existsSync(naviYamlPath)) {
        const naviContent = fs.readFileSync(naviYamlPath, "utf-8");
        const naviParsed = yaml.parse(naviContent);
        bundle.navi = { ...bundle.navi, ...naviParsed };
      }

      // Validate required fields
      if (!bundle.description) {
        console.warn(`[AgentLoader] Agent ${id} missing description, skipping`);
        return null;
      }

      return bundle as AgentBundle;
    } catch (e) {
      console.error(`[AgentLoader] Error loading complex agent from ${dirPath}:`, e);
      return null;
    }
  }

  /**
   * Parse a markdown agent file with YAML frontmatter
   */
  private parseMarkdownAgent(content: string): Omit<AgentBundle, "id" | "source" | "path"> | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    try {
      const frontmatter = frontmatterMatch[1];
      const body = content.slice(frontmatterMatch[0].length).trim();

      // Parse YAML frontmatter
      let parsed: Record<string, any>;
      try {
        parsed = yaml.parse(frontmatter);
      } catch {
        // Fallback to simple key: value parsing for backwards compatibility
        parsed = {};
        for (const line of frontmatter.split("\n")) {
          const colonIndex = line.indexOf(":");
          if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim();
            parsed[key] = value;
          }
        }
      }

      // Normalize to AgentBundle format
      const bundle = this.normalizeYamlConfig(parsed);
      bundle.prompt = body;

      // Validate
      if (!bundle.description) return null;

      return bundle;
    } catch (e) {
      console.error("[AgentLoader] Error parsing markdown agent:", e);
      return null;
    }
  }

  /**
   * Normalize YAML config to AgentBundle format
   */
  private normalizeYamlConfig(
    parsed: Record<string, any>
  ): Omit<AgentBundle, "id" | "source"> {
    const bundle: Omit<AgentBundle, "id" | "source"> = {
      name: parsed.name || "Unnamed Agent",
      description: parsed.description || "",
      prompt: parsed.prompt || "",
    };

    // Model
    if (parsed.model && ["haiku", "sonnet", "opus"].includes(parsed.model)) {
      bundle.model = parsed.model as AgentModel;
    }

    // Tools - handle both string and object formats
    if (parsed.tools) {
      if (typeof parsed.tools === "string") {
        // Simple comma-separated string
        bundle.tools = {
          allowed: parsed.tools.split(",").map((t: string) => t.trim()),
        };
      } else if (Array.isArray(parsed.tools)) {
        bundle.tools = { allowed: parsed.tools };
      } else if (typeof parsed.tools === "object") {
        bundle.tools = {
          allowed: parsed.tools.allowed || [],
          disallowed: parsed.tools.disallowed || [],
        };
      }
    }

    // Permission mode
    if (parsed.permissionMode) {
      bundle.permissionMode = parsed.permissionMode;
    }

    // MCP servers
    if (parsed.mcpServers) {
      bundle.mcpServers = parsed.mcpServers;
    }

    // SDK Subagents (from agents: or subagents: in config)
    if (parsed.agents || parsed.subagents) {
      bundle.subagents = parsed.subagents || parsed.agents;
    }

    // Hooks
    if (parsed.hooks) {
      bundle.hooks = parsed.hooks;
    }

    // Legacy type field
    if (parsed.type) {
      bundle.type = parsed.type;
    }

    // Navi extensions - from prefixed fields or navi object
    const navi: NaviExtensions = {};

    // UI config - from navi_ prefixed fields or dedicated fields
    const ui: NaviUIConfig = {};
    if (parsed.icon || parsed.navi_icon) ui.icon = parsed.icon || parsed.navi_icon;
    if (parsed.color || parsed.navi_color) ui.color = parsed.color || parsed.navi_color;
    if (parsed.nativeUI !== undefined || parsed.navi_nativeUI !== undefined) {
      ui.nativeUI = parsed.nativeUI ?? parsed.navi_nativeUI;
    }
    if (Object.keys(ui).length > 0) navi.ui = ui;

    // Skills
    if (parsed.skills || parsed.navi_skills) {
      const skillsRaw = parsed.skills || parsed.navi_skills;
      navi.skills = typeof skillsRaw === "string"
        ? skillsRaw.split(",").map((s: string) => s.trim())
        : skillsRaw;
    }

    // MCPs (legacy field)
    if (parsed.mcps || parsed.navi_mcps) {
      const mcpsRaw = parsed.mcps || parsed.navi_mcps;
      const mcpNames = typeof mcpsRaw === "string"
        ? mcpsRaw.split(",").map((m: string) => m.trim())
        : mcpsRaw;
      // Convert to mcpServers format (placeholder - actual config needed)
      if (!bundle.mcpServers) bundle.mcpServers = {};
      for (const name of mcpNames) {
        if (!bundle.mcpServers[name]) {
          bundle.mcpServers[name] = { command: name }; // Placeholder
        }
      }
    }

    // Integrations
    if (parsed.integrations || parsed.navi_integrations) {
      const intRaw = parsed.integrations || parsed.navi_integrations;
      if (typeof intRaw === "string") {
        navi.integrations = {
          required: intRaw.split(",").map((i: string) => ({
            name: i.trim(),
            reason: "Required by agent",
          })),
        };
      } else {
        navi.integrations = intRaw;
      }
    }

    if (Object.keys(navi).length > 0) {
      bundle.navi = navi;
    }

    return bundle;
  }

  /**
   * Resolve skill references to paths
   */
  private async resolveSkills(
    skills: string[],
    projectPath: string
  ): Promise<string[]> {
    const resolved: string[] = [];

    for (const skill of skills) {
      if (skill.startsWith("global:")) {
        // Global skill: ~/.claude/skills/{name}
        const name = skill.slice(7);
        const skillPath = path.join(os.homedir(), ".claude", "skills", name);
        if (fs.existsSync(skillPath)) {
          resolved.push(skillPath);
        }
      } else if (skill.startsWith("project:")) {
        // Project skill: .claude/skills/{name}
        const name = skill.slice(8);
        const skillPath = path.join(projectPath, ".claude", "skills", name);
        if (fs.existsSync(skillPath)) {
          resolved.push(skillPath);
        }
      } else if (skill.startsWith("./") || skill.startsWith("../")) {
        // Relative path (for bundled skills)
        const skillPath = path.resolve(projectPath, skill);
        if (fs.existsSync(skillPath)) {
          resolved.push(skillPath);
        }
      } else {
        // Default: try project first, then global
        const projectSkillPath = path.join(projectPath, ".claude", "skills", skill);
        const globalSkillPath = path.join(os.homedir(), ".claude", "skills", skill);

        if (fs.existsSync(projectSkillPath)) {
          resolved.push(projectSkillPath);
        } else if (fs.existsSync(globalSkillPath)) {
          resolved.push(globalSkillPath);
        }
      }
    }

    return resolved;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const agentLoader = new AgentLoader();

// ============================================================================
// Helper Functions (backwards compatible with old code)
// ============================================================================

/**
 * Load all agents as a simple record (backwards compatible)
 */
export async function loadAllAgents(cwd: string): Promise<Record<string, {
  description: string;
  prompt: string;
  model?: AgentModel;
  tools?: string[];
}>> {
  const agents = await agentLoader.loadAllAgents(cwd);
  const result: Record<string, any> = {};

  agents.forEach((bundle, id) => {
    result[id] = {
      description: bundle.description,
      prompt: bundle.prompt,
      model: bundle.model,
      tools: bundle.tools?.allowed,
    };
  });

  return result;
}

/**
 * Get a resolved agent ready for execution
 */
export async function getResolvedAgent(
  agentId: string,
  projectPath: string,
  defaultModel: AgentModel = "sonnet"
): Promise<ResolvedAgent | null> {
  return agentLoader.resolveAgent(agentId, projectPath, defaultModel);
}
