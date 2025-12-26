import { writable } from "svelte/store";
import type { Skill } from "./types";

function createSkillsStore() {
  const { subscribe, set, update } = writable<Skill[]>([]);

  return {
    subscribe,
    set,
    add: (skill: Skill) => update((s) => [skill, ...s]),
    remove: (id: string) => update((s) => s.filter((x) => x.id !== id)),
    update: (skill: Skill) =>
      update((s) => s.map((x) => (x.id === skill.id ? skill : x))),
    updateEnableStatus: (id: string, globally: boolean, projectIds: string[]) =>
      update((s) =>
        s.map((x) =>
          x.id === id
            ? { ...x, enabled_globally: globally, enabled_projects: projectIds }
            : x
        )
      ),
  };
}

export const skillLibrary = createSkillsStore();
