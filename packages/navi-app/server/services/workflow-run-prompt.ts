import type { Workflow } from "../db";

type WorkflowRunPromptWorkflow = Pick<
  Workflow,
  "id" | "name" | "prompt" | "learning_notes" | "feedback_notes"
>;

interface BuildWorkflowRunPromptOptions {
  workflow: WorkflowRunPromptWorkflow;
  recentHistory: string;
  currentDateTime?: string;
}

export function buildWorkflowExecutionHistoryLocation(
  workflow: Pick<WorkflowRunPromptWorkflow, "id" | "name">
): string {
  return [
    `In Navi, open the "${workflow.name}" workflow in the sidebar and review its child run sessions.`,
    `API: /api/workflows/${workflow.id}/runs`,
  ].join(" ");
}

export function formatWorkflowRunDateTime(now: Date = new Date(), timeZone?: string): string {
  const resolvedTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: resolvedTimeZone,
  }).format(now);

  return `${formatted} (${resolvedTimeZone})`;
}

export function buildWorkflowRunPrompt({
  workflow,
  recentHistory,
  currentDateTime = formatWorkflowRunDateTime(),
}: BuildWorkflowRunPromptOptions): string {
  const parts = [
    `You are executing the workflow "${workflow.name}" inside Navi.`,
    "",
    "Workflow run context:",
    `- Workflow: "${workflow.name}" (id: ${workflow.id})`,
    `- Execution history: ${buildWorkflowExecutionHistoryLocation(workflow)}`,
    `- Current local date/time: ${currentDateTime}`,
    "",
    "Workflow instructions:",
    workflow.prompt.trim(),
  ];

  if (workflow.learning_notes?.trim()) {
    parts.push("", "Learnings to keep in mind:", workflow.learning_notes.trim());
  }

  if (workflow.feedback_notes?.trim()) {
    parts.push("", "Feedback and updates:", workflow.feedback_notes.trim());
  }

  parts.push("", "Recent workflow history:", recentHistory);
  parts.push(
    "",
    "Run the workflow now and leave a useful transcript of what you did.",
    'If the user needs to do something for the workflow to continue, add an `inbox-item` JSON block in your final response so Navi creates a workspace inbox request.',
    "Use inbox items for blocked auth, approvals, missing credentials, unanswered questions, or required human review."
  );

  return parts.join("\n");
}
