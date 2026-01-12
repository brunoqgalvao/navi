/**
 * MCP Settings Service
 * Reads MCP server configs from Claude Code's filesystem and manages enabled states
 *
 * Sources (in priority order):
 * 1. Project-level .mcp.json
 * 2. Global ~/.mcp.json
 * 3. Claude Code's ~/.claude.json (projects[path].mcpServers)
 *
 * Navi stores enabled/disabled states in ~/.claude-code-ui/mcp-settings.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Types for external MCP server configurations
export interface ExternalMcpServer {
  name: string;
  type: "stdio" | "sse" | "streamable-http";
  // stdio type
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse/http type
  url?: string;
  // Common
  description?: string;
}

export interface McpServerInfo {
  name: string;
  enabled: boolean;
  isBuiltIn: boolean;
  toolCount?: number;
  type?: "stdio" | "sse" | "streamable-http";
  command?: string;
  url?: string;
  source?: "builtin" | "project-mcp" | "global-mcp" | "claude-json";
}

interface McpSettingsData {
  servers: Record<string, boolean>;
}

// Claude Code's ~/.claude.json structure
interface ClaudeJsonProject {
  mcpServers?: Record<string, ExternalMcpServerConfig>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
}

interface ExternalMcpServerConfig {
  type?: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

// .mcp.json structure
interface McpJsonConfig {
  mcpServers?: Record<string, ExternalMcpServerConfig>;
}

const CLAUDE_JSON_PATH = join(homedir(), ".claude.json");
const GLOBAL_MCP_JSON_PATH = join(homedir(), ".mcp.json");

// Cache for ~/.claude.json
let claudeJsonCache: any = null;
let claudeJsonCacheTime = 0;
const CACHE_TTL_MS = 1000; // 1 second cache

function loadClaudeJson(): any {
  const now = Date.now();
  if (claudeJsonCache && now - claudeJsonCacheTime < CACHE_TTL_MS) {
    return claudeJsonCache;
  }

  try {
    if (existsSync(CLAUDE_JSON_PATH)) {
      const content = readFileSync(CLAUDE_JSON_PATH, "utf-8");
      claudeJsonCache = JSON.parse(content);
      claudeJsonCacheTime = now;
      return claudeJsonCache;
    }
  } catch (e) {
    console.error("[MCP Settings] Failed to load ~/.claude.json:", e);
  }
  return { projects: {} };
}

function saveClaudeJson(data: any) {
  try {
    writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(data, null, 2));
    claudeJsonCache = data;
    claudeJsonCacheTime = Date.now();
  } catch (e) {
    console.error("[MCP Settings] Failed to save ~/.claude.json:", e);
    throw e;
  }
}

/**
 * Load external MCP servers from various config files
 */
function loadExternalMcpServers(projectPath?: string): McpServerInfo[] {
  const servers: McpServerInfo[] = [];
  const seenNames = new Set<string>();

  // 1. Project-level .mcp.json (highest priority)
  if (projectPath) {
    const projectMcpPath = join(projectPath, ".mcp.json");
    try {
      if (existsSync(projectMcpPath)) {
        const content = readFileSync(projectMcpPath, "utf-8");
        const config: McpJsonConfig = JSON.parse(content);
        if (config.mcpServers) {
          for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
            if (!seenNames.has(name)) {
              seenNames.add(name);
              servers.push({
                name,
                enabled: true, // Will be overridden by settings
                isBuiltIn: false,
                type: serverConfig.type || "stdio",
                command: serverConfig.command,
                url: serverConfig.url,
                source: "project-mcp",
              });
            }
          }
        }
        console.log(`[MCP Settings] Loaded ${Object.keys(config.mcpServers || {}).length} servers from project .mcp.json`);
      }
    } catch (e) {
      console.error(`[MCP Settings] Failed to load project .mcp.json:`, e);
    }
  }

  // 2. Global ~/.mcp.json
  try {
    if (existsSync(GLOBAL_MCP_JSON_PATH)) {
      const content = readFileSync(GLOBAL_MCP_JSON_PATH, "utf-8");
      const config: McpJsonConfig = JSON.parse(content);
      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          if (!seenNames.has(name)) {
            seenNames.add(name);
            servers.push({
              name,
              enabled: true,
              isBuiltIn: false,
              type: serverConfig.type || "stdio",
              command: serverConfig.command,
              url: serverConfig.url,
              source: "global-mcp",
            });
          }
        }
      }
      console.log(`[MCP Settings] Loaded ${Object.keys(config.mcpServers || {}).length} servers from global .mcp.json`);
    }
  } catch (e) {
    console.error(`[MCP Settings] Failed to load global .mcp.json:`, e);
  }

  // 3. Claude Code's ~/.claude.json
  if (projectPath) {
    try {
      if (existsSync(CLAUDE_JSON_PATH)) {
        const content = readFileSync(CLAUDE_JSON_PATH, "utf-8");
        const claudeJson = JSON.parse(content);
        const projectConfig: ClaudeJsonProject = claudeJson.projects?.[projectPath];

        if (projectConfig?.mcpServers && Object.keys(projectConfig.mcpServers).length > 0) {
          for (const [name, serverConfig] of Object.entries(projectConfig.mcpServers)) {
            if (!seenNames.has(name)) {
              seenNames.add(name);
              servers.push({
                name,
                enabled: true,
                isBuiltIn: false,
                type: serverConfig.type || "stdio",
                command: serverConfig.command,
                url: serverConfig.url,
                source: "claude-json",
              });
            }
          }
        }

        // Also check enabledMcpjsonServers / disabledMcpjsonServers for .mcp.json toggle states
        // This tells us which servers from .mcp.json files Claude Code has enabled/disabled
        if (projectConfig?.disabledMcpjsonServers) {
          for (const name of projectConfig.disabledMcpjsonServers) {
            const server = servers.find(s => s.name === name);
            if (server) {
              server.enabled = false;
            }
          }
        }
      }
    } catch (e) {
      console.error(`[MCP Settings] Failed to load ~/.claude.json:`, e);
    }
  }

  return servers;
}

export const mcpSettings = {
  /**
   * Get all MCP server enabled states from ~/.claude.json
   * Returns a map of server name -> enabled (true/false)
   * Reads from disabledMcpjsonServers array in project config
   */
  getAll(projectPath?: string): Record<string, boolean> {
    if (!projectPath) return {};

    const claudeJson = loadClaudeJson();
    const projectConfig = claudeJson.projects?.[projectPath];
    const disabled = projectConfig?.disabledMcpjsonServers || [];
    const mcpServers = projectConfig?.mcpServers || {};

    const result: Record<string, boolean> = {};
    // All servers default to enabled unless in disabled list
    for (const name of Object.keys(mcpServers)) {
      result[name] = !disabled.includes(name);
    }
    return result;
  },

  /**
   * Check if a specific MCP server is enabled
   * Defaults to true if not explicitly disabled
   */
  isEnabled(name: string, projectPath?: string): boolean {
    if (!projectPath) return true;

    const claudeJson = loadClaudeJson();
    const projectConfig = claudeJson.projects?.[projectPath];
    const disabled = projectConfig?.disabledMcpjsonServers || [];
    return !disabled.includes(name);
  },

  /**
   * Set the enabled state for an MCP server
   * Writes to ~/.claude.json disabledMcpjsonServers array
   */
  set(name: string, enabled: boolean, projectPath?: string) {
    if (!projectPath) {
      console.warn("[MCP Settings] Cannot set server state without projectPath");
      return;
    }

    const claudeJson = loadClaudeJson();

    // Ensure project structure exists
    if (!claudeJson.projects) claudeJson.projects = {};
    if (!claudeJson.projects[projectPath]) {
      claudeJson.projects[projectPath] = {
        allowedTools: [],
        mcpContextUris: [],
        mcpServers: {},
        enabledMcpjsonServers: [],
        disabledMcpjsonServers: [],
      };
    }

    const projectConfig = claudeJson.projects[projectPath];
    if (!projectConfig.disabledMcpjsonServers) {
      projectConfig.disabledMcpjsonServers = [];
    }

    const disabledIndex = projectConfig.disabledMcpjsonServers.indexOf(name);

    if (enabled && disabledIndex !== -1) {
      // Remove from disabled list to enable
      projectConfig.disabledMcpjsonServers.splice(disabledIndex, 1);
    } else if (!enabled && disabledIndex === -1) {
      // Add to disabled list to disable
      projectConfig.disabledMcpjsonServers.push(name);
    }

    saveClaudeJson(claudeJson);
    console.log(`[MCP Settings] ${name} ${enabled ? "enabled" : "disabled"} for ${projectPath} (saved to ~/.claude.json)`);
  },

  /**
   * Reset all MCP settings for a project (clear disabled list)
   */
  reset(projectPath?: string) {
    if (!projectPath) return;

    const claudeJson = loadClaudeJson();
    if (claudeJson.projects?.[projectPath]) {
      claudeJson.projects[projectPath].disabledMcpjsonServers = [];
      saveClaudeJson(claudeJson);
    }
    console.log("[MCP Settings] Reset disabled servers for", projectPath);
  },

  /**
   * Reload settings from disk (invalidate cache)
   */
  reload() {
    claudeJsonCache = null;
    claudeJsonCacheTime = 0;
  },

  /**
   * Check if a built-in server is disabled
   * Built-in servers are stored in a special key in the project config
   */
  isDisabledBuiltin(name: string, projectPath?: string): boolean {
    if (!projectPath) return false;

    const claudeJson = loadClaudeJson();
    const projectConfig = claudeJson.projects?.[projectPath];

    // Built-in servers use disabledNaviMcpServers array
    const disabledBuiltins = projectConfig?.disabledNaviMcpServers || [];
    return disabledBuiltins.includes(name);
  },

  /**
   * Toggle a built-in server's enabled state
   * Uses a separate key (disabledNaviMcpServers) to not conflict with Claude Code's settings
   */
  setBuiltin(name: string, enabled: boolean, projectPath?: string) {
    if (!projectPath) {
      console.warn("[MCP Settings] Cannot set builtin server state without projectPath");
      return;
    }

    const claudeJson = loadClaudeJson();

    // Ensure project structure exists
    if (!claudeJson.projects) claudeJson.projects = {};
    if (!claudeJson.projects[projectPath]) {
      claudeJson.projects[projectPath] = {
        allowedTools: [],
        mcpContextUris: [],
        mcpServers: {},
        enabledMcpjsonServers: [],
        disabledMcpjsonServers: [],
        disabledNaviMcpServers: [],
      };
    }

    const projectConfig = claudeJson.projects[projectPath];
    if (!projectConfig.disabledNaviMcpServers) {
      projectConfig.disabledNaviMcpServers = [];
    }

    const disabledIndex = projectConfig.disabledNaviMcpServers.indexOf(name);

    if (enabled && disabledIndex !== -1) {
      // Remove from disabled list to enable
      projectConfig.disabledNaviMcpServers.splice(disabledIndex, 1);
    } else if (!enabled && disabledIndex === -1) {
      // Add to disabled list to disable
      projectConfig.disabledNaviMcpServers.push(name);
    }

    saveClaudeJson(claudeJson);
    console.log(`[MCP Settings] Builtin ${name} ${enabled ? "enabled" : "disabled"} for ${projectPath}`);
  },

  /**
   * Get all external MCP servers from filesystem with their enabled states
   * Merges configs from .mcp.json files and ~/.claude.json
   */
  getExternalServers(projectPath?: string): McpServerInfo[] {
    const servers = loadExternalMcpServers(projectPath);
    const enabledStates = this.getAll(projectPath);

    // Apply Navi's enabled states (overrides Claude Code's states)
    for (const server of servers) {
      if (enabledStates[server.name] !== undefined) {
        server.enabled = enabledStates[server.name];
      }
    }

    return servers;
  },

  /**
   * Get external MCP server configs for passing to Claude Agent SDK
   * Only returns enabled servers with their full config
   */
  getEnabledExternalServerConfigs(projectPath?: string): Record<string, ExternalMcpServerConfig> {
    const servers = this.getExternalServers(projectPath);
    const configs: Record<string, ExternalMcpServerConfig> = {};

    for (const server of servers) {
      if (server.enabled) {
        // Re-read the original config to get full details
        // This is a bit redundant but ensures we have complete config
        const fullConfig = this.getServerConfig(server.name, projectPath);
        if (fullConfig) {
          configs[server.name] = fullConfig;
        }
      }
    }

    return configs;
  },

  /**
   * Get the full config for a specific server
   */
  getServerConfig(name: string, projectPath?: string): ExternalMcpServerConfig | null {
    // Check project .mcp.json first
    if (projectPath) {
      const projectMcpPath = join(projectPath, ".mcp.json");
      try {
        if (existsSync(projectMcpPath)) {
          const content = readFileSync(projectMcpPath, "utf-8");
          const config: McpJsonConfig = JSON.parse(content);
          if (config.mcpServers?.[name]) {
            return config.mcpServers[name];
          }
        }
      } catch {}
    }

    // Check global .mcp.json
    try {
      if (existsSync(GLOBAL_MCP_JSON_PATH)) {
        const content = readFileSync(GLOBAL_MCP_JSON_PATH, "utf-8");
        const config: McpJsonConfig = JSON.parse(content);
        if (config.mcpServers?.[name]) {
          return config.mcpServers[name];
        }
      }
    } catch {}

    // Check ~/.claude.json
    if (projectPath) {
      try {
        if (existsSync(CLAUDE_JSON_PATH)) {
          const content = readFileSync(CLAUDE_JSON_PATH, "utf-8");
          const claudeJson = JSON.parse(content);
          const projectConfig: ClaudeJsonProject = claudeJson.projects?.[projectPath];
          if (projectConfig?.mcpServers?.[name]) {
            return projectConfig.mcpServers[name];
          }
        }
      } catch {}
    }

    return null;
  },
};
