/**
 * Command stores - Reactive state for command management system
 */

import { writable, derived, get } from "svelte/store";
import type { ResolvedCommand, CommandScope, CommandSettings } from "./types";
import { commandsApi } from "./api";

interface CommandStoreState {
  commands: ResolvedCommand[];
  globalCount: number;
  workspaceCount: number;
  loading: boolean;
  error: string | null;
  currentProjectId: string | null;
  currentProjectPath: string | null;
}

const initialState: CommandStoreState = {
  commands: [],
  globalCount: 0,
  workspaceCount: 0,
  loading: false,
  error: null,
  currentProjectId: null,
  currentProjectPath: null,
};

/**
 * Main command store with all state and methods
 */
function createCommandStore() {
  const { subscribe, set, update } = writable<CommandStoreState>(initialState);

  return {
    subscribe,

    /**
     * Load commands for a project (or global if no project)
     */
    async load(projectPath?: string, projectId?: string): Promise<void> {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const result = await commandsApi.fetchCommandsWithSettings(projectPath, projectId);
        update(state => ({
          ...state,
          commands: result.commands,
          globalCount: result.globalCount,
          workspaceCount: result.workspaceCount,
          currentProjectId: projectId || null,
          currentProjectPath: projectPath || null,
          loading: false,
        }));
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Failed to load commands";
        update(state => ({ ...state, loading: false, error: errorMessage }));
        console.error("Failed to load commands:", e);
      }
    },

    /**
     * Reload commands with current project context
     */
    async reload(): Promise<void> {
      const state = get({ subscribe });
      await this.load(state.currentProjectPath || undefined, state.currentProjectId || undefined);
    },

    /**
     * Toggle a command's enabled status
     */
    async toggle(commandName: string, scope: CommandScope, enabled: boolean): Promise<void> {
      const state = get({ subscribe });
      const projectId = scope === "workspace" ? state.currentProjectId : null;

      // Optimistic update
      update(s => ({
        ...s,
        commands: s.commands.map(cmd =>
          cmd.name === commandName ? { ...cmd, enabled } : cmd
        ),
      }));

      try {
        const success = await commandsApi.toggleCommand(commandName, scope, enabled, projectId);
        if (!success) {
          // Revert on failure
          update(s => ({
            ...s,
            commands: s.commands.map(cmd =>
              cmd.name === commandName ? { ...cmd, enabled: !enabled } : cmd
            ),
          }));
        }
      } catch (e) {
        // Revert on error
        update(s => ({
          ...s,
          commands: s.commands.map(cmd =>
            cmd.name === commandName ? { ...cmd, enabled: !enabled } : cmd
          ),
        }));
        console.error("Failed to toggle command:", e);
      }
    },

    /**
     * Reorder commands
     */
    async reorder(scope: CommandScope, orderedNames: string[]): Promise<void> {
      const state = get({ subscribe });
      const projectId = scope === "workspace" ? state.currentProjectId : null;

      const orders = orderedNames.map((commandName, index) => ({
        commandName,
        sortOrder: index,
      }));

      // Optimistic update
      update(s => ({
        ...s,
        commands: s.commands
          .map(cmd => {
            const newOrder = orderedNames.indexOf(cmd.name);
            return newOrder >= 0 ? { ...cmd, sortOrder: newOrder } : cmd;
          })
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }));

      try {
        const success = await commandsApi.reorderCommands(scope, orders, projectId);
        if (!success) {
          // Reload on failure to get correct state
          await this.reload();
        }
      } catch (e) {
        // Reload on error
        await this.reload();
        console.error("Failed to reorder commands:", e);
      }
    },

    /**
     * Update command settings
     */
    async updateSettings(
      commandName: string,
      scope: CommandScope,
      updates: { enabled?: boolean; sortOrder?: number; config?: Record<string, unknown> }
    ): Promise<void> {
      const state = get({ subscribe });
      const projectId = scope === "workspace" ? state.currentProjectId : null;

      try {
        await commandsApi.updateCommandSettings(commandName, scope, projectId, updates);
        await this.reload();
      } catch (e) {
        console.error("Failed to update command settings:", e);
        throw e;
      }
    },

    /**
     * Reset command settings to default (delete override)
     */
    async resetSettings(commandName: string, scope: CommandScope): Promise<void> {
      const state = get({ subscribe });
      const projectId = scope === "workspace" ? state.currentProjectId : null;

      try {
        await commandsApi.deleteCommandSetting(commandName, scope, projectId);
        await this.reload();
      } catch (e) {
        console.error("Failed to reset command settings:", e);
        throw e;
      }
    },

    /**
     * Get a specific command by name
     */
    getCommand(commandName: string): ResolvedCommand | undefined {
      const state = get({ subscribe });
      return state.commands.find(cmd => cmd.name === commandName);
    },

    /**
     * Clear the store
     */
    reset(): void {
      set(initialState);
    },
  };
}

export const commandStore = createCommandStore();

// Derived stores for convenience
export const commands = derived(commandStore, $store => $store.commands);
export const enabledCommands = derived(commandStore, $store =>
  $store.commands.filter(cmd => cmd.enabled)
);
export const globalCommands = derived(commandStore, $store =>
  $store.commands.filter(cmd => cmd.source === "global")
);
export const workspaceCommands = derived(commandStore, $store =>
  $store.commands.filter(cmd => cmd.source === "project")
);
export const commandsLoading = derived(commandStore, $store => $store.loading);
export const commandsError = derived(commandStore, $store => $store.error);
