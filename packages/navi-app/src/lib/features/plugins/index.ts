/**
 * Plugins Feature
 *
 * Claude Code plugin management - discover, install, enable, and use plugins
 */

// API
export { pluginApi, pluginCommandsApi, type PluginCommandEntry } from "./api";

// Types
export type {
  Plugin,
  PluginCommand,
  PluginAgent,
  PluginSkill,
  PluginHook,
  PluginHookEntry,
  PluginHookConfig,
  PluginComponentCounts,
  McpServerConfig,
  InstallPluginRequest,
  InstallPluginResponse,
} from "./types";

// Components
export { default as PluginSettings } from "./components/PluginSettings.svelte";
export { default as PluginInstallModal } from "./components/PluginInstallModal.svelte";
