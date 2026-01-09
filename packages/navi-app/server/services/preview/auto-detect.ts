/**
 * Auto-Detection Service for Preview Configuration
 *
 * Automatically detects project structure and generates preview configuration
 * without requiring any manual spec files. Stores detected config in database.
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import type { PreviewSpec } from "./spec";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

interface DetectedProject {
  type: "monorepo" | "single";
  packageManager: "bun" | "npm" | "yarn" | "pnpm";
  framework?: string;
  mainPackage?: string; // For monorepos: which package is the main app
  devPort: number;
  hasBackend: boolean;
  backendPort?: number;
}

/**
 * Detect package manager from lock files
 */
function detectPackageManager(projectPath: string): "bun" | "npm" | "yarn" | "pnpm" {
  if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Check if project is a monorepo
 */
function isMonorepo(projectPath: string, packageJson: PackageJson): boolean {
  // Check for workspaces field
  if (packageJson.workspaces) return true;

  // Check for common monorepo directories
  const monorepoIndicators = ["packages", "apps", "libs", "modules"];
  for (const dir of monorepoIndicators) {
    const dirPath = join(projectPath, dir);
    if (existsSync(dirPath)) {
      // Check if it contains package.json files
      try {
        const entries = readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (existsSync(join(dirPath, entry.name, "package.json"))) {
              return true;
            }
          }
        }
      } catch {}
    }
  }

  // Check for lerna.json or turbo.json
  if (existsSync(join(projectPath, "lerna.json"))) return true;
  if (existsSync(join(projectPath, "turbo.json"))) return true;
  if (existsSync(join(projectPath, "pnpm-workspace.yaml"))) return true;

  return false;
}

/**
 * Find the main app package in a monorepo
 */
function findMainPackage(projectPath: string): { name: string; path: string; relativePath: string } | null {
  const searchDirs = ["packages", "apps"];
  const appIndicators = ["app", "web", "client", "frontend", "main", "navi-app"];

  for (const searchDir of searchDirs) {
    const searchPath = join(projectPath, searchDir);
    if (!existsSync(searchPath)) continue;

    try {
      const entries = readdirSync(searchPath, { withFileTypes: true });

      // First pass: look for common app names
      for (const indicator of appIndicators) {
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.toLowerCase().includes(indicator)) {
            const pkgPath = join(searchPath, entry.name);
            if (existsSync(join(pkgPath, "package.json"))) {
              return {
                name: entry.name,
                path: pkgPath,
                relativePath: `${searchDir}/${entry.name}`,
              };
            }
          }
        }
      }

      // Second pass: look for package with vite/next/sveltekit config
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pkgPath = join(searchPath, entry.name);
        const hasVite = existsSync(join(pkgPath, "vite.config.ts")) || existsSync(join(pkgPath, "vite.config.js"));
        const hasNext = existsSync(join(pkgPath, "next.config.js")) || existsSync(join(pkgPath, "next.config.ts"));
        const hasSvelte = existsSync(join(pkgPath, "svelte.config.js"));

        if (hasVite || hasNext || hasSvelte) {
          return {
            name: entry.name,
            path: pkgPath,
            relativePath: `${searchDir}/${entry.name}`,
          };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Detect framework from config files and dependencies
 */
function detectFramework(pkgPath: string, packageJson: PackageJson): string {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  // Check config files
  if (existsSync(join(pkgPath, "next.config.js")) || existsSync(join(pkgPath, "next.config.ts"))) return "next";
  if (existsSync(join(pkgPath, "nuxt.config.ts")) || existsSync(join(pkgPath, "nuxt.config.js"))) return "nuxt";
  if (existsSync(join(pkgPath, "svelte.config.js"))) return "sveltekit";
  if (existsSync(join(pkgPath, "astro.config.mjs"))) return "astro";
  if (existsSync(join(pkgPath, "vite.config.ts")) || existsSync(join(pkgPath, "vite.config.js"))) return "vite";

  // Check dependencies
  if (deps?.["next"]) return "next";
  if (deps?.["nuxt"]) return "nuxt";
  if (deps?.["@sveltejs/kit"]) return "sveltekit";
  if (deps?.["astro"]) return "astro";
  if (deps?.["vite"]) return "vite";
  if (deps?.["react-scripts"]) return "cra";

  return "generic";
}

/**
 * Detect default port for framework
 */
function getDefaultPort(framework: string): number {
  const ports: Record<string, number> = {
    next: 3000,
    nuxt: 3000,
    vite: 5173,
    sveltekit: 5173,
    astro: 4321,
    cra: 3000,
    generic: 3000,
  };
  return ports[framework] || 3000;
}

/**
 * Check if project has a backend/server component
 */
function hasBackendServer(pkgPath: string, packageJson: PackageJson): boolean {
  const scripts = packageJson.scripts || {};

  // Check for server script
  if (scripts.server || scripts["start:server"] || scripts["dev:server"]) return true;

  // Check for server directory
  if (existsSync(join(pkgPath, "server"))) return true;
  if (existsSync(join(pkgPath, "src", "server"))) return true;
  if (existsSync(join(pkgPath, "api"))) return true;

  return false;
}

/**
 * Auto-detect project structure and generate preview config
 */
export async function autoDetectPreviewConfig(projectPath: string): Promise<PreviewSpec> {
  const packageJsonPath = join(projectPath, "package.json");

  if (!existsSync(packageJsonPath)) {
    throw new Error(`No package.json found at ${projectPath}`);
  }

  const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const pm = detectPackageManager(projectPath);
  const isMonorepoProject = isMonorepo(projectPath, packageJson);

  let workdir = "/app";
  let framework = "generic";
  let devPort = 3000;
  let hasBackend = false;
  let backendPort = 3001;
  let installCmd = pm === "bun" ? "bun install --ignore-scripts" : `${pm} install`;
  let devCmd = "";
  let setupCmds: string[] = [];

  if (isMonorepoProject) {
    // Monorepo: find main app package
    const mainPkg = findMainPackage(projectPath);

    if (mainPkg) {
      const mainPkgJson: PackageJson = JSON.parse(
        readFileSync(join(mainPkg.path, "package.json"), "utf-8")
      );

      framework = detectFramework(mainPkg.path, mainPkgJson);
      devPort = getDefaultPort(framework);
      hasBackend = hasBackendServer(mainPkg.path, mainPkgJson);
      workdir = `/app/${mainPkg.relativePath}`;

      // For monorepos, we need to install from root but run from package
      if (pm === "bun") {
        // Bun monorepos often need rollup native bindings
        setupCmds.push("bun add @rollup/rollup-linux-arm64-musl --optional || true");
      }

      // Build dev command based on what's available
      const scripts = mainPkgJson.scripts || {};
      if (hasBackend && scripts.server) {
        // Run backend in background, then frontend
        devCmd = `(${pm === "bun" ? "bun run" : `${pm} run`} server &) && sleep 3 && ${pm === "bun" ? "bun run" : `${pm} run`} dev -- --host 0.0.0.0 --port ${devPort}`;
        backendPort = 3000; // Default backend port
        devPort = 1420; // Move frontend to different port
      } else if (scripts.dev) {
        devCmd = `${pm === "bun" ? "bun run" : `${pm} run`} dev -- --host 0.0.0.0 --port ${devPort}`;
      } else if (scripts.start) {
        devCmd = `${pm === "bun" ? "bun run" : `${pm} run`} start`;
      }
    }
  } else {
    // Single package project
    framework = detectFramework(projectPath, packageJson);
    devPort = getDefaultPort(framework);
    hasBackend = hasBackendServer(projectPath, packageJson);

    const scripts = packageJson.scripts || {};

    // Build dev command
    if (scripts.dev) {
      devCmd = `${pm === "bun" ? "bun run" : `${pm} run`} dev -- --host 0.0.0.0 --port ${devPort}`;
    } else if (scripts.start) {
      devCmd = `${pm === "bun" ? "bun run" : `${pm} run`} start`;
    }
  }

  // Determine image
  const image = pm === "bun" ? "oven/bun:alpine" : "node:20-alpine";

  // Build final spec
  const spec: PreviewSpec = {
    version: "1",
    image,
    ports: {
      primary: {
        container: devPort,
        description: `${framework} dev server`,
      },
    },
    commands: {
      install: installCmd,
      setup: setupCmds.length > 0 ? setupCmds : undefined,
      dev: devCmd || `${pm === "bun" ? "bun run" : `${pm} run`} dev`,
    },
    workdir,
    env: {
      NODE_ENV: "development",
      HOST: "0.0.0.0",
    },
    healthCheck: {
      port: devPort,
      path: "/",
      timeout: 180,
    },
    resources: {
      memory: "2g",
      cpus: 2,
    },
  };

  // Add backend port if detected
  if (hasBackend) {
    spec.ports!.backend = {
      container: backendPort,
      description: "Backend API server",
    };
  }

  return spec;
}

/**
 * Get preview config for a project - either from DB cache or auto-detect
 */
export async function getOrDetectPreviewConfig(
  projectPath: string,
  cachedConfig?: string | null
): Promise<PreviewSpec> {
  // If cached config exists, use it
  if (cachedConfig) {
    try {
      return JSON.parse(cachedConfig) as PreviewSpec;
    } catch {
      // Invalid cached config, re-detect
    }
  }

  // Check for manual spec file (override)
  const specPath = join(projectPath, ".navi", "preview.json");
  if (existsSync(specPath)) {
    try {
      return JSON.parse(readFileSync(specPath, "utf-8")) as PreviewSpec;
    } catch {}
  }

  // Auto-detect
  return autoDetectPreviewConfig(projectPath);
}
