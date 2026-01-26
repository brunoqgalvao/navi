/**
 * Cron Scheduler Service
 *
 * Persistent job scheduler for Navi. Jobs are stored in ~/.claude-code-ui/cron/
 * and survive server restarts.
 *
 * Schedule types:
 * - "at": One-shot at specific timestamp
 * - "every": Fixed interval in milliseconds
 * - "cron": Standard 5-field cron expression
 *
 * Payload types:
 * - "query": Send message to Claude in a session
 * - "command": Run a shell command
 * - "notification": Show toast notification
 * - "webhook": POST to external URL
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Cron } from "croner";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduleKind = "at" | "every" | "cron";

export interface ScheduleAt {
  kind: "at";
  time: string | number; // ISO 8601 or ms since epoch
}

export interface ScheduleEvery {
  kind: "every";
  interval: number; // milliseconds
}

export interface ScheduleCron {
  kind: "cron";
  expression: string; // 5-field cron
  timezone?: string; // IANA timezone
}

export type Schedule = ScheduleAt | ScheduleEvery | ScheduleCron;

export type PayloadKind = "query" | "command" | "notification" | "webhook";

export interface PayloadQuery {
  kind: "query";
  message: string;
  sessionId?: string;
  projectId?: string;
}

export interface PayloadCommand {
  kind: "command";
  command: string;
  cwd?: string;
  captureOutput?: boolean;
}

export interface PayloadNotification {
  kind: "notification";
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
}

export interface PayloadWebhook {
  kind: "webhook";
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
}

export type Payload = PayloadQuery | PayloadCommand | PayloadNotification | PayloadWebhook;

export interface CronJob {
  id: string;
  name: string;
  schedule: Schedule;
  payload: Payload;
  enabled: boolean;
  deleteAfterRun: boolean;
  retryOnFailure: boolean;
  maxRetries: number;
  timeout: number;
  createdAt: number;
  updatedAt: number;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
}

export interface JobRun {
  id: string;
  jobId: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "success" | "failed";
  output?: string;
  error?: string;
  retryCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Paths
// ─────────────────────────────────────────────────────────────────────────────

const CRON_DIR = join(homedir(), ".claude-code-ui", "cron");
const JOBS_FILE = join(CRON_DIR, "jobs.json");
const RUNS_DIR = join(CRON_DIR, "runs");

function ensureDirectories() {
  if (!existsSync(CRON_DIR)) {
    mkdirSync(CRON_DIR, { recursive: true });
  }
  if (!existsSync(RUNS_DIR)) {
    mkdirSync(RUNS_DIR, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Storage
// ─────────────────────────────────────────────────────────────────────────────

function loadJobs(): Map<string, CronJob> {
  ensureDirectories();
  if (!existsSync(JOBS_FILE)) {
    return new Map();
  }
  try {
    const data = JSON.parse(readFileSync(JOBS_FILE, "utf-8"));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

function saveJobs(jobs: Map<string, CronJob>) {
  ensureDirectories();
  const data = Object.fromEntries(jobs);
  writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function appendRun(run: JobRun) {
  ensureDirectories();
  const runFile = join(RUNS_DIR, `${run.jobId}.jsonl`);
  appendFileSync(runFile, JSON.stringify(run) + "\n", "utf-8");
}

function getJobRuns(jobId: string, limit = 50): JobRun[] {
  const runFile = join(RUNS_DIR, `${jobId}.jsonl`);
  if (!existsSync(runFile)) {
    return [];
  }
  try {
    const lines = readFileSync(runFile, "utf-8").trim().split("\n").filter(Boolean);
    const runs = lines.map((line) => JSON.parse(line) as JobRun);
    // Return most recent first
    return runs.reverse().slice(0, limit);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler State
// ─────────────────────────────────────────────────────────────────────────────

const jobs = loadJobs();
const activeTimers = new Map<string, Cron | ReturnType<typeof setTimeout>>();
let broadcastFn: ((data: unknown) => void) | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Schedule Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseScheduleTime(time: string | number): number {
  if (typeof time === "number") return time;
  // Parse ISO 8601
  const date = new Date(time);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid time format: ${time}`);
  }
  return date.getTime();
}

function calculateNextRun(schedule: Schedule): number | undefined {
  const now = Date.now();

  switch (schedule.kind) {
    case "at": {
      const time = parseScheduleTime(schedule.time);
      return time > now ? time : undefined;
    }
    case "every": {
      return now + schedule.interval;
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// Payload Executors
// ─────────────────────────────────────────────────────────────────────────────

async function executeQuery(payload: PayloadQuery): Promise<string> {
  // Use Navi API to inject message
  const serverUrl = process.env.NAVI_SERVER_URL || "http://localhost:3001";

  let sessionId = payload.sessionId;

  // If no session, we need to create one or find existing
  if (!sessionId) {
    // For now, we'll need a session to be specified
    // In the future, we could create a new session in a "Scheduled Tasks" project
    throw new Error("sessionId is required for query payloads (automatic session creation coming soon)");
  }

  const response = await fetch(`${serverUrl}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: payload.message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send message: ${text}`);
  }

  return `Message sent to session ${sessionId}`;
}

async function executeCommand(payload: PayloadCommand): Promise<string> {
  const { spawn } = await import("child_process");

  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", payload.command], {
      cwd: payload.cwd || process.cwd(),
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
        resolve(payload.captureOutput ? stdout : `Command completed with exit code 0`);
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function executeNotification(payload: PayloadNotification): Promise<string> {
  // Use Navi API to show notification
  const serverUrl = process.env.NAVI_SERVER_URL || "http://localhost:3001";

  const response = await fetch(`${serverUrl}/api/ui/notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      message: payload.message,
      type: payload.type || "info",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to show notification: ${text}`);
  }

  return `Notification shown: ${payload.title}`;
}

async function executeWebhook(payload: PayloadWebhook): Promise<string> {
  const response = await fetch(payload.url, {
    method: payload.method || "POST",
    headers: {
      "Content-Type": "application/json",
      ...payload.headers,
    },
    body: payload.body ? JSON.stringify(payload.body) : undefined,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Webhook failed (${response.status}): ${text}`);
  }

  return `Webhook completed (${response.status}): ${text.slice(0, 200)}`;
}

async function executePayload(payload: Payload): Promise<string> {
  switch (payload.kind) {
    case "query":
      return executeQuery(payload);
    case "command":
      return executeCommand(payload);
    case "notification":
      return executeNotification(payload);
    case "webhook":
      return executeWebhook(payload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Execution
// ─────────────────────────────────────────────────────────────────────────────

async function runJob(jobId: string, retryCount = 0) {
  const job = jobs.get(jobId);
  if (!job || !job.enabled) return;

  const run: JobRun = {
    id: randomUUID(),
    jobId,
    startedAt: Date.now(),
    status: "running",
    retryCount,
  };

  try {
    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Job timed out")), job.timeout);
    });

    const output = await Promise.race([executePayload(job.payload), timeoutPromise]);

    run.status = "success";
    run.output = output;
    run.completedAt = Date.now();

    // Update job stats
    job.lastRun = run.startedAt;
    job.runCount++;
    job.nextRun = calculateNextRun(job.schedule);

    // Delete one-shot jobs if configured
    if (job.deleteAfterRun && job.schedule.kind === "at") {
      jobs.delete(jobId);
      stopJobTimer(jobId);
    } else {
      jobs.set(jobId, job);
    }

    saveJobs(jobs);
  } catch (err: any) {
    run.status = "failed";
    run.error = err.message;
    run.completedAt = Date.now();

    // Retry if configured
    if (job.retryOnFailure && retryCount < job.maxRetries) {
      setTimeout(() => runJob(jobId, retryCount + 1), 5000 * (retryCount + 1));
    }

    // Update job stats even on failure
    job.lastRun = run.startedAt;
    job.runCount++;
    job.nextRun = calculateNextRun(job.schedule);
    jobs.set(jobId, job);
    saveJobs(jobs);
  }

  // Log the run
  appendRun(run);

  // Broadcast update
  if (broadcastFn) {
    broadcastFn({
      type: "cron_job_run",
      jobId,
      run,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timer Management
// ─────────────────────────────────────────────────────────────────────────────

function stopJobTimer(jobId: string) {
  const timer = activeTimers.get(jobId);
  if (timer) {
    if (timer instanceof Cron) {
      timer.stop();
    } else {
      clearTimeout(timer);
    }
    activeTimers.delete(jobId);
  }
}

function startJobTimer(job: CronJob) {
  stopJobTimer(job.id);

  if (!job.enabled) return;

  switch (job.schedule.kind) {
    case "at": {
      const time = parseScheduleTime(job.schedule.time);
      const delay = time - Date.now();
      if (delay > 0) {
        const timer = setTimeout(() => runJob(job.id), delay);
        activeTimers.set(job.id, timer);
      }
      break;
    }

    case "every": {
      // Run immediately then on interval
      const timer = setInterval(() => runJob(job.id), job.schedule.interval);
      activeTimers.set(job.id, timer as unknown as ReturnType<typeof setTimeout>);
      break;
    }

    case "cron": {
      const cron = new Cron(
        job.schedule.expression,
        {
          timezone: job.schedule.timezone,
        },
        () => runJob(job.id)
      );
      activeTimers.set(job.id, cron);
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const cronScheduler = {
  /**
   * Initialize the scheduler and start all enabled jobs
   */
  init(broadcast?: (data: unknown) => void) {
    broadcastFn = broadcast || null;

    // Start timers for all enabled jobs
    for (const job of Array.from(jobs.values())) {
      if (job.enabled) {
        job.nextRun = calculateNextRun(job.schedule);
        startJobTimer(job);
      }
    }

    console.log(`[Cron] Initialized with ${jobs.size} jobs`);
  },

  /**
   * List all jobs
   */
  list(): CronJob[] {
    return Array.from(jobs.values()).sort(
      (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
    );
  },

  /**
   * Get a specific job
   */
  get(jobId: string): CronJob | undefined {
    return jobs.get(jobId);
  },

  /**
   * Create a new job
   */
  create(input: {
    name: string;
    schedule: Schedule;
    payload: Payload;
    enabled?: boolean;
    deleteAfterRun?: boolean;
    retryOnFailure?: boolean;
    maxRetries?: number;
    timeout?: number;
  }): CronJob {
    const now = Date.now();
    const job: CronJob = {
      id: `job_${randomUUID().slice(0, 8)}`,
      name: input.name,
      schedule: input.schedule,
      payload: input.payload,
      enabled: input.enabled ?? true,
      deleteAfterRun: input.deleteAfterRun ?? false,
      retryOnFailure: input.retryOnFailure ?? false,
      maxRetries: input.maxRetries ?? 3,
      timeout: input.timeout ?? 60000,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    };

    job.nextRun = calculateNextRun(job.schedule);

    jobs.set(job.id, job);
    saveJobs(jobs);

    if (job.enabled) {
      startJobTimer(job);
    }

    return job;
  },

  /**
   * Update an existing job
   */
  update(
    jobId: string,
    updates: Partial<
      Pick<
        CronJob,
        | "name"
        | "schedule"
        | "payload"
        | "enabled"
        | "deleteAfterRun"
        | "retryOnFailure"
        | "maxRetries"
        | "timeout"
      >
    >
  ): CronJob | undefined {
    const job = jobs.get(jobId);
    if (!job) return undefined;

    const wasEnabled = job.enabled;

    Object.assign(job, updates, { updatedAt: Date.now() });

    // Recalculate next run if schedule changed
    if (updates.schedule) {
      job.nextRun = calculateNextRun(job.schedule);
    }

    jobs.set(jobId, job);
    saveJobs(jobs);

    // Restart timer if needed
    if (wasEnabled || job.enabled) {
      startJobTimer(job);
    }

    return job;
  },

  /**
   * Delete a job
   */
  delete(jobId: string): boolean {
    const existed = jobs.has(jobId);
    if (existed) {
      stopJobTimer(jobId);
      jobs.delete(jobId);
      saveJobs(jobs);
    }
    return existed;
  },

  /**
   * Manually run a job now
   */
  async run(jobId: string): Promise<void> {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    await runJob(jobId);
  },

  /**
   * Get run history for a job
   */
  getRuns(jobId: string, limit?: number): JobRun[] {
    return getJobRuns(jobId, limit);
  },

  /**
   * Stop all timers (for shutdown)
   */
  shutdown() {
    for (const jobId of Array.from(activeTimers.keys())) {
      stopJobTimer(jobId);
    }
  },
};
