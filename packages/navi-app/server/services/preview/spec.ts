/**
 * Preview Spec
 *
 * Schema for .navi/preview.json configuration files.
 * Allows projects to define custom preview configurations for complex setups.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Port configuration for a service
 */
export interface PortConfig {
  /** Port inside container */
  container: number;
  /** Description of what this port is for */
  description?: string;
}

/**
 * Preview specification schema
 * Stored in .navi/preview.json at project root
 */
export interface PreviewSpec {
  /** Schema version */
  version: "1";

  /** Docker image to use (e.g., "oven/bun:alpine", "node:20-alpine") */
  image?: string;

  /** Ports to expose (key = name, value = port config) */
  ports?: {
    /** Primary port - this is what the preview URL will point to */
    primary?: PortConfig;
    /** Additional ports (e.g., backend API) */
    [key: string]: PortConfig | undefined;
  };

  /** Commands to run */
  commands?: {
    /** Install dependencies (default: auto-detected from package manager) */
    install?: string;
    /** Commands to run after install but before dev server */
    setup?: string[];
    /** Start the dev server (default: auto-detected) */
    dev?: string;
  };

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Working directory inside container (default: /app) */
  workdir?: string;

  /** Health check configuration */
  healthCheck?: {
    /** Port to check */
    port: number;
    /** Path to check (default: /) */
    path?: string;
    /** Timeout in seconds (default: 120) */
    timeout?: number;
  };

  /** Resource limits */
  resources?: {
    /** Memory limit (e.g., "2g", "512m") */
    memory?: string;
    /** CPU limit (e.g., 2, 0.5) */
    cpus?: number;
  };
}

/**
 * Default preview spec
 */
export const DEFAULT_PREVIEW_SPEC: PreviewSpec = {
  version: "1",
  ports: {
    primary: { container: 3000, description: "Dev server" },
  },
};

/**
 * Load preview spec from project
 * Checks both .navi/preview.json and navi.preview.json at root
 */
export function loadPreviewSpec(projectPath: string): PreviewSpec | null {
  // Check .navi/preview.json first
  const naviDirPath = join(projectPath, ".navi", "preview.json");
  if (existsSync(naviDirPath)) {
    try {
      const content = readFileSync(naviDirPath, "utf-8");
      const spec = JSON.parse(content) as PreviewSpec;
      console.log(`[Preview] Loaded spec from ${naviDirPath}`);
      return validateSpec(spec);
    } catch (e: any) {
      console.error(`[Preview] Failed to parse ${naviDirPath}: ${e.message}`);
    }
  }

  // Check navi.preview.json at root
  const rootPath = join(projectPath, "navi.preview.json");
  if (existsSync(rootPath)) {
    try {
      const content = readFileSync(rootPath, "utf-8");
      const spec = JSON.parse(content) as PreviewSpec;
      console.log(`[Preview] Loaded spec from ${rootPath}`);
      return validateSpec(spec);
    } catch (e: any) {
      console.error(`[Preview] Failed to parse ${rootPath}: ${e.message}`);
    }
  }

  return null;
}

/**
 * Validate and normalize preview spec
 */
function validateSpec(spec: PreviewSpec): PreviewSpec {
  // Ensure version is set
  if (!spec.version) {
    spec.version = "1";
  }

  // Ensure ports has at least primary
  if (!spec.ports) {
    spec.ports = {
      primary: { container: 3000 },
    };
  } else if (!spec.ports.primary) {
    // Find first port and make it primary
    const firstKey = Object.keys(spec.ports).find(k => k !== "primary");
    if (firstKey && spec.ports[firstKey]) {
      spec.ports.primary = spec.ports[firstKey];
    } else {
      spec.ports.primary = { container: 3000 };
    }
  }

  return spec;
}

/**
 * Get all ports that need to be exposed
 */
export function getSpecPorts(spec: PreviewSpec): Array<{ name: string; port: number; description?: string }> {
  const ports: Array<{ name: string; port: number; description?: string }> = [];

  if (spec.ports) {
    for (const [name, config] of Object.entries(spec.ports)) {
      if (config) {
        ports.push({
          name,
          port: config.container,
          description: config.description,
        });
      }
    }
  }

  return ports;
}

/**
 * Get primary port from spec
 */
export function getPrimaryPort(spec: PreviewSpec): number {
  return spec.ports?.primary?.container ?? 3000;
}
