import { existsSync } from "fs";
import { homedir } from "os";
import { delimiter, dirname, extname, join } from "path";
import { spawn as spawnChildProcess } from "node:child_process";
import { fileURLToPath } from "url";
import { resolveBunExecutable } from "./bun";
import { describePath, writeDebugLog } from "./logging";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLAUDE_EXECUTABLE_NAMES = process.platform === "win32"
  ? ["claude.exe", "claude.cmd", "claude.bat", "claude"]
  : ["claude"];
const NATIVE_CLAUDE_INLINE_BRIDGE_SCRIPT = [
  'const { spawn } = require("node:child_process");',
  "const nativeClaudePath = process.argv[1];",
  "const claudeArgs = process.argv.slice(2);",
  'const child = spawn(nativeClaudePath, claudeArgs, { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });',
  'process.stdin.resume();',
  'process.stdin.on("data", (chunk) => child.stdin.write(chunk));',
  'process.stdin.on("end", () => child.stdin.end());',
  'child.stdout.on("data", (chunk) => process.stdout.write(chunk));',
  'child.stderr.on("data", (chunk) => process.stderr.write(chunk));',
  'child.on("error", (error) => { process.stderr.write(`[Navi Claude Bridge] ${error.message}\\n`); process.exit(1); });',
  'child.on("exit", (code, signal) => { if (signal) { process.kill(process.pid, signal); return; } process.exit(code ?? 0); });',
].join("\n");

let runtimeLogged = false;
const CLAUDE_SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".tsx", ".ts", ".jsx"]);

export type ClaudeAuthEnvOverrides = {
  apiKey?: string | null;
  baseUrl?: string | null;
};

type ClaudeCodeRuntimeOptions = {
  executable?: string;
  executableArgs?: string[];
  pathToClaudeCodeExecutable?: string;
  spawnClaudeCodeProcess?: (options: {
    command: string;
    args: string[];
    cwd?: string;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  }) => ReturnType<typeof spawnChildProcess>;
};

export function isScriptClaudeCodeExecutable(path: string | null | undefined): boolean {
  if (!path) return false;
  return CLAUDE_SCRIPT_EXTENSIONS.has(extname(path).toLowerCase());
}

export function buildClaudeCodeRuntimeOptions(inputs: {
  isBun: boolean;
  bunPath: string | null;
  claudePath: string | null;
}): ClaudeCodeRuntimeOptions {
  const { isBun, bunPath, claudePath } = inputs;

  if (claudePath && !isScriptClaudeCodeExecutable(claudePath)) {
    return {
      pathToClaudeCodeExecutable: claudePath,
      spawnClaudeCodeProcess: ({ args, cwd, env, signal }) => {
        const bridgeEnv = { ...env };
        delete bridgeEnv.CLAUDE_CODE_ENTRYPOINT;

        const sanitizedArgs: string[] = [];
        for (let index = 0; index < args.length; index++) {
          const arg = args[index];
          const nextArg = args[index + 1];
          if (arg === "--setting-sources" && nextArg === "") {
            index++;
            continue;
          }
          if (arg === "--permission-mode" && nextArg === "default") {
            index++;
            continue;
          }
          sanitizedArgs.push(arg);
        }

        return spawnChildProcess(
          "node",
          ["-e", NATIVE_CLAUDE_INLINE_BRIDGE_SCRIPT, claudePath, ...sanitizedArgs],
          {
            cwd,
            env: bridgeEnv,
            stdio: ["pipe", "pipe", "pipe"],
            signal,
            windowsHide: true,
          }
        );
      },
    };
  }

  if (isBun) {
    return {
      executable: bunPath ?? "bun",
      executableArgs: ["--env-file=/dev/null"],
      ...(claudePath && { pathToClaudeCodeExecutable: claudePath }),
    };
  }

  return { executable: "node", ...(claudePath && { pathToClaudeCodeExecutable: claudePath }) };
}

export function getClaudeCodeRuntimeOptions(): ClaudeCodeRuntimeOptions {
  const isBun = Boolean((process as any)?.versions?.bun);

  const claudePath = resolveClaudeCodeExecutable();
  const bunPath = isBun ? resolveBunExecutable() : null;

  const runtimeOptions = buildClaudeCodeRuntimeOptions({
    isBun,
    bunPath,
    claudePath,
  });

  logClaudeRuntimeDiagnostics(runtimeOptions, bunPath, claudePath);

  return runtimeOptions;
}

export function buildClaudeCodeEnv(baseEnv: NodeJS.ProcessEnv, overrides?: ClaudeAuthEnvOverrides) {
  const env: Record<string, string | undefined> = { ...baseEnv };

  // Strip Navi-specific env so Claude only sees a clean execution context.
  for (const key of Object.keys(env)) {
    if (key.startsWith("NAVI_")) {
      delete env[key];
    }
  }

  // Clean auth-related env vars - Navi provides auth explicitly when needed.
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_BASE_URL;

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
    resolveClaudeCodeFromCommonPaths() ||
    resolveClaudeCodeFromPathEnv() ||
    resolveClaudeCodeFromBundledOverride() ||
    resolveClaudeCodeFromResources() ||
    resolveClaudeCodeFromNodeModules()
  );
}

function logClaudeRuntimeDiagnostics(
  runtimeOptions: ClaudeCodeRuntimeOptions,
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
    usesSpawnBridge: Boolean(runtimeOptions.spawnClaudeCodeProcess),
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
    process.env.CLAUDE_CODE_PATH,
    process.env.CLAUDE_CODE_EXECUTABLE,
    process.env.NAVI_CLAUDE_CODE_PATH,
  ]
    .filter(Boolean)
    .map((value) => expandHome(value as string));

  return firstExisting(explicit);
}

function resolveClaudeCodeFromBundledOverride(): string | null {
  const bundled = [
    process.env.NAVI_BUNDLED_CLAUDE_CODE_PATH,
  ]
    .filter(Boolean)
    .map((value) => expandHome(value as string));

  return firstExisting(bundled);
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
