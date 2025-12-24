const API_BASE = "http://localhost:3001/api";

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  summary?: string | null;
  summary_updated_at?: number | null;
  pinned?: number;
  sort_order?: number;
  context_window?: number;
  auto_accept_all?: number;
  archived?: number;
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
  input_tokens: number;
  output_tokens: number;
  pinned?: number;
  sort_order?: number;
  auto_accept_all?: number;
  favorite?: number;
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
    list: (includeArchived: boolean = false) => 
      request<Project[]>(`/projects${includeArchived ? '?includeArchived=true' : ''}`),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: { name: string; path: string; description?: string }) =>
      request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name: string; path: string; description?: string; context_window?: number }) =>
      request<Project>(`/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/projects/${id}`, { method: "DELETE" }),
    getSummary: (id: string) =>
      request<{ summary: string | null; summaryUpdatedAt: number | null }>(`/projects/${id}/summary`),
    generateSummary: (id: string) =>
      request<{ summary: string; summaryUpdatedAt: number }>(`/projects/${id}/summary`, { method: "POST" }),
    togglePin: (id: string, pinned: boolean) =>
      request<Project>(`/projects/${id}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned }),
      }),
    reorder: (order: string[]) =>
      request<{ success: boolean }>("/projects/reorder", {
        method: "POST",
        body: JSON.stringify({ order }),
      }),
    setAutoAcceptAll: (id: string, autoAcceptAll: boolean) =>
      request<Project>(`/projects/${id}/auto-accept`, {
        method: "POST",
        body: JSON.stringify({ autoAcceptAll }),
      }),
    setArchived: (id: string, archived: boolean) =>
      request<Project>(`/projects/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ archived }),
      }),
  },

  sessions: {
    list: (projectId: string) => request<Session[]>(`/projects/${projectId}/sessions`),
    listRecent: (limit: number = 10, includeArchived: boolean = false) => 
      request<Session[]>(`/sessions/recent?limit=${limit}${includeArchived ? '&includeArchived=true' : ''}`),
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
    togglePin: (id: string, pinned: boolean) =>
      request<Session>(`/sessions/${id}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned }),
      }),
    toggleFavorite: (id: string, favorite: boolean) =>
      request<Session>(`/sessions/${id}/favorite`, {
        method: "POST",
        body: JSON.stringify({ favorite }),
      }),
    reorder: (projectId: string, order: string[]) =>
      request<{ success: boolean }>(`/projects/${projectId}/sessions/reorder`, {
        method: "POST",
        body: JSON.stringify({ order }),
      }),
    search: (query: string, projectId?: string) => {
      const params = new URLSearchParams({ q: query });
      if (projectId) params.set("projectId", projectId);
      return request<Session[]>(`/search?${params}`);
    },
    setAutoAcceptAll: (id: string, autoAcceptAll: boolean) =>
      request<Session>(`/sessions/${id}/auto-accept`, {
        method: "POST",
        body: JSON.stringify({ autoAcceptAll }),
      }),
    resetTokens: (id: string) =>
      request<{ success: boolean }>(`/sessions/${id}/reset-tokens`, {
        method: "POST",
      }),
  },

  messages: {
    list: (sessionId: string) => request<Message[]>(`/sessions/${sessionId}/messages`),
    get: (id: string) => request<Message>(`/messages/${id}`),
    update: (id: string, content: any) =>
      request<{ success: boolean; sessionReset?: boolean; historyContext?: string }>(`/messages/${id}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/messages/${id}`, { method: "DELETE" }),
    rollback: (sessionId: string, messageId: string) =>
      request<{ success: boolean; messages: Message[]; sessionReset: boolean; historyContext?: string }>(
        `/sessions/${sessionId}/rollback`,
        {
          method: "POST",
          body: JSON.stringify({ messageId }),
        }
      ),
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
    get: () => request<{ defaultProjectsDir: string; hasOpenAIKey: boolean; openAIKeyPreview: string | null; autoTitleEnabled: boolean }>("/config"),
    setOpenAIKey: (apiKey: string) =>
      request<{ success: boolean }>("/config/openai-key", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
    setAutoTitle: (enabled: boolean) =>
      request<{ success: boolean; enabled: boolean }>("/config/auto-title", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
  },

  models: {
    list: () => request<Array<{ value: string; displayName: string; description: string }>>("/models"),
  },

  auth: {
    status: () =>
      request<{
        claudeInstalled: boolean;
        claudePath: string;
        authenticated: boolean;
        authMethod: "oauth" | "api_key" | null;
        hasApiKey: boolean;
        apiKeyPreview: string | null;
        hasOAuth: boolean;
        preferredAuth: "oauth" | "api_key" | null;
      }>("/auth/status"),
    setApiKey: (apiKey: string) =>
      request<{ success: boolean }>("/auth/api-key", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
    setPreferred: (preferred: "oauth" | "api_key" | null) =>
      request<{ success: boolean; preferred: "oauth" | "api_key" | null }>("/auth/preferred", {
        method: "POST",
        body: JSON.stringify({ preferred }),
      }),
    login: () =>
      request<{ success: boolean; error?: string; requiresTerminal?: boolean }>("/auth/login", {
        method: "POST",
      }),
  },

  async transcribe(audioBlob: Blob): Promise<{ text: string }> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    
    const res = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Transcription failed: ${res.status}`);
    }
    
    return res.json();
  },

  async saveAudio(audioBlob: Blob): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    
    const res = await fetch(`${API_BASE}/audio/save`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to save audio: ${res.status}`);
    }
    
    return res.json();
  },

  ephemeral: {
    chat: (options: {
      prompt: string;
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
      projectPath?: string;
      useTools?: boolean;
      provider?: "auto" | "openai" | "anthropic" | "sdk";
    }) =>
      request<{
        result: string;
        usage: { input_tokens: number; output_tokens: number };
        costUsd: number;
        provider: string;
      }>("/ephemeral", {
        method: "POST",
        body: JSON.stringify(options),
      }),
  },

  permissions: {
    get: () =>
      request<{
        global: PermissionSettings;
        defaults: { tools: string[]; dangerous: string[] };
      }>("/permissions"),
    set: (settings: PermissionSettings) =>
      request<{ success: boolean }>("/permissions", {
        method: "POST",
        body: JSON.stringify(settings),
      }),
  },

  claudeMd: {
    getDefault: () =>
      request<{ content: string; exists: boolean }>("/claude-md/default"),
    setDefault: (content: string) =>
      request<{ success: boolean }>("/claude-md/default", {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    getProject: (projectPath: string) =>
      request<{ content: string | null; exists: boolean; path: string }>(
        `/claude-md/project?path=${encodeURIComponent(projectPath)}`
      ),
    setProject: (projectPath: string, content: string) =>
      request<{ success: boolean; path: string }>("/claude-md/project?path=" + encodeURIComponent(projectPath), {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    deleteProject: (projectPath: string) =>
      request<{ success: boolean }>("/claude-md/project?path=" + encodeURIComponent(projectPath), {
        method: "DELETE",
      }),
    initProject: (projectPath: string) =>
      request<{ created: boolean; exists: boolean; path: string }>("/claude-md/init", {
        method: "POST",
        body: JSON.stringify({ path: projectPath }),
      }),
  },

  search: {
    query: (q: string, options?: { projectId?: string; sessionId?: string; limit?: number }) => {
      const params = new URLSearchParams({ q });
      if (options?.projectId) params.set("projectId", options.projectId);
      if (options?.sessionId) params.set("sessionId", options.sessionId);
      if (options?.limit) params.set("limit", String(options.limit));
      return request<SearchResult[]>(`/search?${params}`);
    },
    reindex: () => request<{ success: boolean; stats: { total: number; byType: Array<{ entity_type: string; count: number }> } }>("/search/reindex", { method: "POST" }),
    stats: () => request<{ total: number; byType: Array<{ entity_type: string; count: number }> }>("/search/stats"),
  },
};

export interface PermissionSettings {
  autoAcceptAll: boolean;
  allowedTools: string[];
  requireConfirmation: string[];
}

export interface SearchResult {
  id: string;
  entity_type: 'project' | 'session' | 'message';
  entity_id: string;
  project_id: string | null;
  session_id: string | null;
  session_title: string | null;
  searchable_text: string;
  preview: string | null;
  updated_at: number;
  project_name?: string;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  allowed_tools: string[] | null;
  license: string | null;
  category: string | null;
  tags: string[] | null;
  content_hash: string;
  source_type: 'local' | 'marketplace' | 'import';
  source_url: string | null;
  source_version: string | null;
  created_at: number;
  updated_at: number;
  enabled_globally: boolean;
  enabled_projects: string[];
  needs_sync?: boolean;
  body?: string;
}

export interface CreateSkillInput {
  slug?: string;
  name: string;
  description: string;
  body: string;
  allowed_tools?: string[];
  license?: string;
  category?: string;
  tags?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  body?: string;
  allowed_tools?: string[];
  license?: string;
  category?: string;
  tags?: string[];
  version?: string;
}

export const skillsApi = {
  list: () => request<Skill[]>("/skills"),
  get: (id: string) => request<Skill>(`/skills/${id}`),
  create: (data: CreateSkillInput) =>
    request<Skill>("/skills", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateSkillInput) =>
    request<Skill>(`/skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/skills/${id}`, { method: "DELETE" }),
  enableGlobal: (id: string) =>
    request<{ success: boolean; path: string }>(`/skills/${id}/enable`, { method: "POST" }),
  disableGlobal: (id: string) =>
    request<{ success: boolean }>(`/skills/${id}/enable`, { method: "DELETE" }),
  enableForProject: (projectId: string, skillId: string) =>
    request<{ success: boolean; path: string }>(`/projects/${projectId}/skills/${skillId}/enable`, {
      method: "POST",
    }),
  disableForProject: (projectId: string, skillId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/skills/${skillId}/enable`, {
      method: "DELETE",
    }),
  listEnabled: () => request<Skill[]>("/skills/enabled"),
  listProjectSkills: (projectId: string) => request<Skill[]>(`/projects/${projectId}/skills`),
  scan: () => request<{ success: boolean; results: any }>("/skills/scan", { method: "POST" }),
  syncGlobal: () => request<{ synced: string[]; skipped: string[]; errors: string[]; total_global: number }>("/skills/sync-global", { method: "POST" }),
  listGlobal: () => request<Array<{ slug: string; name: string; description: string; path: string }>>("/skills/global"),
  createExamples: () =>
    request<{ success: boolean; created: string[] }>("/skills/examples", { method: "POST" }),
  async importFile(file: File, useAi: boolean = false): Promise<Skill> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("useAi", String(useAi));
    const res = await fetch(`${API_BASE}/skills/import`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Import failed: ${res.status}`);
    }
    return res.json();
  },
  importUrl: (url: string, useAi: boolean = false) =>
    request<Skill>("/skills/import-url", {
      method: "POST",
      body: JSON.stringify({ url, useAi }),
    }),
  async exportZip(id: string, slug: string): Promise<void> {
    const res = await fetch(`${API_BASE}/skills/${id}/export`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Export failed: ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
  sync: (id: string, scope: "global" | "project", projectId?: string) =>
    request<{ success: boolean; hash: string }>(`/skills/${id}/sync`, {
      method: "POST",
      body: JSON.stringify({ scope, projectId }),
    }),
  getFiles: (id: string) =>
    request<{ path: string; files: SkillFileInfo[] }>(`/skills/${id}/files`),
  openInEditor: (id: string, editor: "code" | "cursor" | "zed" | "finder" = "code") =>
    request<{ success: boolean; path: string; editor: string }>(`/skills/${id}/open`, {
      method: "POST",
      body: JSON.stringify({ editor }),
    }),
};

export interface SkillFileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface CostSummary {
  totalEver: number;
  totalToday: number;
}

export interface HourlyCost {
  hour: string;
  total_cost: number;
  entry_count: number;
}

export interface DailyCost {
  date: string;
  total_cost: number;
  entry_count: number;
  input_tokens: number;
  output_tokens: number;
}

export interface CostAnalytics {
  totalEver: number;
  totalToday: number;
  hourlyCosts: HourlyCost[];
  dailyCosts: DailyCost[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMessages: number;
  totalSessions: number;
  totalCalls: number;
}

export const costsApi = {
  getTotal: () => request<CostSummary>("/costs"),
  getAnalytics: () => request<CostAnalytics>("/costs/analytics"),
  getProjectCost: (projectId: string) => request<CostSummary>(`/projects/${projectId}/cost`),
  getSessionCost: (sessionId: string) => request<{ total: number }>(`/sessions/${sessionId}/cost`),
};
