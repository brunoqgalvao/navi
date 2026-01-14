/**
 * Navi Core Registries
 *
 * Central registration and discovery for all extensible components.
 * Each registry follows the same pattern for consistency.
 */

import type {
  Extension,
  ExtensionId,
  PanelMode,
  MessageWidget,
  MessageWidgetType,
  DashboardWidget,
  DashboardWidgetType,
  Registry,
} from "./types";

// =============================================================================
// BASE REGISTRY IMPLEMENTATION
// =============================================================================

class BaseRegistry<T extends { id?: string; type?: string; name?: string }>
  implements Registry<T>
{
  protected items: Map<string, T> = new Map();
  protected idField: keyof T;

  constructor(idField: keyof T = "id" as keyof T) {
    this.idField = idField;
  }

  register(item: T): void {
    const id = String(item[this.idField]);
    this.items.set(id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  unregister(id: string): boolean {
    return this.items.delete(id);
  }

  getIds(): string[] {
    return Array.from(this.items.keys());
  }

  clear(): void {
    this.items.clear();
  }
}

// =============================================================================
// EXTENSION REGISTRY
// =============================================================================

class ExtensionRegistryImpl extends BaseRegistry<Extension> {
  constructor() {
    super("id" as keyof Extension);
  }

  /**
   * Get all extensions sorted by default order
   */
  override getAll(): Extension[] {
    return super.getAll().sort((a, b) => a.defaultOrder - b.defaultOrder);
  }

  /**
   * Get extensions that require a project context
   */
  getProjectExtensions(): Extension[] {
    return this.getAll().filter((ext) => ext.requiresProject);
  }

  /**
   * Get extensions available without a project
   */
  getGlobalExtensions(): Extension[] {
    return this.getAll().filter((ext) => !ext.requiresProject);
  }

  /**
   * Get all valid panel modes (derived from registered extensions)
   */
  getPanelModes(): PanelMode[] {
    return this.getAll().map((ext) => ext.panelMode);
  }

  /**
   * Get extension by panel mode
   */
  getByPanelMode(mode: PanelMode): Extension | undefined {
    return this.getAll().find((ext) => ext.panelMode === mode);
  }
}

export const extensionRegistry = new ExtensionRegistryImpl();

// =============================================================================
// MESSAGE WIDGET REGISTRY
// =============================================================================

class MessageWidgetRegistryImpl extends BaseRegistry<MessageWidget> {
  constructor() {
    super("type" as keyof MessageWidget);
  }

  /**
   * Find widget that matches content
   */
  findMatch(content: unknown): MessageWidget | undefined {
    const widgets = this.getAll();
    for (let i = 0; i < widgets.length; i++) {
      if (widgets[i].matcher(content)) {
        return widgets[i];
      }
    }
    return undefined;
  }

  /**
   * Find all widgets that match content (for compound rendering)
   */
  findAllMatches(content: unknown): MessageWidget[] {
    return this.getAll().filter((widget) => widget.matcher(content));
  }
}

export const messageWidgetRegistry = new MessageWidgetRegistryImpl();

// =============================================================================
// DASHBOARD WIDGET REGISTRY
// =============================================================================

class DashboardWidgetRegistryImpl extends BaseRegistry<DashboardWidget> {
  constructor() {
    super("type" as keyof DashboardWidget);
  }

  /**
   * Get widget types for dashboard parser
   */
  getWidgetTypes(): DashboardWidgetType[] {
    return this.getIds() as DashboardWidgetType[];
  }

  /**
   * Validate and get config for a widget type
   */
  getValidatedConfig<T>(type: DashboardWidgetType, config: unknown): T | null {
    const widget = this.get(type);
    if (!widget) return null;
    if (widget.validateConfig) {
      return widget.validateConfig(config) as T;
    }
    return { ...widget.defaultConfig, ...(config as object) } as T;
  }
}

export const dashboardWidgetRegistry = new DashboardWidgetRegistryImpl();

// =============================================================================
// DEFAULT EXTENSIONS
// =============================================================================

export const DEFAULT_EXTENSIONS: Record<ExtensionId, Extension> = {
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
    defaultEnabled: true,
    defaultOrder: 5,
  },
  preview: {
    id: "preview",
    name: "Preview",
    icon: "play",
    description: "Dev server preview with multiple engines",
    panelMode: "preview-unified",
    requiresProject: true,
    defaultEnabled: true,
    defaultOrder: 6,
  },
  context: {
    id: "context",
    name: "Context",
    icon: "layers",
    description: "Session context visibility - see what Claude has accessed",
    panelMode: "context",
    requiresProject: false,
    defaultEnabled: true,
    defaultOrder: 7,
  },
  email: {
    id: "email",
    name: "Email",
    icon: "mail",
    description: "Navi's email inboxes (experimental)",
    panelMode: "email",
    requiresProject: false,
    defaultEnabled: false, // @experimental - AgentMail integration
    defaultOrder: 100,
  },
  "browser-preview": {
    id: "browser-preview",
    name: "Browser",
    icon: "globe",
    description: "Browser-use preview (not yet implemented)",
    panelMode: "browser-preview",
    requiresProject: false,
    defaultEnabled: false,
    defaultOrder: 101,
  },
  };

// =============================================================================
// INITIALIZATION
// =============================================================================

let initialized = false;

/**
 * Initialize all registries with default values.
 * Call this once at app startup.
 */
export function initializeRegistries(): void {
  if (initialized) {
    return;
  }

  // Register default extensions
  for (const ext of Object.values(DEFAULT_EXTENSIONS)) {
    extensionRegistry.register(ext);
  }

  // Message widgets are registered by their respective component files
  // Dashboard widgets are registered by the dashboard feature

  initialized = true;
}

/**
 * Reset registries (for testing)
 */
export function resetRegistries(): void {
  extensionRegistry.clear();
  messageWidgetRegistry.clear();
  dashboardWidgetRegistry.clear();
  initialized = false;
}
