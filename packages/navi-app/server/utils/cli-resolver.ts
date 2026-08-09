import { existsSync } from "fs";
import { homedir } from "os";
import { basename, delimiter, dirname, join, sep } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type ResolveCliExecutableOptions = {
  command: string;
  envVarNames?: string[];
  executableNames?: string[];
  packageName?: string;
  packageBinPath?: string;
  additionalCandidates?: string[];
  appRoots?: string[];
  /** Search PATH and common install dirs before the bundled node_modules copy. */
  preferInstalled?: boolean;
};

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

export function firstExisting(paths: Array<string | null | undefined>): string | null {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

export function executableNamesFor(command: string): string[] {
  if (process.platform !== "win32") return [command];
  return [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command];
}

function addRoot(roots: Set<string>, value: string | null | undefined) {
  if (!value) return;
  roots.add(expandHome(value));
}

export function getNaviAppRootCandidates(extraRoots: string[] = []): string[] {
  const roots = new Set<string>();

  for (const root of extraRoots) addRoot(roots, root);
  addRoot(roots, process.env.NAVI_APP_DIR);

  // server/utils -> server -> app root
  addRoot(roots, join(__dirname, "..", ".."));

  if (process.cwd()) addRoot(roots, process.cwd());
  if (process.argv?.[1]) {
    addRoot(roots, dirname(process.argv[1]));
    addRoot(roots, join(dirname(process.argv[1]), ".."));
  }

  return Array.from(roots);
}

function packagePathSegments(packageName: string): string[] {
  return packageName.split("/").filter(Boolean);
}

function resolveFromExplicitEnv(envVarNames: string[] = []): string | null {
  return firstExisting(
    envVarNames
      .map((name) => process.env[name])
      .filter(Boolean)
      .map((value) => expandHome(value as string))
  );
}

export function resolveExplicitExecutable(envVarNames: string[] = []): string | null {
  return resolveFromExplicitEnv(envVarNames);
}

function resolveFromAppNodeModules(options: ResolveCliExecutableOptions): string | null {
  const executableNames = options.executableNames ?? executableNamesFor(options.command);
  const roots = getNaviAppRootCandidates(options.appRoots);
  const candidates: string[] = [];

  for (const root of roots) {
    if (options.packageName && options.packageBinPath) {
      candidates.push(
        join(root, "node_modules", ...packagePathSegments(options.packageName), options.packageBinPath)
      );
    }

    for (const name of executableNames) {
      candidates.push(join(root, "node_modules", ".bin", name));
    }
  }

  return firstExisting(candidates);
}

function resolveFromPathEnv(
  executableNames: string[],
  { skipNodeModules = false }: { skipNodeModules?: boolean } = {}
): string | null {
  const pathEnv = process.env.PATH || process.env.Path || process.env.path;
  if (!pathEnv) return null;

  let directories = pathEnv.split(delimiter).filter(Boolean);
  // Bun and npm put node_modules/.bin on PATH, so "search PATH" would otherwise
  // find the very bundled shim the caller asked to look past.
  if (skipNodeModules) {
    directories = directories.filter((dir) => !dir.split(sep).includes("node_modules"));
  }
  const candidates = directories.flatMap((dir) =>
    executableNames.map((name) => join(dir, name))
  );
  return firstExisting(candidates);
}

function resolveFromCommonPaths(executableNames: string[]): string | null {
  const homes = new Set<string>();
  try {
    homes.add(homedir());
  } catch {}
  if (process.env.HOME) homes.add(expandHome(process.env.HOME));
  if (process.env.USERPROFILE) homes.add(expandHome(process.env.USERPROFILE));

  const homeBases = Array.from(homes).flatMap((home) => [
    join(home, ".bun", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".local", "bin"),
    join(home, "bin"),
  ]);

  const basePaths = [...homeBases, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  const candidates = basePaths.flatMap((base) =>
    executableNames.map((name) => join(base, name))
  );
  return firstExisting(candidates);
}

export function resolveCliExecutable(options: ResolveCliExecutableOptions): string | null {
  const executableNames = options.executableNames ?? executableNamesFor(options.command);

  // preferInstalled: search the user's own install before the copy bundled into
  // node_modules. Worth it for CLIs whose bundled copy is version-pinned or
  // unsigned; the bundle stays as the fallback for machines without one.
  const bundled = () => resolveFromAppNodeModules(options);
  const installed = () =>
    resolveFromPathEnv(executableNames, { skipNodeModules: options.preferInstalled }) ||
    resolveFromCommonPaths(executableNames);

  return (
    resolveFromExplicitEnv(options.envVarNames) ||
    firstExisting(options.additionalCandidates?.map(expandHome) ?? []) ||
    (options.preferInstalled ? installed() || bundled() : bundled() || installed())
  );
}

export function resolveNodeExecutable(): string | null {
  const execPathBase = basename(process.execPath || "").toLowerCase();
  const execPath =
    ["node", "node.exe"].includes(execPathBase) && existsSync(process.execPath)
      ? process.execPath
      : null;

  return (
    resolveFromExplicitEnv(["NAVI_NODE_PATH", "NODE_EXECUTABLE"]) ||
    execPath ||
    resolveCliExecutable({
      command: "node",
      executableNames: executableNamesFor("node"),
    })
  );
}

export function buildEnvWithPrependedPath(
  baseEnv: NodeJS.ProcessEnv,
  directories: Array<string | null | undefined>
): NodeJS.ProcessEnv {
  const existingPath = baseEnv.PATH || baseEnv.Path || baseEnv.path || "";
  const prefix = directories.filter(Boolean) as string[];
  const pathValue = Array.from(
    new Set([...prefix, ...existingPath.split(delimiter).filter(Boolean)])
  ).join(delimiter);

  return {
    ...baseEnv,
    PATH: pathValue,
  };
}
