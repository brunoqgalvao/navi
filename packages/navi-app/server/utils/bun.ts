import { existsSync } from "fs";
import { basename, delimiter, dirname, join } from "path";
import { homedir } from "os";

const EXECUTABLE_NAMES = process.platform === "win32" ? ["bun.exe", "bun"] : ["bun"];

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

function resolveFromExplicitOverride(): string | null {
  const explicit = [process.env.NAVI_BUN_PATH]
    .filter(Boolean)
    .map((value) => expandHome(value as string));

  return firstExisting(explicit);
}

function resolveFromSystemEnv(): string | null {
  const explicit = [process.env.BUN_PATH, process.env.BUN_EXECUTABLE]
    .filter(Boolean)
    .map((value) => expandHome(value as string));

  const explicitMatch = firstExisting(explicit);
  if (explicitMatch) return explicitMatch;

  const bunInstall = process.env.BUN_INSTALL || process.env.BUN_HOME;
  if (bunInstall) {
    const base = expandHome(bunInstall);
    const candidates = EXECUTABLE_NAMES.map((name) => join(base, "bin", name));
    const match = firstExisting(candidates);
    if (match) return match;
  }

  return null;
}

function resolveFromExecPath(): string | null {
  if (!process.versions?.bun) return null;
  const execPath = process.execPath;
  if (!execPath) return null;
  const base = basename(execPath).toLowerCase();
  if (EXECUTABLE_NAMES.includes(base) && existsSync(execPath)) {
    return execPath;
  }
  return null;
}

function resolveFromPathEnv(): string | null {
  const pathEnv = process.env.PATH || process.env.Path || process.env.path;
  if (!pathEnv) return null;
  const directories = pathEnv.split(delimiter).filter(Boolean);
  for (const dir of directories) {
    const candidates = EXECUTABLE_NAMES.map((name) => join(dir, name));
    const match = firstExisting(candidates);
    if (match) return match;
  }
  return null;
}

function resolveFromCommonPaths(): string | null {
  const homes = new Set<string>();
  try {
    homes.add(homedir());
  } catch {}
  if (process.env.HOME) homes.add(expandHome(process.env.HOME));
  if (process.env.USERPROFILE) homes.add(expandHome(process.env.USERPROFILE));

  const homeBases = Array.from(homes).flatMap((home) => [
    join(home, ".bun", "bin"),
    join(home, ".local", "bin"),
    join(home, "bin"),
  ]);
  const basePaths = [
    ...homeBases,
  ];
  const candidates = basePaths.flatMap((base) => EXECUTABLE_NAMES.map((name) => join(base, name)));
  return firstExisting(candidates);
}

function resolveFromSidecar(): string | null {
  const baseDirs = new Set<string>();
  if (process.execPath) baseDirs.add(dirname(process.execPath));
  if (process.argv?.[0]) baseDirs.add(dirname(process.argv[0]));

  const candidates = Array.from(baseDirs).flatMap((execDir) => [
    execDir,
    join(execDir, "..", "Resources"),
    join(execDir, "..", "Resources", "bun"),
  ].flatMap((base) => EXECUTABLE_NAMES.map((name) => join(base, name))));

  return firstExisting(candidates);
}

export function resolveBunExecutable(): string | null {
  return (
    resolveFromExplicitOverride() ||
    resolveFromSidecar() ||
    resolveFromSystemEnv() ||
    resolveFromExecPath() ||
    resolveFromPathEnv() ||
    resolveFromCommonPaths()
  );
}
