/**
 * Browser-use API Routes
 *
 * Backend for browser automation via browser-use Python library
 */

import { spawn } from "child_process";
import { json, error } from "../utils/response";
import path from "path";
import os from "os";

const BROWSER_USE_SKILL_PATH = path.join(os.homedir(), ".claude/skills/browser-use");
const BROWSE_SCRIPT = path.join(BROWSER_USE_SKILL_PATH, "browse.py");

interface BrowserTask {
  id: string;
  task: string;
  url?: string;
  headless: boolean;
  screenshot?: string;
  status: "pending" | "running" | "success" | "error";
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

// Track active browser tasks
const activeTasks = new Map<string, BrowserTask>();

export async function handleBrowserRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // POST /api/browser/execute - Start browser task
  if (url.pathname === "/api/browser/execute" && method === "POST") {
    try {
      const body = await req.json() as {
        task: string;
        url?: string;
        headless?: boolean;
        screenshot?: boolean;
        timeout?: number;
      };

      const taskId = crypto.randomUUID();
      const task: BrowserTask = {
        id: taskId,
        task: body.task,
        url: body.url,
        headless: body.headless !== false,
        status: "pending",
        startedAt: Date.now(),
      };

      activeTasks.set(taskId, task);

      // Build command
      const args = [
        BROWSE_SCRIPT,
        body.task,
      ];

      if (body.url) {
        args.push("--url", body.url);
      }

      if (body.headless) {
        args.push("--headless");
      }

      if (body.screenshot) {
        const screenshotPath = path.join(os.tmpdir(), `navi-browser-${taskId}.png`);
        args.push("--screenshot", screenshotPath);
        task.screenshot = screenshotPath;
      }

      args.push("--output", "json");

      if (body.timeout) {
        args.push("--timeout", body.timeout.toString());
      }

      // Execute browser-use
      task.status = "running";
      activeTasks.set(taskId, task);

      const child = spawn("uv", ["run", "python", ...args], {
        cwd: BROWSER_USE_SKILL_PATH,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        const task = activeTasks.get(taskId);
        if (!task) return;

        task.completedAt = Date.now();

        if (code === 0) {
          task.status = "success";
          try {
            const result = JSON.parse(stdout);
            task.result = result.result || stdout;
          } catch {
            task.result = stdout;
          }
        } else {
          task.status = "error";
          task.error = stderr || `Process exited with code ${code}`;
        }

        activeTasks.set(taskId, task);

        // Clean up after 5 minutes
        setTimeout(() => {
          activeTasks.delete(taskId);
        }, 5 * 60 * 1000);
      });

      return json({
        taskId,
        status: "started",
      });
    } catch (e) {
      return error(e instanceof Error ? e.message : "Failed to start browser task", 500);
    }
  }

  // GET /api/browser/task/:id - Get task status
  const taskMatch = url.pathname.match(/^\/api\/browser\/task\/([^/]+)$/);
  if (taskMatch && method === "GET") {
    const taskId = taskMatch[1];
    const task = activeTasks.get(taskId);

    if (!task) {
      return error("Task not found", 404);
    }

    return json(task);
  }

  // GET /api/browser/tasks - List all active tasks
  if (url.pathname === "/api/browser/tasks" && method === "GET") {
    return json({
      tasks: Array.from(activeTasks.values()),
    });
  }

  // Not handled
  return null;
}
