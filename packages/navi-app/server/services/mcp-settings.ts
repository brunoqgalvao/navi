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
import { getCredential, setCredential, type CredentialScope } from "../integrations/credentials";

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
  // Credential references - maps env var name to credential provider:key
  // e.g., { "GITHUB_PERSONAL_ACCESS_TOKEN": "github:pat" }
  credentialRefs?: Record<string, string>;
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
  // Credential references for secure credential storage
  credentialRefs?: Record<string, string>;
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
   * Resolves credential references to actual values
   */
  getEnabledExternalServerConfigs(projectPath?: string): Record<string, ExternalMcpServerConfig> {
    const servers = this.getExternalServers(projectPath);
    const configs: Record<string, ExternalMcpServerConfig> = {};

    for (const server of servers) {
      if (server.enabled) {
        // Re-read the original config to get full details
        const fullConfig = this.getServerConfig(server.name, projectPath);
        if (fullConfig) {
          // Resolve credential references to actual values
          const resolvedConfig = this.resolveCredentials(fullConfig, projectPath);
          configs[server.name] = resolvedConfig;
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

  /**
   * Add a new MCP server to project or global config
   */
  addServer(
    name: string,
    config: ExternalMcpServerConfig,
    scope: "project" | "global",
    projectPath?: string
  ) {
    if (scope === "project") {
      if (!projectPath) {
        throw new Error("projectPath is required for project scope");
      }
      const mcpJsonPath = join(projectPath, ".mcp.json");
      let mcpConfig: McpJsonConfig = { mcpServers: {} };

      try {
        if (existsSync(mcpJsonPath)) {
          const content = readFileSync(mcpJsonPath, "utf-8");
          mcpConfig = JSON.parse(content);
        }
      } catch (e) {
        console.error(`[MCP Settings] Failed to read project .mcp.json:`, e);
      }

      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }

      mcpConfig.mcpServers[name] = config;
      writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
    } else {
      // Global scope
      let mcpConfig: McpJsonConfig = { mcpServers: {} };

      try {
        if (existsSync(GLOBAL_MCP_JSON_PATH)) {
          const content = readFileSync(GLOBAL_MCP_JSON_PATH, "utf-8");
          mcpConfig = JSON.parse(content);
        }
      } catch (e) {
        console.error(`[MCP Settings] Failed to read global .mcp.json:`, e);
      }

      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }

      mcpConfig.mcpServers[name] = config;
      writeFileSync(GLOBAL_MCP_JSON_PATH, JSON.stringify(mcpConfig, null, 2));
    }
  },

  /**
   * Remove an MCP server from project or global config
   * Returns true if server was found and removed, false otherwise
   */
  removeServer(
    name: string,
    scope: "project" | "global",
    projectPath?: string
  ): boolean {
    if (scope === "project") {
      if (!projectPath) {
        throw new Error("projectPath is required for project scope");
      }
      const mcpJsonPath = join(projectPath, ".mcp.json");

      try {
        if (!existsSync(mcpJsonPath)) {
          return false;
        }
        const content = readFileSync(mcpJsonPath, "utf-8");
        const mcpConfig: McpJsonConfig = JSON.parse(content);

        if (!mcpConfig.mcpServers?.[name]) {
          return false;
        }

        delete mcpConfig.mcpServers[name];
        writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
        return true;
      } catch (e) {
        console.error(`[MCP Settings] Failed to remove server from project .mcp.json:`, e);
        throw e;
      }
    } else {
      // Global scope
      try {
        if (!existsSync(GLOBAL_MCP_JSON_PATH)) {
          return false;
        }
        const content = readFileSync(GLOBAL_MCP_JSON_PATH, "utf-8");
        const mcpConfig: McpJsonConfig = JSON.parse(content);

        if (!mcpConfig.mcpServers?.[name]) {
          return false;
        }

        delete mcpConfig.mcpServers[name];
        writeFileSync(GLOBAL_MCP_JSON_PATH, JSON.stringify(mcpConfig, null, 2));
        return true;
      } catch (e) {
        console.error(`[MCP Settings] Failed to remove server from global .mcp.json:`, e);
        throw e;
      }
    }
  },

  /**
   * Add a server with credential reference (stores credential securely, references in .mcp.json)
   */
  addServerWithCredentials(
    name: string,
    config: ExternalMcpServerConfig,
    credentials: Record<string, string>,  // { envVarName: value }
    scope: "project" | "global",
    projectPath?: string
  ) {
    // 1. Store credentials in secure storage
    const credentialRefs: Record<string, string> = {};
    const credProvider = `mcp:${name}`;

    for (const [envVar, value] of Object.entries(credentials)) {
      if (value) {
        // Create a credential key based on env var name
        const credKey = envVar.toLowerCase().replace(/_/g, "-");
        setCredential(credProvider, credKey, value, { projectId: scope === "project" ? projectPath : null });
        credentialRefs[envVar] = `${credProvider}:${credKey}`;
      }
    }

    // 2. Store server config with credential references (not raw values)
    const serverConfig: ExternalMcpServerConfig = {
      ...config,
      credentialRefs: Object.keys(credentialRefs).length > 0 ? credentialRefs : undefined,
      // Remove env vars that are now stored as credentials
      env: config.env ? Object.fromEntries(
        Object.entries(config.env).filter(([k]) => !credentials[k])
      ) : undefined,
    };

    // Clean up empty env object
    if (serverConfig.env && Object.keys(serverConfig.env).length === 0) {
      delete serverConfig.env;
    }

    this.addServer(name, serverConfig, scope, projectPath);
  },

  /**
   * Resolve credential references to actual values
   * Used when loading MCP server configs for the agent
   */
  resolveCredentials(
    config: ExternalMcpServerConfig,
    projectPath?: string
  ): ExternalMcpServerConfig {
    if (!config.credentialRefs) {
      return config;
    }

    const resolvedEnv: Record<string, string> = { ...(config.env || {}) };

    for (const [envVar, credRef] of Object.entries(config.credentialRefs)) {
      // Parse credential reference: "provider:key"
      const [provider, key] = credRef.split(":");
      if (provider && key) {
        const value = getCredential(provider, key, { projectId: projectPath || null });
        if (value) {
          resolvedEnv[envVar] = value;
        } else {
          console.warn(`[MCP Settings] Credential not found: ${credRef}`);
        }
      }
    }

    return {
      ...config,
      env: Object.keys(resolvedEnv).length > 0 ? resolvedEnv : undefined,
      credentialRefs: undefined, // Don't pass refs to agent, only resolved values
    };
  },
};

/**
 * Helper to check if a server has unresolved credential references
 */
export function hasCredentialRefs(config: ExternalMcpServerConfig): boolean {
  return !!(config.credentialRefs && Object.keys(config.credentialRefs).length > 0);
}

/**
 * Helper to get credential info for display (without exposing values)
 */
export function getCredentialRefInfo(config: ExternalMcpServerConfig): { envVar: string; provider: string; key: string; hasValue: boolean }[] {
  if (!config.credentialRefs) return [];

  return Object.entries(config.credentialRefs).map(([envVar, credRef]) => {
    const [provider, key] = credRef.split(":");
    const value = getCredential(provider, key);
    return {
      envVar,
      provider,
      key,
      hasValue: !!value,
    };
  });
}
