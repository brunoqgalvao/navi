import { api, costsApi, backendsApi, type BackendId } from "../api";
import { availableModels, costStore, sessionStatus, currentSession as session, showArchivedWorkspaces, backendModels, getBackendModelsFormatted, defaultBackend } from "../stores";
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

export function getDefaultModelForBackend(backend: BackendId): string {
  if (backend === "claude") {
    const claudeDefault = getDefaultModel();
    if (claudeDefault) return claudeDefault;
    const modelsByBackend = get(backendModels);
    const models = getBackendModelsFormatted("claude", modelsByBackend);
    return models[0]?.value || "";
  }
  const modelsByBackend = get(backendModels);
  const models = getBackendModelsFormatted(backend, modelsByBackend);
  if (models.length > 0) return models[0].value;
  return "";
}

export async function loadModels() {
  try {
    const models = await api.models.list();
    availableModels.set(models);
  } catch (e) {
    availableModels.set([]);
    showError({ title: "Models Error", message: "Failed to load available models", error: e });
  }

  // Always attempt to load backend-specific models, even if Claude models failed
  await loadBackendModels();

  const sessionState = get(session);
  if (!sessionState.selectedModel) {
    const backend = get(defaultBackend);
    const defaultModel = getDefaultModelForBackend(backend);
    if (defaultModel) {
      session.setSelectedModel(defaultModel);
    }
  }
}

// Load models for all backends (Claude, Codex, Gemini)
export async function loadBackendModels() {
  try {
    const allModels = await backendsApi.getAllModels();

    // Convert to ModelInfo format
    type ModelInfo = { value: string; displayName: string; description: string; provider?: string };
    const formatted: Record<BackendId, ModelInfo[]> = {
      claude: [],
      codex: [],
      gemini: [],
    };

    // Claude models (prefer availableModels, fallback to adapter models)
    const claudeModels = get(availableModels);
    if (claudeModels.length > 0) {
      formatted.claude = claudeModels;
    } else if (allModels.claude) {
      formatted.claude = allModels.claude.map((m) => ({
        value: m,
        displayName: formatClaudeModelName(m),
        description: "",
        provider: "anthropic",
      }));
    }

    // Codex models
    if (allModels.codex) {
      formatted.codex = allModels.codex.map((m) => ({
        value: m,
        displayName: formatModelName(m, "codex"),
        description: getModelDescription(m, "codex"),
        provider: "openai",
      }));
    }

    // Gemini models
    if (allModels.gemini) {
      formatted.gemini = allModels.gemini.map((m) => ({
        value: m,
        displayName: formatModelName(m, "gemini"),
        description: getModelDescription(m, "gemini"),
        provider: "google",
      }));
    }

    backendModels.set(formatted);
  } catch (e) {
    console.error("Failed to load backend models:", e);
  }
}

function formatModelName(model: string, backend: string): string {
  if (backend === "codex") {
    return model
      .replace("gpt-", "GPT-")
      .replace("-codex", " Codex")
      .replace("-mini", " Mini")
      .replace("-max", " Max");
  }
  if (backend === "gemini") {
    return model
      .replace("gemini-", "Gemini ")
      .replace("-flash", " Flash")
      .replace("-pro", " Pro")
      .replace("-preview", " (Preview)");
  }
  return model;
}

function formatClaudeModelName(model: string): string {
  return model
    .replace(/^claude-/, "")
    .replace(/-20\d{6}$/, "")
    .replace(/-/g, " ");
}

function getModelDescription(model: string, backend: string): string {
  const descriptions: Record<string, string> = {
    // Codex
    "gpt-5.2-codex": "Latest agentic coding model",
    "gpt-5.1-codex-max": "Maximum capability",
    "gpt-5.1-codex": "Standard agentic model",
    "gpt-5.1-codex-mini": "Fast & efficient",
    "gpt-5.1": "Base GPT-5.1",
    "exp": "Experimental",
    // Gemini
    "gemini-3-flash-preview": "Gemini 3 Flash (Preview)",
    "gemini-3-pro-preview": "Gemini 3 Pro (Preview)",
    "gemini-2.5-pro": "1M context, most capable",
    "gemini-2.5-flash": "Fast & efficient",
  };
  return descriptions[model] || "";
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
