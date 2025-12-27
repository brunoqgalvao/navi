import { api, costsApi } from "../api";
import { availableModels, costStore, sessionStatus, currentSession as session, showArchivedWorkspaces } from "../stores";
import { get } from "svelte/store";
import type { Session } from "../api";
import { showError } from "../errorHandler";

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
    showError({ title: "Config Error", message: "Failed to load configuration", error: e });
  }
}

// Get the default model (Opus 4.5 preferred, or first available)
export function getDefaultModel(): string {
  const models = get(availableModels);
  if (models.length === 0) return "";
  const opus = models.find(m => m.value === "opus" || m.value.includes("opus"));
  return opus?.value || models[0].value;
}

export async function loadModels() {
  try {
    const models = await api.models.list();
    availableModels.set(models);
    const sessionState = get(session);
    if (models.length > 0 && !sessionState.selectedModel) {
      // Prefer Opus 4.5 as default, fall back to first available
      const opus = models.find(m => m.value === "opus" || m.value.includes("opus"));
      session.setSelectedModel(opus?.value || models[0].value);
    }
  } catch (e) {
    showError({ title: "Models Error", message: "Failed to load available models", error: e });
  }
}

export async function loadPermissions() {
  if (!callbacks) return;
  try {
    const perms = await api.permissions.get();
    callbacks.setGlobalPermissionSettings(perms.global);
    callbacks.setPermissionDefaults(perms.defaults);
  } catch (e) {
    showError({ title: "Permissions Error", message: "Failed to load permission settings", error: e });
  }
}

export async function loadCosts() {
  try {
    const costs = await costsApi.getTotal();
    costStore.setTotals(costs.totalEver, costs.totalToday);
  } catch (e) {
    // Silently fail for costs - not critical
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
    // Silently fail for recent chats - not critical
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
    // Silently fail for active sessions - polled frequently
    console.error("Failed to load active sessions:", e);
  }
}
