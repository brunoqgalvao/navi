import { writable } from "svelte/store";
import type { CostState, CostViewMode } from "./types";

function createCostStore() {
  const { subscribe, set, update } = writable<CostState>({
    viewMode: "ever",
    totalEver: 0,
    totalToday: 0,
    projectCosts: new Map(),
    sessionCosts: new Map(),
  });

  return {
    subscribe,
    setViewMode: (mode: CostViewMode) => update((s) => ({ ...s, viewMode: mode })),
    setTotals: (ever: number, today: number) => update((s) => ({ ...s, totalEver: ever, totalToday: today })),
    setProjectCost: (projectId: string, ever: number, today: number) =>
      update((s) => {
        const costs = new Map(s.projectCosts);
        costs.set(projectId, { ever, today });
        return { ...s, projectCosts: costs };
      }),
    setSessionCost: (sessionId: string, cost: number) =>
      update((s) => {
        const costs = new Map(s.sessionCosts);
        costs.set(sessionId, cost);
        return { ...s, sessionCosts: costs };
      }),
    addSessionCost: (sessionId: string, additionalCost: number) =>
      update((s) => {
        const costs = new Map(s.sessionCosts);
        const current = costs.get(sessionId) || 0;
        costs.set(sessionId, current + additionalCost);
        return { ...s, sessionCosts: costs };
      }),
    reset: () =>
      set({
        viewMode: "ever",
        totalEver: 0,
        totalToday: 0,
        projectCosts: new Map(),
        sessionCosts: new Map(),
      }),
  };
}

export const costStore = createCostStore();
