import { writable, derived, get } from "svelte/store";
import { getApiBase } from "../config";
import { currentProject } from "./index";

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  scope: "global" | "project" | "builtin";
  path: string;
  source?: "builtin" | "global" | "project";
}

function createAgentStore() {
  const { subscribe, set, update } = writable<Agent[]>([]);
  let loaded = false;
  let loadedForProject: string | null = null;

  return {
    subscribe,

    async load(projectPath?: string) {
      // Get project path from current project if not provided
      const path = projectPath || get(currentProject)?.path;

      // Only reload if project changed or never loaded
      if (loaded && loadedForProject === path) return;

      try {
        const url = new URL(`${getApiBase()}/agents`);
        if (path) {
          url.searchParams.set("projectPath", path);
        }

        const res = await fetch(url.toString());
        if (res.ok) {
          const agents = await res.json();
          set(agents);
          loaded = true;
          loadedForProject = path || null;
        }
      } catch (e) {
        console.error("Failed to load agents:", e);
      }
    },

    async refresh(projectPath?: string) {
      loaded = false;
      loadedForProject = null;
      await this.load(projectPath);
    },

    getBySlug(slug: string): Agent | undefined {
      let found: Agent | undefined;
      subscribe((agents) => {
        found = agents.find((a) => a.slug === slug);
      })();
      return found;
    },
  };
}

export const agents = createAgentStore();

// Derived store for agent names (for autocomplete)
export const agentSlugs = derived(agents, ($agents) =>
  $agents.map((a) => a.slug)
);
