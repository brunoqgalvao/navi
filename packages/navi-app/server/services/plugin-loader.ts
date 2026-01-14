/**
 * Plugin Loader Service
 *
 * Discovers and loads Claude Code plugins with all their components:
 * - Commands (slash commands)
 * - Agents (specialized AI agents)
 * - Skills (agent capabilities)
 * - Hooks (lifecycle event handlers)
 * - MCP servers (external tools)
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

// Simple frontmatter parser (avoids gray-matter import issues)
function parseFrontmatter(content: string): { data: Record<string, any>; content: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, content };
  }

  const [, frontmatterStr, body] = match;
  const data: Record<string, any> = {};

  for (const line of frontmatterStr.split("\n")) {
    const keyValueMatch = line.match(/^(\w+):\s*(.+)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      // Remove quotes if present
      data[key] = value.trim().replace(/^["']|["']$/g, "");
    }
  }

  return { data, content: body };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  description?: string;
  version: string;
  author?: string | { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
}

export interface PluginCommand {
  name: string;
  fullName: string; // plugin:command format
  description?: string;
  filePath: string;
}

export interface PluginAgent {
  name: string;
  description?: string;
  filePath: string;
}

export interface PluginSkill {
  name: string;
  description?: string;
  filePath: string;
}

export interface PluginHook {
  type: string;
  command: string;
  timeout?: number;
}

export interface PluginHookEntry {
  matcher?: string;
  hooks: PluginHook[];
}

export interface PluginHookConfig {
  description?: string;
  hooks: Record<string, PluginHookEntry[]>;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface PluginMcpConfig {
  servers: Record<string, McpServerConfig>;
}

export interface PluginComponents {
  commands: PluginCommand[];
  agents: PluginAgent[];
  skills: PluginSkill[];
  hooks: PluginHookConfig | null;
  mcpServers: Record<string, McpServerConfig>;
}

export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  installPath: string;
  scope: "user" | "project";
  components: PluginComponents;
  componentCounts: {
    commands: number;
    agents: number;
    skills: number;
    hooks: number;
    mcpServers: number;
  };
}

export interface PluginInfo {
  scope: "user" | "project";
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha: string;
  isLocal: boolean;
  projectPath?: string;
}

export interface InstalledPlugins {
  version: number;
  plugins: Record<string, PluginInfo[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INSTALLED_PLUGINS_PATH = join(
  homedir(),
  ".claude",
  "plugins",
  "installed_plugins.json"
);

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the installed plugins registry
 */
export function getInstalledPluginsRegistry(): InstalledPlugins {
  if (!existsSync(INSTALLED_PLUGINS_PATH)) {
    return { version: 2, plugins: {} };
  }
  try {
    return JSON.parse(readFileSync(INSTALLED_PLUGINS_PATH, "utf-8"));
  } catch {
    return { version: 2, plugins: {} };
  }
}

/**
 * Load plugin manifest from .claude-plugin/plugin.json
 */
export function loadPluginManifest(
  installPath: string
): PluginManifest | null {
  const manifestPath = join(installPath, ".claude-plugin", "plugin.json");

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return {
      name: content.name,
      description: content.description,
      version: content.version || "0.0.0",
      author: content.author,
      homepage: content.homepage,
      repository: content.repository,
      license: content.license,
    };
  } catch {
    return null;
  }
}

/**
 * Discover commands in a plugin's commands/ directory
 */
export function discoverPluginCommands(
  installPath: string,
  pluginName: string
): PluginCommand[] {
  const commandsDir = join(installPath, "commands");

  if (!existsSync(commandsDir) || !statSync(commandsDir).isDirectory()) {
    return [];
  }

  const commands: PluginCommand[] = [];

  try {
    const files = readdirSync(commandsDir);

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const filePath = join(commandsDir, file);
      const commandName = basename(file, ".md");

      try {
        const content = readFileSync(filePath, "utf-8");
        const { data } = parseFrontmatter(content);

        commands.push({
          name: commandName,
          fullName: `${pluginName}:${commandName}`,
          description: data.description,
          filePath,
        });
      } catch {
        // Skip files that can't be parsed
        commands.push({
          name: commandName,
          fullName: `${pluginName}:${commandName}`,
          filePath,
        });
      }
    }
  } catch {
    // Directory read failed
  }

  return commands;
}

/**
 * Discover agents in a plugin's agents/ directory
 */
export function discoverPluginAgents(installPath: string): PluginAgent[] {
  const agentsDir = join(installPath, "agents");

  if (!existsSync(agentsDir) || !statSync(agentsDir).isDirectory()) {
    return [];
  }

  const agents: PluginAgent[] = [];

  try {
    const files = readdirSync(agentsDir);

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const filePath = join(agentsDir, file);
      const agentName = basename(file, ".md");

      try {
        const content = readFileSync(filePath, "utf-8");
        const { data } = parseFrontmatter(content);

        agents.push({
          name: data.name || agentName,
          description: data.description as string | undefined,
          filePath,
        });
      } catch {
        agents.push({
          name: agentName,
          filePath,
        });
      }
    }
  } catch {
    // Directory read failed
  }

  return agents;
}

/**
 * Discover skills in a plugin's skills/ directory
 */
export function discoverPluginSkills(installPath: string): PluginSkill[] {
  const skillsDir = join(installPath, "skills");

  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
    return [];
  }

  const skills: PluginSkill[] = [];

  try {
    const entries = readdirSync(skillsDir);

    for (const entry of entries) {
      const entryPath = join(skillsDir, entry);

      // Skills can be directories with SKILL.md or direct .md files
      if (statSync(entryPath).isDirectory()) {
        const skillMdPath = join(entryPath, "SKILL.md");
        if (existsSync(skillMdPath)) {
          try {
            const content = readFileSync(skillMdPath, "utf-8");
            const { data } = parseFrontmatter(content);

            skills.push({
              name: data.name || entry,
              description: data.description,
              filePath: skillMdPath,
            });
          } catch {
            skills.push({
              name: entry,
              filePath: skillMdPath,
            });
          }
        }
      } else if (entry.endsWith(".md")) {
        const skillName = basename(entry, ".md");
        try {
          const content = readFileSync(entryPath, "utf-8");
          const { data } = parseFrontmatter(content);

          skills.push({
            name: data.name || skillName,
            description: data.description,
            filePath: entryPath,
          });
        } catch {
          skills.push({
            name: skillName,
            filePath: entryPath,
          });
        }
      }
    }
  } catch {
    // Directory read failed
  }

  return skills;
}

/**
 * Load hooks configuration from hooks/hooks.json
 */
export function loadPluginHooks(installPath: string): PluginHookConfig | null {
  const hooksPath = join(installPath, "hooks", "hooks.json");

  if (!existsSync(hooksPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(hooksPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Load MCP server configuration from .mcp.json
 */
export function loadPluginMcpServers(
  installPath: string
): Record<string, McpServerConfig> {
  const mcpPath = join(installPath, ".mcp.json");

  if (!existsSync(mcpPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(mcpPath, "utf-8"));
    if (parsed && typeof parsed === "object") {
      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        return parsed.mcpServers as Record<string, McpServerConfig>;
      }
      if (parsed.servers && typeof parsed.servers === "object") {
        return parsed.servers as Record<string, McpServerConfig>;
      }
    }
    return parsed as Record<string, McpServerConfig>;
  } catch {
    return {};
  }
}

/**
 * Load a complete plugin with all its components
 */
export function loadPlugin(
  pluginId: string,
  info: PluginInfo
): LoadedPlugin | null {
  const { installPath, scope } = info;

  if (!existsSync(installPath)) {
    return null;
  }

  const manifest = loadPluginManifest(installPath);
  if (!manifest) {
    // Try to construct minimal manifest from available info
    return null;
  }

  // Use pluginId for command namespacing (owner/repo format), not manifest.name
  const commands = discoverPluginCommands(installPath, pluginId);
  const agents = discoverPluginAgents(installPath);
  const skills = discoverPluginSkills(installPath);
  const hooks = loadPluginHooks(installPath);
  const mcpServers = loadPluginMcpServers(installPath);

  const hookCount = hooks
    ? Object.values(hooks.hooks).reduce((sum, entries) => sum + entries.length, 0)
    : 0;

  return {
    id: pluginId,
    manifest,
    installPath,
    scope,
    components: {
      commands,
      agents,
      skills,
      hooks,
      mcpServers,
    },
    componentCounts: {
      commands: commands.length,
      agents: agents.length,
      skills: skills.length,
      hooks: hookCount,
      mcpServers: Object.keys(mcpServers).length,
    },
  };
}

/**
 * Load all installed plugins
 */
export function loadAllPlugins(): LoadedPlugin[] {
  const registry = getInstalledPluginsRegistry();
  const plugins: LoadedPlugin[] = [];

  for (const [pluginId, infos] of Object.entries(registry.plugins)) {
    if (infos.length === 0) continue;

    // Use first installation
    const plugin = loadPlugin(pluginId, infos[0]);
    if (plugin) {
      plugins.push(plugin);
    }
  }

  return plugins;
}

/**
 * Get a specific plugin by ID
 */
export function getPlugin(pluginId: string): LoadedPlugin | null {
  const registry = getInstalledPluginsRegistry();
  const infos = registry.plugins[pluginId];

  if (!infos || infos.length === 0) {
    return null;
  }

  return loadPlugin(pluginId, infos[0]);
}

/**
 * Get command content with placeholder substitution
 */
export function getCommandContent(
  pluginId: string,
  commandName: string,
  args?: string
): string | null {
  const plugin = getPlugin(pluginId);
  if (!plugin) return null;

  const command = plugin.components.commands.find(
    (c) => c.name === commandName
  );
  if (!command) return null;

  try {
    const content = readFileSync(command.filePath, "utf-8");
    const { content: body } = parseFrontmatter(content);

    // Substitute placeholders
    let processed = body;
    if (args) {
      processed = processed.replace(/\$ARGUMENTS/g, args);

      // Handle positional arguments $1, $2, etc.
      const argParts = args.split(/\s+/);
      argParts.forEach((arg, index) => {
        processed = processed.replace(new RegExp(`\\$${index + 1}`, "g"), arg);
      });
    }

    return processed;
  } catch {
    return null;
  }
}
