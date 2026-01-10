/**
 * Self-Healing Builds Service
 *
 * Continuously monitors builds and type checks, automatically attempting
 * to fix errors without user intervention. Integrates with the native
 * preview system to watch for build failures.
 *
 * Features:
 * - Watches build/typecheck processes for errors
 * - Automatically spawns repair agents to fix issues
 * - Tracks fix attempts to avoid infinite loops
 * - Integrates with session context for informed fixes
 */

import { spawn, ChildProcess, execSync } from "child_process";
import { existsSync, readFileSync, watch, FSWatcher } from "fs";
import { join } from "path";
import { EventEmitter } from "events";

// Types
export interface BuildError {
  id: string;
  type: "typescript" | "eslint" | "build" | "test" | "runtime";
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  severity: "error" | "warning";
  rawOutput: string;
  timestamp: number;
}

export interface HealingAttempt {
  id: string;
  errorId: string;
  strategy: string;
  startedAt: number;
  completedAt?: number;
  success: boolean;
  changes?: Array<{ file: string; diff: string }>;
  error?: string;
}

export interface HealingSession {
  projectId: string;
  projectPath: string;
  sessionId?: string;
  status: "idle" | "watching" | "healing" | "paused";
  errors: BuildError[];
  attempts: HealingAttempt[];
  maxAttempts: number;
  watchProcess?: ChildProcess;
  watcher?: FSWatcher;
  startedAt: number;
  lastErrorAt?: number;
  lastHealAt?: number;
}

export interface HealingConfig {
  enabled: boolean;
  autoFix: boolean;
  maxAttemptsPerError: number;
  cooldownMs: number;
  watchPatterns: string[];
  ignorePatterns: string[];
  commands: {
    typecheck: string;
    build: string;
    lint?: string;
    test?: string;
  };
}

// Error parsing patterns
const ERROR_PATTERNS = {
  typescript: [
    // TypeScript compiler errors: file(line,col): error TS1234: message
    /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS(\d+):\s*(.+)$/m,
    // Alternative format: file:line:col - error TS1234: message
    /^(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s+TS(\d+):\s*(.+)$/m,
  ],
  eslint: [
    // ESLint format: file:line:col warning/error message rule
    /^(.+?):(\d+):(\d+)\s+(warning|error)\s+(.+?)\s+(\S+)$/m,
  ],
  vite: [
    // Vite build errors
    /\[vite\].*?(?:error|Error).*?in\s+(.+?):(\d+):(\d+)/m,
  ],
  nextjs: [
    // Next.js errors
    /^error\s+-\s+(.+?):(\d+):(\d+)\s+(.+)$/m,
    /Type error:\s*(.+)/m,
  ],
};

// Healing strategies
const HEALING_STRATEGIES = {
  typescript: {
    missingImport: {
      pattern: /Cannot find (module|name) '(.+?)'/,
      fix: async (error: BuildError, projectPath: string) => {
        // This would be handled by spawning an agent
        return { strategy: "add-import", suggestion: `Import '${error.message.match(/Cannot find (?:module|name) '(.+?)'/)?.[1]}' is missing` };
      },
    },
    typeError: {
      pattern: /Type '(.+?)' is not assignable to type '(.+?)'/,
      fix: async (error: BuildError, projectPath: string) => {
        return { strategy: "fix-type", suggestion: `Type mismatch needs fixing` };
      },
    },
    missingProperty: {
      pattern: /Property '(.+?)' does not exist on type '(.+?)'/,
      fix: async (error: BuildError, projectPath: string) => {
        return { strategy: "add-property", suggestion: `Add missing property` };
      },
    },
  },
};

class SelfHealingBuildsService extends EventEmitter {
  private sessions: Map<string, HealingSession> = new Map();
  private configs: Map<string, HealingConfig> = new Map();
  private healingQueue: Array<{ projectId: string; error: BuildError }> = [];
  private isProcessingQueue = false;

  /**
   * Start watching a project for build errors
   */
  async startWatching(
    projectId: string,
    projectPath: string,
    sessionId?: string,
    config?: Partial<HealingConfig>
  ): Promise<HealingSession> {
    // Stop any existing session
    await this.stopWatching(projectId);

    const defaultConfig: HealingConfig = {
      enabled: true,
      autoFix: true,
      maxAttemptsPerError: 3,
      cooldownMs: 5000,
      watchPatterns: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx"],
      ignorePatterns: ["node_modules", ".git", "dist", "build"],
      commands: this.detectProjectCommands(projectPath),
    };

    const finalConfig = { ...defaultConfig, ...config };
    this.configs.set(projectId, finalConfig);

    const session: HealingSession = {
      projectId,
      projectPath,
      sessionId,
      status: "watching",
      errors: [],
      attempts: [],
      maxAttempts: finalConfig.maxAttemptsPerError,
      startedAt: Date.now(),
    };

    this.sessions.set(projectId, session);

    // Start file watcher
    this.startFileWatcher(session, finalConfig);

    // Run initial check
    await this.runCheck(projectId);

    this.emit("session:started", { projectId, session });
    console.log(`[SelfHealing] Started watching project ${projectId} at ${projectPath}`);

    return session;
  }

  /**
   * Stop watching a project
   */
  async stopWatching(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId);
    if (!session) return;

    session.status = "idle";

    if (session.watchProcess) {
      session.watchProcess.kill("SIGTERM");
    }

    if (session.watcher) {
      session.watcher.close();
    }

    this.sessions.delete(projectId);
    this.configs.delete(projectId);

    this.emit("session:stopped", { projectId });
    console.log(`[SelfHealing] Stopped watching project ${projectId}`);
  }

  /**
   * Pause auto-healing (useful when user is actively editing)
   */
  pauseHealing(projectId: string): void {
    const session = this.sessions.get(projectId);
    if (session && session.status === "watching") {
      session.status = "paused";
      this.emit("session:paused", { projectId });
    }
  }

  /**
   * Resume auto-healing
   */
  resumeHealing(projectId: string): void {
    const session = this.sessions.get(projectId);
    if (session && session.status === "paused") {
      session.status = "watching";
      this.emit("session:resumed", { projectId });
    }
  }

  /**
   * Get current session status
   */
  getSession(projectId: string): HealingSession | undefined {
    return this.sessions.get(projectId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): HealingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Manually trigger a check
   */
  async runCheck(projectId: string): Promise<BuildError[]> {
    const session = this.sessions.get(projectId);
    const config = this.configs.get(projectId);
    if (!session || !config) return [];

    console.log(`[SelfHealing] Running check for project ${projectId}`);

    const errors: BuildError[] = [];

    // Run typecheck
    if (config.commands.typecheck) {
      const tsErrors = await this.runCommand(
        session.projectPath,
        config.commands.typecheck,
        "typescript"
      );
      errors.push(...tsErrors);
    }

    // Run lint
    if (config.commands.lint) {
      const lintErrors = await this.runCommand(
        session.projectPath,
        config.commands.lint,
        "eslint"
      );
      errors.push(...lintErrors);
    }

    // Update session
    session.errors = errors;
    if (errors.length > 0) {
      session.lastErrorAt = Date.now();
    }

    this.emit("check:complete", { projectId, errors });

    // Queue errors for healing if auto-fix is enabled
    if (config.autoFix && config.enabled && errors.length > 0) {
      for (const error of errors) {
        if (error.severity === "error") {
          this.queueForHealing(projectId, error);
        }
      }
    }

    return errors;
  }

  /**
   * Queue an error for healing
   */
  private queueForHealing(projectId: string, error: BuildError): void {
    const session = this.sessions.get(projectId);
    if (!session) return;

    // Check if we've already tried too many times
    const attempts = session.attempts.filter((a) => a.errorId === error.id);
    if (attempts.length >= session.maxAttempts) {
      console.log(`[SelfHealing] Max attempts reached for error ${error.id}, skipping`);
      return;
    }

    // Check cooldown
    const lastAttempt = attempts[attempts.length - 1];
    const config = this.configs.get(projectId);
    if (lastAttempt && config && Date.now() - lastAttempt.startedAt < config.cooldownMs) {
      console.log(`[SelfHealing] Cooldown active for error ${error.id}, skipping`);
      return;
    }

    // Add to queue
    this.healingQueue.push({ projectId, error });
    this.processQueue();
  }

  /**
   * Process the healing queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.healingQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.healingQueue.length > 0) {
      const item = this.healingQueue.shift();
      if (!item) continue;

      const session = this.sessions.get(item.projectId);
      if (!session || session.status !== "watching") continue;

      session.status = "healing";
      this.emit("healing:started", { projectId: item.projectId, error: item.error });

      try {
        await this.attemptHeal(item.projectId, item.error);
      } catch (err) {
        console.error(`[SelfHealing] Healing failed:`, err);
      }

      session.status = "watching";
      session.lastHealAt = Date.now();
    }

    this.isProcessingQueue = false;
  }

  /**
   * Attempt to heal an error
   */
  private async attemptHeal(projectId: string, error: BuildError): Promise<HealingAttempt> {
    const session = this.sessions.get(projectId);
    if (!session) throw new Error("Session not found");

    const attemptId = `heal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const attempt: HealingAttempt = {
      id: attemptId,
      errorId: error.id,
      strategy: "agent-fix",
      startedAt: Date.now(),
      success: false,
    };

    session.attempts.push(attempt);

    try {
      // Build context for the healing agent
      const context = this.buildHealingContext(error, session);

      // Emit event for the healing agent to pick up
      // In a real implementation, this would spawn a subagent
      this.emit("healing:request", {
        projectId,
        sessionId: session.sessionId,
        error,
        context,
        attemptId,
        callback: async (result: { success: boolean; changes?: any[]; error?: string }) => {
          attempt.completedAt = Date.now();
          attempt.success = result.success;
          attempt.changes = result.changes;
          attempt.error = result.error;

          this.emit("healing:complete", {
            projectId,
            attemptId,
            success: result.success,
            error: result.error,
          });

          // Re-run check if healing succeeded
          if (result.success) {
            await this.runCheck(projectId);
          }
        },
      });

      return attempt;
    } catch (err: any) {
      attempt.completedAt = Date.now();
      attempt.success = false;
      attempt.error = err.message;
      return attempt;
    }
  }

  /**
   * Build context for the healing agent
   */
  private buildHealingContext(error: BuildError, session: HealingSession): string {
    let context = `# Build Error Context

## Error Details
- **Type**: ${error.type}
- **File**: ${error.file || "unknown"}
- **Location**: Line ${error.line || "?"}, Column ${error.column || "?"}
- **Message**: ${error.message}
${error.code ? `- **Code**: ${error.code}` : ""}

## Raw Output
\`\`\`
${error.rawOutput}
\`\`\`

## Previous Attempts
${session.attempts
  .filter((a) => a.errorId === error.id)
  .map((a) => `- ${a.strategy}: ${a.success ? "succeeded" : `failed (${a.error})`}`)
  .join("\n") || "No previous attempts"}
`;

    // Add file content if available
    if (error.file) {
      const fullPath = join(session.projectPath, error.file);
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          const errorLine = error.line || 1;
          const startLine = Math.max(1, errorLine - 10);
          const endLine = Math.min(lines.length, errorLine + 10);
          const snippet = lines
            .slice(startLine - 1, endLine)
            .map((line, i) => {
              const lineNum = startLine + i;
              const marker = lineNum === errorLine ? ">>>" : "   ";
              return `${marker} ${lineNum}: ${line}`;
            })
            .join("\n");

          context += `
## Code Context
\`\`\`typescript
${snippet}
\`\`\`
`;
        } catch (e) {
          // Ignore read errors
        }
      }
    }

    return context;
  }

  /**
   * Run a command and parse errors
   */
  private async runCommand(
    projectPath: string,
    command: string,
    type: BuildError["type"]
  ): Promise<BuildError[]> {
    const errors: BuildError[] = [];

    try {
      const output = execSync(command, {
        cwd: projectPath,
        encoding: "utf-8",
        timeout: 60000,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      // Command succeeded, no errors
      return [];
    } catch (err: any) {
      const output = err.stdout || err.stderr || err.message || "";
      const parsedErrors = this.parseErrors(output, type);
      errors.push(...parsedErrors);
    }

    return errors;
  }

  /**
   * Parse errors from command output
   */
  private parseErrors(output: string, type: BuildError["type"]): BuildError[] {
    const errors: BuildError[] = [];
    const patterns = ERROR_PATTERNS[type as keyof typeof ERROR_PATTERNS] || [];

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, "gm");
      let match;

      while ((match = regex.exec(output)) !== null) {
        const error: BuildError = {
          id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type,
          file: match[1],
          line: parseInt(match[2]) || undefined,
          column: parseInt(match[3]) || undefined,
          severity: match[4]?.toLowerCase() === "warning" ? "warning" : "error",
          code: match[5] || undefined,
          message: match[6] || match[5] || match[0],
          rawOutput: match[0],
          timestamp: Date.now(),
        };

        errors.push(error);
      }
    }

    // If no patterns matched but there's output, create a generic error
    if (errors.length === 0 && output.trim()) {
      errors.push({
        id: `${type}-${Date.now()}-generic`,
        type,
        severity: "error",
        message: output.slice(0, 500),
        rawOutput: output,
        timestamp: Date.now(),
      });
    }

    return errors;
  }

  /**
   * Detect project commands from package.json
   */
  private detectProjectCommands(
    projectPath: string
  ): HealingConfig["commands"] {
    const commands: HealingConfig["commands"] = {
      typecheck: "npx tsc --noEmit",
      build: "npm run build",
    };

    try {
      const pkgPath = join(projectPath, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const scripts = pkg.scripts || {};

        // Detect package manager
        const hasBunLock = existsSync(join(projectPath, "bun.lockb"));
        const runner = hasBunLock ? "bun run" : "npm run";

        if (scripts.typecheck) commands.typecheck = `${runner} typecheck`;
        else if (scripts["type-check"]) commands.typecheck = `${runner} type-check`;
        else if (scripts.check) commands.typecheck = `${runner} check`;

        if (scripts.build) commands.build = `${runner} build`;
        if (scripts.lint) commands.lint = `${runner} lint`;
        if (scripts.test) commands.test = `${runner} test`;
      }
    } catch (e) {
      // Use defaults
    }

    return commands;
  }

  /**
   * Start file watcher for a session
   */
  private startFileWatcher(session: HealingSession, config: HealingConfig): void {
    // Debounce file changes
    let debounceTimer: NodeJS.Timeout | null = null;
    const debounceMs = 1000;

    try {
      session.watcher = watch(
        session.projectPath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          // Check ignore patterns
          if (config.ignorePatterns.some((p) => filename.includes(p))) {
            return;
          }

          // Check watch patterns (simplified)
          const isWatched = config.watchPatterns.some((p) => {
            const ext = p.split(".").pop();
            return filename.endsWith(`.${ext}`);
          });

          if (!isWatched) return;

          // Debounce
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (session.status === "watching") {
              console.log(`[SelfHealing] File changed: ${filename}`);
              this.runCheck(session.projectId);
            }
          }, debounceMs);
        }
      );

      console.log(`[SelfHealing] File watcher started for ${session.projectPath}`);
    } catch (err) {
      console.error(`[SelfHealing] Failed to start file watcher:`, err);
    }
  }
}

// Singleton instance
export const selfHealingService = new SelfHealingBuildsService();

// Export types
export type { HealingConfig };

// WebSocket event types for frontend consumption
export interface HealingWebSocketEvent {
  type:
    | "healing:session_started"
    | "healing:session_stopped"
    | "healing:check_complete"
    | "healing:started"
    | "healing:complete"
    | "healing:error_found"
    | "healing:status_changed";
  projectId: string;
  data?: unknown;
}
