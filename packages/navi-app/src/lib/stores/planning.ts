import { writable, derived, get } from "svelte/store";

/**
 * A single step in a plan
 */
export interface PlanStep {
  id: string;
  content: string;
  description?: string; // Optional longer description
  status: "pending" | "approved" | "rejected" | "modified";
  order: number;
  dependencies?: string[]; // IDs of steps this depends on
  estimatedComplexity?: "trivial" | "simple" | "moderate" | "complex";
}

/**
 * A complete plan for a session
 */
export interface Plan {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  steps: PlanStep[];
  status: "draft" | "reviewing" | "approved" | "executing" | "completed" | "rejected";
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  originalPrompt?: string; // What the user originally asked
  refinementHistory?: string[]; // Track refinement requests
}

/**
 * Create the session plans store
 * Maps sessionId -> Plan
 */
function createSessionPlansStore() {
  const { subscribe, set, update } = writable<Map<string, Plan>>(new Map());

  return {
    subscribe,

    /**
     * Create a new plan for a session
     */
    create: (sessionId: string, title: string, steps: Omit<PlanStep, "id" | "order" | "status">[], originalPrompt?: string): Plan => {
      const planId = crypto.randomUUID();
      const now = Date.now();

      const plan: Plan = {
        id: planId,
        sessionId,
        title,
        steps: steps.map((step, idx) => ({
          ...step,
          id: crypto.randomUUID(),
          order: idx,
          status: "pending" as const,
        })),
        status: "draft",
        createdAt: now,
        updatedAt: now,
        originalPrompt,
        refinementHistory: [],
      };

      update(map => {
        map.set(sessionId, plan);
        return new Map(map);
      });

      return plan;
    },

    /**
     * Get plan for a session
     */
    get: (sessionId: string): Plan | undefined => {
      let plan: Plan | undefined;
      subscribe(map => plan = map.get(sessionId))();
      return plan;
    },

    /**
     * Update plan steps (from Claude's response)
     */
    updateSteps: (sessionId: string, steps: Omit<PlanStep, "id" | "order" | "status">[]) => {
      update(map => {
        const existing = map.get(sessionId);
        if (existing) {
          existing.steps = steps.map((step, idx) => ({
            ...step,
            id: crypto.randomUUID(),
            order: idx,
            status: "pending" as const,
          }));
          existing.updatedAt = Date.now();
          existing.status = "reviewing";
          map.set(sessionId, existing);
        }
        return new Map(map);
      });
    },

    /**
     * Update a single step's status
     */
    updateStepStatus: (sessionId: string, stepId: string, status: PlanStep["status"]) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          const step = plan.steps.find(s => s.id === stepId);
          if (step) {
            step.status = status;
            plan.updatedAt = Date.now();
          }
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Modify a step's content
     */
    modifyStep: (sessionId: string, stepId: string, newContent: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          const step = plan.steps.find(s => s.id === stepId);
          if (step) {
            step.content = newContent;
            step.status = "modified";
            plan.updatedAt = Date.now();
          }
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Add a refinement request to history
     */
    addRefinement: (sessionId: string, refinement: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          plan.refinementHistory = [...(plan.refinementHistory || []), refinement];
          plan.updatedAt = Date.now();
          plan.status = "draft";
        }
        return new Map(map);
      });
    },

    /**
     * Approve all steps and the overall plan
     */
    approvePlan: (sessionId: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          plan.steps.forEach(step => {
            if (step.status === "pending" || step.status === "modified") {
              step.status = "approved";
            }
          });
          plan.status = "approved";
          plan.approvedAt = Date.now();
          plan.updatedAt = Date.now();
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Reject the plan
     */
    rejectPlan: (sessionId: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          plan.status = "rejected";
          plan.updatedAt = Date.now();
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Mark plan as executing
     */
    startExecution: (sessionId: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          plan.status = "executing";
          plan.updatedAt = Date.now();
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Mark plan as completed
     */
    complete: (sessionId: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          plan.status = "completed";
          plan.updatedAt = Date.now();
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Clear plan for a session
     */
    clear: (sessionId: string) => {
      update(map => {
        map.delete(sessionId);
        return new Map(map);
      });
    },

    /**
     * Clear all plans
     */
    clearAll: () => {
      set(new Map());
    },

    /**
     * Reorder steps
     */
    reorderSteps: (sessionId: string, stepIds: string[]) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          const reordered = stepIds.map((id, idx) => {
            const step = plan.steps.find(s => s.id === id);
            if (step) {
              step.order = idx;
            }
            return step;
          }).filter(Boolean) as PlanStep[];
          plan.steps = reordered;
          plan.updatedAt = Date.now();
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Add a new step
     */
    addStep: (sessionId: string, content: string, afterStepId?: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          const newStep: PlanStep = {
            id: crypto.randomUUID(),
            content,
            status: "modified",
            order: plan.steps.length,
          };

          if (afterStepId) {
            const idx = plan.steps.findIndex(s => s.id === afterStepId);
            if (idx !== -1) {
              plan.steps.splice(idx + 1, 0, newStep);
              // Reorder
              plan.steps.forEach((s, i) => s.order = i);
            } else {
              plan.steps.push(newStep);
            }
          } else {
            plan.steps.push(newStep);
          }
          plan.updatedAt = Date.now();
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },

    /**
     * Remove a step
     */
    removeStep: (sessionId: string, stepId: string) => {
      update(map => {
        const plan = map.get(sessionId);
        if (plan) {
          plan.steps = plan.steps.filter(s => s.id !== stepId);
          plan.steps.forEach((s, i) => s.order = i);
          plan.updatedAt = Date.now();
          map.set(sessionId, plan);
        }
        return new Map(map);
      });
    },
  };
}

// Export store instances
export const sessionPlans = createSessionPlansStore();

// Derived store: get current session's plan status
export function getPlanForSession(sessionId: string) {
  return derived(sessionPlans, $plans => $plans.get(sessionId));
}

// Helper to check if a session has an active plan
export function hasActivePlan(sessionId: string): boolean {
  const plan = get(sessionPlans).get(sessionId);
  return !!plan && ["draft", "reviewing", "approved"].includes(plan.status);
}
