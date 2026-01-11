import { json, error } from "../utils/response";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PLUGIN_CACHE = join(homedir(), ".claude", "plugins", "cache");
const INSTALLED_PLUGINS = join(homedir(), ".claude", "plugins", "installed_plugins.json");

interface PluginInfo {
  scope: "user" | "project";
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha: string;
  isLocal: boolean;
  projectPath?: string;
}

interface InstalledPlugins {
  version: number;
  plugins: Record<string, PluginInfo[]>;
}

interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
}

interface PluginHook {
  type: string;
  command: string;
  timeout?: number;
}

interface PluginHookConfig {
  description?: string;
  hooks: Record<string, Array<{
    matcher?: string;
    hooks: PluginHook[];
  }>>;
}

interface PluginConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
}

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
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
}

function getInstalledPlugins(): InstalledPlugins {
  if (!existsSync(INSTALLED_PLUGINS)) {
    return { version: 2, plugins: {} };
  }
  return JSON.parse(readFileSync(INSTALLED_PLUGINS, "utf-8"));
}

function getPluginMetadata(installPath: string): PluginMetadata | null {
  const packageJsonPath = join(installPath, "package.json");
  const pluginConfigPath = join(installPath, ".claude-plugin", "plugin.json");

  let metadata: Partial<PluginMetadata> = {};

  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      metadata.version = pkg.version;
      metadata.description = pkg.description;
      metadata.author = pkg.author;
    } catch {}
  }

  if (existsSync(pluginConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(pluginConfigPath, "utf-8"));
      metadata.name = config.name;
      metadata.description = metadata.description || config.description;
    } catch {}
  }

  return metadata.version ? (metadata as PluginMetadata) : null;
}

function getPluginHooks(installPath: string): PluginHookConfig | null {
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

export async function handlePluginRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // List all installed plugins
  if (pathname === "/api/plugins" && method === "GET") {
    try {
      const cwd = url.searchParams.get("cwd");
      if (!cwd) {
        return error("Missing cwd parameter", 400);
      }

      const installed = getInstalledPlugins();
      const projectSettings = readSettings(getProjectSettingsPath(cwd));
      const userSettings = readSettings(getUserSettingsPath());

      const plugins = Object.entries(installed.plugins).map(([pluginId, infos]) => {
        const info = infos[0]; // Take first installation
        const metadata = getPluginMetadata(info.installPath);
        const hooks = getPluginHooks(info.installPath);

        // Check if enabled in project or user settings
        const enabledInProject = projectSettings.enabledPlugins?.[pluginId];
        const enabledInUser = userSettings.enabledPlugins?.[pluginId];

        return {
          id: pluginId,
          name: metadata?.name || pluginId,
          version: info.version,
          description: metadata?.description,
          author: metadata?.author,
          scope: info.scope,
          installPath: info.installPath,
          enabledInProject,
          enabledInUser,
          hooks: hooks ? Object.keys(hooks.hooks) : [],
          hooksDetail: hooks,
        };
      });

      return json(plugins);
    } catch (err) {
      return error(`Failed to list plugins: ${err}`, 500);
    }
  }

  // Toggle plugin enabled state
  if (pathname === "/api/plugins/toggle" && method === "POST") {
    try {
      const body = await req.json();
      const { pluginId, enabled, scope, cwd } = body;

      if (!pluginId || typeof enabled !== "boolean" || !scope || !cwd) {
        return error("Missing required fields: pluginId, enabled, scope, cwd", 400);
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

  // Get plugin hooks detail
  if (pathname.startsWith("/api/plugins/") && pathname.endsWith("/hooks") && method === "GET") {
    try {
      const pluginId = pathname.split("/")[3];
      const installed = getInstalledPlugins();
      const infos = installed.plugins[pluginId];

      if (!infos || infos.length === 0) {
        return error("Plugin not found", 404);
      }

      const hooks = getPluginHooks(infos[0].installPath);
      return json(hooks);
    } catch (err) {
      return error(`Failed to get plugin hooks: ${err}`, 500);
    }
  }

  return null;
}
