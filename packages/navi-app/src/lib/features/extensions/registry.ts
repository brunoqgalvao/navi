// Extension Registry - Central registration and discovery of extensions

import type { Extension } from "./types";

/**
 * Registry for all available extensions
 */
class ExtensionRegistry {
  private extensions: Map<string, Extension> = new Map();

  /**
   * Register a new extension
   */
  register(extension: Extension): void {
    if (this.extensions.has(extension.id)) {
      console.warn(`Extension ${extension.id} already registered, overwriting`);
    }
    this.extensions.set(extension.id, extension);
  }

  /**
   * Get an extension by ID
   */
  get(id: string): Extension | undefined {
    return this.extensions.get(id);
  }

  /**
   * Get all registered extensions
   */
  getAll(): Extension[] {
    return Array.from(this.extensions.values()).sort((a, b) => a.defaultOrder - b.defaultOrder);
  }

  /**
   * Get extension IDs
   */
  getIds(): string[] {
    return Array.from(this.extensions.keys());
  }

  /**
   * Check if an extension exists
   */
  has(id: string): boolean {
    return this.extensions.has(id);
  }

  /**
   * Unregister an extension
   */
  unregister(id: string): boolean {
    return this.extensions.delete(id);
  }

  /**
   * Get extensions that require a project
   */
  getProjectExtensions(): Extension[] {
    return this.getAll().filter((ext) => ext.requiresProject);
  }

  /**
   * Get extensions that don't require a project
   */
  getGlobalExtensions(): Extension[] {
    return this.getAll().filter((ext) => !ext.requiresProject);
  }
}

// Singleton instance
export const extensionRegistry = new ExtensionRegistry();

/**
 * Default extension definitions - the core extensions available in Navi
 */
export const DEFAULT_EXTENSIONS: Record<string, Extension> = {
  files: {
    id: "files",
    name: "Files",
    icon: "folder",
    description: "Browse and preview files",
    panelMode: "files",
    requiresProject: true,
    defaultEnabled: true,
    defaultOrder: 0,
  },
  browser: {
    id: "browser",
    name: "Browser",
    icon: "globe",
    description: "Web browser for previewing URLs",
    panelMode: "browser",
    requiresProject: false,
    defaultEnabled: true,
    defaultOrder: 1,
  },
  git: {
    id: "git",
    name: "Git",
    icon: "git-branch",
    description: "Git version control",
    panelMode: "git",
    requiresProject: true,
    defaultEnabled: true,
    defaultOrder: 2,
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    icon: "terminal",
    description: "Interactive terminal",
    panelMode: "terminal",
    requiresProject: false,
    defaultEnabled: true,
    defaultOrder: 3,
  },
  processes: {
    id: "processes",
    name: "Processes",
    icon: "activity",
    description: "Background process manager",
    panelMode: "processes",
    requiresProject: false,
    defaultEnabled: false,
    defaultOrder: 4,
  },
  kanban: {
    id: "kanban",
    name: "Kanban",
    icon: "layout-kanban",
    description: "Agentic task board",
    panelMode: "kanban",
    requiresProject: true,
    defaultEnabled: false,
    defaultOrder: 5,
  },
};

/**
 * Initialize the registry with default extensions
 */
export function initializeRegistry(): void {
  for (const ext of Object.values(DEFAULT_EXTENSIONS)) {
    extensionRegistry.register(ext);
  }
}
