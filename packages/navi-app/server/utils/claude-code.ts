import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { delimiter, dirname, extname, join } from "path";
import { spawn as spawnChildProcess, spawnSync } from "node:child_process";
import { fileURLToPath } from "url";
import { resolveBunExecutable } from "./bun";
import {
  firstExisting as firstExistingCli,
  getNaviAppRootCandidates,
  resolveNodeExecutable,
} from "./cli-resolver";
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
  authToken?: string | null;
  baseUrl?: string | null;
  apiTimeoutMs?: string | null;
};

type ClaudeCodeRuntimeOptions = {
  // Must stay assignable to the SDK's Options["executable"].
  executable?: "bun" | "node" | "deno";
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
        const nodePath = resolveNodeExecutable() ?? "node";
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
          nodePath,
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
      // The SDK only accepts a runtime *name* here, not a path. When we know
      // which bun to use, swap it in at spawn time so a bun that isn't on PATH
      // still works.
      executable: "bun",
      executableArgs: ["--env-file=/dev/null"],
      ...(bunPath && {
        spawnClaudeCodeProcess: ({ command, args, cwd, env, signal }) =>
          spawnChildProcess(command === "bun" ? bunPath : command, args, {
            cwd,
            env,
            stdio: ["pipe", "pipe", "pipe"],
            signal,
            windowsHide: true,
          }),
      }),
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
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;

  // Apply Navi-controlled overrides
  const apiKey = overrides?.apiKey ?? null;
  const authToken = overrides?.authToken ?? null;
  const baseUrl = overrides?.baseUrl ?? null;
  const apiTimeoutMs = overrides?.apiTimeoutMs ?? null;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (authToken) env.ANTHROPIC_AUTH_TOKEN = authToken;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (apiTimeoutMs) env.API_TIMEOUT_MS = apiTimeoutMs;

  return env;
}

export function getNaviAuthOverridesFromEnv(env: NodeJS.ProcessEnv): ClaudeAuthEnvOverrides {
  return {
    apiKey: env.NAVI_ANTHROPIC_API_KEY ?? null,
    authToken: env.NAVI_ANTHROPIC_AUTH_TOKEN ?? null,
    baseUrl: env.NAVI_ANTHROPIC_BASE_URL ?? null,
    apiTimeoutMs: env.NAVI_API_TIMEOUT_MS ?? null,
  };
}

export function resolveClaudeCodeExecutable(): string | null {
  return (
    resolveClaudeCodeFromExplicitOverride() ||
    resolveClaudeCodeFromNaviPackage() ||
    resolveClaudeCodeFromCommonPaths() ||
    resolveClaudeCodeFromPathEnv() ||
    resolveClaudeCodeFromBundledOverride() ||
    resolveClaudeCodeFromResources() ||
    resolveClaudeCodeFromNodeModules()
  );
}

function detectMuslRuntime(): boolean {
  if (process.platform !== "linux") return false;
  const report =
    typeof process.report?.getReport === "function"
      ? process.report.getReport()
      : null;
  return report != null && report.header?.glibcVersionRuntime === undefined;
}

function getClaudeCodePlatformPackage(): { packageName: string; binName: string } | null {
  let cpu = process.arch;

  if (process.platform === "darwin" && cpu === "x64") {
    const result = spawnSync("sysctl", ["-n", "sysctl.proc_translated"], {
      encoding: "utf-8",
    });
    if (result.stdout?.trim() === "1") {
      cpu = "arm64";
    }
  }

  const suffix =
    process.platform === "linux"
      ? `${process.platform}-${cpu}${detectMuslRuntime() ? "-musl" : ""}`
      : `${process.platform}-${cpu}`;

  const supported = new Set([
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-arm64-musl",
    "linux-x64",
    "linux-x64-musl",
    "win32-arm64",
    "win32-x64",
  ]);

  if (!supported.has(suffix)) return null;

  return {
    packageName: `@anthropic-ai/claude-code-${suffix}`,
    binName: process.platform === "win32" ? "claude.exe" : "claude",
  };
}

function isClaudeCodePlaceholder(path: string): boolean {
  try {
    const stats = statSync(path);
    if (stats.size > 4096) return false;
    return readFileSync(path, "utf-8").includes("native binary not installed");
  } catch {
    return false;
  }
}

function resolveClaudeCodeFromNaviPackage(): string | null {
  const roots = getNaviAppRootCandidates();
  const platformPackage = getClaudeCodePlatformPackage();

  if (platformPackage) {
    const nativePath = firstExistingCli(
      roots.map((root) =>
        join(
          root,
          "node_modules",
          ...platformPackage.packageName.split("/").filter(Boolean),
          platformPackage.binName
        )
      )
    );
    if (nativePath) return nativePath;
  }

  const wrapperPath = firstExistingCli(
    roots.map((root) =>
      join(root, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")
    )
  );

  if (wrapperPath && !isClaudeCodePlaceholder(wrapperPath)) {
    return wrapperPath;
  }

  return null;
}

export function getClaudeCodeCommonSearchBases(homeCandidates?: Array<string | null | undefined>): string[] {
  const homes = new Set<string>();
  const candidates = homeCandidates ?? [
    (() => {
      try {
        return homedir();
      } catch {
        return null;
      }
    })(),
    process.env.HOME,
    process.env.USERPROFILE,
  ];

  for (const home of candidates) {
    if (home) homes.add(expandHome(home));
  }

  const homeBases = Array.from(homes).flatMap((home) => [
    join(home, ".claude", "local"),
    join(home, ".claude", "local", "node_modules", ".bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".local", "bin"),
    join(home, "bin"),
  ]);

  return [...homeBases, "/usr/local/bin", "/opt/homebrew/bin"];
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
  const basePaths = getClaudeCodeCommonSearchBases();
  const candidates = basePaths.flatMap((base) => CLAUDE_EXECUTABLE_NAMES.map((name) => join(base, name)));
  return firstExisting(candidates);
}
