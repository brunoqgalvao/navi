// Extensions feature - barrel export

export * from "./types";
export { extensionRegistry, DEFAULT_EXTENSIONS, initializeRegistry } from "./registry";
export { projectExtensions, getEnabledExtensionsForProject, getResolvedExtensionsForProject } from "./stores";
export { extensionsApi } from "./api";

// Components
export { default as ExtensionIcon } from "./components/ExtensionIcon.svelte";
export { default as ExtensionSettingsModal } from "./components/ExtensionSettingsModal.svelte";
export { default as ExtensionTabs } from "./components/ExtensionTabs.svelte";
export { default as ExtensionToolbar } from "./components/ExtensionToolbar.svelte";
