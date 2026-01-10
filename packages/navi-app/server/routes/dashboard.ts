/**
 * Dashboard Routes
 *
 * Handles reading/writing .claude/dashboard.md and executing actions.
 * Fully isolated - remove to disable dashboard feature.
 */

import { json } from "../utils/response";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve, normalize } from "path";
import { execSync } from "child_process";

const DASHBOARD_FILE = ".claude/dashboard.md";

export async function handleDashboardRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/dashboard - Get dashboard for a project
  if (url.pathname === "/api/dashboard" && method === "GET") {
    const projectPath = url.searchParams.get("path");

    if (!projectPath) {
      return json({ error: "Missing path parameter" }, 400);
    }

    const dashboardPath = join(projectPath, DASHBOARD_FILE);

    if (!existsSync(dashboardPath)) {
      return json({
        exists: false,
        dashboard: null,
        path: dashboardPath,
      });
    }

    try {
      const content = readFileSync(dashboardPath, "utf-8");
      return json({
        exists: true,
        dashboard: { raw: content },
        path: dashboardPath,
      });
    } catch (e) {
      console.error("Error reading dashboard:", e);
      return json({ error: "Failed to read dashboard" }, 500);
    }
  }

  // POST /api/dashboard - Save dashboard content
  if (url.pathname === "/api/dashboard" && method === "POST") {
    try {
      const body = await req.json();
      const { path: projectPath, content } = body;

      if (!projectPath || content === undefined) {
        return json({ error: "Missing path or content" }, 400);
      }

      const dashboardPath = join(projectPath, DASHBOARD_FILE);
      const dir = dirname(dashboardPath);

      // Create .claude directory if it doesn't exist
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(dashboardPath, content, "utf-8");

      return json({ success: true });
    } catch (e) {
      console.error("Error saving dashboard:", e);
      return json({ error: "Failed to save dashboard" }, 500);
    }
  }

  // POST /api/dashboard/action - Execute a command
  if (url.pathname === "/api/dashboard/action" && method === "POST") {
    try {
      const body = await req.json();
      const { path: projectPath, command } = body;

      if (!projectPath || !command) {
        return json({ error: "Missing path or command" }, 400);
      }

      // Security: Basic command validation
      // Block obviously dangerous patterns
      const dangerousPatterns = [
        /rm\s+-rf\s+[\/~]/i, // rm -rf / or ~
        />\s*\/dev\/sd/i,    // writing to disk devices
        /mkfs/i,             // formatting
        /dd\s+if=/i,         // raw disk access
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(command)) {
          return json({ error: "Command blocked for safety" }, 403);
        }
      }

      const output = execSync(command, {
        cwd: projectPath,
        encoding: "utf-8",
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024, // 1MB output limit
      });

      return json({ success: true, output });
    } catch (e: unknown) {
      const error = e as { message?: string; stderr?: string };
      console.error("Error executing action:", e);
      return json({
        success: false,
        error: error.stderr || error.message || "Command failed",
      });
    }
  }

  // POST /api/dashboard/status-check - Check if a service is up
  if (url.pathname === "/api/dashboard/status-check" && method === "POST") {
    try {
      const body = await req.json();
      const { url: serviceUrl } = body;

      if (!serviceUrl) {
        return json({ error: "Missing url" }, 400);
      }

      const start = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(serviceUrl, {
          method: "HEAD",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latency = Date.now() - start;

        return json({
          up: res.ok,
          latency,
        });
      } catch {
        return json({ up: false });
      }
    } catch (e) {
      console.error("Error checking status:", e);
      return json({ error: "Failed to check status" }, 500);
    }
  }

  // GET /api/dashboard/file - Get file content for file widget
  if (url.pathname === "/api/dashboard/file" && method === "GET") {
    const projectPath = url.searchParams.get("projectPath");
    const filePath = url.searchParams.get("filePath");

    if (!projectPath || !filePath) {
      return json({ error: "Missing projectPath or filePath" }, 400);
    }

    // Security: Ensure file is within project directory
    const fullPath = resolve(projectPath, filePath);
    const normalizedProject = normalize(projectPath);

    if (!fullPath.startsWith(normalizedProject)) {
      return json({ error: "Access denied: path outside project" }, 403);
    }

    if (!existsSync(fullPath)) {
      return json({ error: "File not found", content: "" });
    }

    try {
      const content = readFileSync(fullPath, "utf-8");
      return json({ content });
    } catch (e) {
      console.error("Error reading file:", e);
      return json({ error: "Failed to read file", content: "" });
    }
  }

  return null;
}
