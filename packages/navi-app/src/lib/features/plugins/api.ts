import { getServerUrl } from "$lib/api";

const API_BASE = () => getServerUrl();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface PluginHook {
  type: string;
  command: string;
  timeout?: number;
}

export interface PluginHookEntry {
  matcher?: string;
  hooks: PluginHook[];
}

export interface PluginHookConfig {
  description?: string;
  hooks: Record<string, PluginHookEntry[]>;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  scope: "user" | "project";
  installPath: string;
  enabledInProject?: boolean;
  enabledInUser?: boolean;
  hooks: string[];
  hooksDetail: PluginHookConfig | null;
}

export const pluginApi = {
  list: (cwd: string) =>
    request<Plugin[]>(`/api/plugins?cwd=${encodeURIComponent(cwd)}`),

  toggle: (pluginId: string, enabled: boolean, scope: "user" | "project", cwd: string) =>
    request("/api/plugins/toggle", {
      method: "POST",
      body: JSON.stringify({ pluginId, enabled, scope, cwd }),
    }),

  getHooks: (pluginId: string) =>
    request<PluginHookConfig>(`/api/plugins/${encodeURIComponent(pluginId)}/hooks`),
};
