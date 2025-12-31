// Agent Builder API client
import { getApiBase } from "../../config";
import type { AgentDefinition, AgentFileNode } from "./types";

const API_BASE = () => getApiBase();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || "Request failed");
  }

  return res.json();
}

export interface AgentLibraryResponse {
  agents: AgentDefinition[];
  skills: AgentDefinition[];
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  modified: number;
}

export const agentBuilderApi = {
  // Get all agents and skills
  getLibrary: () => request<AgentLibraryResponse>("/agent-builder/library"),

  // Get file tree for an agent
  getAgentFiles: (agentId: string) =>
    request<AgentFileNode>(`/agent-builder/agents/${encodeURIComponent(agentId)}/files`),

  // Read a file
  readFile: (path: string) =>
    request<FileContent>(`/agent-builder/file?path=${encodeURIComponent(path)}`),

  // Write a file
  writeFile: (path: string, content: string) =>
    request<{ success: boolean; path: string }>("/agent-builder/file", {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),

  // Create a new agent or skill
  create: (data: { name: string; description?: string; type?: "agent" | "skill" }) =>
    request<AgentDefinition>("/agent-builder/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Delete an agent or skill
  delete: (id: string, type: "agent" | "skill" = "agent") =>
    request<{ success: boolean }>(`/agent-builder/agents/${encodeURIComponent(id)}?type=${type}`, {
      method: "DELETE",
    }),

  // Add a skill to an agent
  addSkill: (agentId: string, name: string) =>
    request<{ path: string; name: string }>(`/agent-builder/agents/${encodeURIComponent(agentId)}/skill`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  // Add a script to an agent
  addScript: (agentId: string, name: string, language: "typescript" | "python" | "shell" = "typescript") =>
    request<{ path: string; name: string; language: string }>(
      `/agent-builder/agents/${encodeURIComponent(agentId)}/script`,
      {
        method: "POST",
        body: JSON.stringify({ name, language }),
      }
    ),
};
