/**
 * Preview System Types
 */

export type ContainerRuntime = "colima" | "docker" | "orbstack" | "none";

export type PreviewStatus =
  | "pending" // Waiting to start
  | "starting" // Container created, deps installing
  | "running" // Dev server up and healthy
  | "paused" // Container paused (idle timeout)
  | "stopped" // Container stopped
  | "error"; // Something went wrong

export interface PreviewContainer {
  /** Short hash ID, e.g., "abc123" */
  id: string;
  /** Full docker container ID */
  containerId: string;
  /** URL slug for subdomain, e.g., "myapp-feature-auth" */
  slug: string;
  /** Associated Navi session ID */
  sessionId: string;
  /** Associated Navi project ID */
  projectId: string;
  /** Absolute path to project/worktree */
  path: string;
  /** Git branch name */
  branch: string;

  status: PreviewStatus;
  /** Full preview URL, e.g., "http://myapp-feature.preview.localhost:4000" */
  url: string;
  /** Port inside container (usually 3000) */
  internalPort: number;

  framework?: DetectedFramework;
  startedAt?: number;
  lastAccessedAt?: number;
  error?: string;
}

export interface DetectedFramework {
  /** Framework name: "vite" | "next" | "nuxt" | "sveltekit" | etc. */
  name: string;
  /** Detected package manager */
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
  /** Full command to run dev server with port binding */
  devCommand: string;
  /** Install command for dependencies */
  installCommand: string;
  /** Default port the framework uses */
  defaultPort: number;
  /** Config file found, e.g., "vite.config.ts" */
  configFile?: string;
}

export interface PreviewConfig {
  /** Maximum concurrent preview containers */
  maxContainers: number;
  /** Pause container after this idle time (ms) */
  idleTimeoutMs: number;
  /** Remove container after this idle time (ms) */
  cleanupTimeoutMs: number;
  /** Memory limit per container (MB) */
  memoryLimitMb: number;
  /** CPU limit per container */
  cpuLimit: number;
  /** Traefik proxy port */
  proxyPort: number;
  /** Docker network name */
  networkName: string;
}

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  maxContainers: 5,
  idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
  cleanupTimeoutMs: 2 * 60 * 60 * 1000, // 2 hours
  memoryLimitMb: 1024,
  cpuLimit: 2,
  proxyPort: 4000,
  networkName: "navi-preview-net",
};

export interface RuntimeInfo {
  runtime: ContainerRuntime;
  version?: string;
  running: boolean;
}

export interface PreviewState {
  initialized: boolean;
  runtime: RuntimeInfo;
  proxyRunning: boolean;
  containers: Map<string, PreviewContainer>;
  config: PreviewConfig;
}
