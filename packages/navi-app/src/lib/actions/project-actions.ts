import { api, costsApi, type Project } from "../api";
import { currentSession, costStore, sessionMessages, sessionStatus, tour, showArchivedWorkspaces } from "../stores";
import { get } from "svelte/store";
import { getApiBase } from "../config";
import { showError } from "../errorHandler";
import { PROJECT_SUMMARY_CACHE_MAX_AGE_MS, TOUR_START_DELAY_MS } from "../constants";
import {
  sidebarProjects,
  sidebarSessions,
  projectFileIndex,
  projectContext,
  projectContextError,
  claudeMdContent,
} from "../stores/workspace";

// =============================================================================
// LEGACY CALLBACK SUPPORT (for gradual migration)
// =============================================================================

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

/**
 * @deprecated Use stores directly instead of callbacks
 * This function is kept for backward compatibility during migration
 */
export function initProjectActions(cb: ProjectActionCallbacks) {
  callbacks = cb;
}

// =============================================================================
// HELPER FUNCTIONS (use stores or callbacks based on availability)
// =============================================================================

function setSidebarProjectsValue(projects: Project[]) {
  sidebarProjects.set(projects);
  callbacks?.setSidebarProjects(projects);
}

function setSidebarSessionsValue(sessions: any[]) {
  sidebarSessions.set(sessions);
  callbacks?.setSidebarSessions(sessions);
}

function setProjectFileIndexValue(index: Map<string, string>) {
  projectFileIndex.set(index);
  callbacks?.setProjectFileIndex(index);
}

function setProjectContextValue(ctx: { summary: string; suggestions: string[] } | null) {
  projectContext.set(ctx);
  callbacks?.setProjectContext(ctx);
}

function setProjectContextErrorValue(error: string | null) {
  projectContextError.set(error);
  callbacks?.setProjectContextError(error);
}

function setClaudeMdContentValue(content: string | null) {
  claudeMdContent.set(content);
  callbacks?.setClaudeMdContent(content);
}

function getSidebarProjectsValue(): Project[] {
  return callbacks?.getSidebarProjects() ?? get(sidebarProjects);
}

function getShowArchivedValue(): boolean {
  return callbacks?.getShowArchivedWorkspaces() ?? get(showArchivedWorkspaces);
}

export async function loadProjects(showArchived?: boolean): Promise<Project[]> {
  try {
    const archived = showArchived ?? getShowArchivedValue();
    const projectsList = await api.projects.list(archived);
    setSidebarProjectsValue(projectsList);
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
  const session = get(currentSession);
  const prevSessionId = session.sessionId;
  const inputText = callbacks?.getInputText() ?? "";

  // Save draft if switching away from a session
  if (prevSessionId && inputText.trim()) {
    // This would need sessionDrafts - keeping in App.svelte for now
  }

  callbacks?.setInputText("");
  currentSession.setProject(project.id);
  currentSession.setSession(null);
  setSidebarSessionsValue([]);
  setProjectFileIndexValue(new Map());
  setProjectContextValue(null);
  setProjectContextErrorValue(null);
  setClaudeMdContentValue(null);

  try {
    const sessionsList = await api.sessions.list(project.id, getShowArchivedValue());
    setSidebarSessionsValue(sessionsList);
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
    setTimeout(() => tour.start("project"), TOUR_START_DELAY_MS);
  }
}

export async function loadClaudeMd(projectPath: string) {
  try {
    const res = await fetch(`${getApiBase()}/fs/read?path=${encodeURIComponent(projectPath + "/CLAUDE.md")}`);
    const data = await res.json();
    if (!data.error && data.content) {
      setClaudeMdContentValue(data.content);
    } else {
      setClaudeMdContentValue(null);
    }
  } catch (e) {
    setClaudeMdContentValue(null);
  }
}

export async function loadProjectContext(project: Project) {
  const cached = project.summary || project.description;
  const cacheAge = project.summary_updated_at ? Date.now() - project.summary_updated_at : Infinity;

  if (cached && cacheAge < PROJECT_SUMMARY_CACHE_MAX_AGE_MS) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.summary) {
        setProjectContextValue(parsed);
        return;
      }
    } catch { /* cached data is not valid JSON, will regenerate */ }
  }

  setProjectContextValue(null);
  setProjectContextErrorValue(null);

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
        setProjectContextValue({
          summary: "New project ready for development.",
          suggestions: ["Create a package.json or project configuration", "Add source code files", "Set up version control with git"]
        });
        return;
      }
      const jsonMatch = response.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setProjectContextValue(parsed);
        // Save to DB for caching
        try {
          await api.projects.update(project.id, {
            summary: JSON.stringify(parsed),
            summary_updated_at: Date.now()
          });
        } catch (e) {
          console.warn("[Project] Failed to cache project summary:", e);
        }
      } else {
        setProjectContextValue({ summary: response.result.slice(0, 500), suggestions: [] });
      }
    } catch (e) {
      console.warn("[Project] Failed to parse project context response:", e);
      setProjectContextValue({ summary: response.result?.slice(0, 500) || "Project loaded.", suggestions: [] });
    }
  }).catch(e => {
    console.error("Project context error:", e);
    setProjectContextValue({ summary: "Project ready.", suggestions: ["Start coding", "Add dependencies", "Create project structure"] });
  });
}

export async function indexProjectFiles(rootPath: string, currentPath: string = rootPath) {
  const fileIndex = new Map<string, string>();

  async function indexDir(path: string) {
    try {
      const res = await fetch(`${getApiBase()}/fs/list?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.entries) {
        for (const entry of data.entries) {
          if (entry.type === "file") {
            const relativePath = entry.path.replace(rootPath + "/", "");
            const fileName = entry.name;
            fileIndex.set(fileName, entry.path);
            fileIndex.set(relativePath, entry.path);
            fileIndex.set("./" + relativePath, entry.path);
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
      // Ignore errors - file listing is non-critical
    }
  }

  await indexDir(currentPath);
  setProjectFileIndexValue(fileIndex);
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

export function updateProject(projectId: string, name: string, path: string): boolean {
  const projects = getSidebarProjectsValue();
  const previousProjects = projects;
  setSidebarProjectsValue(projects.map(p => p.id === projectId ? { ...p, name, path } : p));
  api.projects.update(projectId, { name, path }).catch((e) => {
    setSidebarProjectsValue(previousProjects);
    showError({ title: "Update Failed", message: "Failed to update project", error: e });
  });
  return true;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    await api.projects.delete(projectId);
    await loadProjects();
    const session = get(currentSession);
    if (session.projectId === projectId) {
      currentSession.setProject(null);
      setSidebarSessionsValue([]);
    }
    return true;
  } catch (e) {
    showError({ title: "Delete Failed", message: "Failed to delete project", error: e });
    return false;
  }
}

export function toggleProjectPin(project: Project): void {
  const newPinned = !project.pinned;
  const projects = getSidebarProjectsValue();
  const previousProjects = projects;
  const updated = projects
    .map(p => p.id === project.id ? { ...p, pinned: newPinned ? 1 : 0 } : p)
    .sort((a, b) => {
      if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  setSidebarProjectsValue(updated);
  api.projects.togglePin(project.id, newPinned).catch((e) => {
    setSidebarProjectsValue(previousProjects);
    showError({ title: "Pin Failed", message: "Failed to toggle project pin", error: e });
  });
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
