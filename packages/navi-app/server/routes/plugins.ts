/**
 * Plugin Routes
 *
 * API endpoints for managing Claude Code plugins:
 * - List installed plugins with full component details
 * - Toggle plugin enable/disable state
 * - Install plugins from URL
 * - Uninstall plugins
 * - Get plugin command content
 */

import { json, error } from "../utils/response";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawn } from "child_process";
import {
  loadAllPlugins,
  getPlugin,
  getCommandContent,
  getInstalledPluginsRegistry,
  type LoadedPlugin,
  type InstalledPlugins,
  type PluginInfo,
} from "../services/plugin-loader";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PLUGINS_DIR = join(homedir(), ".claude", "plugins");
const PLUGIN_CACHE = join(PLUGINS_DIR, "cache");
const INSTALLED_PLUGINS_PATH = join(PLUGINS_DIR, "installed_plugins.json");

// ─────────────────────────────────────────────────────────────────────────────
// Settings Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".claude", "settings.json");
}

function getUserSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function readSettings(path: string): any {
  if (!existsSync(path)) {
    return { enabledPlugins: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { enabledPlugins: {} };
  }
}

function writeSettings(path: string, settings: any): void {
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
}

function saveInstalledPlugins(registry: InstalledPlugins): void {
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
  }
  writeFileSync(INSTALLED_PLUGINS_PATH, JSON.stringify(registry, null, 2), "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Installation
// ─────────────────────────────────────────────────────────────────────────────

interface InstallResult {
  success: boolean;
  pluginId?: string;
  error?: string;
}

/**
 * Install a plugin from a git URL
 */
async function installPluginFromUrl(
  url: string,
  scope: "user" | "project",
  projectPath?: string
): Promise<InstallResult> {
  // Ensure cache directory exists
  if (!existsSync(PLUGIN_CACHE)) {
    mkdirSync(PLUGIN_CACHE, { recursive: true });
  }

  // Extract plugin name from URL
  const urlParts = url.replace(/\.git$/, "").split("/");
  const repoName = urlParts[urlParts.length - 1];
  const owner = urlParts[urlParts.length - 2];

  // Validate owner and repoName to prevent path traversal
  const validNameRegex = /^[a-zA-Z0-9_.-]+$/;
  if (!owner || !repoName || !validNameRegex.test(owner) || !validNameRegex.test(repoName)) {
    return { success: false, error: "Invalid plugin URL: owner or repo name contains invalid characters" };
  }

  // Additional check: ensure no path traversal sequences
  if (owner.includes("..") || repoName.includes("..")) {
    return { success: false, error: "Invalid plugin URL: path traversal detected" };
  }

  const pluginId = `${owner}/${repoName}`;

  const installPath = join(PLUGIN_CACHE, owner, repoName);

  // Verify the install path is within the cache directory
  const resolvedInstallPath = join(PLUGIN_CACHE, owner, repoName);
  const resolvedCachePath = PLUGIN_CACHE;
  if (!resolvedInstallPath.startsWith(resolvedCachePath)) {
    return { success: false, error: "Invalid plugin path: outside cache directory" };
  }

  // Clone or pull the repository
  return new Promise((resolve) => {
    let gitProcess: ReturnType<typeof spawn> | null = null;
    let resolved = false;

    // Set a timeout to prevent hanging - kills the process on timeout
    const timeout = setTimeout(() => {
      if (!resolved && gitProcess) {
        gitProcess.kill("SIGTERM");
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (gitProcess && !gitProcess.killed) {
            gitProcess.kill("SIGKILL");
          }
        }, 5000);
      }
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: "Git operation timed out after 60 seconds" });
      }
    }, 60000);

    const handleCompletion = (sha: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      updatePluginRegistry(pluginId, installPath, scope, sha.trim(), projectPath);
      resolve({ success: true, pluginId });
    };

    const handleError = (msg: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({ success: false, error: msg });
    };

    // Disable git prompts to prevent hanging on auth
    const gitEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o StrictHostKeyChecking=no",
    };

    if (existsSync(installPath)) {
      // Update existing installation
      gitProcess = spawn("git", ["pull"], { cwd: installPath, env: gitEnv });
      let stderr = "";

      gitProcess.stderr.on("data", (data) => (stderr += data.toString()));

      gitProcess.on("error", (err) => {
        handleError(`Git pull failed: ${err.message}`);
      });

      gitProcess.on("close", (code) => {
        if (resolved) return;
        if (code !== 0) {
          handleError(`Failed to update plugin repository: ${stderr || `exit code ${code}`}`);
          return;
        }

        // Get commit SHA
        const gitRev = spawn("git", ["rev-parse", "HEAD"], { cwd: installPath });
        let sha = "";
        gitRev.stdout.on("data", (data) => (sha += data.toString()));
        gitRev.on("error", () => handleCompletion("unknown"));
        gitRev.on("close", () => handleCompletion(sha));
      });
    } else {
      // Fresh clone
      const parentDir = join(installPath, "..");
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      gitProcess = spawn("git", ["clone", "--depth=1", url, installPath], { env: gitEnv });
      let stderr = "";

      gitProcess.stderr.on("data", (data) => (stderr += data.toString()));

      gitProcess.on("error", (err) => {
        handleError(`Git clone failed: ${err.message}`);
      });

      gitProcess.on("close", (code) => {
        if (resolved) return;
        if (code !== 0) {
          handleError(`Failed to clone plugin repository: ${stderr || `exit code ${code}`}`);
          return;
        }

        // Get commit SHA
        const gitRev = spawn("git", ["rev-parse", "HEAD"], { cwd: installPath });
        let sha = "";
        gitRev.stdout.on("data", (data) => (sha += data.toString()));
        gitRev.on("error", () => handleCompletion("unknown"));
        gitRev.on("close", () => handleCompletion(sha));
      });
    }
  });
}

function updatePluginRegistry(
  pluginId: string,
  installPath: string,
  scope: "user" | "project",
  gitCommitSha: string,
  projectPath?: string
): void {
  const registry = getInstalledPluginsRegistry();
  const now = new Date().toISOString();

  // Try to get version from manifest
  let version = "0.0.0";
  const manifestPath = join(installPath, ".claude-plugin", "plugin.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      version = manifest.version || version;
    } catch {}
  }

  const info: PluginInfo = {
    scope,
    installPath,
    version,
    installedAt: now,
    lastUpdated: now,
    gitCommitSha,
    isLocal: false,
    projectPath: scope === "project" ? projectPath : undefined,
  };

  if (!registry.plugins[pluginId]) {
    registry.plugins[pluginId] = [];
  }

  // Update or add
  const existingIdx = registry.plugins[pluginId].findIndex(
    (p) => p.scope === scope && p.projectPath === projectPath
  );

  if (existingIdx >= 0) {
    registry.plugins[pluginId][existingIdx] = info;
  } else {
    registry.plugins[pluginId].push(info);
  }

  saveInstalledPlugins(registry);
}

/**
 * Uninstall a plugin
 */
function uninstallPlugin(pluginId: string): boolean {
  const registry = getInstalledPluginsRegistry();

  if (!registry.plugins[pluginId]) {
    return false;
  }

  // Remove from filesystem
  const infos = registry.plugins[pluginId];
  for (const info of infos) {
    if (existsSync(info.installPath)) {
      try {
        rmSync(info.installPath, { recursive: true, force: true });
      } catch {
        // Ignore removal errors
      }
    }
  }

  // Remove from registry
  delete registry.plugins[pluginId];
  saveInstalledPlugins(registry);

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handlePluginRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/plugins - List all installed plugins with full component details
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/plugins" && method === "GET") {
    try {
      const cwd = url.searchParams.get("cwd");
      if (!cwd) {
        return error("Missing cwd parameter", 400);
      }

      const projectSettings = readSettings(getProjectSettingsPath(cwd));
      const userSettings = readSettings(getUserSettingsPath());

      const loadedPlugins = loadAllPlugins();

      const plugins = loadedPlugins.map((plugin) => ({
        id: plugin.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description,
        author:
          typeof plugin.manifest.author === "string"
            ? plugin.manifest.author
            : plugin.manifest.author?.name,
        scope: plugin.scope,
        installPath: plugin.installPath,
        enabledInProject: projectSettings.enabledPlugins?.[plugin.id] ?? false,
        enabledInUser: userSettings.enabledPlugins?.[plugin.id] ?? false,

        // Component counts for UI badges
        componentCounts: plugin.componentCounts,

        // Full component details
        commands: plugin.components.commands,
        agents: plugin.components.agents,
        skills: plugin.components.skills,
        hooks: plugin.components.hooks
          ? Object.keys(plugin.components.hooks.hooks)
          : [],
        hooksDetail: plugin.components.hooks,
        mcpServers: Object.keys(plugin.components.mcpServers),
        mcpServersDetail: plugin.components.mcpServers,
      }));

      return json(plugins);
    } catch (err) {
      return error(`Failed to list plugins: ${err}`, 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/plugins/toggle - Toggle plugin enabled state
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/plugins/toggle" && method === "POST") {
    try {
      const body = await req.json();
      const { pluginId, enabled, scope, cwd } = body;

      if (!pluginId || typeof enabled !== "boolean" || !scope || !cwd) {
        return error(
          "Missing required fields: pluginId, enabled, scope, cwd",
          400
        );
      }

      const settingsPath =
        scope === "project"
          ? getProjectSettingsPath(cwd)
          : getUserSettingsPath();

      const settings = readSettings(settingsPath);
      if (!settings.enabledPlugins) {
        settings.enabledPlugins = {};
      }

      settings.enabledPlugins[pluginId] = enabled;
      writeSettings(settingsPath, settings);

      return json({ success: true });
    } catch (err) {
      return error(`Failed to toggle plugin: ${err}`, 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/plugins/install - Install plugin from URL
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/plugins/install" && method === "POST") {
    try {
      const body = await req.json();
      const { url: pluginUrl, scope, projectPath } = body;

      if (!pluginUrl) {
        return error("Missing required field: url", 400);
      }

      const result = await installPluginFromUrl(
        pluginUrl,
        scope || "user",
        projectPath
      );

      if (!result.success) {
        return error(result.error || "Installation failed", 500);
      }

      // Return the installed plugin details
      const plugin = getPlugin(result.pluginId!);
      return json({
        success: true,
        plugin: plugin
          ? {
              id: plugin.id,
              name: plugin.manifest.name,
              version: plugin.manifest.version,
              componentCounts: plugin.componentCounts,
            }
          : null,
      });
    } catch (err) {
      return error(`Failed to install plugin: ${err}`, 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/plugins/:id - Uninstall a plugin
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/plugins/") && method === "DELETE") {
    try {
      // Extract plugin ID (can contain /)
      const pluginId = decodeURIComponent(pathname.slice("/api/plugins/".length));

      if (!pluginId) {
        return error("Missing plugin ID", 400);
      }

      const success = uninstallPlugin(pluginId);

      if (!success) {
        return error("Plugin not found", 404);
      }

      return json({ success: true });
    } catch (err) {
      return error(`Failed to uninstall plugin: ${err}`, 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/plugins/:id - Get single plugin details
  // ─────────────────────────────────────────────────────────────────────────
  if (
    pathname.startsWith("/api/plugins/") &&
    !pathname.endsWith("/hooks") &&
    !pathname.endsWith("/command") &&
    method === "GET"
  ) {
    try {
      const pluginId = decodeURIComponent(pathname.slice("/api/plugins/".length));
      const plugin = getPlugin(pluginId);

      if (!plugin) {
        return error("Plugin not found", 404);
      }

      return json({
        id: plugin.id,
        manifest: plugin.manifest,
        installPath: plugin.installPath,
        scope: plugin.scope,
        componentCounts: plugin.componentCounts,
        components: plugin.components,
      });
    } catch (err) {
      return error(`Failed to get plugin: ${err}`, 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/plugins/:id/hooks - Get plugin hooks detail
  // ─────────────────────────────────────────────────────────────────────────
  if (
    pathname.startsWith("/api/plugins/") &&
    pathname.endsWith("/hooks") &&
    method === "GET"
  ) {
    try {
      const pluginId = decodeURIComponent(
        pathname.slice("/api/plugins/".length, -"/hooks".length)
      );
      const plugin = getPlugin(pluginId);

      if (!plugin) {
        return error("Plugin not found", 404);
      }

      return json(plugin.components.hooks);
    } catch (err) {
      return error(`Failed to get plugin hooks: ${err}`, 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/plugins/:id/command - Get command content with args
  // ─────────────────────────────────────────────────────────────────────────
  if (
    pathname.startsWith("/api/plugins/") &&
    pathname.endsWith("/command") &&
    method === "POST"
  ) {
    try {
      const pluginId = decodeURIComponent(
        pathname.slice("/api/plugins/".length, -"/command".length)
      );

      const body = await req.json();
      const { commandName, args } = body;

      if (!commandName) {
        return error("Missing commandName", 400);
      }

      const content = getCommandContent(pluginId, commandName, args);

      if (!content) {
        return error("Command not found", 404);
      }

      return json({ content });
    } catch (err) {
      return error(`Failed to get command content: ${err}`, 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/plugins/commands - Get all commands from enabled plugins
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/plugins/commands" && method === "GET") {
    try {
      const cwd = url.searchParams.get("cwd");
      if (!cwd) {
        return error("Missing cwd parameter", 400);
      }

      const projectSettings = readSettings(getProjectSettingsPath(cwd));
      const userSettings = readSettings(getUserSettingsPath());

      const loadedPlugins = loadAllPlugins();
      const commands: Array<{
        name: string;
        fullName: string;
        description?: string;
        pluginId: string;
        pluginName: string;
      }> = [];

      for (const plugin of loadedPlugins) {
        // Check if plugin is enabled (project or user level)
        const isEnabled =
          projectSettings.enabledPlugins?.[plugin.id] ||
          userSettings.enabledPlugins?.[plugin.id];

        if (!isEnabled) continue;

        // Add all commands from this plugin
        for (const cmd of plugin.components.commands) {
          commands.push({
            name: cmd.name,
            fullName: cmd.fullName,
            description: cmd.description,
            pluginId: plugin.id,
            pluginName: plugin.manifest.name,
          });
        }
      }

      return json(commands);
    } catch (err) {
      return error(`Failed to get plugin commands: ${err}`, 500);
    }
  }

  return null;
}
