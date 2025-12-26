import { writable, derived } from "svelte/store";
import type { Project, Session } from "./types";
import { currentSession } from "./session";

function createProjectsStore() {
  const { subscribe, set, update } = writable<Project[]>([]);

  return {
    subscribe,
    set,
    add: (project: Project) => update((p) => [project, ...p]),
    remove: (id: string) => update((p) => p.filter((x) => x.id !== id)),
    update: (project: Project) =>
      update((p) => p.map((x) => (x.id === project.id ? project : x))),
  };
}

function createSessionsStore() {
  const { subscribe, set, update } = writable<Session[]>([]);

  return {
    subscribe,
    set,
    add: (session: Session) => update((s) => [session, ...s]),
    remove: (id: string) => update((s) => s.filter((x) => x.id !== id)),
    update: (session: Session) =>
      update((s) => s.map((x) => (x.id === session.id ? session : x))),
  };
}

export const projects = createProjectsStore();
export const sessions = createSessionsStore();

export const currentProject = derived(
  [projects, currentSession],
  ([$projects, $current]) =>
    $current.projectId ? $projects.find((p) => p.id === $current.projectId) : null
);
