/**
 * Framework Detector
 *
 * Detects the framework/build tool used in a project and generates
 * the appropriate dev server command with port binding.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import type { DetectedFramework } from "./types";

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Detect package manager from lock files and scripts
 * We check scripts too because some projects use bun in scripts without bun.lockb
 */
function detectPackageManager(projectPath: string, scripts?: Record<string, string>): PackageManager {
  // Check lock files first (most reliable)
  if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";

  // Also check if scripts reference bun (common in monorepos that use bun)
  if (scripts) {
    const devScript = scripts.dev || scripts.start || "";
    if (devScript.includes("bun run") || devScript.includes("bun ")) {
      return "bun";
    }
  }

  return "npm";
}

/**
 * Get the run command prefix for a package manager
 */
function getRunPrefix(pm: PackageManager): string {
  switch (pm) {
    case "bun":
      return "bun run";
    case "pnpm":
      return "pnpm run";
    case "yarn":
      return "yarn";
    case "npm":
    default:
      return "npm run";
  }
}

/**
 * Get the install command for a package manager
 */
function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case "bun":
      return "bun install";
    case "pnpm":
      return "pnpm install --frozen-lockfile || pnpm install";
    case "yarn":
      return "yarn install --frozen-lockfile || yarn install";
    case "npm":
    default:
      return "npm ci || npm install";
  }
}

/**
 * Check if a config file exists
 */
function findConfigFile(
  projectPath: string,
  patterns: string[]
): string | undefined {
  for (const pattern of patterns) {
    if (existsSync(join(projectPath, pattern))) {
      return pattern;
    }
  }
  return undefined;
}

/**
 * Framework detection rules
 */
interface FrameworkRule {
  name: string;
  configFiles: string[];
  dependencies: string[];
  defaultPort: number;
  getDevCommand: (pm: PackageManager, port: number) => string;
}

const FRAMEWORK_RULES: FrameworkRule[] = [
  {
    name: "next",
    configFiles: ["next.config.ts", "next.config.js", "next.config.mjs"],
    dependencies: ["next"],
    defaultPort: 3000,
    getDevCommand: (pm, port) =>
      `${getRunPrefix(pm)} dev -- -H 0.0.0.0 -p ${port}`,
  },
  {
    name: "nuxt",
    configFiles: ["nuxt.config.ts", "nuxt.config.js"],
    dependencies: ["nuxt"],
    defaultPort: 3000,
    getDevCommand: (pm, port) =>
      `${getRunPrefix(pm)} dev -- --host 0.0.0.0 --port ${port}`,
  },
  {
    name: "sveltekit",
    configFiles: ["svelte.config.js"],
    dependencies: ["@sveltejs/kit"],
    defaultPort: 5173,
    getDevCommand: (pm, port) =>
      `${getRunPrefix(pm)} dev -- --host 0.0.0.0 --port ${port}`,
  },
  {
    name: "astro",
    configFiles: ["astro.config.mjs", "astro.config.ts", "astro.config.js"],
    dependencies: ["astro"],
    defaultPort: 4321,
    getDevCommand: (pm, port) =>
      `${getRunPrefix(pm)} dev -- --host 0.0.0.0 --port ${port}`,
  },
  {
    name: "remix",
    configFiles: ["remix.config.js"],
    dependencies: ["@remix-run/react", "@remix-run/dev"],
    defaultPort: 3000,
    getDevCommand: (pm, port) => `PORT=${port} ${getRunPrefix(pm)} dev`,
  },
  {
    name: "vite",
    configFiles: [
      "vite.config.ts",
      "vite.config.js",
      "vite.config.mjs",
      "vitest.config.ts",
    ],
    dependencies: ["vite"],
    defaultPort: 5173,
    getDevCommand: (pm, port) =>
      `${getRunPrefix(pm)} dev -- --host 0.0.0.0 --port ${port}`,
  },
  {
    name: "cra",
    configFiles: [],
    dependencies: ["react-scripts"],
    defaultPort: 3000,
    getDevCommand: (pm, port) =>
      `PORT=${port} HOST=0.0.0.0 ${getRunPrefix(pm)} start`,
  },
  {
    name: "angular",
    configFiles: ["angular.json"],
    dependencies: ["@angular/core"],
    defaultPort: 4200,
    getDevCommand: (pm, port) =>
      `${getRunPrefix(pm)} start -- --host 0.0.0.0 --port ${port}`,
  },
  {
    name: "vue-cli",
    configFiles: ["vue.config.js"],
    dependencies: ["@vue/cli-service"],
    defaultPort: 8080,
    getDevCommand: (pm, port) =>
      `${getRunPrefix(pm)} serve -- --host 0.0.0.0 --port ${port}`,
  },
];

/**
 * Detect framework from config files and dependencies
 */
function detectFrameworkType(
  projectPath: string,
  deps: Record<string, string>
): FrameworkRule | null {
  // First check config files (more reliable)
  for (const rule of FRAMEWORK_RULES) {
    if (rule.configFiles.length > 0) {
      const configFile = findConfigFile(projectPath, rule.configFiles);
      if (configFile) {
        return rule;
      }
    }
  }

  // Fallback to dependency detection
  for (const rule of FRAMEWORK_RULES) {
    for (const dep of rule.dependencies) {
      if (deps[dep]) {
        return rule;
      }
    }
  }

  return null;
}

/**
 * Main framework detection function
 * @param projectPath - Path to the project
 * @param forContainer - If true, forces npm as package manager (for Alpine containers)
 */
export async function detectFramework(
  projectPath: string,
  forContainer = false
): Promise<DetectedFramework> {
  const packageJsonPath = join(projectPath, "package.json");

  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `No package.json found at ${projectPath}. Not a Node.js project.`
    );
  }

  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  } catch (error) {
    throw new Error(`Invalid package.json at ${projectPath}`);
  }

  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const scripts = packageJson.scripts || {};

  // Detect package manager - pass scripts so we detect bun usage in monorepos
  const pm = detectPackageManager(projectPath, scripts);

  // Detect framework
  const frameworkRule = detectFrameworkType(projectPath, deps);
  const port = 3000; // Standard port inside container

  if (frameworkRule) {
    const configFile = findConfigFile(projectPath, frameworkRule.configFiles);
    return {
      name: frameworkRule.name,
      packageManager: pm,
      devCommand: frameworkRule.getDevCommand(pm, port),
      installCommand: getInstallCommand(pm),
      defaultPort: port,
      configFile,
    };
  }

  // Generic fallback - check for common dev scripts
  const devScriptNames = ["dev", "start", "serve", "develop"];
  let devScript: string | undefined;

  for (const name of devScriptNames) {
    if (scripts[name]) {
      devScript = name;
      break;
    }
  }

  if (!devScript) {
    throw new Error(
      `No dev script found in package.json. Expected one of: ${devScriptNames.join(", ")}`
    );
  }

  // Generic command with PORT env var
  return {
    name: "generic",
    packageManager: pm,
    devCommand: `PORT=${port} HOST=0.0.0.0 ${getRunPrefix(pm)} ${devScript}`,
    installCommand: getInstallCommand(pm),
    defaultPort: port,
  };
}

/**
 * Get a human-readable description of detected framework
 */
export function describeFramework(framework: DetectedFramework): string {
  const parts = [framework.name];

  if (framework.configFile) {
    parts.push(`(${framework.configFile})`);
  }

  parts.push(`with ${framework.packageManager}`);

  return parts.join(" ");
}
