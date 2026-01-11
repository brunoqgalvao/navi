import { writable, derived } from "svelte/store";
import { getApiBase } from "../config";

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  scope: "global" | "project";
  path: string;
}

function createAgentStore() {
  const { subscribe, set, update } = writable<Agent[]>([]);
  let loaded = false;

  return {
    subscribe,

    async load() {
      if (loaded) return;
      try {
        const res = await fetch(`${getApiBase()}/api/agents`);
        if (res.ok) {
          const agents = await res.json();
          set(agents);
          loaded = true;
        }
      } catch (e) {
        console.error("Failed to load agents:", e);
      }
    },

    async refresh() {
      loaded = false;
      await this.load();
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
