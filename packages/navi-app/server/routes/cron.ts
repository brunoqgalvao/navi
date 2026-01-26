/**
 * Cron Routes
 *
 * API endpoints for managing scheduled jobs
 */

import { json, error } from "../utils/response";
import {
  cronScheduler,
  type Schedule,
  type Payload,
  type CronJob,
} from "../services/cron-scheduler";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CreateJobInput {
  name: string;
  schedule: Schedule;
  payload: Payload;
  enabled?: boolean;
  deleteAfterRun?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  timeout?: number;
}

interface UpdateJobInput {
  name?: string;
  schedule?: Schedule;
  payload?: Payload;
  enabled?: boolean;
  deleteAfterRun?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  timeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateSchedule(schedule: Schedule): string | null {
  if (!schedule || typeof schedule !== "object") {
    return "schedule is required";
  }

  switch (schedule.kind) {
    case "at":
      if (!schedule.time) {
        return "schedule.time is required for 'at' schedules";
      }
      // Validate time format
      if (typeof schedule.time === "string") {
        const date = new Date(schedule.time);
        if (isNaN(date.getTime())) {
          return "schedule.time must be a valid ISO 8601 date or timestamp";
        }
      } else if (typeof schedule.time !== "number") {
        return "schedule.time must be a string or number";
      }
      break;

    case "every":
      if (typeof schedule.interval !== "number" || schedule.interval < 1000) {
        return "schedule.interval must be a number >= 1000 (1 second)";
      }
      break;

    case "cron":
      if (!schedule.expression || typeof schedule.expression !== "string") {
        return "schedule.expression is required for 'cron' schedules";
      }
      // Basic cron validation (5 fields)
      const parts = schedule.expression.trim().split(/\s+/);
      if (parts.length !== 5) {
        return "schedule.expression must be a 5-field cron expression (minute hour day month weekday)";
      }
      break;

    default:
      return "schedule.kind must be 'at', 'every', or 'cron'";
  }

  return null;
}

function validatePayload(payload: Payload): string | null {
  if (!payload || typeof payload !== "object") {
    return "payload is required";
  }

  switch (payload.kind) {
    case "query":
      if (!payload.message || typeof payload.message !== "string") {
        return "payload.message is required for 'query' payloads";
      }
      break;

    case "command":
      if (!payload.command || typeof payload.command !== "string") {
        return "payload.command is required for 'command' payloads";
      }
      break;

    case "notification":
      if (!payload.title || typeof payload.title !== "string") {
        return "payload.title is required for 'notification' payloads";
      }
      if (!payload.message || typeof payload.message !== "string") {
        return "payload.message is required for 'notification' payloads";
      }
      break;

    case "webhook":
      if (!payload.url || typeof payload.url !== "string") {
        return "payload.url is required for 'webhook' payloads";
      }
      try {
        new URL(payload.url);
      } catch {
        return "payload.url must be a valid URL";
      }
      break;

    default:
      return "payload.kind must be 'query', 'command', 'notification', or 'webhook'";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCronRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cron/jobs - List all jobs
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/cron/jobs" && method === "GET") {
    const jobs = cronScheduler.list();
    return json(jobs);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/cron/jobs - Create a new job
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/cron/jobs" && method === "POST") {
    try {
      const body = (await req.json()) as CreateJobInput;

      // Validate required fields
      if (!body.name || typeof body.name !== "string") {
        return error("name is required", 400);
      }

      const scheduleError = validateSchedule(body.schedule);
      if (scheduleError) {
        return error(scheduleError, 400);
      }

      const payloadError = validatePayload(body.payload);
      if (payloadError) {
        return error(payloadError, 400);
      }

      const job = cronScheduler.create({
        name: body.name,
        schedule: body.schedule,
        payload: body.payload,
        enabled: body.enabled,
        deleteAfterRun: body.deleteAfterRun,
        retryOnFailure: body.retryOnFailure,
        maxRetries: body.maxRetries,
        timeout: body.timeout,
      });

      return json(job, 201);
    } catch (err: any) {
      return error(err.message || "Failed to create job", 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cron/jobs/:id - Get a specific job
  // ─────────────────────────────────────────────────────────────────────────
  const getMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)$/);
  if (getMatch && method === "GET") {
    const jobId = getMatch[1];
    const job = cronScheduler.get(jobId);

    if (!job) {
      return error(`Job ${jobId} not found`, 404);
    }

    return json(job);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /api/cron/jobs/:id - Update a job
  // ─────────────────────────────────────────────────────────────────────────
  const patchMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)$/);
  if (patchMatch && method === "PATCH") {
    try {
      const jobId = patchMatch[1];
      const body = (await req.json()) as UpdateJobInput;

      // Validate schedule if provided
      if (body.schedule) {
        const scheduleError = validateSchedule(body.schedule);
        if (scheduleError) {
          return error(scheduleError, 400);
        }
      }

      // Validate payload if provided
      if (body.payload) {
        const payloadError = validatePayload(body.payload);
        if (payloadError) {
          return error(payloadError, 400);
        }
      }

      const job = cronScheduler.update(jobId, body);

      if (!job) {
        return error(`Job ${jobId} not found`, 404);
      }

      return json(job);
    } catch (err: any) {
      return error(err.message || "Failed to update job", 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/cron/jobs/:id - Delete a job
  // ─────────────────────────────────────────────────────────────────────────
  const deleteMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    const jobId = deleteMatch[1];
    const deleted = cronScheduler.delete(jobId);

    if (!deleted) {
      return error(`Job ${jobId} not found`, 404);
    }

    return json({ success: true, deleted: jobId });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/cron/jobs/:id/run - Run a job now
  // ─────────────────────────────────────────────────────────────────────────
  const runMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)\/run$/);
  if (runMatch && method === "POST") {
    try {
      const jobId = runMatch[1];
      await cronScheduler.run(jobId);
      return json({ success: true, jobId, message: "Job triggered" });
    } catch (err: any) {
      return error(err.message || "Failed to run job", 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cron/jobs/:id/runs - Get job run history
  // ─────────────────────────────────────────────────────────────────────────
  const runsMatch = pathname.match(/^\/api\/cron\/jobs\/([^/]+)\/runs$/);
  if (runsMatch && method === "GET") {
    const jobId = runsMatch[1];
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const job = cronScheduler.get(jobId);
    if (!job) {
      return error(`Job ${jobId} not found`, 404);
    }

    const runs = cronScheduler.getRuns(jobId, limit);
    return json({ jobId, runs });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cron/status - Get scheduler status
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/cron/status" && method === "GET") {
    const jobs = cronScheduler.list();
    const enabledCount = jobs.filter((j) => j.enabled).length;
    const totalRuns = jobs.reduce((sum, j) => sum + j.runCount, 0);

    return json({
      totalJobs: jobs.length,
      enabledJobs: enabledCount,
      disabledJobs: jobs.length - enabledCount,
      totalRuns,
      upcomingJobs: jobs
        .filter((j) => j.enabled && j.nextRun)
        .sort((a, b) => (a.nextRun || 0) - (b.nextRun || 0))
        .slice(0, 5)
        .map((j) => ({
          id: j.id,
          name: j.name,
          nextRun: j.nextRun,
          nextRunFormatted: j.nextRun
            ? new Date(j.nextRun).toISOString()
            : null,
        })),
    });
  }

  return null;
}
