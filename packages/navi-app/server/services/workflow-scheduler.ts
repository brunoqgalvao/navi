import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { Cron } from "croner";
import {
  projects,
  workflows,
  workflowRuns,
  sessionHierarchy,
  sessions,
  messages,
  type Workflow,
} from "../db";
import { triggerQuery } from "../websocket/handler";
import { buildWorkflowRunPrompt } from "./workflow-run-prompt";

export type WorkflowScheduleKind = "at" | "every" | "cron";

export interface WorkflowScheduleAt {
  kind: "at";
  time: string | number;
}

export interface WorkflowScheduleEvery {
  kind: "every";
  interval: number;
}

export interface WorkflowScheduleCron {
  kind: "cron";
  expression: string;
  timezone?: string;
}

export type WorkflowSchedule =
  | WorkflowScheduleAt
  | WorkflowScheduleEvery
  | WorkflowScheduleCron;

export interface WorkflowGateNone {
  kind: "none";
}

export interface WorkflowGateCommand {
  kind: "command";
  command: string;
  cwd?: string;
}

export type WorkflowGate = WorkflowGateNone | WorkflowGateCommand;

type WorkflowTimer = Cron | ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;

const activeTimers = new Map<string, WorkflowTimer>();
let broadcastFn: ((data: unknown) => void) | null = null;

function parseScheduleTime(time: string | number): number {
  if (typeof time === "number") return time;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid workflow time: ${time}`);
  }
  return date.getTime();
}

export function parseWorkflowSchedule(scheduleJson: string): WorkflowSchedule {
  return JSON.parse(scheduleJson) as WorkflowSchedule;
}

export function parseWorkflowGate(gateJson: string): WorkflowGate {
  return JSON.parse(gateJson) as WorkflowGate;
}

export function calculateNextWorkflowRun(schedule: WorkflowSchedule): number | undefined {
  const now = Date.now();
  switch (schedule.kind) {
    case "at": {
      const time = parseScheduleTime(schedule.time);
      return time > now ? time : undefined;
    }
    case "every":
      return now + schedule.interval;
    case "cron": {
      try {
        const cron = new Cron(schedule.expression, {
          timezone: schedule.timezone,
        });
        const next = cron.nextRun();
        cron.stop();
        return next ? next.getTime() : undefined;
      } catch {
        return undefined;
      }
    }
  }
}

function stopWorkflowTimer(workflowId: string) {
  const timer = activeTimers.get(workflowId);
  if (!timer) return;
  if (timer instanceof Cron) {
    timer.stop();
  } else {
    clearTimeout(timer);
    clearInterval(timer);
  }
  activeTimers.delete(workflowId);
}

function buildWorkflowSummary(workflow: Workflow): string {
  const schedule = parseWorkflowSchedule(workflow.schedule_json);
  const gate = parseWorkflowGate(workflow.gate_json);
  const scheduleLine =
    schedule.kind === "cron"
      ? `Cron: \`${schedule.expression}\`${schedule.timezone ? ` (${schedule.timezone})` : ""}`
      : schedule.kind === "every"
        ? `Interval: every ${Math.max(1, Math.round(schedule.interval / 60000))} min`
        : `One-shot: ${new Date(parseScheduleTime(schedule.time)).toLocaleString()}`;
  const gateLine =
    gate.kind === "command"
      ? `Command gate: \`${gate.command}\``
      : "Gate: none";

  return [
    `# Workflow: ${workflow.name}`,
    "",
    `Status: ${workflow.enabled ? "enabled" : "paused"}`,
    scheduleLine,
    gateLine,
    workflow.learning_notes ? `\n## Learnings\n${workflow.learning_notes}` : "",
    workflow.feedback_notes ? `\n## Feedback\n${workflow.feedback_notes}` : "",
    "\n## Prompt",
    workflow.prompt,
  ]
    .filter(Boolean)
    .join("\n");
}

export function upsertWorkflowSummaryMessage(workflow: Workflow) {
  const messageId = `workflow_summary_${workflow.id}`;
  messages.upsert(
    messageId,
    workflow.root_session_id,
    "assistant",
    JSON.stringify([{ type: "text", text: buildWorkflowSummary(workflow) }]),
    Date.now(),
    null,
    1,
    1
  );
}

async function evaluateGate(workflow: Workflow): Promise<{ proceed: boolean; reason?: string }> {
  const gate = parseWorkflowGate(workflow.gate_json);
  if (gate.kind === "none") {
    return { proceed: true };
  }
  const rootSession = sessions.get(workflow.root_session_id);
  const project = rootSession ? projects.get(rootSession.project_id) : null;

  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", gate.command], {
      cwd: gate.cwd || project?.path || process.cwd(),
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ proceed: true });
      } else {
        resolve({
          proceed: false,
          reason: (stderr || stdout || `Gate command exited with ${code}`).trim().slice(0, 500),
        });
      }
    });
    child.on("error", (error) => {
      resolve({ proceed: false, reason: error.message });
    });
  });
}

function buildRecentRunHistory(workflowId: string): string {
  const recentRuns = workflowRuns.listByWorkflow(workflowId, 5);
  if (recentRuns.length === 0) return "No previous runs.";

  return recentRuns
    .map((run) => {
      const sessionTitle = run.session_id ? sessions.get(run.session_id)?.title : null;
      const details = run.skipped_reason || run.error || sessionTitle || "";
      return `- ${new Date(run.started_at).toLocaleString()}: ${run.status}${details ? ` (${details})` : ""}`;
    })
    .join("\n");
}

function createWorkflowRunSession(workflow: Workflow) {
  const childId = randomUUID();
  const child = sessionHierarchy.spawnChild(workflow.root_session_id, {
    id: childId,
    title: `${workflow.name} ${new Date().toLocaleString()}`,
    role: "workflow",
    task: workflow.name,
    model: workflow.model || undefined,
    backend: workflow.backend || undefined,
    agentType: "workflow-run",
    updateParentStatus: false,
  });
  return child;
}

function broadcastWorkflowNotification(title: string, message: string, type: "info" | "warning" | "error" = "warning") {
  broadcastFn?.({
    type: "ui_command",
    command: "notification",
    payload: {
      title,
      message,
      type,
    },
  });
}

// Inbox feature removed: workflow attention reports now log to the server
// console and surface a toast notification. The workflow engine rebuild
// owns proper user notification.
function reportWorkflowAttention(
  workflow: Workflow,
  _sessionId: string | null,
  options: {
    title: string;
    body: string;
    priority?: "medium" | "high" | "urgent";
    dedupeKey: string;
  }
) {
  console.error(`[Workflow] ${options.title}: ${options.body} (workflow=${workflow.id})`);
  broadcastWorkflowNotification(options.title, options.body || "Workflow needs attention.");
}

async function executeWorkflow(workflow: Workflow, triggerSource: "manual" | "scheduled") {
  const schedule = parseWorkflowSchedule(workflow.schedule_json);
  const now = Date.now();
  const gateResult = await evaluateGate(workflow);

  if (!gateResult.proceed) {
    const skipReason = gateResult.reason || "Gate returned false";

    workflowRuns.create({
      id: randomUUID(),
      workflow_id: workflow.id,
      session_id: null,
      status: "skipped",
      trigger_source: triggerSource,
      started_at: now,
      completed_at: now,
      skipped_reason: skipReason,
      error: null,
    });
    workflows.update(workflow.id, {
      next_run_at: calculateNextWorkflowRun(schedule) ?? null,
      last_skip_reason: skipReason,
      last_error: null,
    });
    reportWorkflowAttention(workflow, workflow.root_session_id, {
      title: `Workflow blocked: ${workflow.name}`,
      body: `The workflow could not run because: ${skipReason}`,
      priority: /auth|oauth|token|credential|gmail|google/i.test(skipReason) ? "urgent" : "high",
      dedupeKey: `workflow:${workflow.id}:gate-skip`,
    });
    broadcastFn?.({
      type: "workflow:run_skipped",
      workflowId: workflow.id,
      projectId: workflow.project_id,
      reason: skipReason,
    });
    return;
  }

  const childSession = createWorkflowRunSession(workflow);
  if (!childSession) {
    const error = "Failed to create workflow run session";
    workflowRuns.create({
      id: randomUUID(),
      workflow_id: workflow.id,
      session_id: null,
      status: "failed",
      trigger_source: triggerSource,
      started_at: now,
      completed_at: now,
      skipped_reason: null,
      error,
    });
    workflows.update(workflow.id, {
      last_error: error,
      next_run_at: calculateNextWorkflowRun(schedule) ?? null,
    });
    reportWorkflowAttention(workflow, workflow.root_session_id, {
      title: `Workflow failed to start: ${workflow.name}`,
      body: error,
      priority: "urgent",
      dedupeKey: `workflow:${workflow.id}:run-session-error`,
    });
    return;
  }

  const runId = randomUUID();
  workflowRuns.create({
    id: runId,
    workflow_id: workflow.id,
    session_id: childSession.id,
    status: "running",
    trigger_source: triggerSource,
    started_at: now,
    completed_at: null,
    skipped_reason: null,
    error: null,
  });

  workflows.update(workflow.id, {
    run_count: (workflow.run_count || 0) + 1,
    last_run_at: now,
    next_run_at: calculateNextWorkflowRun(schedule) ?? null,
    last_error: null,
    last_skip_reason: null,
  });

  broadcastFn?.({
    type: "workflow:run_started",
    workflowId: workflow.id,
    projectId: workflow.project_id,
    sessionId: childSession.id,
  });

  const ok = triggerQuery(
    childSession.id,
    workflow.project_id,
    buildWorkflowRunPrompt({
      workflow,
      recentHistory: buildRecentRunHistory(workflow.id),
    }),
    workflow.model || undefined
  );

  if (!ok) {
    const error = "No active WebSocket connection to trigger workflow";
    workflowRuns.update(runId, {
      status: "failed",
      completed_at: Date.now(),
      error,
    });
    workflows.update(workflow.id, {
      last_error: error,
    });
    reportWorkflowAttention(workflow, childSession.id, {
      title: `Workflow failed to dispatch: ${workflow.name}`,
      body: error,
      priority: "high",
      dedupeKey: `workflow:${workflow.id}:dispatch-error`,
    });
  }
}

function startWorkflowTimer(workflow: Workflow) {
  stopWorkflowTimer(workflow.id);
  if (!workflow.enabled) return;

  const schedule = parseWorkflowSchedule(workflow.schedule_json);
  switch (schedule.kind) {
    case "at": {
      const delay = parseScheduleTime(schedule.time) - Date.now();
      if (delay > 0) {
        const timer = setTimeout(() => {
          void workflowScheduler.run(workflow.id, "scheduled");
        }, delay);
        activeTimers.set(workflow.id, timer);
      }
      break;
    }
    case "every": {
      const timer = setInterval(() => {
        void workflowScheduler.run(workflow.id, "scheduled");
      }, schedule.interval);
      activeTimers.set(workflow.id, timer);
      break;
    }
    case "cron": {
      const cron = new Cron(
        schedule.expression,
        { timezone: schedule.timezone },
        () => {
          void workflowScheduler.run(workflow.id, "scheduled");
        }
      );
      activeTimers.set(workflow.id, cron);
      break;
    }
  }
}

export const workflowScheduler = {
  init(broadcast?: (data: unknown) => void) {
    broadcastFn = broadcast || null;
    for (const workflow of workflows.listEnabled()) {
      workflows.update(workflow.id, {
        next_run_at: calculateNextWorkflowRun(parseWorkflowSchedule(workflow.schedule_json)) ?? null,
      });
      startWorkflowTimer(workflow);
    }
  },

  sync(workflowId: string) {
    const workflow = workflows.get(workflowId);
    stopWorkflowTimer(workflowId);
    if (!workflow) return;
    workflows.update(workflow.id, {
      next_run_at: workflow.enabled
        ? calculateNextWorkflowRun(parseWorkflowSchedule(workflow.schedule_json)) ?? null
        : null,
    });
    startWorkflowTimer(workflow);
  },

  remove(workflowId: string) {
    stopWorkflowTimer(workflowId);
  },

  async run(workflowId: string, triggerSource: "manual" | "scheduled" = "manual") {
    const workflow = workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    await executeWorkflow(workflow, triggerSource);
  },

  shutdown() {
    for (const workflowId of Array.from(activeTimers.keys())) {
      stopWorkflowTimer(workflowId);
    }
  },
};
