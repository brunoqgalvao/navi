import { api, costsApi, type Project } from "../api";
import { currentSession, costStore, sessionMessages, sessionStatus, tour } from "../stores";
import { get } from "svelte/store";
import { getApiBase } from "../config";
import { showError } from "../errorHandler";

export interface ProjectActionCallbacks {
  setSidebarProjects: (projects: Project[]) => void;
  setSidebarSessions: (sessions: any[]) => void;
  setProjectFileIndex: (index: Map<string, string>) => void;
  setProjectContext: (ctx: { summary: string; suggestions: string[] } | null) => void;
  setProjectContextError: (error: string | null) => void;
  setClaudeMdContent: (content: string | null) => void;
  setInputText: (text: string) => void;
  getSidebarProjects: () => Project[];
  getInputText: () => string;
  getShowArchivedWorkspaces: () => boolean;
}

let callbacks: ProjectActionCallbacks | null = null;

export function initProjectActions(cb: ProjectActionCallbacks) {
  callbacks = cb;
}

export async function loadProjects(showArchived?: boolean): Promise<Project[]> {
  try {
    const archived = showArchived ?? callbacks?.getShowArchivedWorkspaces() ?? false;
    const projectsList = await api.projects.list(archived);
    callbacks?.setSidebarProjects(projectsList);
    return projectsList;
  } catch (e) {
    showError({ title: "Projects Error", message: "Failed to load projects", error: e });
    return [];
  }
}

export async function loadProjectCost(projectId: string) {
  try {
    const costs = await costsApi.getProjectCost(projectId);
    costStore.setProjectCost(projectId, costs.totalEver, costs.totalToday);
  } catch (e) {
    console.error("Failed to load project cost:", e);
  }
}

export async function selectProject(project: Project) {
  if (!callbacks) return;

  const session = get(currentSession);
  const prevSessionId = session.sessionId;
  const inputText = callbacks.getInputText();

  // Save draft if switching away from a session
  if (prevSessionId && inputText.trim()) {
    // This would need sessionDrafts - keeping in App.svelte for now
  }

  callbacks.setInputText("");
  currentSession.setProject(project.id);
  currentSession.setSession(null);
  callbacks.setSidebarSessions([]);
  callbacks.setProjectFileIndex(new Map());
  callbacks.setProjectContext(null);
  callbacks.setProjectContextError(null);
  callbacks.setClaudeMdContent(null);

  try {
    const sessionsList = await api.sessions.list(project.id, callbacks.getShowArchivedWorkspaces());
    callbacks.setSidebarSessions(sessionsList);
  } catch (e) {
    showError({ title: "Sessions Error", message: "Failed to load sessions", error: e });
  }

  api.claudeMd.initProject(project.path).catch(e => {
    // Silent - CLAUDE.md init is not critical
    console.error("Failed to init CLAUDE.md:", e);
  });

  indexProjectFiles(project.path);
  loadProjectContext(project);
  loadClaudeMd(project.path);
  loadProjectCost(project.id);

  const tourState = get(tour);
  if (!tourState.completedTours.includes("project")) {
    setTimeout(() => tour.start("project"), 500);
  }
}

export async function loadClaudeMd(projectPath: string) {
  try {
    const res = await fetch(`${getApiBase()}/fs/read?path=${encodeURIComponent(projectPath + "/CLAUDE.md")}`);
    const data = await res.json();
    if (!data.error && data.content) {
      callbacks?.setClaudeMdContent(data.content);
    } else {
      callbacks?.setClaudeMdContent(null);
    }
  } catch (e) {
    callbacks?.setClaudeMdContent(null);
  }
}

export async function loadProjectContext(project: Project) {
  if (!callbacks) return;

  const cached = project.summary || project.description;
  const cacheAge = project.summary_updated_at ? Date.now() - project.summary_updated_at : Infinity;
  const maxAge = 24 * 60 * 60 * 1000; // 1 day cache

  if (cached && cacheAge < maxAge) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.summary) {
        callbacks.setProjectContext(parsed);
        return;
      }
    } catch {}
  }

  callbacks.setProjectContext(null);
  callbacks.setProjectContextError(null);

  api.ephemeral.chat({
    prompt: `Analyze this project directory and provide:
1. A brief summary (2-3 sentences) of what this project is about and its main technologies
2. 3-4 suggested next steps or tasks the user might want to do based on the project state

Respond in this exact JSON format only, no other text:
{"summary": "...", "suggestions": ["...", "...", "..."]}`,
    projectPath: project.path,
    useTools: true,
    maxTokens: 500,
  }).then(async response => {
    try {
      if (!response.result) {
        callbacks?.setProjectContext({
          summary: "New project ready for development.",
          suggestions: ["Create a package.json or project configuration", "Add source code files", "Set up version control with git"]
        });
        return;
      }
      const jsonMatch = response.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        callbacks?.setProjectContext(parsed);
        // Save to DB for caching
        try {
          await api.projects.update(project.id, {
            summary: JSON.stringify(parsed),
            summary_updated_at: Date.now()
          });
        } catch {}
      } else {
        callbacks?.setProjectContext({ summary: response.result.slice(0, 500), suggestions: [] });
      }
    } catch {
      callbacks?.setProjectContext({ summary: response.result?.slice(0, 500) || "Project loaded.", suggestions: [] });
    }
  }).catch(e => {
    console.error("Project context error:", e);
    callbacks?.setProjectContext({ summary: "Project ready.", suggestions: ["Start coding", "Add dependencies", "Create project structure"] });
  });
}

export async function indexProjectFiles(rootPath: string, currentPath: string = rootPath) {
  if (!callbacks) return;

  const projectFileIndex = new Map<string, string>();

  async function indexDir(path: string) {
    try {
      const res = await fetch(`${getApiBase()}/fs/list?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.entries) {
        for (const entry of data.entries) {
          if (entry.type === "file") {
            const relativePath = entry.path.replace(rootPath + "/", "");
            const fileName = entry.name;
            projectFileIndex.set(fileName, entry.path);
            projectFileIndex.set(relativePath, entry.path);
            projectFileIndex.set("./" + relativePath, entry.path);
          } else if (
            entry.type === "directory" &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules" &&
            entry.name !== "target" &&
            entry.name !== "dist" &&
            entry.name !== "build" &&
            entry.name !== ".git"
          ) {
            await indexDir(entry.path);
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  await indexDir(currentPath);
  callbacks.setProjectFileIndex(projectFileIndex);
}

export async function createProject(
  mode: "quick" | "browse",
  quickName: string,
  defaultDir: string,
  name: string,
  path: string
): Promise<Project | null> {
  if (mode === "quick") {
    if (!quickName.trim()) return null;
    const sanitizedName = quickName.trim().replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    const fullPath = `${defaultDir}/${sanitizedName}`;

    try {
      await api.fs.mkdir(fullPath);
    } catch (e: any) {
      console.error("Failed to create directory:", e);
      throw new Error(`Failed to create directory: ${e.message}`);
    }

    try {
      const newProject = await api.projects.create({
        name: quickName.trim(),
        path: fullPath
      });
      await loadProjects();
      await selectProject(newProject);
      return newProject;
    } catch (e: any) {
      console.error("Failed to create project:", e);
      throw new Error(`Failed to create project: ${e.message}`);
    }
  } else {
    if (!name || !path) return null;

    try {
      const newProject = await api.projects.create({ name, path });
      await loadProjects();
      await selectProject(newProject);
      return newProject;
    } catch (e: any) {
      console.error("Failed to create project:", e);
      throw new Error(`Failed to create project: ${e.message}`);
    }
  }
}

export async function updateProject(projectId: string, name: string, path: string): Promise<boolean> {
  try {
    await api.projects.update(projectId, { name, path });
    await loadProjects();
    return true;
  } catch (e) {
    showError({ title: "Update Failed", message: "Failed to update project", error: e });
    return false;
  }
}

export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    await api.projects.delete(projectId);
    await loadProjects();
    const session = get(currentSession);
    if (session.projectId === projectId) {
      currentSession.setProject(null);
      callbacks?.setSidebarSessions([]);
    }
    return true;
  } catch (e) {
    showError({ title: "Delete Failed", message: "Failed to delete project", error: e });
    return false;
  }
}

export async function toggleProjectPin(project: Project): Promise<boolean> {
  const newPinned = !project.pinned;
  try {
    await api.projects.togglePin(project.id, newPinned);
    const projects = callbacks?.getSidebarProjects() || [];
    const updated = projects
      .map(p => p.id === project.id ? { ...p, pinned: newPinned ? 1 : 0 } : p)
      .sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
    callbacks?.setSidebarProjects(updated);
    return true;
  } catch (e) {
    showError({ title: "Pin Failed", message: "Failed to toggle project pin", error: e });
    return false;
  }
}

export async function reorderProjects(projectIds: string[]): Promise<boolean> {
  try {
    await api.projects.reorder(projectIds);
    return true;
  } catch (e) {
    // Silent failure for reorder - not critical
    console.error("Failed to reorder projects:", e);
    return false;
  }
}
