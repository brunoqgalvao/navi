/**
 * LLM-Powered Port Conflict Resolver
 *
 * Uses AI to intelligently resolve port conflicts by analyzing:
 * - What's currently using the port
 * - Whether it's safe to kill the process
 * - If reassigning to another port is better
 *
 * Decision matrix:
 * - Navi-owned process on same project → restart on new port
 * - Navi-owned process on different project → prompt user
 * - System process → always reassign to new port
 * - User's other dev server → prompt user or auto-reassign
 * - Unknown process → use LLM to decide
 */

import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface PortInfo {
  port: number;
  pid: number;
  process: string;
  command: string;
  user: string;
  isNaviOwned: boolean;
  isSystemProcess: boolean;
  isDevServer: boolean;
  projectPath?: string;
}

export interface ConflictResolution {
  action: "kill" | "reassign" | "prompt_user";
  newPort?: number;
  reason: string;
  confidence: number; // 0-1
  llmUsed: boolean;
}

export interface PortConflict {
  requestedPort: number;
  conflictingProcess: PortInfo;
  resolution: ConflictResolution;
}

// Known dev server patterns
const DEV_SERVER_PATTERNS = [
  /node.*vite/i,
  /node.*next/i,
  /node.*nuxt/i,
  /node.*svelte/i,
  /node.*astro/i,
  /node.*webpack/i,
  /node.*react-scripts/i,
  /bun.*dev/i,
  /npm.*dev/i,
  /nodemon/i,
  /ts-node/i,
];

// System processes we should never kill
const SYSTEM_PROCESSES = [
  "launchd",
  "kernel_task",
  "WindowServer",
  "loginwindow",
  "SystemUIServer",
  "Finder",
  "Dock",
  "cfprefsd",
  "UserEventAgent",
  "coreauthd",
  "sharingd",
  "nsurlsessiond",
  "postgres",
  "mysql",
  "mongod",
  "redis-server",
];

// Navi process identifiers
const NAVI_IDENTIFIERS = [
  "navi-app",
  "claude-code-ui",
  "navi-server",
];

class PortFixerService {
  private llmEndpoint: string;

  constructor() {
    // Use the navi-llm skill for decisions
    this.llmEndpoint = `${process.env.HOME}/.claude/skills/navi-llm/index.ts`;
  }

  /**
   * Analyze a port conflict and get resolution
   */
  async analyzeConflict(
    port: number,
    projectPath: string,
    useLlm: boolean = true
  ): Promise<PortConflict | null> {
    // Get info about what's using the port
    const portInfo = await this.getPortInfo(port);

    if (!portInfo) {
      // Port is available, no conflict
      return null;
    }

    console.log(`[PortFixer] Port ${port} conflict detected:`, portInfo);

    // Determine resolution
    const resolution = await this.determineResolution(portInfo, projectPath, useLlm);

    return {
      requestedPort: port,
      conflictingProcess: portInfo,
      resolution,
    };
  }

  /**
   * Resolve a port conflict (execute the resolution)
   */
  async resolveConflict(conflict: PortConflict): Promise<{ success: boolean; port: number; error?: string }> {
    const { resolution, conflictingProcess } = conflict;

    switch (resolution.action) {
      case "kill":
        try {
          console.log(`[PortFixer] Killing process ${conflictingProcess.pid} (${resolution.reason})`);
          await this.killProcess(conflictingProcess.pid);

          // Wait for port to be released
          await this.waitForPortRelease(conflict.requestedPort);

          return { success: true, port: conflict.requestedPort };
        } catch (e) {
          console.error(`[PortFixer] Failed to kill process:`, e);
          // Fallback to reassignment
          const newPort = await this.findAvailablePort(conflict.requestedPort);
          return { success: true, port: newPort };
        }

      case "reassign":
        const newPort = resolution.newPort || (await this.findAvailablePort(conflict.requestedPort));
        console.log(`[PortFixer] Reassigning to port ${newPort} (${resolution.reason})`);
        return { success: true, port: newPort };

      case "prompt_user":
        // Return with prompt_user action for the caller to handle
        const fallbackPort = await this.findAvailablePort(conflict.requestedPort);
        return {
          success: true,
          port: fallbackPort,
          error: `Port ${conflict.requestedPort} is in use by ${conflictingProcess.process}. Using ${fallbackPort} instead.`,
        };
    }
  }

  /**
   * Auto-fix a port conflict (analyze + resolve in one step)
   */
  async autoFix(
    port: number,
    projectPath: string,
    useLlm: boolean = true
  ): Promise<{ port: number; wasConflict: boolean; action?: string; reason?: string }> {
    const conflict = await this.analyzeConflict(port, projectPath, useLlm);

    if (!conflict) {
      return { port, wasConflict: false };
    }

    const result = await this.resolveConflict(conflict);

    return {
      port: result.port,
      wasConflict: true,
      action: conflict.resolution.action,
      reason: conflict.resolution.reason,
    };
  }

  /**
   * Get information about what's using a port
   */
  private async getPortInfo(port: number): Promise<PortInfo | null> {
    try {
      // Use lsof to get process info
      const { stdout } = await execAsync(`lsof -i :${port} -P -n 2>/dev/null || true`);

      if (!stdout.trim()) {
        return null;
      }

      // Parse lsof output
      const lines = stdout.trim().split("\n").slice(1); // Skip header
      if (lines.length === 0) return null;

      // Get the LISTEN process (prefer it over ESTABLISHED connections)
      const listenLine = lines.find((l) => l.includes("LISTEN")) || lines[0];
      const parts = listenLine.split(/\s+/);

      if (parts.length < 2) return null;

      const processName = parts[0];
      const pid = parseInt(parts[1], 10);
      const user = parts[2] || "unknown";

      // Get full command
      let command = "";
      try {
        const { stdout: cmdStdout } = await execAsync(`ps -p ${pid} -o command= 2>/dev/null || true`);
        command = cmdStdout.trim();
      } catch {
        command = processName;
      }

      return {
        port,
        pid,
        process: processName,
        command,
        user,
        isNaviOwned: this.isNaviProcess(command),
        isSystemProcess: this.isSystemProcess(processName),
        isDevServer: this.isDevServer(command),
        projectPath: this.extractProjectPath(command),
      };
    } catch (e) {
      console.error(`[PortFixer] Error getting port info:`, e);
      return null;
    }
  }

  /**
   * Determine how to resolve the conflict
   */
  private async determineResolution(
    portInfo: PortInfo,
    requestedProjectPath: string,
    useLlm: boolean
  ): Promise<ConflictResolution> {
    // Rule 1: Never kill system processes
    if (portInfo.isSystemProcess) {
      const newPort = await this.findAvailablePort(portInfo.port);
      return {
        action: "reassign",
        newPort,
        reason: `${portInfo.process} is a system process - cannot kill`,
        confidence: 1.0,
        llmUsed: false,
      };
    }

    // Rule 2: Navi-owned process for same project → kill and restart
    if (portInfo.isNaviOwned && portInfo.projectPath === requestedProjectPath) {
      return {
        action: "kill",
        reason: "Stale Navi preview for same project - restarting",
        confidence: 1.0,
        llmUsed: false,
      };
    }

    // Rule 3: Navi-owned process for different project → reassign (don't kill other project's preview)
    if (portInfo.isNaviOwned) {
      const newPort = await this.findAvailablePort(portInfo.port);
      return {
        action: "reassign",
        newPort,
        reason: `Port used by another Navi preview (${portInfo.projectPath || "unknown"}) - using different port`,
        confidence: 0.9,
        llmUsed: false,
      };
    }

    // Rule 4: Another dev server → KILL IT (dev servers are safe to kill)
    // This is aggressive but necessary because many package.json scripts have hardcoded ports
    // like "next dev -p 3000" which ignore PORT env var
    if (portInfo.isDevServer) {
      console.log(`[PortFixer] Dev server detected on port ${portInfo.port}, killing it`);
      return {
        action: "kill",
        reason: `Killing existing dev server (${portInfo.process}) to free port`,
        confidence: 0.9,
        llmUsed: false,
      };
    }

    // Rule 5: Unknown process → LLM or safe reassign
    if (useLlm) {
      return this.askLlmForDecision(portInfo, requestedProjectPath);
    }

    const newPort = await this.findAvailablePort(portInfo.port);
    return {
      action: "reassign",
      newPort,
      reason: `Unknown process (${portInfo.process}) - safely reassigning to avoid issues`,
      confidence: 0.6,
      llmUsed: false,
    };
  }

  /**
   * Ask LLM to decide on conflict resolution
   */
  private async askLlmForDecision(
    portInfo: PortInfo,
    requestedProjectPath: string
  ): Promise<ConflictResolution> {
    const prompt = `You are a port conflict resolver. Analyze this situation and decide the best action.

PORT CONFLICT:
- Port: ${portInfo.port}
- Process: ${portInfo.process} (PID: ${portInfo.pid})
- Command: ${portInfo.command}
- User: ${portInfo.user}
- Is Dev Server: ${portInfo.isDevServer}
- Process Project Path: ${portInfo.projectPath || "unknown"}
- Requested Project Path: ${requestedProjectPath}

RULES:
1. If it's a stale/orphan dev server from the SAME project → KILL (safe)
2. If it's a dev server from a DIFFERENT project → REASSIGN (don't disrupt other work)
3. If it's an important service (db, cache, api) → REASSIGN (never kill)
4. If it looks abandoned/stuck → KILL (cleanup)
5. If uncertain → REASSIGN (safer option)

Respond with EXACTLY one JSON object (no markdown, no explanation):
{"action": "kill" | "reassign", "reason": "brief explanation", "confidence": 0.0-1.0}`;

    try {
      const { stdout } = await execAsync(
        `bun "${this.llmEndpoint}" haiku "${prompt.replace(/"/g, '\\"')}" --json`,
        { timeout: 15000 }
      );

      // Parse LLM response
      const response = JSON.parse(stdout.trim());
      const decision = typeof response.response === "string"
        ? JSON.parse(response.response)
        : response;

      // Validate action
      if (!["kill", "reassign"].includes(decision.action)) {
        throw new Error("Invalid action from LLM");
      }

      const newPort = decision.action === "reassign"
        ? await this.findAvailablePort(portInfo.port)
        : undefined;

      return {
        action: decision.action,
        newPort,
        reason: decision.reason || "LLM decision",
        confidence: decision.confidence || 0.7,
        llmUsed: true,
      };
    } catch (e) {
      console.error(`[PortFixer] LLM decision failed, falling back to safe reassign:`, e);

      // Fallback to safe reassign
      const newPort = await this.findAvailablePort(portInfo.port);
      return {
        action: "reassign",
        newPort,
        reason: `LLM unavailable - safely reassigning (original: ${portInfo.process})`,
        confidence: 0.5,
        llmUsed: false,
      };
    }
  }

  /**
   * Find an available port starting from the given port
   */
  async findAvailablePort(startPort: number): Promise<number> {
    const net = await import("net");

    for (let port = startPort; port < startPort + 100; port++) {
      if (await this.isPortAvailable(port, net)) {
        return port;
      }
    }

    // If all in range are taken, try a random high port
    return this.findAvailablePort(Math.floor(Math.random() * 10000) + 40000);
  }

  /**
   * Check if a port is available
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
   * Kill a process by PID
   */
  private async killProcess(pid: number): Promise<void> {
    try {
      // Try graceful first
      execSync(`kill -TERM ${pid} 2>/dev/null || true`);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if still running
      try {
        execSync(`kill -0 ${pid} 2>/dev/null`);
        // Still running, force kill
        execSync(`kill -9 ${pid} 2>/dev/null || true`);
      } catch {
        // Process already dead, good
      }
    } catch (e) {
      console.error(`[PortFixer] Error killing process ${pid}:`, e);
    }
  }

  /**
   * Wait for a port to be released
   */
  private async waitForPortRelease(port: number, timeoutMs: number = 5000): Promise<boolean> {
    const net = await import("net");
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.isPortAvailable(port, net)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return false;
  }

  /**
   * Check if process is Navi-owned
   */
  private isNaviProcess(command: string): boolean {
    const lower = command.toLowerCase();
    return NAVI_IDENTIFIERS.some((id) => lower.includes(id.toLowerCase()));
  }

  /**
   * Check if process is a system process
   */
  private isSystemProcess(processName: string): boolean {
    return SYSTEM_PROCESSES.some(
      (sys) => processName.toLowerCase() === sys.toLowerCase()
    );
  }

  /**
   * Check if process is a dev server
   */
  private isDevServer(command: string): boolean {
    return DEV_SERVER_PATTERNS.some((pattern) => pattern.test(command));
  }

  /**
   * Extract project path from command
   */
  private extractProjectPath(command: string): string | undefined {
    // Try to find a path in the command
    const pathMatch = command.match(/(?:cwd|--cwd|cd)\s+([^\s]+)/);
    if (pathMatch) return pathMatch[1];

    // Look for common project directory patterns
    const projectMatch = command.match(/\/(?:Users|home)\/[^/]+\/[^/]+\/[^/\s]+/);
    return projectMatch?.[0];
  }

  /**
   * Get all ports currently in use by Navi
   */
  async getNaviPorts(): Promise<PortInfo[]> {
    try {
      const { stdout } = await execAsync(
        `lsof -i -P -n 2>/dev/null | grep -E 'node|bun' | grep LISTEN || true`
      );

      const ports: PortInfo[] = [];
      const lines = stdout.trim().split("\n").filter((l) => l);

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;

        const processName = parts[0];
        const pid = parseInt(parts[1], 10);
        const portMatch = parts[8]?.match(/:(\d+)$/);

        if (!portMatch) continue;

        const port = parseInt(portMatch[1], 10);

        // Get command
        let command = "";
        try {
          const { stdout: cmdStdout } = await execAsync(`ps -p ${pid} -o command= 2>/dev/null || true`);
          command = cmdStdout.trim();
        } catch {
          command = processName;
        }

        if (this.isNaviProcess(command)) {
          ports.push({
            port,
            pid,
            process: processName,
            command,
            user: parts[2] || "unknown",
            isNaviOwned: true,
            isSystemProcess: false,
            isDevServer: this.isDevServer(command),
            projectPath: this.extractProjectPath(command),
          });
        }
      }

      return ports;
    } catch {
      return [];
    }
  }

  /**
   * Cleanup all Navi-owned ports (useful for fresh start)
   */
  async cleanupNaviPorts(): Promise<number> {
    const naviPorts = await this.getNaviPorts();
    let cleaned = 0;

    for (const portInfo of naviPorts) {
      try {
        await this.killProcess(portInfo.pid);
        cleaned++;
        console.log(`[PortFixer] Cleaned up port ${portInfo.port} (PID: ${portInfo.pid})`);
      } catch {
        // Ignore errors
      }
    }

    return cleaned;
  }
}

// Singleton instance
export const portFixer = new PortFixerService();
