/**
 * Port Manager Preview Service
 *
 * LLM-powered port orchestration system for running multiple dev servers
 * without port conflicts. Manages port assignments across worktrees and
 * can intelligently allocate ports based on project framework detection.
 *
 * Key Features:
 * - Multi-instance support (run same project on different branches)
 * - LLM-assisted port allocation decisions
 * - Framework-aware port assignment
 * - Automatic conflict resolution
 * - Port tracking and cleanup
 */

import { spawn, ChildProcess } from "child_process";
import { detectFramework, describeFramework } from "./preview/framework-detector";
import type { DetectedFramework } from "./preview/types";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface PortAllocation {
  primary: number;
  backend?: number;
  additional?: number[];
}

interface PortManagerPreview {
  id: string;
  sessionId: string;
  projectId: string;
  projectPath: string;
  branch: string;
  framework: DetectedFramework;
  process: ChildProcess;
  ports: PortAllocation;
  status: "starting" | "running" | "error";
  startedAt: number;
  error?: string;
  logs: string[];
}

interface FrameworkPortConfig {
  name: string;
  defaultPort: number;
  envVar: string; // Environment variable to set port
  cliFlag?: string; // CLI flag for port (e.g., "--port", "-p")
  needsHostFlag?: boolean; // Some frameworks need --host 0.0.0.0
}

// Framework-specific port configuration
const FRAMEWORK_PORT_CONFIG: Record<string, FrameworkPortConfig> = {
  vite: { name: "vite", defaultPort: 5173, envVar: "PORT", cliFlag: "--port", needsHostFlag: true },
  sveltekit: { name: "sveltekit", defaultPort: 5173, envVar: "PORT", cliFlag: "--port", needsHostFlag: true },
  next: { name: "next", defaultPort: 3000, envVar: "PORT", cliFlag: "-p" },
  nuxt: { name: "nuxt", defaultPort: 3000, envVar: "PORT", cliFlag: "--port" },
  astro: { name: "astro", defaultPort: 4321, envVar: "PORT", cliFlag: "--port", needsHostFlag: true },
  cra: { name: "cra", defaultPort: 3000, envVar: "PORT" },
  remix: { name: "remix", defaultPort: 3000, envVar: "PORT" },
  express: { name: "express", defaultPort: 3000, envVar: "PORT" },
  generic: { name: "generic", defaultPort: 3000, envVar: "PORT" },
};

// Port ranges for different purposes
const PORT_RANGES = {
  primary: { min: 3000, max: 3999 }, // Main dev servers
  backend: { min: 4000, max: 4999 }, // Backend APIs
  auxiliary: { min: 5000, max: 5999 }, // HMR, WebSocket, etc.
};

// Common subfolder names where web projects live
const COMMON_APP_SUBFOLDERS = [
  "frontend",
  "client",
  "web",
  "app",
  "packages/app",
  "packages/web",
  "packages/frontend",
  "packages/client",
  "src/app",
  "apps/web",
  "apps/frontend",
];

class PortManagerPreviewService {
  private previews: Map<string, PortManagerPreview> = new Map();
  private allocatedPorts: Set<number> = new Set();
  private portToPreviewId: Map<number, string> = new Map();
  private readonly maxLogLines = 100;

  /**
   * Find package.json in project root or common subfolders
   * Returns the resolved path where package.json was found
   */
  private findProjectRoot(projectPath: string): string | null {
    // First check root
    if (existsSync(join(projectPath, "package.json"))) {
      return projectPath;
    }

    // Check common subfolders
    for (const subfolder of COMMON_APP_SUBFOLDERS) {
      const subPath = join(projectPath, subfolder);
      if (existsSync(join(subPath, "package.json"))) {
        console.log(`[PortManagerPreview] Found package.json in subfolder: ${subfolder}`);
        return subPath;
      }
    }

    // Shallow search of immediate subdirectories
    try {
      const { readdirSync, statSync } = require("fs");
      const entries = readdirSync(projectPath);

      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;

        const subPath = join(projectPath, entry);
        try {
          if (statSync(subPath).isDirectory()) {
            const pkgPath = join(subPath, "package.json");
            if (existsSync(pkgPath)) {
              // Verify it has a dev script
              const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
              if (pkg.scripts?.dev || pkg.scripts?.start) {
                console.log(`[PortManagerPreview] Found package.json in: ${entry}`);
                return subPath;
              }
            }
          }
        } catch {
          // Skip entries we can't read
        }
      }
    } catch {
      // Ignore errors listing directory
    }

    return null;
  }

  /**
   * Start a preview with intelligent port allocation
   */
  async start(
    sessionId: string,
    projectId: string,
    projectPath: string,
    branch: string,
    useLlm: boolean = true
  ): Promise<{ id: string; ports: PortAllocation; url: string }> {
    // Check if already running for this session
    const existingId = `${projectId}-${branch}`;
    if (this.previews.has(existingId)) {
      const existing = this.previews.get(existingId)!;
      return {
        id: existing.id,
        ports: existing.ports,
        url: `http://localhost:${existing.ports.primary}`,
      };
    }

    // Find the actual project root (where package.json lives)
    const resolvedPath = this.findProjectRoot(projectPath);
    if (!resolvedPath) {
      throw new Error("No package.json found in project root or common subfolders. This project cannot be previewed.");
    }

    // Use the resolved path for all operations
    const effectivePath = resolvedPath;
    console.log(`[PortManagerPreview] Using project root: ${effectivePath}`);

    // Check if node_modules exists - if not, we need to install dependencies
    // This is critical for worktrees which don't share node_modules
    const nodeModulesPath = join(effectivePath, "node_modules");
    if (!existsSync(nodeModulesPath)) {
      console.log(`[PortManagerPreview] node_modules not found, installing dependencies...`);
      try {
        await this.installDependencies(effectivePath);
      } catch (e: any) {
        // Don't crash - just log and continue, the dev server might still work
        console.error(`[PortManagerPreview] Warning: Failed to install dependencies: ${e.message}`);
      }
    }

    // Detect framework
    let framework: DetectedFramework;
    try {
      framework = await detectFramework(effectivePath, false);
      console.log(`[PortManagerPreview] Detected: ${describeFramework(framework)}`);
    } catch (e: any) {
      throw new Error(`Framework detection failed: ${e.message}`);
    }

    // Allocate ports intelligently
    const ports = await this.allocatePorts(framework, effectivePath, useLlm);
    console.log(`[PortManagerPreview] Allocated ports:`, ports);

    // Build dev command with port configuration
    const devCommand = this.buildDevCommand(framework, ports);
    console.log(`[PortManagerPreview] Command: ${devCommand}`);

    // Spawn process with port env vars
    const childProcess = spawn(devCommand, {
      cwd: effectivePath,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // Allow process to continue if parent dies
      env: {
        ...process.env,
        PORT: ports.primary.toString(),
        DEV_SERVER_PORT: ports.primary.toString(),
        ...(ports.backend && { BACKEND_PORT: ports.backend.toString() }),
      },
    });

    const logs: string[] = [];
    const id = existingId;

    // Capture stdout
    childProcess.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        logs.push(`[stdout] ${line}`);
        // Check for ready messages
        if (this.isServerReadyMessage(line)) {
          const preview = this.previews.get(id);
          if (preview && preview.status === "starting") {
            preview.status = "running";
            console.log(`[PortManagerPreview] ${id} is now running`);
          }
        }
      }
      if (logs.length > this.maxLogLines) {
        logs.splice(0, logs.length - this.maxLogLines);
      }
    });

    // Capture stderr
    childProcess.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        logs.push(`[stderr] ${line}`);
      }
      if (logs.length > this.maxLogLines) {
        logs.splice(0, logs.length - this.maxLogLines);
      }
    });

    // Handle process exit
    childProcess.on("exit", (code) => {
      console.log(`[PortManagerPreview] ${id} exited with code ${code}`);
      const preview = this.previews.get(id);
      if (preview) {
        preview.status = "error";
        preview.error = `Process exited with code ${code}`;
        this.releasePorts(preview.ports);
        // Auto-remove crashed previews after 30 seconds to allow UI to show error
        setTimeout(() => {
          if (this.previews.get(id)?.status === "error") {
            console.log(`[PortManagerPreview] Auto-removing crashed preview ${id}`);
            this.previews.delete(id);
          }
        }, 30000);
      }
    });

    // Store preview state (use effectivePath for the projectPath)
    const preview: PortManagerPreview = {
      id,
      sessionId,
      projectId,
      projectPath: effectivePath,
      branch,
      framework,
      process: childProcess,
      ports,
      status: "starting",
      startedAt: Date.now(),
      logs,
    };

    this.previews.set(id, preview);

    // Mark ports as allocated
    this.allocatedPorts.add(ports.primary);
    this.portToPreviewId.set(ports.primary, id);
    if (ports.backend) {
      this.allocatedPorts.add(ports.backend);
      this.portToPreviewId.set(ports.backend, id);
    }

    // Start health check polling
    this.pollHealth(id);

    return {
      id,
      ports,
      url: `http://localhost:${ports.primary}`,
    };
  }

  /**
   * Stop a specific preview
   */
  async stop(previewId: string): Promise<boolean> {
    const preview = this.previews.get(previewId);
    if (!preview) return false;

    try {
      // Kill process and all children
      if (preview.process.pid) {
        try {
          process.kill(-preview.process.pid, "SIGTERM");
        } catch {
          // Process group might not exist
        }
      }
      preview.process.kill("SIGTERM");

      // Wait for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Force kill if still running
      if (!preview.process.killed) {
        preview.process.kill("SIGKILL");
      }

      // Release ports
      this.releasePorts(preview.ports);

      // Remove from map
      this.previews.delete(previewId);

      return true;
    } catch (e) {
      console.error(`[PortManagerPreview] Error stopping ${previewId}:`, e);
      return false;
    }
  }

  /**
   * Stop preview by session ID
   */
  async stopBySession(sessionId: string): Promise<boolean> {
    for (const [id, preview] of this.previews) {
      if (preview.sessionId === sessionId) {
        return this.stop(id);
      }
    }
    return false;
  }

  /**
   * Get status of a preview
   */
  getStatus(previewId: string): {
    running: boolean;
    id?: string;
    sessionId?: string;
    branch?: string;
    ports?: PortAllocation;
    url?: string;
    status?: string;
    framework?: string;
    error?: string;
  } {
    const preview = this.previews.get(previewId);
    if (!preview) {
      return { running: false };
    }

    return {
      running: true,
      id: preview.id,
      sessionId: preview.sessionId,
      branch: preview.branch,
      ports: preview.ports,
      url: `http://localhost:${preview.ports.primary}`,
      status: preview.status,
      framework: preview.framework.name,
      error: preview.error,
    };
  }

  /**
   * Get status by session ID
   */
  getStatusBySession(sessionId: string): ReturnType<typeof this.getStatus> {
    for (const [id, preview] of this.previews) {
      if (preview.sessionId === sessionId) {
        return this.getStatus(id);
      }
    }
    return { running: false };
  }

  /**
   * List all running previews
   */
  listAll(): Array<{
    id: string;
    sessionId: string;
    projectId: string;
    branch: string;
    ports: PortAllocation;
    status: string;
    framework: string;
    startedAt: number;
  }> {
    return Array.from(this.previews.values()).map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      projectId: p.projectId,
      branch: p.branch,
      ports: p.ports,
      status: p.status,
      framework: p.framework.name,
      startedAt: p.startedAt,
    }));
  }

  /**
   * Get logs for a preview
   */
  getLogs(previewId: string, tail: number = 50): string[] {
    const preview = this.previews.get(previewId);
    if (!preview) return [];
    return preview.logs.slice(-tail);
  }

  /**
   * Get logs by session ID
   */
  getLogsBySession(sessionId: string, tail: number = 50): string[] {
    for (const [, preview] of this.previews) {
      if (preview.sessionId === sessionId) {
        return preview.logs.slice(-tail);
      }
    }
    return [];
  }

  /**
   * Get allocated ports map (for debugging/UI)
   */
  getAllocatedPorts(): { port: number; previewId: string }[] {
    return Array.from(this.portToPreviewId.entries()).map(([port, id]) => ({
      port,
      previewId: id,
    }));
  }

  /**
   * Suggest port allocation using LLM (or smart fallback)
   */
  async allocatePorts(
    framework: DetectedFramework,
    projectPath: string,
    useLlm: boolean
  ): Promise<PortAllocation> {
    const config = FRAMEWORK_PORT_CONFIG[framework.name] || FRAMEWORK_PORT_CONFIG.generic;

    // Check if project needs backend port
    const needsBackend = this.projectNeedsBackend(projectPath);

    if (useLlm) {
      // LLM-based allocation (can be expanded with actual LLM call)
      // For now, use smart allocation with project context
      return this.smartAllocate(config, needsBackend);
    }

    // Simple allocation - find next available ports
    const primary = await this.findAvailablePort(config.defaultPort, PORT_RANGES.primary);
    const backend = needsBackend
      ? await this.findAvailablePort(4000, PORT_RANGES.backend)
      : undefined;

    return { primary, backend };
  }

  /**
   * Smart port allocation based on project context
   */
  private async smartAllocate(
    config: FrameworkPortConfig,
    needsBackend: boolean
  ): Promise<PortAllocation> {
    // Start from framework's default port
    let startPort = config.defaultPort;

    // If default is taken, calculate offset based on how many are running
    const runningCount = this.previews.size;
    if (runningCount > 0) {
      // Each new instance gets ports offset by 10
      startPort = config.defaultPort + runningCount * 10;
    }

    const primary = await this.findAvailablePort(startPort, PORT_RANGES.primary);
    const backend = needsBackend
      ? await this.findAvailablePort(primary + 1000, PORT_RANGES.backend)
      : undefined;

    return { primary, backend };
  }

  /**
   * Check if project has backend server
   */
  private projectNeedsBackend(projectPath: string): boolean {
    const pkgPath = join(projectPath, "package.json");
    if (!existsSync(pkgPath)) return false;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts || {};

      // Check for backend-related scripts
      if (scripts.server || scripts["dev:server"] || scripts["start:server"]) {
        return true;
      }

      // Check for server directory
      if (existsSync(join(projectPath, "server"))) return true;
      if (existsSync(join(projectPath, "api"))) return true;
      if (existsSync(join(projectPath, "backend"))) return true;

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Find available port in range
   */
  private async findAvailablePort(
    startPort: number,
    range: { min: number; max: number }
  ): Promise<number> {
    const net = await import("net");

    // Ensure start port is within range
    let port = Math.max(range.min, Math.min(range.max, startPort));

    for (let i = 0; i < 100; i++) {
      const checkPort = port + i;
      if (checkPort > range.max) break;

      // Skip if we already allocated this port
      if (this.allocatedPorts.has(checkPort)) continue;

      // Check if port is available
      if (await this.isPortAvailable(checkPort, net)) {
        return checkPort;
      }
    }

    throw new Error(`No available port found in range ${range.min}-${range.max}`);
  }

  /**
   * Check if port is available
   */
  private isPortAvailable(port: number, net: any): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close();
        resolve(true);
      });

      server.listen(port, "localhost");
    });
  }

  /**
   * Install dependencies for a project (used for worktrees)
   * Detects package manager from lockfiles and installs
   */
  private async installDependencies(projectPath: string): Promise<void> {
    const { execSync } = await import("child_process");

    // Detect package manager from lockfiles
    let installCmd = "npm install";
    if (existsSync(join(projectPath, "bun.lockb"))) {
      installCmd = "bun install";
    } else if (existsSync(join(projectPath, "pnpm-lock.yaml"))) {
      installCmd = "pnpm install";
    } else if (existsSync(join(projectPath, "yarn.lock"))) {
      installCmd = "yarn install";
    }

    console.log(`[PortManagerPreview] Running: ${installCmd} in ${projectPath}`);

    try {
      execSync(installCmd, {
        cwd: projectPath,
        stdio: "pipe",
        timeout: 120000, // 2 minute timeout for install
        env: {
          ...process.env,
          CI: "true", // Disable interactive prompts
        },
      });
      console.log(`[PortManagerPreview] Dependencies installed successfully`);
    } catch (e: any) {
      console.error(`[PortManagerPreview] Failed to install dependencies:`, e.message);
      throw new Error(`Failed to install dependencies: ${e.message}`);
    }
  }

  /**
   * Release allocated ports
   */
  private releasePorts(ports: PortAllocation): void {
    this.allocatedPorts.delete(ports.primary);
    this.portToPreviewId.delete(ports.primary);

    if (ports.backend) {
      this.allocatedPorts.delete(ports.backend);
      this.portToPreviewId.delete(ports.backend);
    }

    if (ports.additional) {
      for (const port of ports.additional) {
        this.allocatedPorts.delete(port);
        this.portToPreviewId.delete(port);
      }
    }
  }

  /**
   * Build dev command with port configuration
   * NOTE: We build our own command here, ignoring framework.devCommand which has hardcoded ports
   */
  private buildDevCommand(framework: DetectedFramework, ports: PortAllocation): string {
    const { packageManager } = framework;

    const runCmd = packageManager === "bun" ? "bun run" : `${packageManager} run`;

    // Framework-specific command building - each framework has different CLI syntax
    // For npm/yarn/pnpm, we need "--" to pass args to the script
    // For bun, args are passed directly
    const needsSeparator = packageManager !== "bun";
    const sep = needsSeparator ? " --" : "";

    switch (framework.name) {
      case "next":
        // Next.js: next dev -H host -p port
        return `${runCmd} dev${sep} -H 0.0.0.0 -p ${ports.primary}`;

      case "vite":
      case "sveltekit":
        // Vite-based: vite dev --port X --host Y
        return `${runCmd} dev${sep} --port ${ports.primary} --host 0.0.0.0`;

      case "astro":
        return `${runCmd} dev${sep} --port ${ports.primary} --host 0.0.0.0`;

      case "nuxt":
        return `${runCmd} dev${sep} --port ${ports.primary} --host 0.0.0.0`;

      case "remix":
        // Remix uses PORT env var
        return `PORT=${ports.primary} ${runCmd} dev`;

      case "cra":
        // Create React App uses PORT and HOST env vars
        return `PORT=${ports.primary} HOST=0.0.0.0 ${runCmd} start`;

      case "angular":
        return `${runCmd} start${sep} --host 0.0.0.0 --port ${ports.primary}`;

      case "vue-cli":
        return `${runCmd} serve${sep} --host 0.0.0.0 --port ${ports.primary}`;

      default:
        // Generic: rely on PORT env var (set in spawn env)
        return `${runCmd} dev`;
    }
  }

  /**
   * Check if output line indicates server is ready
   */
  private isServerReadyMessage(line: string): boolean {
    const readyPatterns = [
      /ready in \d+/i,
      /listening on/i,
      /started server/i,
      /server running/i,
      /local:\s*http/i,
      /➜\s*Local:/i,
      /compiled successfully/i,
      /waiting on/i,
    ];

    return readyPatterns.some((pattern) => pattern.test(line));
  }

  /**
   * Poll preview health
   */
  private async pollHealth(previewId: string): Promise<void> {
    const preview = this.previews.get(previewId);
    if (!preview) return;

    const maxWaitMs = 90000; // 90 seconds
    const pollIntervalMs = 2000;
    const start = Date.now();

    const poll = async () => {
      const currentPreview = this.previews.get(previewId);
      if (!currentPreview || currentPreview !== preview) {
        return; // Preview was stopped or replaced
      }

      // Check timeout
      if (Date.now() - start > maxWaitMs) {
        preview.status = "error";
        preview.error = "Server failed to start within timeout";
        console.error(`[PortManagerPreview] ${previewId} health check timeout`);
        return;
      }

      // Check if port is responding
      try {
        const response = await fetch(`http://localhost:${preview.ports.primary}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok || response.status < 500) {
          preview.status = "running";
          console.log(`[PortManagerPreview] ${previewId} is healthy on port ${preview.ports.primary}`);
          return;
        }
      } catch {
        // Not ready yet, keep polling
      }

      // Check if process exited
      if (preview.process.exitCode !== null) {
        preview.status = "error";
        preview.error = `Process exited with code ${preview.process.exitCode}`;
        return;
      }

      // Poll again
      setTimeout(poll, pollIntervalMs);
    };

    setTimeout(poll, pollIntervalMs);
  }
}

// Singleton instance
export const portManagerPreviewService = new PortManagerPreviewService();
