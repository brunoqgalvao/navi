/**
 * Backend Routes
 *
 * API endpoints for backend detection, selection, and configuration.
 */

import { spawnSync } from "child_process";
import {
  existsSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  readdirSync,
  statSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import * as yaml from "yaml";
import { json, error } from "../utils/response";
import {
  backendRegistry,
  detectBackends,
  getModels,
  getAllModels,
  type BackendId,
} from "../backends";

type BackendHealthIssue = {
  level: "warning" | "error";
  code: string;
  message: string;
  path?: string;
};

type CodexHealth = {
  backend: "codex";
  installed: boolean;
  version?: string;
  path?: string;
  authMode: "chatgpt" | "api_key" | "not_logged_in" | "unknown";
  config: {
    model?: string;
    reasoningEffort?: string;
  };
  issues: BackendHealthIssue[];
  checkedAt: string;
};

function readTail(filePath: string, maxBytes = 256 * 1024): string {
  const size = statSync(filePath).size;
  const readBytes = Math.min(size, maxBytes);
  const fd = openSync(filePath, "r");
  const buffer = Buffer.alloc(readBytes);

  try {
    readSync(fd, buffer, 0, readBytes, size - readBytes);
    return buffer.toString("utf-8");
  } finally {
    closeSync(fd);
  }
}

function extractTomlStringValue(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*\"([^\"]+)\"`, "m"));
  return match?.[1];
}

function detectCodexAuthMode(codexPath?: string): CodexHealth["authMode"] {
  if (!codexPath) return "unknown";

  try {
    const result = spawnSync(codexPath, ["login", "status"], {
      encoding: "utf-8",
      timeout: 4000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();

    if (/logged in using chatgpt/i.test(output)) return "chatgpt";
    if (/logged in using api key/i.test(output)) return "api_key";
    if (/not logged in/i.test(output)) return "not_logged_in";
  } catch {}

  return "unknown";
}

function scanCodexSkills(issues: BackendHealthIssue[]) {
  const skillsDir = join(homedir(), ".codex", "skills");
  if (!existsSync(skillsDir)) {
    return;
  }

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    try {
      const content = readFileSync(skillPath, "utf-8");
      const match = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (!match) {
        continue;
      }

      const frontmatter = yaml.parse(match[1]) as Record<string, unknown> | null;
      const name = typeof frontmatter?.name === "string" ? frontmatter.name.trim() : "";
      if (!name) {
        issues.push({
          level: "error",
          code: "skill_missing_name",
          message: `Codex skill "${entry.name}" is missing a frontmatter name.`,
          path: skillPath,
        });
      }
    } catch (err) {
      issues.push({
        level: "error",
        code: "skill_parse_failed",
        message: err instanceof Error ? err.message : "Failed to parse skill frontmatter.",
        path: skillPath,
      });
    }
  }
}

function scanCodexLogs(issues: BackendHealthIssue[]) {
  const logPath = join(homedir(), ".codex", "log", "codex-tui.log");
  if (!existsSync(logPath)) {
    return;
  }

  try {
    const tail = readTail(logPath);

    if (/failed to open state db .*missing in the resolved migrations/i.test(tail)) {
      issues.push({
        level: "warning",
        code: "state_db_migration_mismatch",
        message: "Recent Codex logs show a state DB migration mismatch.",
        path: logPath,
      });
    }
  } catch (err) {
    issues.push({
      level: "warning",
      code: "health_log_scan_failed",
      message: err instanceof Error ? err.message : "Failed to scan Codex logs.",
      path: logPath,
    });
  }
}

async function getCodexHealth(): Promise<CodexHealth> {
  const info = await backendRegistry.get("codex")?.detect();
  const configPath = join(homedir(), ".codex", "config.toml");
  const configContent = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  const issues: BackendHealthIssue[] = [];

  scanCodexSkills(issues);
  scanCodexLogs(issues);

  return {
    backend: "codex",
    installed: info?.installed ?? false,
    version: info?.version,
    path: info?.path,
    authMode: detectCodexAuthMode(info?.path),
    config: {
      model: extractTomlStringValue(configContent, "model"),
      reasoningEffort: extractTomlStringValue(configContent, "model_reasoning_effort"),
    },
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export async function handleBackendRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  const path = url.pathname;

  // GET /api/backends - List all backends with installation status and models
  if (path === "/api/backends" && method === "GET") {
    try {
      const backends = await detectBackends();
      // Enrich with models and other adapter info
      const enriched = backends.map((b) => {
        const adapter = backendRegistry.get(b.id);
        return {
          ...b,
          models: adapter?.models || [],
          defaultModel: adapter?.defaultModel,
          supportsCallbackPermissions: adapter?.supportsCallbackPermissions,
          supportsResume: adapter?.supportsResume,
        };
      });
      return json(enriched);
    } catch (e: any) {
      return error(e.message, 500);
    }
  }

  // GET /api/backends/installed - List only installed backends
  if (path === "/api/backends/installed" && method === "GET") {
    try {
      const backends = await detectBackends();
      const installed = backends.filter((b) => b.installed);
      // Enrich with models and other adapter info
      const enriched = installed.map((b) => {
        const adapter = backendRegistry.get(b.id);
        return {
          ...b,
          models: adapter?.models || [],
          defaultModel: adapter?.defaultModel,
          supportsCallbackPermissions: adapter?.supportsCallbackPermissions,
          supportsResume: adapter?.supportsResume,
        };
      });
      return json(enriched);
    } catch (e: any) {
      return error(e.message, 500);
    }
  }

  // GET /api/backends/models - Get all models grouped by backend
  // (Must be before :id match to avoid "models" being treated as an ID)
  if (path === "/api/backends/models" && method === "GET") {
    return json(getAllModels());
  }

  // GET /api/backends/codex/health - Local Codex runtime diagnostics
  if (path === "/api/backends/codex/health" && method === "GET") {
    try {
      return json(await getCodexHealth());
    } catch (e: any) {
      return error(e.message, 500);
    }
  }

  // GET /api/backends/:id/models - Get models for a specific backend
  const modelsMatch = path.match(/^\/api\/backends\/([^/]+)\/models$/);
  if (modelsMatch && method === "GET") {
    const backendId = modelsMatch[1] as BackendId;
    const models = getModels(backendId);

    if (!models.length) {
      return error(`Unknown backend: ${backendId}`, 404);
    }

    const adapter = backendRegistry.get(backendId);
    return json({
      models,
      default: adapter?.defaultModel,
    });
  }

  // GET /api/backends/:id - Get specific backend info
  const backendMatch = path.match(/^\/api\/backends\/([^/]+)$/);
  if (backendMatch && method === "GET") {
    const backendId = backendMatch[1] as BackendId;
    const adapter = backendRegistry.get(backendId);

    if (!adapter) {
      return error(`Unknown backend: ${backendId}`, 404);
    }

    try {
      const info = await adapter.detect();
      return json({
        ...info,
        models: adapter.models,
        defaultModel: adapter.defaultModel,
        supportsCallbackPermissions: adapter.supportsCallbackPermissions,
        supportsResume: adapter.supportsResume,
      });
    } catch (e: any) {
      return error(e.message, 500);
    }
  }

  return null;
}
