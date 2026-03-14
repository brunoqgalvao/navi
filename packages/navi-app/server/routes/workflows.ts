import { randomUUID } from "crypto";
import { json, error } from "../utils/response";
import {
  projects,
  sessions,
  messages,
  workflows,
  workflowRuns,
  sessionHierarchy,
  type Workflow,
} from "../db";
import {
  workflowScheduler,
  upsertWorkflowSummaryMessage,
  calculateNextWorkflowRun,
  type WorkflowSchedule,
  type WorkflowGate,
} from "../services/workflow-scheduler";

interface WorkflowDto {
  id: string;
  projectId: string;
  rootSessionId: string;
  ownerAgentId: string | null;
  name: string;
  prompt: string;
  schedule: WorkflowSchedule;
  gate: WorkflowGate;
  enabled: boolean;
  collapsed: boolean;
  learningNotes: string | null;
  feedbackNotes: string | null;
  model: string | null;
  backend: string | null;
  runCount: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastError: string | null;
  lastSkipReason: string | null;
  createdAt: number;
  updatedAt: number;
}

function workflowToDto(workflow: Workflow): WorkflowDto {
  return {
    id: workflow.id,
    projectId: workflow.project_id,
    rootSessionId: workflow.root_session_id,
    ownerAgentId: workflow.owner_agent_id,
    name: workflow.name,
    prompt: workflow.prompt,
    schedule: JSON.parse(workflow.schedule_json) as WorkflowSchedule,
    gate: JSON.parse(workflow.gate_json) as WorkflowGate,
    enabled: workflow.enabled === 1,
    collapsed: workflow.collapsed === 1,
    learningNotes: workflow.learning_notes,
    feedbackNotes: workflow.feedback_notes,
    model: workflow.model,
    backend: workflow.backend,
    runCount: workflow.run_count,
    lastRunAt: workflow.last_run_at,
    nextRunAt: workflow.next_run_at,
    lastError: workflow.last_error,
    lastSkipReason: workflow.last_skip_reason,
    createdAt: workflow.created_at,
    updatedAt: workflow.updated_at,
  };
}

function validateSchedule(schedule: WorkflowSchedule): string | null {
  if (!schedule || typeof schedule !== "object") return "schedule is required";
  switch (schedule.kind) {
    case "at":
      if (!schedule.time) return "schedule.time is required";
      return null;
    case "every":
      if (typeof schedule.interval !== "number" || schedule.interval < 1000) {
        return "schedule.interval must be a number >= 1000";
      }
      return null;
    case "cron":
      if (!schedule.expression || typeof schedule.expression !== "string") {
        return "schedule.expression is required";
      }
      if (schedule.expression.trim().split(/\s+/).length !== 5) {
        return "schedule.expression must be a 5-field cron expression";
      }
      return null;
    default:
      return "schedule.kind must be 'at', 'every', or 'cron'";
  }
}

function validateGate(gate: WorkflowGate): string | null {
  if (!gate || typeof gate !== "object") return "gate is required";
  switch (gate.kind) {
    case "none":
      return null;
    case "command":
      if (!gate.command || typeof gate.command !== "string") {
        return "gate.command is required for command gates";
      }
      return null;
    default:
      return "gate.kind must be 'none' or 'command'";
  }
}

async function createWorkflow(
  projectId: string,
  body: {
    name: string;
    prompt: string;
    schedule: WorkflowSchedule;
    gate?: WorkflowGate;
    enabled?: boolean;
    collapsed?: boolean;
    learningNotes?: string | null;
    feedbackNotes?: string | null;
    model?: string | null;
    backend?: string | null;
    ownerAgentId?: string | null;
  }
) {
  const now = Date.now();
  const workflowId = randomUUID();
  const rootSessionId = randomUUID();

  sessions.create(
    rootSessionId,
    projectId,
    body.name.trim(),
    now,
    now,
    body.backend || undefined
  );

  workflows.create({
    id: workflowId,
    project_id: projectId,
    root_session_id: rootSessionId,
    name: body.name.trim(),
    prompt: body.prompt.trim(),
    schedule_json: JSON.stringify(body.schedule),
    gate_json: JSON.stringify(body.gate || { kind: "none" }),
    enabled: body.enabled === false ? 0 : 1,
    collapsed: body.collapsed === false ? 0 : 1,
    learning_notes: body.learningNotes ?? null,
    feedback_notes: body.feedbackNotes ?? null,
    model: body.model ?? null,
    backend: (body.backend as Workflow["backend"]) ?? null,
    owner_agent_id: body.ownerAgentId ?? null,
    run_count: 0,
    last_run_at: null,
    next_run_at:
      body.enabled === false ? null : (calculateNextWorkflowRun(body.schedule) ?? null),
    last_error: null,
    last_skip_reason: null,
    created_at: now,
    updated_at: now,
  });

  const workflow = workflows.get(workflowId);
  if (!workflow) {
    throw new Error("Failed to create workflow");
  }
  sessions.setWorkspaceLinks(rootSessionId, {
    workflow_id: workflowId,
    agent_id: body.ownerAgentId ?? null,
  });
  upsertWorkflowSummaryMessage(workflow);
  workflowScheduler.sync(workflowId);
  return workflow;
}

export async function handleWorkflowRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  const projectListMatch = pathname.match(/^\/api\/projects\/([^/]+)\/workflows$/);
  if (projectListMatch) {
    const projectId = projectListMatch[1];
    if (method === "GET") {
      return json(workflows.listByProject(projectId).map(workflowToDto));
    }
    if (method === "POST") {
      try {
        const project = projects.get(projectId);
        if (!project) return error("Project not found", 404);

        const body = await req.json();
        if (!body.name || typeof body.name !== "string") {
          return error("name is required", 400);
        }
        if (!body.name.trim()) {
          return error("name cannot be empty", 400);
        }
        if (!body.prompt || typeof body.prompt !== "string") {
          return error("prompt is required", 400);
        }
        if (!body.prompt.trim()) {
          return error("prompt cannot be empty", 400);
        }

        const scheduleError = validateSchedule(body.schedule);
        if (scheduleError) return error(scheduleError, 400);
        const gateError = validateGate(body.gate || { kind: "none" });
        if (gateError) return error(gateError, 400);

        const workflow = await createWorkflow(projectId, body);
        return json(workflowToDto(workflow), 201);
      } catch (err: any) {
        return error(err.message || "Failed to create workflow", 500);
      }
    }
  }

  const workflowMatch = pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (workflowMatch) {
    const workflowId = workflowMatch[1];
    if (method === "GET") {
      const workflow = workflows.get(workflowId);
      if (!workflow) return error("Workflow not found", 404);
      return json(workflowToDto(workflow));
    }

    if (method === "PATCH") {
      try {
        const workflow = workflows.get(workflowId);
        if (!workflow) return error("Workflow not found", 404);

        const body = await req.json();
        if (body.name !== undefined && (!body.name || !String(body.name).trim())) {
          return error("name cannot be empty", 400);
        }
        if (body.prompt !== undefined && (!body.prompt || !String(body.prompt).trim())) {
          return error("prompt cannot be empty", 400);
        }
        if (body.schedule) {
          const scheduleError = validateSchedule(body.schedule);
          if (scheduleError) return error(scheduleError, 400);
        }
        if (body.gate) {
          const gateError = validateGate(body.gate);
          if (gateError) return error(gateError, 400);
        }

        workflows.update(workflowId, {
          name: typeof body.name === "string" ? body.name.trim() : undefined,
          prompt: typeof body.prompt === "string" ? body.prompt.trim() : undefined,
          schedule_json: body.schedule ? JSON.stringify(body.schedule) : undefined,
          gate_json: body.gate ? JSON.stringify(body.gate) : undefined,
          enabled: typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : undefined,
          collapsed: typeof body.collapsed === "boolean" ? (body.collapsed ? 1 : 0) : undefined,
          learning_notes:
            body.learningNotes === undefined ? undefined : (body.learningNotes ?? null),
          feedback_notes:
            body.feedbackNotes === undefined ? undefined : (body.feedbackNotes ?? null),
          model: body.model === undefined ? undefined : body.model,
          backend: body.backend === undefined ? undefined : body.backend,
          owner_agent_id:
            body.ownerAgentId === undefined ? undefined : (body.ownerAgentId ?? null),
          next_run_at:
            body.schedule || typeof body.enabled === "boolean"
              ? (
                  typeof body.enabled === "boolean"
                    ? body.enabled
                    : workflow.enabled === 1
                )
                  ? (calculateNextWorkflowRun(
                      (body.schedule || JSON.parse(workflow.schedule_json)) as WorkflowSchedule
                    ) ?? null)
                  : null
              : undefined,
        });

        const updatedWorkflow = workflows.get(workflowId);
        if (!updatedWorkflow) return error("Workflow not found after update", 404);

        if (body.name && body.name !== workflow.name) {
          sessions.updateTitle(body.name.trim(), Date.now(), workflow.root_session_id);
        }
        if (body.ownerAgentId !== undefined) {
          sessions.setWorkspaceLinks(workflow.root_session_id, {
            workflow_id: workflowId,
            agent_id: body.ownerAgentId ?? null,
          });
        }

        upsertWorkflowSummaryMessage(updatedWorkflow);
        workflowScheduler.sync(workflowId);
        return json(workflowToDto(updatedWorkflow));
      } catch (err: any) {
        return error(err.message || "Failed to update workflow", 500);
      }
    }

    if (method === "DELETE") {
      const workflow = workflows.get(workflowId);
      if (!workflow) return error("Workflow not found", 404);
      workflowScheduler.remove(workflowId);
      const descendants = sessionHierarchy.getDescendants(workflow.root_session_id);
      for (const descendant of descendants) {
        messages.deleteBySession(descendant.id);
        sessions.delete(descendant.id);
      }
      workflowRuns.deleteByWorkflow(workflowId);
      workflows.delete(workflowId);
      messages.deleteBySession(workflow.root_session_id);
      sessions.delete(workflow.root_session_id);
      return json({ success: true, workflowId });
    }
  }

  const runMatch = pathname.match(/^\/api\/workflows\/([^/]+)\/run$/);
  if (runMatch && method === "POST") {
    try {
      const workflowId = runMatch[1];
      const workflow = workflows.get(workflowId);
      if (!workflow) return error("Workflow not found", 404);
      await workflowScheduler.run(workflowId, "manual");
      return json({ success: true, workflowId });
    } catch (err: any) {
      return error(err.message || "Failed to run workflow", 500);
    }
  }

  const runsMatch = pathname.match(/^\/api\/workflows\/([^/]+)\/runs$/);
  if (runsMatch && method === "GET") {
    const workflowId = runsMatch[1];
    const workflow = workflows.get(workflowId);
    if (!workflow) return error("Workflow not found", 404);
    const limit = parseInt(url.searchParams.get("limit") || "25", 10);
    const runs = workflowRuns.listByWorkflow(workflowId, limit).map((run) => ({
      ...run,
      session: run.session_id ? sessions.get(run.session_id) : null,
    }));
    return json({ workflowId, runs });
  }

  return null;
}
