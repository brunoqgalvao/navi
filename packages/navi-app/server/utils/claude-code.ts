import { existsSync } from "fs";
import { homedir } from "os";
import { delimiter, dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolveBunExecutable } from "./bun";
import { describePath, writeDebugLog } from "./logging";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLAUDE_EXECUTABLE_NAMES = process.platform === "win32"
  ? ["claude.exe", "claude.cmd", "claude.bat", "claude"]
  : ["claude"];

let runtimeLogged = false;

export type ClaudeAuthEnvOverrides = {
  apiKey?: string | null;
  baseUrl?: string | null;
};

export function getClaudeCodeRuntimeOptions(): { executable?: string; executableArgs?: string[]; pathToClaudeCodeExecutable?: string } {
  const isBun = Boolean((process as any)?.versions?.bun);

  const claudePath = resolveClaudeCodeExecutable();
  const bunPath = isBun ? resolveBunExecutable() : null;

  const runtimeOptions = isBun
    ? {
        executable: bunPath ?? "bun",
        executableArgs: ["--env-file=/dev/null"],
        ...(claudePath && { pathToClaudeCodeExecutable: claudePath }),
      }
    : { executable: "node", ...(claudePath && { pathToClaudeCodeExecutable: claudePath }) };

  logClaudeRuntimeDiagnostics(runtimeOptions, bunPath, claudePath);

  return runtimeOptions;
}

export function buildClaudeCodeEnv(baseEnv: NodeJS.ProcessEnv, overrides?: ClaudeAuthEnvOverrides) {
  const env: Record<string, string | undefined> = { ...baseEnv };

  // Clean all auth-related env vars - Navi provides auth explicitly
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_BASE_URL;
  delete env.NAVI_ANTHROPIC_API_KEY;
  delete env.NAVI_ANTHROPIC_BASE_URL;
  delete env.NAVI_AUTH_MODE;
  delete env.NAVI_AUTH_SOURCE;

  // Apply Navi-controlled overrides
  const apiKey = overrides?.apiKey ?? null;
  const baseUrl = overrides?.baseUrl ?? null;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;

  return env;
}

export function getNaviAuthOverridesFromEnv(env: NodeJS.ProcessEnv): ClaudeAuthEnvOverrides {
  return {
    apiKey: env.NAVI_ANTHROPIC_API_KEY ?? null,
    baseUrl: env.NAVI_ANTHROPIC_BASE_URL ?? null,
  };
}

export function resolveClaudeCodeExecutable(): string | null {
  return (
    resolveClaudeCodeFromExplicitOverride() ||
    resolveClaudeCodeFromResources() ||
    resolveClaudeCodeFromNodeModules() ||
    resolveClaudeCodeFromPathEnv() ||
    resolveClaudeCodeFromCommonPaths()
  );
}

function logClaudeRuntimeDiagnostics(
  runtimeOptions: { executable?: string; executableArgs?: string[]; pathToClaudeCodeExecutable?: string },
  bunPath: string | null,
  claudePath: string | null
) {
  if (runtimeLogged) return;
  runtimeLogged = true;

  const payload = {
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
    argv0: process.argv?.[0] ?? null,
    cwd: process.cwd(),
    bun: describePath(bunPath),
    claudeCode: describePath(claudePath),
    runtimeOptions,
  };
  const message = `[Runtime] Claude Code runtime: ${JSON.stringify(payload)}`;
  console.error(message);
  writeDebugLog(message);
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function firstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveClaudeCodeFromExplicitOverride(): string | null {
  const explicit = [
    process.env.NAVI_CLAUDE_CODE_PATH,
    process.env.CLAUDE_CODE_PATH,
    process.env.CLAUDE_CODE_EXECUTABLE,
  ]
    .filter(Boolean)
    .map((value) => expandHome(value as string));

  return firstExisting(explicit);
}

function resolveClaudeCodeFromResources(): string | null {
  const baseDirs = new Set<string>();
  if (process.execPath) baseDirs.add(dirname(process.execPath));
  if (process.argv?.[0]) baseDirs.add(dirname(process.argv[0]));

  const candidates: string[] = [];
  if (process.env.TAURI_RESOURCE_DIR) {
    const resourceDir = expandHome(process.env.TAURI_RESOURCE_DIR);
    candidates.push(join(resourceDir, "claude-agent-sdk", "cli.js"));
    candidates.push(join(resourceDir, "resources", "claude-agent-sdk", "cli.js"));
  }
  for (const base of baseDirs) {
    candidates.push(join(base, "..", "Resources", "claude-agent-sdk", "cli.js"));
    candidates.push(join(base, "..", "Resources", "resources", "claude-agent-sdk", "cli.js"));
  }

  return firstExisting(candidates);
}

function resolveClaudeCodeFromNodeModules(): string | null {
  const candidates = [
    join(__dirname, "..", "..", "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js"),
    join(process.cwd(), "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js"),
  ];

  return firstExisting(candidates);
}

function resolveClaudeCodeFromPathEnv(): string | null {
  const pathEnv = process.env.PATH || process.env.Path || process.env.path;
  if (!pathEnv) return null;
  const directories = pathEnv.split(delimiter).filter(Boolean);

  for (const dir of directories) {
    const candidates = CLAUDE_EXECUTABLE_NAMES.map((name) => join(dir, name));
    const match = firstExisting(candidates);
    if (match) return match;
  }

  return null;
}

function resolveClaudeCodeFromCommonPaths(): string | null {
  const homes = new Set<string>();
  try {
    homes.add(homedir());
  } catch {}
  if (process.env.HOME) homes.add(expandHome(process.env.HOME));
  if (process.env.USERPROFILE) homes.add(expandHome(process.env.USERPROFILE));

  const homeBases = Array.from(homes).flatMap((home) => [
    join(home, ".npm-global", "bin"),
    join(home, ".local", "bin"),
    join(home, "bin"),
  ]);
  const basePaths = [...homeBases, "/usr/local/bin", "/opt/homebrew/bin"];

  const candidates = basePaths.flatMap((base) => CLAUDE_EXECUTABLE_NAMES.map((name) => join(base, name)));
  return firstExisting(candidates);
}
