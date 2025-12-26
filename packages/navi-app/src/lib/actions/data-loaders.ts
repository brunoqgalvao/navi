import { api, costsApi } from "../api";
import { availableModels, costStore, sessionStatus, currentSession as session, showArchivedWorkspaces } from "../stores";
import { get } from "svelte/store";
import type { Session } from "../api";

export interface DataLoaderCallbacks {
  setDefaultProjectsDir: (dir: string) => void;
  setGlobalPermissionSettings: (settings: any) => void;
  setPermissionDefaults: (defaults: any) => void;
  setRecentChats: (chats: Session[]) => void;
}

let callbacks: DataLoaderCallbacks | null = null;
let lastActiveSessions = new Map<string, string>();

export function initDataLoaders(cbs: DataLoaderCallbacks) {
  callbacks = cbs;
}

export async function loadConfig() {
  if (!callbacks) return;
  try {
    const config = await api.config.get();
    callbacks.setDefaultProjectsDir(config.defaultProjectsDir);
  } catch (e) {
    console.error("Failed to load config:", e);
  }
}

export async function loadModels() {
  try {
    const models = await api.models.list();
    availableModels.set(models);
    const sessionState = get(session);
    if (models.length > 0 && !sessionState.selectedModel) {
      session.setSelectedModel(models[0].value);
    }
  } catch (e) {
    console.error("Failed to load models:", e);
  }
}

export async function loadPermissions() {
  if (!callbacks) return;
  try {
    const perms = await api.permissions.get();
    callbacks.setGlobalPermissionSettings(perms.global);
    callbacks.setPermissionDefaults(perms.defaults);
  } catch (e) {
    console.error("Failed to load permissions:", e);
  }
}

export async function loadCosts() {
  try {
    const costs = await costsApi.getTotal();
    costStore.setTotals(costs.totalEver, costs.totalToday);
  } catch (e) {
    console.error("Failed to load costs:", e);
  }
}

export async function loadRecentChats() {
  if (!callbacks) return;
  try {
    const showArchived = get(showArchivedWorkspaces);
    const chats = await api.sessions.listRecent(10, showArchived);
    callbacks.setRecentChats(chats);
  } catch (e) {
    console.error("Failed to load recent chats:", e);
  }
}

export async function loadActiveSessions() {
  try {
    const active = await api.sessions.active();
    const nextActive = new Map(active.map((item) => [item.sessionId, item.projectId]));
    const sessionState = get(session);

    for (const item of active) {
      if (item.status === "permission") {
        sessionStatus.setPermissionRequired(item.sessionId, item.projectId);
      } else {
        sessionStatus.setRunning(item.sessionId, item.projectId);
      }
    }

    for (const [sessionId, projectId] of lastActiveSessions.entries()) {
      if (!nextActive.has(sessionId)) {
        if (sessionId === sessionState.sessionId) {
          sessionStatus.setIdle(sessionId, projectId);
        } else {
          sessionStatus.setUnread(sessionId, projectId);
        }
      }
    }

    lastActiveSessions = nextActive;
  } catch (e) {
    console.error("Failed to load active sessions:", e);
  }
}
