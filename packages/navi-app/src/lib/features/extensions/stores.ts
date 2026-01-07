// Extension stores - Reactive state for extension system

import { writable, derived, get } from "svelte/store";
import type { EnabledExtension, ResolvedExtension, Extension } from "./types";
import { extensionRegistry, DEFAULT_EXTENSIONS } from "./registry";
import { extensionsApi } from "./api";

/**
 * Store for project extension settings
 * Key: projectId, Value: Map of extensionId -> extension state
 */
function createProjectExtensionsStore() {
  const { subscribe, set, update } = writable<Map<string, Map<string, EnabledExtension>>>(
    new Map()
  );

  return {
    subscribe,

    /**
     * Load extension settings for a project
     */
    async loadForProject(projectId: string): Promise<void> {
      try {
        const settings = await extensionsApi.getProjectExtensions(projectId);
        update((state) => {
          const projectMap = new Map<string, EnabledExtension>();
          for (const ext of settings) {
            projectMap.set(ext.extension_id, {
              extensionId: ext.extension_id,
              enabled: ext.enabled === 1,
              sortOrder: ext.sort_order,
              config: ext.config ? JSON.parse(ext.config) : undefined,
            });
          }
          state.set(projectId, projectMap);
          return new Map(state);
        });
      } catch (error) {
        console.error("Failed to load extension settings:", error);
      }
    },

    /**
     * Get settings for an extension in a project
     */
    getSettings(projectId: string | null, extensionId: string): EnabledExtension | null {
      if (!projectId) return null;
      const state = get({ subscribe });
      const projectMap = state.get(projectId);
      return projectMap?.get(extensionId) || null;
    },

    /**
     * Get enabled state for an extension in a project
     * Returns default if not explicitly set
     */
    isEnabled(projectId: string | null, extensionId: string): boolean {
      if (!projectId) {
        const def = DEFAULT_EXTENSIONS[extensionId];
        return def?.defaultEnabled ?? true;
      }

      const state = get({ subscribe });
      const projectMap = state.get(projectId);
      if (!projectMap || !projectMap.has(extensionId)) {
        const def = DEFAULT_EXTENSIONS[extensionId];
        return def?.defaultEnabled ?? true;
      }

      return projectMap.get(extensionId)!.enabled;
    },

    /**
     * Get sort order for an extension in a project
     */
    getSortOrder(projectId: string | null, extensionId: string): number {
      if (!projectId) {
        const def = DEFAULT_EXTENSIONS[extensionId];
        return def?.defaultOrder ?? 999;
      }

      const state = get({ subscribe });
      const projectMap = state.get(projectId);
      if (!projectMap || !projectMap.has(extensionId)) {
        const def = DEFAULT_EXTENSIONS[extensionId];
        return def?.defaultOrder ?? 999;
      }

      return projectMap.get(extensionId)!.sortOrder;
    },

    /**
     * Toggle extension enabled state
     */
    async toggle(projectId: string, extensionId: string, enabled: boolean): Promise<void> {
      try {
        const def = DEFAULT_EXTENSIONS[extensionId];
        const currentOrder = this.getSortOrder(projectId, extensionId);
        await extensionsApi.setExtensionEnabled(projectId, extensionId, enabled, currentOrder);
        update((state) => {
          let projectMap = state.get(projectId);
          if (!projectMap) {
            projectMap = new Map();
            state.set(projectId, projectMap);
          }
          const existing = projectMap.get(extensionId);
          projectMap.set(extensionId, {
            extensionId,
            enabled,
            sortOrder: existing?.sortOrder ?? def?.defaultOrder ?? 999,
            config: existing?.config,
          });
          return new Map(state);
        });
      } catch (error) {
        console.error("Failed to toggle extension:", error);
        throw error;
      }
    },

    /**
     * Reorder extensions
     */
    async reorder(projectId: string, orderedIds: string[]): Promise<void> {
      try {
        const orders = orderedIds.map((extensionId, index) => ({
          extensionId,
          sortOrder: index,
        }));
        await extensionsApi.reorderExtensions(projectId, orders);

        update((state) => {
          let projectMap = state.get(projectId);
          if (!projectMap) {
            projectMap = new Map();
            state.set(projectId, projectMap);
          }

          for (const { extensionId, sortOrder } of orders) {
            const existing = projectMap.get(extensionId);
            const def = DEFAULT_EXTENSIONS[extensionId];
            projectMap.set(extensionId, {
              extensionId,
              enabled: existing?.enabled ?? def?.defaultEnabled ?? true,
              sortOrder,
              config: existing?.config,
            });
          }
          return new Map(state);
        });
      } catch (error) {
        console.error("Failed to reorder extensions:", error);
        throw error;
      }
    },

    /**
     * Clear settings for a project
     */
    clearProject(projectId: string): void {
      update((state) => {
        state.delete(projectId);
        return new Map(state);
      });
    },

    /**
     * Reset all
     */
    reset(): void {
      set(new Map());
    },
  };
}

export const projectExtensions = createProjectExtensionsStore();

/**
 * Resolve an extension with its current settings for a project
 */
function resolveExtension(ext: Extension, projectId: string | null, projectMap: Map<string, EnabledExtension> | undefined): ResolvedExtension {
  const settings = projectMap?.get(ext.id);
  const def = DEFAULT_EXTENSIONS[ext.id];

  return {
    ...ext,
    enabled: settings?.enabled ?? def?.defaultEnabled ?? true,
    sortOrder: settings?.sortOrder ?? def?.defaultOrder ?? 999,
    config: settings?.config,
  };
}

/**
 * Get all extensions with resolved settings for a project, sorted by order
 */
export function getResolvedExtensionsForProject(projectId: string | null) {
  return derived(projectExtensions, ($projectExtensions) => {
    const allExtensions = extensionRegistry.getAll();
    const projectMap = projectId ? $projectExtensions.get(projectId) : undefined;

    return allExtensions
      .map((ext) => resolveExtension(ext, projectId, projectMap))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });
}

/**
 * Get only enabled extensions for a project, sorted by order
 */
export function getEnabledExtensionsForProject(projectId: string | null) {
  return derived(projectExtensions, ($projectExtensions) => {
    const allExtensions = extensionRegistry.getAll();
    const projectMap = projectId ? $projectExtensions.get(projectId) : undefined;

    return allExtensions
      .map((ext) => resolveExtension(ext, projectId, projectMap))
      .filter((ext) => ext.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });
}
