/**
 * Dashboard Routes
 *
 * Handles reading/writing .claude/dashboard.md and executing actions.
 * Fully isolated - remove to disable dashboard feature.
 */

import { json } from "../utils/response";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname, resolve, normalize, basename } from "path";
import { execSync } from "child_process";
import { homedir } from "os";
import { getAllCommands, type CustomCommand } from "./commands";
import { mcpSettings } from "../services/mcp-settings";

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

  // GET /api/dashboard/capabilities - Get project capabilities (skills, commands, hooks, agents, MCPs)
  if (url.pathname === "/api/dashboard/capabilities" && method === "GET") {
    const projectPath = url.searchParams.get("path");

    if (!projectPath) {
      return json({ error: "Missing path parameter" }, 400);
    }

    try {
      const capabilities = {
        commands: [] as Array<{ name: string; description: string; source: string }>,
        skills: [] as Array<{ name: string; description: string; source: string }>,
        agents: [] as Array<{ name: string; description: string; type?: string; source: string }>,
        hooks: [] as Array<{ event: string; command: string }>,
        mcpServers: [] as Array<{ name: string; type: string; enabled: boolean; source: string }>,
      };

      // Get commands
      const commands = getAllCommands(projectPath);
      capabilities.commands = commands.map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        source: cmd.source,
      }));

      // Get skills from project .claude/skills directory
      const projectSkillsDir = join(projectPath, ".claude", "skills");
      if (existsSync(projectSkillsDir)) {
        const skillDirs = readdirSync(projectSkillsDir).filter(name => {
          const skillPath = join(projectSkillsDir, name);
          return statSync(skillPath).isDirectory() && existsSync(join(skillPath, "SKILL.md"));
        });

        for (const skillDir of skillDirs) {
          const skillMdPath = join(projectSkillsDir, skillDir, "SKILL.md");
          try {
            const content = readFileSync(skillMdPath, "utf-8");
            const { name, description } = parseSkillFrontmatter(content);
            capabilities.skills.push({
              name: name || skillDir,
              description: description || "",
              source: "project",
            });
          } catch {
            capabilities.skills.push({
              name: skillDir,
              description: "",
              source: "project",
            });
          }
        }
      }

      // Also get global skills
      const globalSkillsDir = join(homedir(), ".claude", "skills");
      if (existsSync(globalSkillsDir)) {
        const skillDirs = readdirSync(globalSkillsDir).filter(name => {
          const skillPath = join(globalSkillsDir, name);
          return statSync(skillPath).isDirectory() && existsSync(join(skillPath, "SKILL.md"));
        });

        for (const skillDir of skillDirs) {
          // Skip if already added from project
          if (capabilities.skills.some(s => s.name === skillDir)) continue;

          const skillMdPath = join(globalSkillsDir, skillDir, "SKILL.md");
          try {
            const content = readFileSync(skillMdPath, "utf-8");
            const { name, description } = parseSkillFrontmatter(content);
            capabilities.skills.push({
              name: name || skillDir,
              description: description || "",
              source: "global",
            });
          } catch {
            capabilities.skills.push({
              name: skillDir,
              description: "",
              source: "global",
            });
          }
        }
      }

      // Get agents from project .claude/agents directory
      const projectAgentsDir = join(projectPath, ".claude", "agents");
      if (existsSync(projectAgentsDir)) {
        const agentFiles = readdirSync(projectAgentsDir).filter(
          name => name.endsWith(".md") && name !== "AGENTS.md"
        );

        for (const file of agentFiles) {
          const agentPath = join(projectAgentsDir, file);
          try {
            const content = readFileSync(agentPath, "utf-8");
            const { name, description, type } = parseAgentFrontmatter(content);
            capabilities.agents.push({
              name: name || basename(file, ".md"),
              description: description || "",
              type,
              source: "project",
            });
          } catch {
            capabilities.agents.push({
              name: basename(file, ".md"),
              description: "",
              source: "project",
            });
          }
        }
      }

      // Also get global agents
      const globalAgentsDir = join(homedir(), ".claude", "agents");
      if (existsSync(globalAgentsDir)) {
        const agentFiles = readdirSync(globalAgentsDir).filter(
          name => name.endsWith(".md") && name !== "AGENTS.md"
        );

        for (const file of agentFiles) {
          // Skip if already added from project
          const agentName = basename(file, ".md");
          if (capabilities.agents.some(a => a.name === agentName)) continue;

          const agentPath = join(globalAgentsDir, file);
          try {
            const content = readFileSync(agentPath, "utf-8");
            const { name, description, type } = parseAgentFrontmatter(content);
            capabilities.agents.push({
              name: name || agentName,
              description: description || "",
              type,
              source: "global",
            });
          } catch {
            capabilities.agents.push({
              name: agentName,
              description: "",
              source: "global",
            });
          }
        }
      }

      // Get hooks from .claude/settings.json
      const projectSettingsPath = join(projectPath, ".claude", "settings.json");
      if (existsSync(projectSettingsPath)) {
        try {
          const settingsContent = readFileSync(projectSettingsPath, "utf-8");
          const settings = JSON.parse(settingsContent);
          if (settings.hooks && typeof settings.hooks === "object") {
            for (const [event, command] of Object.entries(settings.hooks)) {
              if (typeof command === "string") {
                capabilities.hooks.push({ event, command });
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Get MCP servers
      const mcpServers = mcpSettings.getExternalServers(projectPath);
      capabilities.mcpServers = mcpServers.map(server => ({
        name: server.name,
        type: server.type || "stdio",
        enabled: server.enabled,
        source: server.source || "unknown",
      }));

      return json(capabilities);
    } catch (e) {
      console.error("Error getting capabilities:", e);
      return json({ error: "Failed to get capabilities" }, 500);
    }
  }

  return null;
}

/**
 * Parse skill frontmatter from SKILL.md content
 */
function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return {};

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex < 0) return {};

  const result: { name?: string; description?: string } = {};
  for (let i = 1; i < endIndex; i++) {
    const line = lines[i];
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "name") result.name = value;
      if (key === "description") result.description = value;
    }
  }

  return result;
}

/**
 * Parse agent frontmatter from agent .md file
 */
function parseAgentFrontmatter(content: string): { name?: string; description?: string; type?: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return {};

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex < 0) return {};

  const result: { name?: string; description?: string; type?: string } = {};
  for (let i = 1; i < endIndex; i++) {
    const line = lines[i];
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "name") result.name = value;
      if (key === "description") result.description = value;
      if (key === "type") result.type = value;
    }
  }

  return result;
}
