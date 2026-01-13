/**
 * @deprecated This service is deprecated and scheduled for removal.
 * E2B cloud execution has been superseded by Navi Cloud.
 *
 * E2B Cloud Executor Service
 *
 * Runs Claude Code agents in E2B cloud sandboxes for isolated execution.
 * Supports git repo cloning, branch checkout, and real-time output streaming.
 */

import { Sandbox } from "e2b";

// E2B pre-built template with Claude Code installed
const CLAUDE_CODE_TEMPLATE = "anthropic-claude-code";

// Default sandbox timeout: 30 minutes
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// E2B pricing: ~$0.05/hour per vCPU (default 1 vCPU)
// Convert to cost per millisecond: $0.05 / 60 / 60 / 1000 = $0.0000000139 per ms
const E2B_COST_PER_MS = 0.05 / 3600000;

export interface CloudExecutionRequest {
  sessionId: string;
  projectId: string;
  prompt: string;
  repoUrl?: string;        // Git repo to clone (e.g., https://github.com/user/repo.git)
  branch?: string;         // Branch to checkout
  model?: string;          // Claude model to use
  anthropicApiKey: string; // API key for Claude
  workingDir?: string;     // Working directory in sandbox (default: /workspace)
  syncFilesBack?: boolean; // Whether to sync modified files back (default: false)
  localProjectPath?: string; // Local path to sync files to
}

export interface SyncedFile {
  path: string;
  content: string;
  size: number;
}

export interface CloudExecutionResult {
  success: boolean;
  exitCode: number;
  modifiedFiles?: string[];
  syncedFiles?: SyncedFile[];
  error?: string;
  duration: number;
  sandboxId: string;
  // Cost estimation
  estimatedCostUsd: number;
}

export type OutputCallback = (data: string, stream: "stdout" | "stderr") => void;
export type StageCallback = (stage: CloudExecutionStage, message?: string) => void;

export type CloudExecutionStage =
  | "starting"
  | "cloning"
  | "checkout"
  | "executing"
  | "syncing"
  | "completed"
  | "failed";

/**
 * Execute Claude Code in an E2B cloud sandbox
 */
export async function executeInCloud(
  request: CloudExecutionRequest,
  onOutput: OutputCallback,
  onStage: StageCallback,
): Promise<CloudExecutionResult> {
  const startTime = Date.now();
  let sandbox: Sandbox | null = null;

  try {
    onStage("starting", "Creating cloud sandbox...");

    // Create sandbox from pre-built Claude Code template
    sandbox = await Sandbox.create(CLAUDE_CODE_TEMPLATE, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      envVars: {
        ANTHROPIC_API_KEY: request.anthropicApiKey,
      },
    });

    const sandboxId = sandbox.sandboxId;
    const workDir = request.workingDir || "/workspace";

    // Clone repo if provided
    if (request.repoUrl) {
      onStage("cloning", `Cloning ${request.repoUrl}...`);

      const cloneResult = await sandbox.commands.run(
        `git clone --depth 1 ${request.repoUrl} ${workDir}`,
        {
          timeout: 120_000, // 2 min for clone
          onStdout: (data) => onOutput(data, "stdout"),
          onStderr: (data) => onOutput(data, "stderr"),
        }
      );

      if (cloneResult.exitCode !== 0) {
        throw new Error(`Failed to clone repository: exit code ${cloneResult.exitCode}`);
      }

      // Checkout specific branch if provided
      if (request.branch && request.branch !== "main" && request.branch !== "master") {
        onStage("checkout", `Checking out branch: ${request.branch}...`);

        // Fetch the specific branch
        await sandbox.commands.run(
          `cd ${workDir} && git fetch origin ${request.branch}:${request.branch}`,
          {
            timeout: 60_000,
            onStdout: (data) => onOutput(data, "stdout"),
            onStderr: (data) => onOutput(data, "stderr"),
          }
        );

        const checkoutResult = await sandbox.commands.run(
          `cd ${workDir} && git checkout ${request.branch}`,
          {
            timeout: 30_000,
            onStdout: (data) => onOutput(data, "stdout"),
            onStderr: (data) => onOutput(data, "stderr"),
          }
        );

        if (checkoutResult.exitCode !== 0) {
          throw new Error(`Failed to checkout branch ${request.branch}`);
        }
      }
    } else {
      // No repo - just create workspace directory
      await sandbox.commands.run(`mkdir -p ${workDir}`, {});
    }

    // Build the Claude Code command
    // Using -p for non-interactive mode and --dangerously-skip-permissions to allow all operations
    const escapedPrompt = escapeShellArg(request.prompt);
    const modelFlag = request.model ? `--model ${request.model}` : "";
    const claudeCmd = `cd ${workDir} && echo ${escapedPrompt} | claude -p ${modelFlag} --dangerously-skip-permissions`;

    onStage("executing", "Running Claude Code...");

    // Execute Claude Code with no timeout (let it run as long as needed)
    const result = await sandbox.commands.run(claudeCmd, {
      timeout: 0, // No timeout
      onStdout: (data) => onOutput(data, "stdout"),
      onStderr: (data) => onOutput(data, "stderr"),
    });

    // Get list of modified files if we have a git repo
    let modifiedFiles: string[] = [];
    if (request.repoUrl) {
      // Get both staged and unstaged changes, plus untracked files
      const diffResult = await sandbox.commands.run(
        `cd ${workDir} && (git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null) | sort -u`,
        { timeout: 10_000 }
      );
      modifiedFiles = (diffResult.stdout || "")
        .split("\n")
        .filter((f) => f.trim().length > 0);
    }

    // Sync files back if requested
    let syncedFiles: SyncedFile[] = [];
    if (request.syncFilesBack && modifiedFiles.length > 0) {
      onStage("syncing", `Syncing ${modifiedFiles.length} modified files...`);
      syncedFiles = await syncFilesFromSandbox(sandbox, workDir, modifiedFiles, onOutput);
    }

    const duration = Date.now() - startTime;
    const estimatedCostUsd = duration * E2B_COST_PER_MS;

    if (result.exitCode === 0) {
      onStage("completed", `Execution completed (${formatDuration(duration)}, ~$${estimatedCostUsd.toFixed(4)})`);
    } else {
      onStage("failed", `Execution failed with exit code ${result.exitCode}`);
    }

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      modifiedFiles,
      syncedFiles: syncedFiles.length > 0 ? syncedFiles : undefined,
      duration,
      sandboxId,
      estimatedCostUsd,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const estimatedCostUsd = duration * E2B_COST_PER_MS;

    onStage("failed", errorMessage);

    return {
      success: false,
      exitCode: -1,
      error: errorMessage,
      duration,
      sandboxId: sandbox?.sandboxId || "unknown",
      estimatedCostUsd,
    };

  } finally {
    // Always clean up the sandbox
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch (e) {
        console.error("[E2B] Failed to kill sandbox:", e);
      }
    }
  }
}

/**
 * Get a file from the sandbox after execution
 */
export async function getFileFromSandbox(
  sandboxId: string,
  filePath: string,
): Promise<string | null> {
  try {
    // Note: This requires keeping the sandbox alive, which we don't do currently
    // For now, return null - files should be retrieved during execution
    console.warn("[E2B] getFileFromSandbox called but sandbox is killed after execution");
    return null;
  } catch (error) {
    console.error("[E2B] Failed to get file:", error);
    return null;
  }
}

/**
 * List running sandboxes (for debugging/admin)
 */
export async function listRunningSandboxes(): Promise<string[]> {
  try {
    const sandboxes = await Sandbox.list();
    return sandboxes.map((s) => s.sandboxId);
  } catch (error) {
    console.error("[E2B] Failed to list sandboxes:", error);
    return [];
  }
}

/**
 * Kill a specific sandbox by ID
 */
export async function killSandbox(sandboxId: string): Promise<boolean> {
  try {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.kill();
    return true;
  } catch (error) {
    console.error(`[E2B] Failed to kill sandbox ${sandboxId}:`, error);
    return false;
  }
}

/**
 * Escape a string for safe use in shell commands
 */
function escapeShellArg(arg: string): string {
  // Use $'...' syntax for proper escaping
  return "$'" + arg
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    + "'";
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Sync modified files from sandbox back to result
 * Files are returned as content - caller decides whether to write to disk
 */
async function syncFilesFromSandbox(
  sandbox: Sandbox,
  workDir: string,
  modifiedFiles: string[],
  onOutput: OutputCallback,
): Promise<SyncedFile[]> {
  const syncedFiles: SyncedFile[] = [];
  const maxFileSize = 1024 * 1024; // 1MB max per file

  for (const filePath of modifiedFiles) {
    try {
      const fullPath = `${workDir}/${filePath}`;

      // Check file size first
      const statResult = await sandbox.commands.run(`stat -f%z "${fullPath}" 2>/dev/null || stat -c%s "${fullPath}" 2>/dev/null`, {
        timeout: 5000,
      });
      const fileSize = parseInt(statResult.stdout?.trim() || "0", 10);

      if (fileSize > maxFileSize) {
        onOutput(`Skipping ${filePath} (${(fileSize / 1024).toFixed(1)}KB > 1MB limit)\n`, "stderr");
        continue;
      }

      // Read file content
      const content = await sandbox.files.read(fullPath);

      if (typeof content === "string") {
        syncedFiles.push({
          path: filePath,
          content,
          size: content.length,
        });
        onOutput(`Synced: ${filePath} (${content.length} bytes)\n`, "stdout");
      }
    } catch (e) {
      onOutput(`Failed to sync ${filePath}: ${e instanceof Error ? e.message : String(e)}\n`, "stderr");
    }
  }

  return syncedFiles;
}

/**
 * Write synced files to local filesystem
 */
export async function writeSyncedFilesToDisk(
  syncedFiles: SyncedFile[],
  localBasePath: string,
): Promise<{ written: string[]; failed: string[] }> {
  const { writeFile, mkdir } = await import("fs/promises");
  const { dirname, join } = await import("path");

  const written: string[] = [];
  const failed: string[] = [];

  for (const file of syncedFiles) {
    try {
      const fullPath = join(localBasePath, file.path);

      // Ensure directory exists
      await mkdir(dirname(fullPath), { recursive: true });

      // Write file
      await writeFile(fullPath, file.content, "utf-8");
      written.push(file.path);
    } catch (e) {
      console.error(`[E2B] Failed to write ${file.path}:`, e);
      failed.push(file.path);
    }
  }

  return { written, failed };
}

/**
 * Estimate E2B cost for a given duration
 */
export function estimateE2bCost(durationMs: number, vcpus: number = 1): number {
  return durationMs * E2B_COST_PER_MS * vcpus;
}
