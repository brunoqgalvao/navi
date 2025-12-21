const API_BASE = "http://localhost:3001/api";

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  created_at: number;
  updated_at: number;
  session_count?: number;
  last_activity?: number | null;
}

export interface Session {
  id: string;
  project_id: string;
  title: string;
  claude_session_id: string | null;
  model: string | null;
  total_cost_usd: number;
  total_turns: number;
  created_at: number;
  updated_at: number;
  project_name?: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: any;
  timestamp: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  projects: {
    list: () => request<Project[]>("/projects"),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: { name: string; path: string; description?: string }) =>
      request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name: string; path: string; description?: string }) =>
      request<Project>(`/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  },

  sessions: {
    list: (projectId: string) => request<Session[]>(`/projects/${projectId}/sessions`),
    get: (id: string) => request<Session>(`/sessions/${id}`),
    create: (projectId: string, data: { title?: string }) =>
      request<Session>(`/projects/${projectId}/sessions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { title: string }) =>
      request<Session>(`/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/sessions/${id}`, { method: "DELETE" }),
    fork: (id: string, data: { fromMessageId?: string; title?: string }) =>
      request<Session>(`/sessions/${id}/fork`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    search: (query: string, projectId?: string) => {
      const params = new URLSearchParams({ q: query });
      if (projectId) params.set("projectId", projectId);
      return request<Session[]>(`/search?${params}`);
    },
  },

  messages: {
    list: (sessionId: string) => request<Message[]>(`/sessions/${sessionId}/messages`),
  },

  export: {
    markdown: (sessionId: string) =>
      fetch(`${API_BASE}/sessions/${sessionId}/export`).then((res) => res.text()),
    download: async (sessionId: string, title: string) => {
      const markdown = await api.export.markdown(sessionId);
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },

  fs: {
    mkdir: (path: string) =>
      request<{ success: boolean; path: string }>("/fs/mkdir", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
  },

  config: {
    get: () => request<{ defaultProjectsDir: string }>("/config"),
  },

  models: {
    list: () => request<Array<{ value: string; displayName: string; description: string }>>("/models"),
  },
};
