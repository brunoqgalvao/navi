/**
 * Container Manager
 *
 * Handles Docker container lifecycle for preview servers.
 * Creates containers with proper labels for Traefik routing.
 */
import { exec, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";

import type { DetectedFramework, PreviewConfig, PreviewContainer, PreviewStatus } from "./types";
import { loadPreviewSpec, getSpecPorts, getPrimaryPort, type PreviewSpec } from "./spec";
import { getOrDetectPreviewConfig } from "./auto-detect";

const execAsync = promisify(exec);

/**
 * Execute docker command with string args (for simple commands)
 */
async function docker(args: string, timeout = 30000): Promise<string> {
  const { stdout } = await execAsync(`docker ${args}`, { timeout });
  return stdout.trim();
}

/**
 * Execute docker command with array args (for complex commands with spaces)
 */
async function dockerSpawn(args: string[], timeout = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Docker command timed out after ${timeout}ms`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Docker command failed (code ${code}): ${stderr || stdout}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Generate a short hash ID from path and branch
 */
function generateId(path: string, branch: string): string {
  const hash = createHash("md5")
    .update(`${path}:${branch}`)
    .digest("hex");
  return hash.substring(0, 8);
}

/**
 * Generate a URL-safe slug from project name and branch
 */
function generateSlug(projectPath: string, branch: string): string {
  const projectName = projectPath.split("/").pop() || "project";

  // Clean branch name for URL
  const branchSlug = branch
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .substring(0, 20);

  // Clean project name
  const projectSlug = projectName
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .substring(0, 20);

  return `${projectSlug}-${branchSlug}`.substring(0, 40);
}

/**
 * Hash a path for volume naming
 */
function hashPath(path: string): string {
  return createHash("md5").update(path).digest("hex").substring(0, 12);
}

export class ContainerManager {
  private config: PreviewConfig;
  private usedPorts: Set<number> = new Set();
  private nextPort: number = 4001;

  constructor(config: PreviewConfig) {
    this.config = config;
  }

  /**
   * Allocate a unique port for a container
   */
  allocatePort(): number {
    while (this.usedPorts.has(this.nextPort)) {
      this.nextPort++;
    }
    const port = this.nextPort;
    this.usedPorts.add(port);
    this.nextPort++;
    return port;
  }

  /**
   * Release a port when container is stopped
   */
  releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  /**
   * Ensure Docker network exists for preview containers
   */
  async ensureNetwork(): Promise<void> {
    try {
      await docker(`network inspect ${this.config.networkName}`);
    } catch {
      console.log(`[Preview] Creating network: ${this.config.networkName}`);
      await docker(`network create ${this.config.networkName}`);
    }
  }

  /**
   * Ensure named volume exists for caching
   */
  async ensureVolume(name: string): Promise<void> {
    try {
      await docker(`volume inspect ${name}`);
    } catch {
      await docker(`volume create ${name}`);
    }
  }

  /**
   * Create and start a preview container
   * @param cachedConfig - Optional cached config from database (avoids re-detection)
   * @returns The container and optionally the newly detected config (JSON string)
   */
  async createContainer(
    sessionId: string,
    projectId: string,
    projectPath: string,
    branch: string,
    framework: DetectedFramework,
    cachedConfig?: string | null
  ): Promise<{ container: PreviewContainer; detectedConfig?: string }> {
    const id = generateId(projectPath, branch);
    const slug = generateSlug(projectPath, branch);
    const containerName = `navi-prev-${id}`;
    const nodeModulesVolume = `navi-nm-${hashPath(projectPath)}`;

    // Auto-detect preview config (or use cached/spec file)
    const spec = await getOrDetectPreviewConfig(projectPath, cachedConfig);
    const hasSpec = true; // Always true now since we auto-detect

    // Track if we generated a new config (for caching in DB)
    const isNewlyDetected = !cachedConfig;

    // Get ports from spec or use defaults
    const specPorts = spec ? getSpecPorts(spec) : [];
    const primaryContainerPort = spec ? getPrimaryPort(spec) : 3000;

    // Allocate host ports for each container port
    const portMappings: Array<{ name: string; host: number; container: number }> = [];

    if (specPorts.length > 0) {
      // Use spec-defined ports
      for (const p of specPorts) {
        portMappings.push({
          name: p.name,
          host: this.allocatePort(),
          container: p.port,
        });
      }
    } else {
      // Default: single port for simple projects, or frontend+backend for bun monorepos
      if (framework.packageManager === "bun") {
        portMappings.push({ name: "frontend", host: this.allocatePort(), container: 1420 });
        portMappings.push({ name: "backend", host: this.allocatePort(), container: 3000 });
      } else {
        portMappings.push({ name: "primary", host: this.allocatePort(), container: 3000 });
      }
    }

    // Find primary port for the preview URL
    const primaryMapping = portMappings.find(p => p.name === "primary") || portMappings[0];

    // Ensure volumes exist
    await this.ensureVolume(nodeModulesVolume);
    await this.ensureVolume("navi-npm-cache");
    await this.ensureVolume("navi-bun-cache");

    // Determine image
    const image = spec?.image ||
      (framework.packageManager === "bun" ? "oven/bun:alpine" : "node:20-alpine");

    // Build install command
    const installCmd = spec?.commands?.install || framework.installCommand;

    // Build setup commands (run after install)
    const setupCmds = spec?.commands?.setup?.join(" && ") ||
      (framework.packageManager === "bun"
        ? "(cd packages/navi-app 2>/dev/null && bun add @rollup/rollup-linux-arm64-musl --optional 2>/dev/null || true)"
        : "true");

    // Build dev command
    const devCmd = spec?.commands?.dev || framework.devCommand;

    // Build environment variables
    const envVars: string[] = [
      "-e", "NODE_ENV=development",
      "-e", "NAVI_PREVIEW=true",
    ];

    if (spec?.env) {
      for (const [key, value] of Object.entries(spec.env)) {
        envVars.push("-e", `${key}=${value}`);
      }
    } else {
      envVars.push("-e", "PORT=3000");
      envVars.push("-e", "HOST=0.0.0.0");
    }

    // Build resource limits
    const memoryLimit = spec?.resources?.memory || `${this.config.memoryLimitMb}m`;
    const cpuLimit = spec?.resources?.cpus || this.config.cpuLimit;

    // Build docker run command
    const args = [
      "run", "-d",
      "--name", containerName,

      // Labels for identification
      "--label", "navi.preview=true",
      "--label", `navi.session=${sessionId}`,
      "--label", `navi.project=${projectId}`,
      "--label", `navi.slug=${slug}`,
      "--label", `navi.port=${primaryMapping.host}`,
      "--label", `navi.hasSpec=${hasSpec}`,

      // Resource limits
      "--memory", memoryLimit,
      "--cpus", `${cpuLimit}`,

      // Port mappings from spec or defaults
      ...portMappings.flatMap(p => ["-p", `${p.host}:${p.container}`]),

      // Mount source code (cached for better macOS performance)
      "-v", `${projectPath}:/app:cached`,

      // Mount cached node_modules (persistent across restarts)
      "-v", `${nodeModulesVolume}:/app/node_modules`,

      // Mount package manager caches
      "-v", "navi-npm-cache:/root/.npm",
      "-v", "navi-bun-cache:/root/.bun",

      // Environment variables
      ...envVars,

      // Working directory
      "-w", spec?.workdir || "/app",

      // Image
      image,

      // Startup command - workdir is already set via -w flag, no need to cd
      "sh", "-c",
      `echo "[Navi Preview] Installing dependencies..." && ${installCmd} && echo "[Navi Preview] Running setup..." && ${setupCmds} && echo "[Navi Preview] Starting dev server..." && ${devCmd}`,
    ];

    console.log(`[Preview] Creating container: ${containerName}`);
    console.log(`[Preview] Using spec: ${hasSpec}`);
    console.log(`[Preview] Image: ${image}`);
    console.log(`[Preview] Ports: ${portMappings.map(p => `${p.name}=${p.host}:${p.container}`).join(", ")}`);
    console.log(`[Preview] Install: ${installCmd}`);
    console.log(`[Preview] Dev: ${devCmd}`);

    // Use spawn with array args to avoid shell escaping issues
    const containerId = await dockerSpawn(args, 120000);

    const container: PreviewContainer = {
      id,
      containerId,
      slug,
      sessionId,
      projectId,
      path: projectPath,
      branch,
      status: "starting",
      url: `http://localhost:${primaryMapping.host}`,
      internalPort: primaryMapping.container,
      framework,
      startedAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    // Return the container and the detected config if it was newly generated
    return {
      container,
      detectedConfig: isNewlyDetected ? JSON.stringify(spec) : undefined,
    };
  }

  /**
   * Stop and remove a container
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      await docker(`stop ${containerId}`, 10000);
    } catch {
      // Container might already be stopped
    }

    try {
      await docker(`rm -f ${containerId}`, 10000);
    } catch {
      // Container might already be removed
    }
  }

  /**
   * Pause a running container
   */
  async pauseContainer(containerId: string): Promise<void> {
    await docker(`pause ${containerId}`);
  }

  /**
   * Unpause a paused container
   */
  async unpauseContainer(containerId: string): Promise<void> {
    await docker(`unpause ${containerId}`);
  }

  /**
   * Get container logs
   */
  async getLogs(containerId: string, tail = 100): Promise<string[]> {
    const output = await docker(`logs ${containerId} --tail ${tail} 2>&1`);
    return output.split("\n").filter(Boolean);
  }

  /**
   * Stream container logs
   */
  streamLogs(containerId: string): ChildProcess {
    return spawn("docker", ["logs", "-f", containerId], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /**
   * Check if container's dev server is healthy (responding on the mapped port from host)
   */
  async isHealthy(containerId: string): Promise<boolean> {
    try {
      // Get the host port mapping for this container
      const portOutput = await docker(
        `port ${containerId}`,
        5000
      );

      // Parse first port mapping (e.g., "1420/tcp -> 0.0.0.0:4003")
      const match = portOutput.match(/-> 0\.0\.0\.0:(\d+)/);
      if (!match) return false;

      const hostPort = match[1];

      // Check from host side using fetch
      const response = await fetch(`http://localhost:${hostPort}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus(containerId: string): Promise<PreviewStatus | null> {
    try {
      const output = await docker(
        `inspect ${containerId} --format '{{.State.Status}}'`
      );
      const status = output.toLowerCase();

      if (status === "running") return "running";
      if (status === "paused") return "paused";
      if (status === "exited" || status === "dead") return "stopped";
      if (status === "created" || status === "restarting") return "starting";

      return "error";
    } catch {
      return null; // Container doesn't exist
    }
  }

  /**
   * List all Navi preview containers
   */
  async listContainers(): Promise<string[]> {
    const output = await docker(
      'ps -a --filter "label=navi.preview=true" --format "{{.ID}}"'
    );
    return output.split("\n").filter(Boolean);
  }

  /**
   * Get container info by session ID
   */
  async getContainerBySession(sessionId: string): Promise<string | null> {
    try {
      const output = await docker(
        `ps -a --filter "label=navi.session=${sessionId}" --format "{{.ID}}"`
      );
      const ids = output.split("\n").filter(Boolean);
      return ids[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Clean up all Navi preview containers
   */
  async cleanupAll(): Promise<void> {
    const containerIds = await this.listContainers();
    await Promise.all(containerIds.map((id) => this.stopContainer(id)));
  }

  /**
   * Clean up unused volumes (node_modules caches)
   */
  async cleanupVolumes(): Promise<void> {
    try {
      await docker('volume prune -f --filter "label=navi.preview=true"');
    } catch {
      // Ignore errors
    }
  }
}
