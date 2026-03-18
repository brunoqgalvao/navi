import { describe, expect, test } from "bun:test";
import {
  buildWorkflowExecutionHistoryLocation,
  buildWorkflowRunPrompt,
  formatWorkflowRunDateTime,
} from "./workflow-run-prompt";

describe("workflow run prompt", () => {
  test("formats current local date and time with the resolved timezone", () => {
    const formatted = formatWorkflowRunDateTime(
      new Date("2026-03-07T13:26:41.000Z"),
      "America/Sao_Paulo"
    );

    expect(formatted).toBe("Saturday, March 7, 2026 at 10:26:41 AM (America/Sao_Paulo)");
  });

  test("injects workflow identity, execution history location, and current time", () => {
    const workflow = {
      id: "wf-littlehero",
      name: "Littlehero influencer",
      prompt: "Present getlittlehero to influencers and keep the outreach personalized.",
      learning_notes: "Offer credits when they want to keep testing the app.",
      feedback_notes: "Capture paid partnership rates before escalating.",
    };

    expect(buildWorkflowExecutionHistoryLocation(workflow)).toBe(
      'In Navi, open the "Littlehero influencer" workflow in the sidebar and review its child run sessions. API: /api/workflows/wf-littlehero/runs'
    );

    const prompt = buildWorkflowRunPrompt({
      workflow,
      recentHistory:
        "- 3/7/2026, 10:26:41 AM: running (Littlehero influencer 3/7/2026, 10:26:41 AM)",
      currentDateTime: "Saturday, March 7, 2026 at 10:26:41 AM (America/Sao_Paulo)",
    });

    expect(prompt).toContain('You are executing the workflow "Littlehero influencer" inside Navi.');
    expect(prompt).toContain('Workflow: "Littlehero influencer" (id: wf-littlehero)');
    expect(prompt).toContain(
      'Execution history: In Navi, open the "Littlehero influencer" workflow in the sidebar and review its child run sessions. API: /api/workflows/wf-littlehero/runs'
    );
    expect(prompt).toContain(
      "Current local date/time: Saturday, March 7, 2026 at 10:26:41 AM (America/Sao_Paulo)"
    );
    expect(prompt).toContain("Learnings to keep in mind:");
    expect(prompt).toContain("Offer credits when they want to keep testing the app.");
    expect(prompt).toContain("Feedback and updates:");
    expect(prompt).toContain("Capture paid partnership rates before escalating.");
    expect(prompt).toContain("Recent workflow history:");
    expect(prompt).toContain("`inbox-item` JSON block");
    expect(prompt).toContain("blocked auth, approvals, missing credentials");
  });
});
