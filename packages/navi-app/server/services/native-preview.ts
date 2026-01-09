/**
 * Native Preview Service
 *
 * Lightweight preview system that runs dev servers natively (no Docker).
 *
 * Multi-workspace support:
 * - One preview PER PROJECT (not global singleton)
 * - Switching worktrees within same project → reuses same port
 * - Different projects → different ports, run in parallel
 * - Auto port assignment to avoid conflicts between projects
 *
 * Other features:
 * - LLM-powered port conflict resolution
 * - Preview compliance checking (validates project can be previewed)
 * - Auto dependency installation for worktrees
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { detectFramework, describeFramework } from "./preview/framework-detector";
import type { DetectedFramework } from "./preview/types";
import { portFixer } from "./port-fixer";

export interface PreviewComplianceResult {
  canPreview: boolean;
  reason?: string;
  framework?: string;
  suggestions?: string[];
  /** If package.json was found in a subfolder, this is the resolved path */
  resolvedPath?: string;
  /** If true, dependencies need to be installed before starting */
  needsInstall?: boolean;
}

/**
 * Port conflict info - returned when a port is in use by an external process
 * that is NOT from the same workspace (which would be auto-killed)
 */
export interface PortConflictInfo {
  hasConflict: true;
  requestedPort: number;
  alternativePort: number;
  conflictProcess: {
    pid: number;
    name: string;
    isDevServer: boolean;
    isSameWorkspace: boolean;  // true if same project different branch (auto-resolved)
  };
}

/**
 * Preview start result variants
 */
export type PreviewStartResult =
  | { success: true; port: number; url: string; framework: string }
  | { success: false; conflict: PortConflictInfo }
  | { success: false; error: string };

// Reserved ports that should NEVER be killed or used for previews
// These are Navi's own services and critical system ports
const RESERVED_PORTS = new Set([
  1420,  // Vite dev server (frontend)
  3001,  // Navi backend server
  3002,  // PTY server
  3011,  // Bundled server port (Tauri production)
  3012,  // Bundled PTY port (Tauri production)
  5173,  // Vite default port (alternative)
  5174,  // Vite preview port
]);

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

interface NativePreview {
  sessionId: string;
  projectId: string;
  projectPath: string;
  branch: string;
  framework: DetectedFramework;
  process: ChildProcess;
  port: number;
  status: "starting" | "running" | "error";
  startedAt: number;
  error?: string;
  logs: string[];
}

/**
 * Pending conflict - stored when a conflict is detected and waiting for user resolution
 */
interface PendingConflict {
  sessionId: string;
  projectId: string;
  projectPath: string;
  branch: string;
  requestedPort: number;
  alternativePort: number;
  conflictProcess: {
    pid: number;
    name: string;
    isDevServer: boolean;
    isSameWorkspace: boolean;
  };
  framework: DetectedFramework;
  createdAt: number;
}

class NativePreviewService {
  // Map of sessionId -> NativePreview (one preview per session)
  // This allows multiple sessions to have their own previews running simultaneously
  private previews: Map<string, NativePreview> = new Map();
  private readonly maxLogLines = 100;

  // Port reservations to prevent race conditions during concurrent starts
  // Maps port -> sessionId that has reserved it (before process is spawned)
  private portReservations: Map<number, string> = new Map();

  // Pending conflicts waiting for user resolution
  // Maps sessionId -> PendingConflict
  private pendingConflicts: Map<string, PendingConflict> = new Map();

  // Mutex-like lock for port operations to prevent race conditions
  private portLock: Promise<void> = Promise.resolve();
  private acquirePortLock(): Promise<() => void> {
    let release: () => void;
    const newLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previousLock = this.portLock;
    this.portLock = newLock;
    return previousLock.then(() => release!);
  }

  // For backwards compatibility - get the "current" preview for a session
  private get currentPreview(): NativePreview | null {
    // Return the first preview (legacy behavior)
    const values = Array.from(this.previews.values());
    return values.length > 0 ? values[0] : null;
  }

  /**
   * Check if a project can be previewed
   * Returns compliance status and suggestions if not compliant
   * Auto-discovers package.json in common subfolders
   */
  async checkCompliance(projectPath: string): Promise<PreviewComplianceResult> {
    // Check if path exists
    if (!existsSync(projectPath)) {
      return {
        canPreview: false,
        reason: "Project path does not exist",
      };
    }

    // Try to find package.json - first in root, then in common subfolders
    let resolvedPath = projectPath;
    let pkgPath = join(projectPath, "package.json");

    if (!existsSync(pkgPath)) {
      // Search common subfolders
      const foundSubfolder = this.findPackageJsonSubfolder(projectPath);
      if (foundSubfolder) {
        resolvedPath = foundSubfolder;
        pkgPath = join(foundSubfolder, "package.json");
        console.log(`[NativePreview] Found package.json in subfolder: ${foundSubfolder}`);
      } else {
        // List what folders exist to give better suggestions
        const subfolders = this.listDirectories(projectPath);
        const suggestions = ["Initialize a Node.js project with `npm init` or `bun init`"];

        // Check if any subfolder looks like it should have content but is empty
        // This often happens with git worktrees and nested repos
        const emptySubfolders = this.findEmptySubfolders(projectPath);
        if (emptySubfolders.length > 0) {
          suggestions.unshift(
            `Found empty folder(s): ${emptySubfolders.join(", ")} - these may be nested git repos that weren't checked out in the worktree`
          );
          suggestions.push("Try running 'git submodule update --init' or manually checkout the nested repo");
        } else if (subfolders.length > 0) {
          suggestions.push(`Found folders: ${subfolders.slice(0, 5).join(", ")}${subfolders.length > 5 ? "..." : ""}`);
        }

        return {
          canPreview: false,
          reason: "No package.json found in project root or common subfolders",
          suggestions,
        };
      }
    }

    // Try to detect framework at resolved path
    try {
      const framework = await detectFramework(resolvedPath, false);

      // Check for dev script
      if (!framework.devCommand || framework.devCommand === "npm run dev") {
        // Read package.json to verify dev script exists
        const { readFileSync } = await import("fs");
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const scripts = pkg.scripts || {};

        if (!scripts.dev && !scripts.start) {
          return {
            canPreview: false,
            reason: "No 'dev' or 'start' script found in package.json",
            framework: framework.name,
            resolvedPath: resolvedPath !== projectPath ? resolvedPath : undefined,
            suggestions: [
              "Add a dev script: \"dev\": \"vite\" or similar",
              "If using a framework, ensure it's properly configured",
            ],
          };
        }
      }

      // Check for node_modules - if missing, we'll auto-install in start()
      // Don't fail compliance, just note it
      const nodeModulesPath = join(resolvedPath, "node_modules");
      const needsInstall = !existsSync(nodeModulesPath);

      // All checks passed (dependencies will be installed on start if needed)
      return {
        canPreview: true,
        framework: framework.name,
        resolvedPath: resolvedPath !== projectPath ? resolvedPath : undefined,
        needsInstall, // Signal that we need to install deps
      };
    } catch (e: any) {
      return {
        canPreview: false,
        reason: `Framework detection failed: ${e.message}`,
        resolvedPath: resolvedPath !== projectPath ? resolvedPath : undefined,
        suggestions: ["Ensure the project is a valid Node.js/web project"],
      };
    }
  }

  /**
   * Search for package.json in common subfolders
   */
  private findPackageJsonSubfolder(projectPath: string): string | null {
    // First check explicit common folders
    for (const subfolder of COMMON_APP_SUBFOLDERS) {
      const subPath = join(projectPath, subfolder);
      if (existsSync(join(subPath, "package.json"))) {
        return subPath;
      }
    }

    // Then do a shallow search of immediate subdirectories
    try {
      const { readdirSync, statSync } = require("fs");
      const entries = readdirSync(projectPath);

      for (const entry of entries) {
        // Skip hidden folders and node_modules
        if (entry.startsWith(".") || entry === "node_modules") continue;

        const subPath = join(projectPath, entry);
        try {
          if (statSync(subPath).isDirectory()) {
            if (existsSync(join(subPath, "package.json"))) {
              // Verify it has a dev script (not just any package.json)
              const pkg = JSON.parse(require("fs").readFileSync(join(subPath, "package.json"), "utf-8"));
              if (pkg.scripts?.dev || pkg.scripts?.start) {
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
   * Detect if package.json has a hardcoded port in dev/start scripts
   * Returns the port number if found, null otherwise
   */
  private detectHardcodedPort(projectPath: string): number | null {
    try {
      const pkgPath = join(projectPath, "package.json");
      if (!existsSync(pkgPath)) return null;

      const { readFileSync } = require("fs");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts || {};

      // Check dev and start scripts for port patterns
      const scriptContent = `${scripts.dev || ""} ${scripts.start || ""}`;

      // Common port patterns in scripts:
      // -p 3000, --port 3000, --port=3000, -p=3000, PORT=3000
      const portPatterns = [
        /-p[=\s]+(\d+)/,           // -p 3000 or -p=3000
        /--port[=\s]+(\d+)/,       // --port 3000 or --port=3000
        /PORT[=:](\d+)/,           // PORT=3000
        /:(\d{4,5})(?:\s|$|")/,    // :3000 (like in URLs or bindings)
      ];

      for (const pattern of portPatterns) {
        const match = scriptContent.match(pattern);
        if (match) {
          const port = parseInt(match[1], 10);
          if (port >= 1024 && port <= 65535) {
            console.log(`[NativePreview] Found hardcoded port ${port} in package.json scripts`);
            return port;
          }
        }
      }

      return null;
    } catch (e) {
      console.error(`[NativePreview] Error detecting hardcoded port:`, e);
      return null;
    }
  }

  /**
   * List directories in a path (for suggestions)
   */
  private listDirectories(projectPath: string): string[] {
    try {
      const { readdirSync, statSync } = require("fs");
      const entries = readdirSync(projectPath);
      return entries.filter((entry: string) => {
        if (entry.startsWith(".") || entry === "node_modules") return false;
        try {
          return statSync(join(projectPath, entry)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  /**
   * Find empty subfolders that might be nested git repos not checked out in worktree
   */
  private findEmptySubfolders(projectPath: string): string[] {
    const empty: string[] = [];
    try {
      const { readdirSync, statSync } = require("fs");
      const entries = readdirSync(projectPath);

      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;

        const subPath = join(projectPath, entry);
        try {
          if (statSync(subPath).isDirectory()) {
            const contents = readdirSync(subPath);
            // Folder is "empty" if it has no files (or only . and ..)
            if (contents.length === 0) {
              empty.push(entry);
            }
          }
        } catch {
          // Skip entries we can't read
        }
      }
    } catch {
      // Ignore errors
    }
    return empty;
  }

  /**
   * Install dependencies for a project (used for worktrees)
   * Detects package manager from lockfiles and installs
   */
  private async installDependencies(projectPath: string): Promise<void> {
    const { execSync } = await import("child_process");

    // Detect package manager from lockfiles
    let installCmd = "npm install";
    let packageManager = "npm";

    if (existsSync(join(projectPath, "bun.lockb"))) {
      installCmd = "bun install";
      packageManager = "bun";
    } else if (existsSync(join(projectPath, "pnpm-lock.yaml"))) {
      installCmd = "pnpm install";
      packageManager = "pnpm";
    } else if (existsSync(join(projectPath, "yarn.lock"))) {
      installCmd = "yarn install";
      packageManager = "yarn";
    }

    console.log(`[NativePreview] Detected ${packageManager}, running: ${installCmd}`);

    try {
      execSync(installCmd, {
        cwd: projectPath,
        stdio: "pipe",
        timeout: 180000, // 3 minute timeout for install
        env: {
          ...process.env,
          CI: "true", // Disable interactive prompts
        },
      });
      console.log(`[NativePreview] Dependencies installed successfully`);
    } catch (e: any) {
      console.error(`[NativePreview] Failed to install dependencies:`, e.message);
      throw new Error(`Failed to install dependencies: ${e.message}`);
    }
  }

  /**
   * Clean up framework-specific lock files that can cause "another instance running" errors
   */
  private async cleanupLockFiles(projectPath: string): Promise<void> {
    const { rmSync } = await import("fs");

    // Next.js lock file
    const nextLockPath = join(projectPath, ".next", "dev", "lock");
    if (existsSync(nextLockPath)) {
      try {
        rmSync(nextLockPath, { force: true });
        console.log(`[NativePreview] Removed Next.js lock file: ${nextLockPath}`);
      } catch (e) {
        console.warn(`[NativePreview] Failed to remove Next.js lock: ${e}`);
      }
    }

    // Vite lock files (if any)
    const viteLockPath = join(projectPath, "node_modules", ".vite", ".lock");
    if (existsSync(viteLockPath)) {
      try {
        rmSync(viteLockPath, { force: true });
        console.log(`[NativePreview] Removed Vite lock file: ${viteLockPath}`);
      } catch (e) {
        console.warn(`[NativePreview] Failed to remove Vite lock: ${e}`);
      }
    }

    // Nuxt lock (if any)
    const nuxtLockPath = join(projectPath, ".nuxt", ".lock");
    if (existsSync(nuxtLockPath)) {
      try {
        rmSync(nuxtLockPath, { force: true });
        console.log(`[NativePreview] Removed Nuxt lock file: ${nuxtLockPath}`);
      } catch (e) {
        console.warn(`[NativePreview] Failed to remove Nuxt lock: ${e}`);
      }
    }
  }

  /**
   * Start a native preview for a session
   *
   * Multi-project behavior:
   * - Same workspace (same project, different branch) → auto-kill existing, seamless switch
   * - Different workspace → return conflict info for user to choose action
   *
   * @returns Success with port info, or conflict info for user resolution, or error
   */
  async start(
    sessionId: string,
    projectId: string,
    projectPath: string,
    branch: string
  ): Promise<PreviewStartResult> {
    console.log(`[NativePreview] Starting preview for session ${sessionId}, project ${projectId}`);
    console.log(`[NativePreview] Path: ${projectPath}, Branch: ${branch}`);

    // Check compliance first
    const compliance = await this.checkCompliance(projectPath);
    if (!compliance.canPreview) {
      const suggestionText = compliance.suggestions?.length
        ? `\nSuggestions:\n${compliance.suggestions.map(s => `  - ${s}`).join("\n")}`
        : "";
      return { success: false, error: `Cannot preview: ${compliance.reason}${suggestionText}` };
    }

    // Check if there's already a preview for THIS session
    const existingPreview = this.previews.get(sessionId);

    if (existingPreview) {
      // Same session - check if it's already running for this exact config
      if (
        existingPreview.projectPath === projectPath &&
        existingPreview.branch === branch &&
        existingPreview.status === "running"
      ) {
        console.log(`[NativePreview] Already running for this session`);
        return {
          success: true,
          port: existingPreview.port,
          url: `http://localhost:${existingPreview.port}`,
          framework: existingPreview.framework.name,
        };
      }

      // Same session but different config (e.g., switched branch) → stop and start fresh
      console.log(`[NativePreview] Stopping existing preview for session (config changed)`);
      console.log(`[NativePreview] Old: branch=${existingPreview.branch}, path=${existingPreview.projectPath}`);
      console.log(`[NativePreview] New: branch=${branch}, path=${projectPath}`);

      await this.stopForSession(sessionId);
    }

    // Check if node_modules exists - if not, install dependencies first
    // This is critical for worktrees which don't share node_modules
    const nodeModulesPath = join(projectPath, "node_modules");
    if (!existsSync(nodeModulesPath)) {
      console.log(`[NativePreview] node_modules not found, installing dependencies...`);
      await this.installDependencies(projectPath);
    }

    // Clean up any stale lock files (Next.js, Vite, etc.)
    // This prevents "another instance running" errors
    await this.cleanupLockFiles(projectPath);

    // Detect framework and package manager
    const framework = await detectFramework(projectPath, false);
    console.log(`[NativePreview] Detected: ${describeFramework(framework)}`);

    // Check for hardcoded port in package.json scripts
    const scriptPort = this.detectHardcodedPort(projectPath);
    const targetPort = scriptPort || framework.defaultPort;
    console.log(`[NativePreview] Target port: ${targetPort} (${scriptPort ? 'from package.json' : 'framework default'})`);

    // CRITICAL: Use mutex lock for port operations to prevent race conditions
    // when multiple projects start simultaneously
    const releasePortLock = await this.acquirePortLock();
    let finalPort: number;

    try {
      // Check for port conflicts with smart resolution
      const conflictResult = await this.checkPortConflictSmart(
        targetPort,
        projectPath,
        sessionId,
        projectId,
        framework
      );

      // If there's a conflict requiring user decision, return it
      if (conflictResult.needsUserDecision) {
        // Store the pending conflict for later resolution
        this.pendingConflicts.set(sessionId, {
          sessionId,
          projectId,
          projectPath,
          branch,
          requestedPort: targetPort,
          alternativePort: conflictResult.alternativePort!,
          conflictProcess: conflictResult.conflictProcess!,
          framework,
          createdAt: Date.now(),
        });

        return {
          success: false,
          conflict: {
            hasConflict: true,
            requestedPort: targetPort,
            alternativePort: conflictResult.alternativePort!,
            conflictProcess: conflictResult.conflictProcess!,
          },
        };
      }

      // No conflict or auto-resolved - use the determined port
      finalPort = conflictResult.port;
      console.log(`[NativePreview] Using port ${finalPort}`);
      if (conflictResult.action) {
        console.log(`[NativePreview] Port action: ${conflictResult.action} - ${conflictResult.reason}`);
      }

      // Reserve the port BEFORE spawning to prevent race conditions
      this.portReservations.set(finalPort, sessionId);
      console.log(`[NativePreview] Reserved port ${finalPort} for session ${sessionId}`);
    } finally {
      // Release lock after port is reserved but before spawn (spawn can take time)
      releasePortLock();
    }

    // Build dev command with port override
    const devCommand = this.buildDevCommand(framework, finalPort);
    console.log(`[NativePreview] Command: ${devCommand}`);

    // Spawn process (detached so we can kill the process group)
    const childProcess = spawn(devCommand, {
      cwd: projectPath,
      shell: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PORT: finalPort.toString(),
        // Disable interactive prompts
        CI: "true",
        FORCE_COLOR: "1",
      },
    });

    const logs: string[] = [];

    // Capture stdout
    childProcess.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      logs.push(...lines);
      if (logs.length > this.maxLogLines) {
        logs.splice(0, logs.length - this.maxLogLines);
      }
    });

    // Capture stderr
    childProcess.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      logs.push(...lines);
      if (logs.length > this.maxLogLines) {
        logs.splice(0, logs.length - this.maxLogLines);
      }
    });

    // Create the preview object
    const preview: NativePreview = {
      sessionId,
      projectId,
      projectPath,
      branch,
      framework,
      process: childProcess,
      port: finalPort,
      status: "starting",
      startedAt: Date.now(),
      logs,
    };

    // Handle process exit
    childProcess.on("exit", (code) => {
      console.log(`[NativePreview] Process exited with code ${code} for session ${sessionId}`);
      const existingPreview = this.previews.get(sessionId);
      if (existingPreview) {
        existingPreview.status = "error";
        existingPreview.error = `Process exited with code ${code}`;
      }
    });

    // Store preview in the Map (keyed by sessionId)
    this.previews.set(sessionId, preview);

    // Clear the port reservation since it's now registered as an active preview
    this.portReservations.delete(finalPort);
    console.log(`[NativePreview] Active previews: ${this.previews.size}`);

    // Start health check polling
    this.pollHealth(sessionId, projectId);

    return {
      success: true,
      port: finalPort,
      url: `http://localhost:${finalPort}`,
      framework: framework.name,
    };
  }

  /**
   * Stop preview for a specific session
   */
  async stopForSession(sessionId: string): Promise<void> {
    const preview = this.previews.get(sessionId);
    if (!preview) return;

    const port = preview.port;

    console.log(`[NativePreview] Stopping preview for session ${sessionId} on port ${port}`);

    // Remove from map first
    this.previews.delete(sessionId);

    // Also clear any port reservations for this session
    for (const [reservedPort, reservedSessionId] of this.portReservations.entries()) {
      if (reservedSessionId === sessionId) {
        this.portReservations.delete(reservedPort);
      }
    }

    await this.killPreviewProcess(preview);
  }

  /**
   * Stop preview for a specific project (stops ALL sessions for that project)
   * Use stopForSession for single session stops
   */
  async stopForProject(projectId: string): Promise<void> {
    // Find all sessions for this project and stop them
    for (const [sessionId, preview] of this.previews.entries()) {
      if (preview.projectId === projectId) {
        await this.stopForSession(sessionId);
      }
    }
  }

  /**
   * Stop all previews (legacy method, for backwards compatibility)
   */
  async stop(): Promise<void> {
    // Stop all previews
    const sessionIds = Array.from(this.previews.keys());
    for (const sessionId of sessionIds) {
      await this.stopForSession(sessionId);
    }
  }

  /**
   * Kill a preview's process and wait for port release
   *
   * SAFETY: Only kills the specific spawned process by PID.
   * Never blindly kills everything on a port - that could kill Navi itself!
   */
  private async killPreviewProcess(preview: NativePreview): Promise<void> {
    const port = preview.port;
    const sessionId = preview.sessionId;
    const pid = preview.process.pid;

    console.log(`[NativePreview] Stopping preview for session ${sessionId} (PID: ${pid}, port: ${port})`);

    // CRITICAL: Only kill by PID, never by port!
    // The port might now be used by something else (like Navi server after restart)
    if (!pid) {
      console.warn(`[NativePreview] No PID for preview, cannot kill safely`);
      return;
    }

    // Check if our spawned process is still alive
    const isOurProcessAlive = this.isProcessAlive(pid);
    if (!isOurProcessAlive) {
      console.log(`[NativePreview] Process ${pid} already dead, nothing to kill`);
      return;
    }

    try {
      // Kill ONLY the specific process we spawned - never use lsof!
      try {
        preview.process.kill("SIGTERM");
        console.log(`[NativePreview] Sent SIGTERM to PID ${pid}`);
      } catch (e) {
        console.log(`[NativePreview] SIGTERM failed (process may be dead): ${e}`);
      }

      // Wait a moment for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // If still alive, force kill
      if (!preview.process.killed && this.isProcessAlive(pid)) {
        try {
          preview.process.kill("SIGKILL");
          console.log(`[NativePreview] Sent SIGKILL to PID ${pid}`);
        } catch {}
      }

      console.log(`[NativePreview] Preview process ${pid} stopped`);
    } catch (e) {
      console.error("[NativePreview] Error stopping preview:", e);
    }
  }

  /**
   * Check if a process is still alive by PID
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without actually killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find a preview by port number
   */
  private findPreviewByPort(port: number): NativePreview | undefined {
    for (const preview of this.previews.values()) {
      if (preview.port === port) {
        return preview;
      }
    }
    return undefined;
  }

  /**
   * Get all active previews
   */
  listAll(): Array<{
    projectId: string;
    sessionId: string;
    branch: string;
    port: number;
    url: string;
    status: string;
    framework: string;
  }> {
    return Array.from(this.previews.values()).map((p) => ({
      projectId: p.projectId,
      sessionId: p.sessionId,
      branch: p.branch,
      port: p.port,
      url: `http://localhost:${p.port}`,
      status: p.status,
      framework: p.framework.name,
    }));
  }

  /**
   * Get current preview status (global - returns first running preview for backwards compat)
   */
  getStatus(): {
    running: boolean;
    sessionId?: string;
    projectId?: string;
    projectPath?: string;
    branch?: string;
    port?: number;
    url?: string;
    status?: string;
    framework?: string;
    error?: string;
    startedAt?: number;
    activeCount?: number;
  } {
    const first = this.currentPreview;
    if (!first) {
      return { running: false, activeCount: 0 };
    }

    return {
      running: true,
      sessionId: first.sessionId,
      projectId: first.projectId,
      projectPath: first.projectPath,
      branch: first.branch,
      port: first.port,
      url: `http://localhost:${first.port}`,
      status: first.status,
      framework: first.framework.name,
      error: first.error,
      startedAt: first.startedAt,
      activeCount: this.previews.size,
    };
  }

  /**
   * Find preview by session ID (direct lookup since map is keyed by sessionId)
   */
  private findBySession(sessionId: string): NativePreview | undefined {
    return this.previews.get(sessionId);
  }

  /**
   * Get current preview by session ID
   */
  getBySession(sessionId: string): {
    running: boolean;
    port?: number;
    url?: string;
    status?: string;
    framework?: string;
    error?: string;
    branch?: string;
    projectId?: string;
  } {
    const preview = this.findBySession(sessionId);
    if (!preview) {
      return { running: false };
    }

    return {
      running: true,
      port: preview.port,
      url: `http://localhost:${preview.port}`,
      status: preview.status,
      framework: preview.framework.name,
      error: preview.error,
      branch: preview.branch,
      projectId: preview.projectId,
    };
  }

  /**
   * Get preview by project ID
   */
  getByProject(projectId: string): {
    running: boolean;
    port?: number;
    url?: string;
    status?: string;
    framework?: string;
    error?: string;
    branch?: string;
    sessionId?: string;
  } {
    const preview = this.previews.get(projectId);
    if (!preview) {
      return { running: false };
    }

    return {
      running: true,
      port: preview.port,
      url: `http://localhost:${preview.port}`,
      status: preview.status,
      framework: preview.framework.name,
      error: preview.error,
      branch: preview.branch,
      sessionId: preview.sessionId,
    };
  }

  /**
   * Check if preview is running for a specific session
   */
  isRunningForSession(sessionId: string): boolean {
    const preview = this.findBySession(sessionId);
    return preview?.status === "running";
  }

  /**
   * Get preview logs (from first active preview for backwards compat)
   */
  getLogs(tail: number = 50): string[] {
    const first = this.currentPreview;
    if (!first) return [];
    return first.logs.slice(-tail);
  }

  /**
   * Get logs for a specific session
   */
  getLogsBySession(sessionId: string, tail: number = 50): string[] {
    const preview = this.findBySession(sessionId);
    if (!preview) return [];
    return preview.logs.slice(-tail);
  }

  /**
   * Find next available port, skipping:
   * - Reserved Navi ports (3001, 3002, etc.)
   * - Ports with pending reservations
   * - Ports already used by other Navi previews
   * - Ports in use by other processes
   */
  private async findSafePort(startPort: number): Promise<number> {
    let port = startPort;
    const maxAttempts = 100; // Prevent infinite loop
    const net = await import("net");

    for (let i = 0; i < maxAttempts; i++) {
      // 1. Skip Navi reserved ports
      while (RESERVED_PORTS.has(port)) {
        console.log(`[NativePreview] Port ${port} is reserved for Navi, skipping...`);
        port++;
      }

      // 2. Skip ports with pending reservations
      if (this.portReservations.has(port)) {
        console.log(`[NativePreview] Port ${port} has pending reservation, skipping...`);
        port++;
        continue;
      }

      // 3. Skip ports already used by other Navi previews
      const usedByPreview = this.findPreviewByPort(port);
      if (usedByPreview) {
        console.log(`[NativePreview] Port ${port} used by session ${usedByPreview.sessionId}, skipping...`);
        port++;
        continue;
      }

      // 4. Check if port is actually free (not used by any process)
      const isAvailable = await this.isPortAvailable(port, net);
      if (isAvailable) {
        console.log(`[NativePreview] Found available port: ${port}`);
        return port;
      }

      console.log(`[NativePreview] Port ${port} is in use by external process, skipping...`);
      port++;
    }

    // Fallback - shouldn't normally reach here
    console.warn(`[NativePreview] Could not find free port after ${maxAttempts} attempts, trying portFixer fallback`);
    return portFixer.findAvailablePort(startPort + maxAttempts);
  }

  /**
   * Check if a port is reserved by another session (either running preview or pending reservation)
   */
  private isPortReservedByOther(port: number, currentSessionId?: string): string | null {
    // Check active previews (keyed by sessionId)
    for (const [sessionId, preview] of this.previews.entries()) {
      if (preview.port === port && sessionId !== currentSessionId) {
        // Also verify the preview is actually running (not stale)
        if (preview.process.pid && this.isProcessAlive(preview.process.pid)) {
          return sessionId;
        }
      }
    }

    // Check pending reservations (for concurrent starts)
    const reservedBy = this.portReservations.get(port);
    if (reservedBy && reservedBy !== currentSessionId) {
      return reservedBy;
    }

    return null;
  }

  /**
   * Smart port conflict checker that determines whether to:
   * - Auto-kill (same workspace / worktree scenarios)
   * - Return conflict for user decision (different workspaces)
   * - Just use the port (no conflict)
   */
  private async checkPortConflictSmart(
    targetPort: number,
    projectPath: string,
    sessionId: string,
    projectId: string,
    framework: DetectedFramework
  ): Promise<{
    port: number;
    needsUserDecision?: boolean;
    alternativePort?: number;
    conflictProcess?: {
      pid: number;
      name: string;
      isDevServer: boolean;
      isSameWorkspace: boolean;
    };
    action?: string;
    reason?: string;
  }> {
    // CRITICAL: Never use reserved Navi ports
    if (RESERVED_PORTS.has(targetPort)) {
      console.log(`[NativePreview] Port ${targetPort} is reserved for Navi services, finding new port...`);
      const newPort = await this.findSafePort(targetPort + 1);
      return {
        port: newPort,
        action: "reassigned",
        reason: `Port ${targetPort} is reserved for Navi, using ${newPort}`,
      };
    }

    // Check if port is reserved by another Navi session
    const reservedBy = this.isPortReservedByOther(targetPort, sessionId);
    if (reservedBy) {
      console.log(`[NativePreview] Port ${targetPort} is reserved by session ${reservedBy}, finding new port...`);
      const newPort = await this.findSafePort(targetPort + 1);
      return {
        port: newPort,
        action: "reassigned",
        reason: `Port ${targetPort} reserved by another session, using ${newPort}`,
      };
    }

    // Check if port is in use by external process
    const conflict = await portFixer.analyzeConflict(targetPort, projectPath, false);

    if (!conflict) {
      // Port is free, use it
      return { port: targetPort };
    }

    const processInfo = conflict.conflictingProcess;
    console.log(`[NativePreview] Port ${targetPort} is in use by ${processInfo.process} (PID: ${processInfo.pid})`);

    // Determine if this is from the same workspace
    // Same workspace = same project base path (parent directory of worktrees)
    const isSameWorkspace = this.isSameWorkspace(projectPath, processInfo.projectPath);

    // If same workspace (e.g., different branch of same project), auto-kill seamlessly
    if (isSameWorkspace && processInfo.isDevServer) {
      console.log(`[NativePreview] Same workspace detected, auto-killing process on port ${targetPort}...`);
      await this.forceKillPort(targetPort);

      // Verify port is now free
      const stillInUse = await portFixer.analyzeConflict(targetPort, projectPath, false);
      if (!stillInUse) {
        return {
          port: targetPort,
          action: "auto-killed",
          reason: `Auto-killed same-workspace dev server (${processInfo.process}) to switch branches`,
        };
      }
      // If still in use, fall through to user decision
    }

    // Different workspace or couldn't auto-kill → ask user
    // Find an alternative port to offer
    const alternativePort = await this.findSafePort(targetPort + 1);

    return {
      port: targetPort,
      needsUserDecision: true,
      alternativePort,
      conflictProcess: {
        pid: processInfo.pid,
        name: processInfo.process,
        isDevServer: processInfo.isDevServer,
        isSameWorkspace,
      },
    };
  }

  /**
   * Check if two paths are from the same workspace
   * This considers worktrees to be part of the same workspace if they share the same project root
   */
  private isSameWorkspace(path1: string, path2: string | undefined): boolean {
    if (!path2) return false;

    // Normalize paths
    const norm1 = path1.replace(/\/+$/, "");
    const norm2 = path2.replace(/\/+$/, "");

    // Direct match
    if (norm1 === norm2) return true;

    // Check if one is a parent of the other (worktree scenario)
    // Worktrees are typically in .worktrees/ subfolder of the main repo
    const isWorktreePath = (p: string) => p.includes(".worktrees/") || p.includes("/.worktrees/");

    if (isWorktreePath(norm1) || isWorktreePath(norm2)) {
      // Extract the base project path (before .worktrees)
      const getBasePath = (p: string) => {
        const worktreeIdx = p.indexOf(".worktrees");
        return worktreeIdx > 0 ? p.slice(0, worktreeIdx - 1) : p;
      };

      const base1 = getBasePath(norm1);
      const base2 = getBasePath(norm2);

      return base1 === base2;
    }

    return false;
  }

  /**
   * Resolve a pending port conflict by user choice
   *
   * @param sessionId The session with the pending conflict
   * @param action 'use_alternative' to use the offered alternative port, 'kill_and_use_original' to kill the conflicting process
   */
  async resolveConflict(
    sessionId: string,
    action: "use_alternative" | "kill_and_use_original"
  ): Promise<PreviewStartResult> {
    const pending = this.pendingConflicts.get(sessionId);
    if (!pending) {
      return { success: false, error: "No pending conflict found for this session" };
    }

    // Clear the pending conflict
    this.pendingConflicts.delete(sessionId);

    const { projectId, projectPath, branch, requestedPort, alternativePort, framework } = pending;

    let portToUse: number;

    if (action === "use_alternative") {
      portToUse = alternativePort;
      console.log(`[NativePreview] User chose alternative port ${portToUse}`);
    } else {
      // Kill the conflicting process and use the original port
      console.log(`[NativePreview] User chose to kill process on port ${requestedPort}`);
      await this.forceKillPort(requestedPort);

      // Verify the port is now free
      const stillInUse = await portFixer.analyzeConflict(requestedPort, projectPath, false);
      if (stillInUse) {
        console.error(`[NativePreview] Could not free port ${requestedPort} after kill`);
        return {
          success: false,
          error: `Could not free port ${requestedPort}. The process may have respawned. Try using the alternative port instead.`,
        };
      }
      portToUse = requestedPort;
    }

    // Now spawn the preview on the chosen port
    return this.spawnPreview(sessionId, projectId, projectPath, branch, framework, portToUse);
  }

  /**
   * Internal method to spawn a preview on a specific port (used by both start and resolveConflict)
   */
  private async spawnPreview(
    sessionId: string,
    projectId: string,
    projectPath: string,
    branch: string,
    framework: DetectedFramework,
    port: number
  ): Promise<PreviewStartResult> {
    // Reserve the port
    this.portReservations.set(port, sessionId);
    console.log(`[NativePreview] Reserved port ${port} for session ${sessionId}`);

    // Build dev command with port override
    const devCommand = this.buildDevCommand(framework, port);
    console.log(`[NativePreview] Command: ${devCommand}`);

    // Spawn process (detached so we can kill the process group)
    const childProcess = spawn(devCommand, {
      cwd: projectPath,
      shell: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PORT: port.toString(),
        CI: "true",
        FORCE_COLOR: "1",
      },
    });

    const logs: string[] = [];

    // Capture stdout
    childProcess.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      logs.push(...lines);
      if (logs.length > this.maxLogLines) {
        logs.splice(0, logs.length - this.maxLogLines);
      }
    });

    // Capture stderr
    childProcess.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      logs.push(...lines);
      if (logs.length > this.maxLogLines) {
        logs.splice(0, logs.length - this.maxLogLines);
      }
    });

    // Create the preview object
    const preview: NativePreview = {
      sessionId,
      projectId,
      projectPath,
      branch,
      framework,
      process: childProcess,
      port,
      status: "starting",
      startedAt: Date.now(),
      logs,
    };

    // Handle process exit
    childProcess.on("exit", (code) => {
      console.log(`[NativePreview] Process exited with code ${code} for session ${sessionId}`);
      const existingPreview = this.previews.get(sessionId);
      if (existingPreview) {
        existingPreview.status = "error";
        existingPreview.error = `Process exited with code ${code}`;
      }
    });

    // Store preview in the Map
    this.previews.set(sessionId, preview);

    // Clear the port reservation
    this.portReservations.delete(port);
    console.log(`[NativePreview] Active previews: ${this.previews.size}`);

    // Start health check polling
    this.pollHealth(sessionId, projectId);

    return {
      success: true,
      port,
      url: `http://localhost:${port}`,
      framework: framework.name,
    };
  }

  /**
   * Ensure a port is available for a session
   *
   * Multi-session behavior:
   * - If port is RESERVED (Navi services) → NEVER use or kill, find new port
   * - If port is used by ANOTHER session's preview → DON'T kill, find new port
   * - If port has a pending reservation → DON'T use, find new port
   * - If port is used by external process → kill it (it's probably a stale dev server)
   * - If port is free → use it
   */
  private async ensurePortAvailable(
    targetPort: number,
    projectPath: string,
    currentSessionId?: string
  ): Promise<{ port: number; action?: string; reason?: string }> {
    // CRITICAL: Never use or kill reserved Navi ports
    if (RESERVED_PORTS.has(targetPort)) {
      console.log(`[NativePreview] Port ${targetPort} is reserved for Navi services, finding new port...`);
      const newPort = await this.findSafePort(targetPort + 1);
      return {
        port: newPort,
        action: "reassigned",
        reason: `Port ${targetPort} is reserved for Navi, using ${newPort}`,
      };
    }

    // Check if port is reserved by another session (active preview or pending reservation)
    const reservedBy = this.isPortReservedByOther(targetPort, currentSessionId);
    if (reservedBy) {
      console.log(`[NativePreview] Port ${targetPort} is reserved by session ${reservedBy}, finding new port...`);
      const newPort = await this.findSafePort(targetPort + 1);
      return {
        port: newPort,
        action: "reassigned",
        reason: `Port ${targetPort} reserved by another session, using ${newPort}`,
      };
    }

    // Check if port is in use by external process
    const conflict = await portFixer.analyzeConflict(targetPort, projectPath, false);

    if (!conflict) {
      // Port is free, use it
      return { port: targetPort };
    }

    console.log(`[NativePreview] Port ${targetPort} is in use by ${conflict.conflictingProcess.process} (PID: ${conflict.conflictingProcess.pid})`);

    // Double-check: don't kill if port is reserved (belt and suspenders)
    if (RESERVED_PORTS.has(targetPort)) {
      const newPort = await this.findSafePort(targetPort + 1);
      return {
        port: newPort,
        action: "reassigned",
        reason: `Port ${targetPort} is reserved, using ${newPort}`,
      };
    }

    // Kill external dev servers - they're safe to kill
    if (conflict.conflictingProcess.isDevServer || !conflict.conflictingProcess.isSystemProcess) {
      console.log(`[NativePreview] Killing external process on port ${targetPort}...`);
      await this.forceKillPort(targetPort);

      // Verify port is now free
      const stillInUse = await portFixer.analyzeConflict(targetPort, projectPath, false);
      if (!stillInUse) {
        return {
          port: targetPort,
          action: "killed",
          reason: `Killed ${conflict.conflictingProcess.process} (PID: ${conflict.conflictingProcess.pid})`,
        };
      }
      console.warn(`[NativePreview] Port ${targetPort} still in use after kill attempt`);
    }

    // If we couldn't free the port, find another one (skipping reserved ports)
    const newPort = await this.findSafePort(targetPort + 1);
    return {
      port: newPort,
      action: "reassigned",
      reason: `Could not free port ${targetPort}, using ${newPort} instead`,
    };
  }

  /**
   * Force kill any process using a specific port
   * Uses graceful SIGTERM first, then SIGKILL only for stubborn processes
   * Only targets LISTEN state connections to avoid killing unrelated processes
   *
   * CRITICAL: Never call this on reserved ports!
   */
  private async forceKillPort(port: number): Promise<void> {
    // SAFETY CHECK: Never kill reserved ports
    if (RESERVED_PORTS.has(port)) {
      console.error(`[NativePreview] REFUSED to kill reserved port ${port}! This is a Navi service.`);
      return;
    }

    const { execSync } = await import("child_process");

    console.log(`[NativePreview] Killing process on port ${port}...`);

    try {
      // Get PIDs using this specific port (LISTEN state only to be surgical)
      const pidsOutput = execSync(
        `lsof -ti :${port} -sTCP:LISTEN 2>/dev/null || true`,
        { encoding: "utf-8", timeout: 5000 }
      );
      const pids = pidsOutput.trim().split("\n").filter(p => p && /^\d+$/.test(p));

      if (pids.length === 0) {
        console.log(`[NativePreview] No process found listening on port ${port}`);
        return;
      }

      console.log(`[NativePreview] Found PIDs on port ${port}: ${pids.join(", ")}`);

      // Step 1: Try graceful SIGTERM first
      for (const pid of pids) {
        try {
          execSync(`kill -TERM ${pid} 2>/dev/null || true`, { stdio: "pipe" });
          console.log(`[NativePreview] Sent SIGTERM to PID ${pid}`);
        } catch {
          // Process might already be dead
        }
      }

      // Wait 1 second for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Check if port is free, if not use SIGKILL
      const net = await import("net");
      if (!(await this.isPortAvailable(port, net))) {
        // Re-check which PIDs are still alive
        const remainingPidsOutput = execSync(
          `lsof -ti :${port} -sTCP:LISTEN 2>/dev/null || true`,
          { encoding: "utf-8", timeout: 5000 }
        );
        const remainingPids = remainingPidsOutput.trim().split("\n").filter(p => p && /^\d+$/.test(p));

        for (const pid of remainingPids) {
          try {
            execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: "pipe" });
            console.log(`[NativePreview] Sent SIGKILL to PID ${pid}`);
          } catch {
            // Ignore
          }
        }
      }

      // Wait for port to be released (up to 2 more seconds)
      const maxWait = 2000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        if (await this.isPortAvailable(port, net)) {
          console.log(`[NativePreview] Port ${port} is now free`);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.warn(`[NativePreview] Port ${port} may still be in use after kill`);
    } catch (e) {
      console.error(`[NativePreview] Error killing port ${port}:`, e);
    }
  }

  /**
   * Check if a port is available
   */
  private isPortAvailable(port: number, net: any): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once("error", () => {
        resolve(false);
      });

      server.once("listening", () => {
        server.close();
        resolve(true);
      });

      server.listen(port, "localhost");
    });
  }

  /**
   * Build dev command with port override
   *
   * NOTE: Many projects hardcode ports in package.json scripts like "next dev -p 3000"
   * We use environment variables which take precedence, and also prepend PORT= for safety.
   * The spawn() also sets PORT in env, so we have multiple fallbacks.
   */
  private buildDevCommand(framework: DetectedFramework, port: number): string {
    const { packageManager } = framework;
    const runCmd = packageManager === "bun" ? "bun run" : `${packageManager} run`;

    // Always prepend PORT env var - this overrides hardcoded ports in scripts
    // Most frameworks check PORT env var first before using CLI args
    const portEnv = `PORT=${port}`;

    // Framework-specific command building
    switch (framework.name) {
      case "next":
        // Next.js: PORT env takes precedence over -p flag
        // Also set HOSTNAME for binding
        return `${portEnv} HOSTNAME=0.0.0.0 ${runCmd} dev`;
      case "vite":
      case "sveltekit":
        // Vite respects PORT env var
        return `${portEnv} ${runCmd} dev -- --host 0.0.0.0`;
      case "astro":
        return `${portEnv} ${runCmd} dev -- --host 0.0.0.0`;
      case "nuxt":
        // Nuxt uses NUXT_PORT or PORT
        return `${portEnv} NUXT_HOST=0.0.0.0 ${runCmd} dev`;
      case "remix":
        return `${portEnv} ${runCmd} dev`;
      case "cra":
        // CRA uses PORT and HOST env vars
        return `${portEnv} HOST=0.0.0.0 ${runCmd} start`;
      case "angular":
        return `${portEnv} ${runCmd} start -- --host 0.0.0.0`;
      case "vue-cli":
        return `${portEnv} ${runCmd} serve -- --host 0.0.0.0`;
      default:
        // Generic: rely on PORT env var (also set in spawn env)
        return `${portEnv} ${runCmd} dev`;
    }
  }

  /**
   * Poll preview health
   */
  private async pollHealth(targetSessionId: string, _targetProjectId: string): Promise<void> {
    const preview = this.previews.get(targetSessionId);
    if (!preview) return;

    const maxWaitMs = 60000; // 1 minute
    const pollIntervalMs = 2000;
    const start = Date.now();

    const poll = async () => {
      // Check if this preview is still active for this session
      const currentPreview = this.previews.get(targetSessionId);
      if (!currentPreview) {
        console.log(`[NativePreview] Health poll cancelled - preview removed for session ${targetSessionId}`);
        return;
      }

      // Check timeout
      if (Date.now() - start > maxWaitMs) {
        currentPreview.status = "error";
        currentPreview.error = "Server failed to start within timeout";
        console.error(`[NativePreview] Health check timeout for session ${targetSessionId}`);
        return;
      }

      // Check if port is responding
      try {
        const response = await fetch(`http://localhost:${currentPreview.port}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok || response.status < 500) {
          currentPreview.status = "running";
          console.log(`[NativePreview] Server is healthy on port ${currentPreview.port} for session ${targetSessionId}`);
          return;
        }
      } catch {
        // Not ready yet, keep polling
      }

      // Check if process exited
      if (currentPreview.process.exitCode !== null) {
        currentPreview.status = "error";
        currentPreview.error = `Process exited with code ${currentPreview.process.exitCode}`;
        return;
      }

      // Poll again
      setTimeout(poll, pollIntervalMs);
    };

    setTimeout(poll, pollIntervalMs);
  }
}

// Singleton instance
export const nativePreviewService = new NativePreviewService();
