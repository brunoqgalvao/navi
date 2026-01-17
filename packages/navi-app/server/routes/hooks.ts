/**
 * Hooks Routes
 *
 * API endpoints for managing lifecycle hooks (.claude/hooks/)
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join, basename } from "path";
import { json, error } from "../utils/response";
import { projects } from "../db";
import {
  loadHooks,
  listHooks,
  getHooksDir,
  generateHookTemplate,
  type HookEvent,
  type HookType,
  type HookDefinition,
} from "../services/hook-loader";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CreateHookInput {
  name: string;
  description?: string;
  event: HookEvent;
  matcher?: string;
  type?: HookType;
  command: string;
  timeout?: number;
  scope: "project" | "user";
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleHooksRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const pathname = url.pathname;

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/hooks?projectId=xxx - List all hooks
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/hooks" && method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return error("projectId is required", 400);
    }

    const project = projects.get(projectId);
    if (!project) {
      return error("Project not found", 404);
    }

    const { project: projectHooks, user: userHooks, total } = listHooks(
      project.path
    );

    return json({
      project: projectHooks,
      user: userHooks,
      total,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/hooks/events - List available hook events
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/hooks/events" && method === "GET") {
    return json({
      events: [
        {
          name: "SessionStart",
          description: "When a new session begins",
          supportsToolMatcher: false,
        },
        {
          name: "PreToolUse",
          description: "Before a tool is executed",
          supportsToolMatcher: true,
        },
        {
          name: "PostToolUse",
          description: "After a tool is executed",
          supportsToolMatcher: true,
        },
        {
          name: "Stop",
          description: "When session is ending",
          supportsToolMatcher: false,
        },
        {
          name: "PreQuery",
          description: "Before sending query to Claude",
          supportsToolMatcher: false,
        },
        {
          name: "PostQuery",
          description: "After receiving response from Claude",
          supportsToolMatcher: false,
        },
      ],
      types: [
        { name: "command", description: "Execute a shell command" },
        { name: "prompt", description: "Inject text into the conversation" },
      ],
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/hooks - Create a new hook
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/hooks" && method === "POST") {
    try {
      const body = (await req.json()) as CreateHookInput & {
        projectId?: string;
      };
      const { projectId, name, description, event, matcher, type, command, timeout, scope } =
        body;

      if (!name || !event || !command) {
        return error("name, event, and command are required", 400);
      }

      // Validate event
      const validEvents: HookEvent[] = [
        "SessionStart",
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "PreQuery",
        "PostQuery",
      ];
      if (!validEvents.includes(event)) {
        return error(`Invalid event. Must be one of: ${validEvents.join(", ")}`, 400);
      }

      // Get project path if scope is project
      let projectPath: string | undefined;
      if (scope === "project") {
        if (!projectId) {
          return error("projectId required for project-scoped hooks", 400);
        }
        const project = projects.get(projectId);
        if (!project) {
          return error("Project not found", 404);
        }
        projectPath = project.path;
      }

      // Get hooks directory
      const hooksDir = getHooksDir(scope, projectPath);

      // Ensure directory exists
      if (!existsSync(hooksDir)) {
        mkdirSync(hooksDir, { recursive: true });
      }

      // Generate filename from name
      const filename = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.md`;
      const filePath = join(hooksDir, filename);

      // Check if already exists
      if (existsSync(filePath)) {
        return error(`Hook "${name}" already exists`, 409);
      }

      // Generate hook content
      const hookType = type || "command";
      const content = `---
name: ${name}
description: ${description || "TODO - describe what this hook does"}
event: ${event}
${matcher ? `matcher: "${matcher}"\n` : ""}type: ${hookType}
timeout: ${timeout || 30000}
enabled: true
---

${command}
`;

      // Write file
      writeFileSync(filePath, content, "utf-8");

      return json({
        success: true,
        hook: {
          name,
          description,
          event,
          matcher,
          type: hookType,
          command,
          timeout: timeout || 30000,
          filePath,
          scope,
          enabled: true,
        },
      });
    } catch (err: any) {
      return error(err.message || "Failed to create hook", 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/hooks/:name - Delete a hook
  // ─────────────────────────────────────────────────────────────────────────
  const deleteMatch = pathname.match(/^\/api\/hooks\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    try {
      const hookName = decodeURIComponent(deleteMatch[1]);
      const projectId = url.searchParams.get("projectId");
      const scope = (url.searchParams.get("scope") || "project") as
        | "project"
        | "user";

      // Get project path if needed
      let projectPath: string | undefined;
      if (scope === "project") {
        if (!projectId) {
          return error("projectId required for project-scoped hooks", 400);
        }
        const project = projects.get(projectId);
        if (!project) {
          return error("Project not found", 404);
        }
        projectPath = project.path;
      }

      const hooksDir = getHooksDir(scope, projectPath);
      const filename = `${hookName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.md`;
      const filePath = join(hooksDir, filename);

      if (!existsSync(filePath)) {
        return error(`Hook "${hookName}" not found`, 404);
      }

      unlinkSync(filePath);

      return json({ success: true, deleted: hookName });
    } catch (err: any) {
      return error(err.message || "Failed to delete hook", 500);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/hooks/template - Generate a hook template
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === "/api/hooks/template" && method === "GET") {
    const name = url.searchParams.get("name") || "my-hook";
    const event = (url.searchParams.get("event") || "PostToolUse") as HookEvent;
    const type = (url.searchParams.get("type") || "command") as HookType;

    const template = generateHookTemplate(name, event, type);
    return json({ template });
  }

  return null;
}
