import { getApiBase, getPtyApiUrl, getServerUrl } from "./config";
export { getServerUrl };
import type { ContentBlock } from "./claude";

const getApiBaseUrl = () => getApiBase();
const getPtyBaseUrl = () => getPtyApiUrl();

export interface WorkspaceFolder {
  id: string;
  name: string;
  sort_order: number;
  collapsed: number;
  pinned?: number;
  created_at: number;
  updated_at: number;
}

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
  folder_id?: string | null;
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
  archived?: number;
  marked_for_review?: number;
  // Backlog
  in_backlog?: number;
  backlog_added_at?: number | null;
  backlog_note?: string | null;
  // Worktree mode - session runs in isolated git worktree
  worktree_path?: string | null;
  worktree_branch?: string | null;
  worktree_base_branch?: string | null;
  created_at: number;
  updated_at: number;
  project_name?: string;
}

export interface ActiveSessionStatus {
  sessionId: string;
  projectId: string;
  status: "running" | "permission";
}

/**
 * Message content can be:
 * - ContentBlock[] for structured content (assistant/user messages with tools)
 * - string for simple text content (legacy or system messages)
 */
export type MessageContent = ContentBlock[] | string;

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: MessageContent;
  timestamp: number;
  parent_tool_use_id?: string | null;
  is_synthetic?: number;
  is_final?: number;
}

export interface PaginatedMessages {
  messages: Message[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

import { handleNetworkError, isNetworkError } from "./stores/connectivity";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const data = await res.json().catch((parseError) => {
        console.error("[API] Failed to parse error response:", parseError);
        return {};
      });
      throw new Error(data.error || `API error: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    // Detect and handle network errors (triggers connectivity check)
    if (isNetworkError(error)) {
      handleNetworkError(error);
      throw new Error("Unable to connect. Check your internet connection.");
    }
    throw error;
  }
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
    update: (id: string, data: { name?: string; path?: string; description?: string; context_window?: number; summary?: string; summary_updated_at?: number }) =>
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
    setFolder: (id: string, folderId: string | null) =>
      request<Project>(`/projects/${id}/folder`, {
        method: "POST",
        body: JSON.stringify({ folderId }),
      }),
  },

  folders: {
    list: () => request<WorkspaceFolder[]>("/folders"),
    get: (id: string) => request<WorkspaceFolder>(`/folders/${id}`),
    create: (name: string) =>
      request<WorkspaceFolder>("/folders", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    update: (id: string, name: string) =>
      request<WorkspaceFolder>(`/folders/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/folders/${id}`, { method: "DELETE" }),
    toggleCollapse: (id: string, collapsed: boolean) =>
      request<WorkspaceFolder>(`/folders/${id}/collapse`, {
        method: "POST",
        body: JSON.stringify({ collapsed }),
      }),
    togglePin: (id: string, pinned: boolean) =>
      request<WorkspaceFolder>(`/folders/${id}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned }),
      }),
    reorder: (order: string[]) =>
      request<{ success: boolean }>("/folders/reorder", {
        method: "POST",
        body: JSON.stringify({ order }),
      }),
  },

  sessions: {
    list: (projectId: string, includeArchived: boolean = false) =>
      request<Session[]>(`/projects/${projectId}/sessions${includeArchived ? '?includeArchived=true' : ''}`),
    listRecent: (limit: number = 10, includeArchived: boolean = false) => 
      request<Session[]>(`/sessions/recent?limit=${limit}${includeArchived ? '&includeArchived=true' : ''}`),
    active: () => request<ActiveSessionStatus[]>("/sessions/active"),
    get: (id: string) => request<Session>(`/sessions/${id}`),
    create: (projectId: string, data: { title?: string }) =>
      request<Session>(`/projects/${projectId}/sessions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { title?: string; model?: string }) =>
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
    setArchived: (id: string, archived: boolean) =>
      request<Session>(`/sessions/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ archived }),
      }),
    archiveAllNonStarred: (projectId: string) =>
      request<{ success: boolean }>(`/projects/${projectId}/sessions/archive-all-non-starred`, {
        method: "POST",
      }),
    setMarkedForReview: (id: string, markedForReview: boolean) =>
      request<Session>(`/sessions/${id}/mark-for-review`, {
        method: "POST",
        body: JSON.stringify({ markedForReview }),
      }),
    reorder: (projectId: string, order: string[]) =>
      request<{ success: boolean }>(`/projects/${projectId}/sessions/reorder`, {
        method: "POST",
        body: JSON.stringify({ order }),
      }),
    resetContext: (id: string) =>
      request<{ success: boolean; sessionReset: boolean }>(`/sessions/${id}/reset-context`, {
        method: "POST",
        body: JSON.stringify({}),
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
    pruneToolResults: (id: string, options?: { preserveRecentCount?: number; maxPrunedLength?: number }) =>
      request<{ success: boolean; prunedCount: number; tokensSaved: number; prunedToolUseIds: string[] }>(
        `/sessions/${id}/prune-tool-results`,
        {
          method: "POST",
          body: JSON.stringify(options || {}),
        }
      ),
    getPendingQuestion: (id: string) =>
      request<{
        id: string;
        session_id: string;
        request_id: string;
        questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }>;
        created_at: number;
      } | null>(`/sessions/${id}/pending-question`),
    clearPendingQuestion: (id: string) =>
      request<{ success: boolean }>(`/sessions/${id}/pending-question`, { method: "DELETE" }),
    generateSummary: (id: string) =>
      request<{
        summary: string;
        sessionTitle: string;
        projectName: string | null;
        messageCount: number;
        costUsd: number;
      }>(`/sessions/${id}/generate-summary`, { method: "POST" }),
    clearWorktree: (id: string) =>
      request<Session>(`/sessions/${id}/clear-worktree`, { method: "POST" }),
  },

  messages: {
    list: (sessionId: string) => request<Message[]>(`/sessions/${sessionId}/messages`),
    listPaginated: (sessionId: string, limit: number, offset: number = 0) =>
      request<PaginatedMessages>(`/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`),
    get: (id: string) => request<Message>(`/messages/${id}`),
    update: (id: string, content: MessageContent) =>
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
      fetch(`${getApiBaseUrl()}/sessions/${sessionId}/export`).then((res) => res.text()),
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
    reveal: (path: string) =>
      request<{ success: boolean }>("/fs/reveal", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    openInEditor: (path: string, editor: "code" | "cursor" | "zed" | "terminal" = "code") =>
      request<{ success: boolean }>("/fs/open-editor", {
        method: "POST",
        body: JSON.stringify({ path, editor }),
      }),
    applyTemplate: (templateId: string, targetPath: string) =>
      request<{ success: boolean; templateId: string; targetPath: string; skillSlugs: string[]; message: string }>("/fs/apply-template", {
        method: "POST",
        body: JSON.stringify({ templateId, targetPath }),
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
        hasZaiKey: boolean;
        zaiKeyPreview: string | null;
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
    setZaiKey: (apiKey: string) =>
      request<{ success: boolean }>("/auth/zai-key", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
    deleteZaiKey: () =>
      request<{ success: boolean }>("/auth/zai-key", {
        method: "DELETE",
      }),
  },

  async transcribe(audioBlob: Blob): Promise<{ text: string }> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    
    const res = await fetch(`${getApiBaseUrl()}/transcribe`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const data = await res.json().catch((parseError) => {
        console.error("[API] Failed to parse transcription error:", parseError);
        return {};
      });
      throw new Error(data.error || `Transcription failed: ${res.status}`);
    }
    
    return res.json();
  },

  async saveAudio(audioBlob: Blob): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    
    const res = await fetch(`${getApiBaseUrl()}/audio/save`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const data = await res.json().catch((parseError) => {
        console.error("[API] Failed to parse audio save error:", parseError);
        return {};
      });
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
    const res = await fetch(`${getApiBaseUrl()}/skills/import`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch((parseError) => {
        console.error("[API] Failed to parse skill import error:", parseError);
        return {};
      });
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
    const res = await fetch(`${getApiBaseUrl()}/skills/${id}/export`);
    if (!res.ok) {
      const data = await res.json().catch((parseError) => {
        console.error("[API] Failed to parse skill export error:", parseError);
        return {};
      });
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

// Agents (subagents for Claude Agent SDK)
export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
  body: string;
  scope: "global" | "project";
  projectId?: string;
  path: string;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
  instructions?: string;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  model?: "haiku" | "sonnet" | "opus";
  tools?: string[];
  instructions?: string;
}

export const agentsApi = {
  // Global agents
  list: () => request<Agent[]>("/agents"),
  get: (id: string) => request<Agent>(`/agents/${encodeURIComponent(id)}`),
  create: (data: CreateAgentInput) =>
    request<Agent>("/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateAgentInput) =>
    request<Agent>(`/agents/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/agents/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Project agents
  listForProject: (projectId: string) => request<Agent[]>(`/projects/${projectId}/agents`),
  createForProject: (projectId: string, data: CreateAgentInput) =>
    request<Agent>(`/projects/${projectId}/agents`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

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
  getAnalytics: (projectIds?: string[]) =>
    request<CostAnalytics>(`/costs/analytics${projectIds && projectIds.length > 0 ? `?projectIds=${projectIds.join(',')}` : ''}`),
  getProjectCost: (projectId: string) => request<CostSummary>(`/projects/${projectId}/cost`),
  getSessionCost: (sessionId: string) => request<{ total: number }>(`/sessions/${sessionId}/cost`),
};

// Terminal API
export interface ExecEvent {
  type: "started" | "stdout" | "stderr" | "exit" | "error";
  execId?: string;
  data?: string;
  code?: number;
  message?: string;
}

export interface TerminalSession {
  terminalId: string;
  pid: number;
  shell: string;
  cwd: string;
}

export interface ActiveExec {
  execId: string;
  cwd: string;
  startedAt: number;
  pid: number;
}

export const terminalApi = {
  // Execute a command and get SSE stream
  exec: (command: string, cwd?: string, env?: Record<string, string>) => {
    return fetch(`${getApiBaseUrl()}/terminal/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, cwd, env }),
    });
  },

  // Kill an exec process
  killExec: (execId: string) =>
    request<{ success: boolean; execId: string }>(`/terminal/exec/${execId}`, {
      method: "DELETE",
    }),

  // List active exec processes
  listExec: () => request<ActiveExec[]>("/terminal/exec"),

  // Create a new PTY terminal
  createPty: (cwd?: string, cols?: number, rows?: number, sessionId?: string) =>
    request<TerminalSession>("/terminal/pty", {
      method: "POST",
      body: JSON.stringify({ cwd, cols, rows, sessionId }),
    }),

  // Resize a PTY terminal
  resizePty: (terminalId: string, cols: number, rows: number) =>
    request<{ success: boolean; error?: string }>(`/terminal/pty/${terminalId}/resize`, {
      method: "POST",
      body: JSON.stringify({ cols, rows }),
    }),

  // Kill a PTY terminal
  killPty: (terminalId: string) =>
    request<{ success: boolean }>(`/terminal/pty/${terminalId}`, {
      method: "DELETE",
    }),

  // List active PTY terminals (optionally filtered by sessionId)
  listPty: (sessionId?: string) =>
    request<Array<{ terminalId: string; cwd: string; createdAt: number; pid: number; sessionId?: string }>>(
      sessionId ? `/terminal/pty?sessionId=${sessionId}` : "/terminal/pty"
    ),

  // Get terminal output buffer for Claude context
  getBuffer: (terminalId: string, lines = 100) =>
    request<{ terminalId: string; lines: string[]; totalLines: number }>(
      `/terminal/pty/${terminalId}/buffer?lines=${lines}`
    ),

  // Check for errors in terminal output
  checkErrors: (terminalId: string) =>
    request<{ terminalId: string; hasErrors: boolean; errorLines: string[]; context: string }>(
      `/terminal/pty/${terminalId}/errors`
    ),
};

// PTY Server API (talks directly to Node PTY server on port 3002)
export interface PtyTerminalInfo {
  terminalId: string;
  pid: number;
  cwd: string;
  createdAt: number;
  projectId?: string;
  name?: string;
}

export const ptyApi = {
  // Check PTY server health
  health: async () => {
    const res = await fetch(`${getPtyBaseUrl()}/health`);
    return res.json() as Promise<{ status: string; terminals: number; uptime: number }>;
  },

  // List terminals (optionally filtered by projectId)
  list: async (projectId?: string) => {
    const url = projectId
      ? `${getPtyBaseUrl()}/terminals?projectId=${projectId}`
      : `${getPtyBaseUrl()}/terminals`;
    const res = await fetch(url);
    return res.json() as Promise<PtyTerminalInfo[]>;
  },
};

// Process management API
export interface ProcessInfo {
  id: string;
  type: "query" | "exec" | "pty" | "child";
  pid?: number;
  ppid?: number;
  sessionId?: string;
  sessionTitle?: string;
  cwd?: string;
  startedAt: number;
  command?: string;
}

export const processApi = {
  // List all active child processes (includeChildren defaults to true)
  list: (includeChildren = true) =>
    request<ProcessInfo[]>(`/processes${includeChildren ? '' : '?children=false'}`),

  // Kill a specific process (supports SIGTERM, SIGKILL, etc.)
  kill: (processId: string, signal: string = "SIGTERM") =>
    request<{ success: boolean; processId: string; type: string }>(`/processes/${processId}`, {
      method: "DELETE",
      body: JSON.stringify({ signal }),
    }),

  // Kill all processes of a specific type
  killAll: (type: "query" | "exec" | "pty" | "child" | "all") =>
    request<{ success: boolean; killedCount: number }>("/processes/kill-all", {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
};

// Project Analytics (parsed from Claude session transcripts)
export interface ToolUsage {
  name: string;
  count: number;
}

export interface FileAccess {
  path: string;
  reads: number;
  writes: number;
  edits: number;
  lineRanges: Array<{ offset?: number; limit?: number }>;
}

export interface ProjectAnalytics {
  projectPath: string;
  totalSessions: number;
  analyzedSessions: number;
  dateRange: { start: number; end: number } | null;
  toolUsage: ToolUsage[];
  topFiles: FileAccess[];
  hotspots: Array<{ file: string; range: string; accessCount: number }>;
  totalReads: number;
  totalWrites: number;
  totalEdits: number;
}

export const analyticsApi = {
  getProjectAnalytics: (projectId: string, days?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (days) params.set("days", String(days));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<ProjectAnalytics>(`/projects/${projectId}/analytics${query ? `?${query}` : ""}`);
  },
};

// Background Process Management API
export type BackgroundProcessStatus = "running" | "completed" | "failed" | "killed";

export interface BackgroundProcess {
  id: string;
  type: "bash" | "task" | "dev_server";
  command: string;
  cwd: string;
  pid?: number;
  sessionId?: string;
  projectId?: string;
  startedAt: number;
  status: BackgroundProcessStatus;
  exitCode?: number;
  output: string[];
  outputSize: number;
  ports: number[];
  label?: string;
}

export interface BackgroundProcessEvent {
  type: "process_started" | "process_output" | "process_status" | "process_port_detected" | "process_removed";
  processId: string;
  data?: string;
  status?: BackgroundProcessStatus;
  exitCode?: number;
  port?: number;
  process?: BackgroundProcess;
}

export interface DetectedProcess {
  pid: number;
  port: number;
  command: string;
}

export const backgroundProcessApi = {
  // List all background processes
  list: (filter?: { sessionId?: string; projectId?: string; status?: BackgroundProcessStatus }) => {
    const params = new URLSearchParams();
    if (filter?.sessionId) params.set("sessionId", filter.sessionId);
    if (filter?.projectId) params.set("projectId", filter.projectId);
    if (filter?.status) params.set("status", filter.status);
    const query = params.toString();
    return request<BackgroundProcess[]>(`/background-processes${query ? `?${query}` : ""}`);
  },

  // Get a specific process
  get: (id: string) => request<BackgroundProcess>(`/background-processes/${id}`),

  // Start a new background process
  start: (options: {
    command: string;
    cwd?: string;
    sessionId?: string;
    projectId?: string;
    type?: "bash" | "task" | "dev_server";
    label?: string;
  }) =>
    request<BackgroundProcess>("/background-processes", {
      method: "POST",
      body: JSON.stringify(options),
    }),

  // Get process output
  getOutput: (id: string, lines?: number) =>
    request<{ output: string[]; totalLines: number }>(
      `/background-processes/${id}/output${lines ? `?lines=${lines}` : ""}`
    ),

  // Kill a process
  kill: (id: string, signal: string = "SIGTERM") =>
    request<{ success: boolean; killed: boolean }>(`/background-processes/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ signal }),
    }),

  // Remove a process from tracking
  remove: (id: string) =>
    request<{ success: boolean; removed: boolean }>(`/background-processes/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ remove: true }),
    }),

  // Restart a process
  restart: (id: string) =>
    request<BackgroundProcess>(`/background-processes/${id}/restart`, {
      method: "POST",
    }),

  // Detect existing processes (dev servers, etc.)
  detect: (projectPath?: string) => {
    const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
    return request<DetectedProcess[]>(`/background-processes/detect${params}`);
  },
};

// Worktree API - manage git worktrees for sessions
export interface WorktreeStatus {
  ahead: number;
  behind: number;
  isClean: boolean;
  staged: number;
  modified: number;
  untracked: number;
}

export interface WorktreeCommit {
  hash: string;
  message: string;
}

export interface WorktreeChangedFile {
  path: string;
  status: string;
}

export interface WorktreeInfo {
  status: WorktreeStatus;
  commits: WorktreeCommit[];
  changedFiles: WorktreeChangedFile[];
  branch: string | null;
  baseBranch: string | null;
}

export interface MergePreview {
  canMerge: boolean;
  hasUncommittedChanges: boolean;
  mainHasUncommittedChanges?: boolean;
  mainRepoChanges?: { staged: number; modified: number; untracked: number } | null;
  commits: WorktreeCommit[];
  changedFiles: WorktreeChangedFile[];
  totalChanges: number;
  branch: string | null;
  baseBranch: string | null;
}

export interface ConflictInfo {
  file: string;
  content: {
    ours: string;
    theirs: string;
    full: string;
  } | null;
}

export interface ConflictFileInfo {
  path: string;
  oursContent: string;
  theirsContent: string;
  fullContent: string;
  conflictMarkers: string[];
}

export interface ConflictContext {
  conflictingFiles: ConflictFileInfo[];
  worktreeBranch: string;
  baseBranch: string;
  worktreePath: string;
  mainRepoPath: string;
  snapshotId: string;
}

export interface MergeResult {
  success: boolean;
  hasConflicts?: boolean;
  needsConflictResolution?: boolean;  // True if rebase is paused waiting for user to resolve
  conflicts?: ConflictInfo[];
  conflictContext?: ConflictContext;  // Rich context for Claude to resolve conflicts
  error?: string;
  merged?: boolean;
  cleanedUp?: boolean;
}

// Branch name generation API
export interface BranchNameResult {
  branchName: string;  // Full branch name with session/ prefix
  shortName: string;   // Short name without prefix
  generatedBy: "llm" | "fallback";
}

export const branchNameApi = {
  // Generate a smart branch name using LLM
  generate: (description: string, useLlm: boolean = true) =>
    request<BranchNameResult>("/branch-name/generate", {
      method: "POST",
      body: JSON.stringify({ description, useLlm }),
    }),
};

export const worktreeApi = {
  // Create a worktree for a session
  // If branchName is provided, uses that; otherwise generates from description
  create: (sessionId: string, description: string, branchName?: string) =>
    request<{
      session: Session;
      worktree: { path: string; branch: string; baseBranch: string };
    }>(`/sessions/${sessionId}/worktree`, {
      method: "POST",
      body: JSON.stringify({ description, branchName }),
    }),

  // Get worktree status
  getStatus: (sessionId: string) =>
    request<WorktreeInfo>(`/sessions/${sessionId}/worktree/status`),

  // Delete worktree
  delete: (sessionId: string, force?: boolean, deleteBranch?: boolean) =>
    request<{ success: boolean }>(`/sessions/${sessionId}/worktree`, {
      method: "DELETE",
      body: JSON.stringify({ force, deleteBranch }),
    }),

  // Commit changes in worktree
  commit: (sessionId: string, message: string) =>
    request<{ success: boolean }>(`/sessions/${sessionId}/worktree/commit`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  // Preview merge
  previewMerge: (sessionId: string) =>
    request<MergePreview>(`/sessions/${sessionId}/worktree/merge/preview`),

  // Merge worktree to base branch
  merge: (
    sessionId: string,
    options?: { commitMessage?: string; autoCommit?: boolean; cleanupAfter?: boolean }
  ) =>
    request<MergeResult>(`/sessions/${sessionId}/worktree/merge`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),

  // Abort merge/rebase
  abortMerge: (sessionId: string) =>
    request<{ success: boolean }>(`/sessions/${sessionId}/worktree/merge/abort`, {
      method: "POST",
    }),

  // Continue rebase after conflicts resolved
  continueRebase: (sessionId: string, options?: { cleanupAfter?: boolean }) =>
    request<MergeResult>(`/sessions/${sessionId}/worktree/rebase/continue`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),

  // Check if rebase is in progress
  rebaseStatus: (sessionId: string) =>
    request<{ inProgress: boolean }>(`/sessions/${sessionId}/worktree/rebase/status`),

  // Prune stale worktrees for a project
  prune: (projectId: string) =>
    request<{ success: boolean; cleanedSessions: string[] }>(
      `/projects/${projectId}/worktrees/prune`,
      { method: "POST" }
    ),

  // Restore repo from snapshot (abort merge and rollback)
  restoreSnapshot: (snapshotId: string) =>
    request<{ success: boolean; message: string }>(`/merge/restore/${snapshotId}`, {
      method: "POST",
    }),

  // Delete snapshot (cleanup after successful resolve)
  deleteSnapshot: (snapshotId: string) =>
    request<{ success: boolean }>(`/merge/snapshot/${snapshotId}`, {
      method: "DELETE",
    }),

  // ⚠️ EXPERIMENTAL: Preview server methods (startPreview -> listPreviews) - remove to revert
  // See server/routes/worktree-preview.ts for full revert instructions

  // Start preview server in worktree
  startPreview: (sessionId: string, command?: string) =>
    request<{
      success: boolean;
      alreadyRunning?: boolean;
      processId: string;
      pid?: number;
      frontendPort?: number;
      backendPort?: number;
      ports?: number[];
      command?: string;
      worktreePath?: string;
      branch?: string;
    }>(`/sessions/${sessionId}/worktree/preview`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),

  // Stop preview server
  stopPreview: (sessionId: string) =>
    request<{ success: boolean; killed: boolean }>(`/sessions/${sessionId}/worktree/preview`, {
      method: "DELETE",
    }),

  // Get preview server status
  getPreviewStatus: (sessionId: string) =>
    request<{
      running: boolean;
      processId?: string;
      pid?: number;
      ports?: number[];
      status?: string;
      startedAt?: number;
      output?: string[];
    }>(`/sessions/${sessionId}/worktree/preview`),

  // List all running preview servers
  listPreviews: () =>
    request<Array<{
      sessionId: string;
      processId: string;
      status: string;
      ports: number[];
      branch?: string;
    }>>("/worktree-previews"),
  // ⚠️ END EXPERIMENTAL preview methods
};

/**
 * Container Preview API
 *
 * Containerized preview system using Colima/Docker.
 * Runs dev servers in isolated containers with Traefik routing.
 */
export interface ContainerPreview {
  id: string;
  sessionId: string;
  url: string;
  slug: string;
  status: "pending" | "starting" | "running" | "paused" | "stopped" | "error";
  branch: string;
  framework?: string;
  startedAt?: number;
  error?: string;
}

export interface ContainerPreviewStatus {
  running: boolean;
  exists?: boolean;
  status?: string;
  url?: string;
  slug?: string;
  branch?: string;
  framework?: string;
  startedAt?: number;
  error?: string;
}

export interface PreviewSystemStatus {
  initialized: boolean;
  runtime: {
    runtime: "colima" | "docker" | "orbstack" | "none";
    version?: string;
    running: boolean;
  };
  proxyRunning: boolean;
  containerCount: number;
  proxyPort: number;
  maxContainers: number;
}

export const containerPreviewApi = {
  /** Get preview system status (runtime detection, proxy status) */
  getSystemStatus: () => request<PreviewSystemStatus>("/preview/status"),

  /** Initialize the preview system (detect runtime, restore containers) */
  initialize: () =>
    request<{
      success: boolean;
      runtime: string;
      version?: string;
      running: boolean;
      error?: string;
      instructions?: string;
    }>("/preview/initialize", { method: "POST" }),

  /** List all active container previews */
  list: () => request<ContainerPreview[]>("/preview/list"),

  /** Start a containerized preview for a session */
  start: (sessionId: string) =>
    request<{
      success: boolean;
      preview?: {
        id: string;
        url: string;
        slug: string;
        status: string;
        branch: string;
        framework?: string;
      };
      error?: string;
      instructions?: string;
    }>(`/sessions/${sessionId}/preview/container`, { method: "POST" }),

  /** Stop a containerized preview for a session */
  stop: (sessionId: string) =>
    request<{ success: boolean }>(`/sessions/${sessionId}/preview/container`, {
      method: "DELETE",
    }),

  /** Get container preview status for a session */
  getStatus: (sessionId: string) =>
    request<ContainerPreviewStatus>(`/sessions/${sessionId}/preview/container`),

  /** Get container preview logs */
  getLogs: (sessionId: string, tail = 100) =>
    request<{ logs: string[] }>(
      `/sessions/${sessionId}/preview/container/logs?tail=${tail}`
    ),

  /** Pause a container preview */
  pause: (sessionId: string) =>
    request<{ success: boolean }>(
      `/sessions/${sessionId}/preview/container/pause`,
      { method: "POST" }
    ),

  /** Unpause a container preview */
  unpause: (sessionId: string) =>
    request<{ success: boolean }>(
      `/sessions/${sessionId}/preview/container/unpause`,
      { method: "POST" }
    ),

  // Branch-scoped APIs (preferred)

  /** Get container preview status by branch */
  getStatusByBranch: (projectId: string, branch: string) =>
    request<ContainerPreviewStatus>(
      `/projects/${projectId}/preview/branch/${encodeURIComponent(branch)}`
    ),

  /** Stop container preview by branch */
  stopByBranch: (projectId: string, branch: string) =>
    request<{ success: boolean }>(
      `/projects/${projectId}/preview/branch/${encodeURIComponent(branch)}`,
      { method: "DELETE" }
    ),

  /** Reset cached preview config (forces re-detection on next start) */
  resetConfig: (projectId: string) =>
    request<{ success: boolean; message: string }>(
      `/projects/${projectId}/preview/config`,
      { method: "DELETE" }
    ),
};

/**
 * Native Preview API
 * Lightweight preview system that runs dev servers natively (no Docker).
 * One preview at a time, auto-switches when changing worktrees.
 */
export interface NativePreviewStatus {
  running: boolean;
  sessionId?: string;
  projectId?: string;
  projectPath?: string;
  branch?: string;
  port?: number;
  url?: string;
  status?: "starting" | "running" | "error";
  framework?: string;
  error?: string;
  startedAt?: number;
}

export interface PreviewComplianceResult {
  canPreview: boolean;
  reason?: string;
  framework?: string;
  suggestions?: string[];
  /** If package.json was found in a subfolder, this is the resolved path */
  resolvedPath?: string;
  /** If true, dependencies will be auto-installed on start */
  needsInstall?: boolean;
}

export const nativePreviewApi = {
  /** Check if preview is possible for a session (compliance check) */
  checkCompliance: (sessionId: string) =>
    request<PreviewComplianceResult>(
      `/sessions/${sessionId}/preview/native/compliance`
    ),

  /** Start native preview for a session */
  start: (sessionId: string) =>
    request<{ success: boolean; port?: number; url?: string; framework?: string; error?: string }>(
      `/sessions/${sessionId}/preview/native`,
      { method: "POST" }
    ),

  /** Stop native preview */
  stop: (sessionId: string) =>
    request<{ success: boolean }>(
      `/sessions/${sessionId}/preview/native`,
      { method: "DELETE" }
    ),

  /** Get native preview status for a session */
  getStatus: (sessionId: string) =>
    request<NativePreviewStatus>(`/sessions/${sessionId}/preview/native`),

  /** Get logs from native preview */
  getLogs: (sessionId: string, tail = 50) =>
    request<{ logs: string[] }>(
      `/sessions/${sessionId}/preview/native/logs?tail=${tail}`
    ),

  /** Get global native preview status */
  getGlobalStatus: () =>
    request<NativePreviewStatus>("/preview/native/status"),
};

/**
 * Port Manager Preview API
 * LLM-powered port orchestration for running multiple dev servers without conflicts.
 * Supports multiple instances across different worktrees/branches.
 */
export interface PortAllocation {
  primary: number;
  backend?: number;
  additional?: number[];
}

export interface PortManagerPreviewStatus {
  running: boolean;
  id?: string;
  sessionId?: string;
  branch?: string;
  ports?: PortAllocation;
  url?: string;
  status?: "starting" | "running" | "error";
  framework?: string;
  error?: string;
}

export interface PortManagerPreviewInfo {
  id: string;
  sessionId: string;
  projectId: string;
  branch: string;
  ports: PortAllocation;
  status: string;
  framework: string;
  startedAt: number;
}

export const portManagerPreviewApi = {
  /** Start port manager preview for a session */
  start: (sessionId: string, useLlm: boolean = true) =>
    request<{ success: boolean; id?: string; ports?: PortAllocation; url?: string; error?: string }>(
      `/sessions/${sessionId}/preview/port-manager`,
      { method: "POST", body: JSON.stringify({ useLlm }) }
    ),

  /** Stop port manager preview for a session */
  stop: (sessionId: string) =>
    request<{ success: boolean }>(
      `/sessions/${sessionId}/preview/port-manager`,
      { method: "DELETE" }
    ),

  /** Get port manager preview status for a session */
  getStatus: (sessionId: string) =>
    request<PortManagerPreviewStatus>(`/sessions/${sessionId}/preview/port-manager`),

  /** Get logs from port manager preview */
  getLogs: (sessionId: string, tail = 50) =>
    request<{ logs: string[] }>(
      `/sessions/${sessionId}/preview/port-manager/logs?tail=${tail}`
    ),

  /** List all running port manager previews */
  list: () =>
    request<PortManagerPreviewInfo[]>("/port-manager-preview/list"),

  /** Get allocated ports map */
  getAllocatedPorts: () =>
    request<{ ports: { port: number; previewId: string }[] }>("/port-manager-preview/ports"),

  /** Stop a specific preview by ID */
  stopById: (previewId: string) =>
    request<{ success: boolean }>(
      `/port-manager-preview/${encodeURIComponent(previewId)}`,
      { method: "DELETE" }
    ),

  /** Get status of a specific preview by ID */
  getStatusById: (previewId: string) =>
    request<PortManagerPreviewStatus>(
      `/port-manager-preview/${encodeURIComponent(previewId)}`
    ),

  /** Get logs for a specific preview by ID */
  getLogsById: (previewId: string, tail = 50) =>
    request<{ logs: string[] }>(
      `/port-manager-preview/${encodeURIComponent(previewId)}/logs?tail=${tail}`
    ),
};
