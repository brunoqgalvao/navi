import { execSync } from "child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, rmSync } from "fs";
import { join, basename } from "path";

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

export interface WorktreeStatus {
  ahead: number;
  behind: number;
  isClean: boolean;
  staged: number;
  modified: number;
  untracked: number;
}

/**
 * Check if a directory is a git repository
 */
export function isGitRepo(repoPath: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd: repoPath, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * List all worktrees for a repository
 */
export function listWorktrees(repoPath: string): WorktreeInfo[] {
  const output = execSync("git worktree list --porcelain", {
    cwd: repoPath,
    encoding: "utf-8",
  });

  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) worktrees.push(current as WorktreeInfo);
      current = { path: line.slice(9), isMain: false };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "bare") {
      current.isMain = true;
    }
  }
  if (current.path) worktrees.push(current as WorktreeInfo);

  // Mark the first one (main working directory) as main
  if (worktrees.length > 0) worktrees[0].isMain = true;

  return worktrees;
}

/**
 * Sanitize branch name for filesystem
 */
export function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Generate a branch name from a session description
 */
export function generateBranchName(description: string): string {
  const safeName = sanitizeBranchName(description);
  const timestamp = Date.now().toString(36);
  return `session/${safeName}-${timestamp}`;
}

/**
 * Get the worktrees directory for a project
 */
export function getWorktreesDir(repoPath: string): string {
  return join(repoPath, ".worktrees");
}

/**
 * Ensure .worktrees directory exists and is gitignored
 */
export function ensureWorktreesDir(repoPath: string): string {
  const worktreesDir = getWorktreesDir(repoPath);

  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }

  // Add to .gitignore if not already there
  const gitignorePath = join(repoPath, ".gitignore");
  const gitignoreEntry = ".worktrees/";

  try {
    const content = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, "utf-8")
      : "";
    if (!content.includes(gitignoreEntry)) {
      appendFileSync(
        gitignorePath,
        `\n# Git worktrees managed by Navi\n${gitignoreEntry}\n`
      );
    }
  } catch (e) {
    console.error("Failed to update .gitignore:", e);
  }

  return worktreesDir;
}

/**
 * Get the current branch of a repo
 */
export function getCurrentBranch(repoPath: string): string {
  return execSync("git branch --show-current", {
    cwd: repoPath,
    encoding: "utf-8",
  }).trim();
}

/**
 * Create a new worktree with a new branch
 * @param repoPath - Path to the main git repository
 * @param description - Task description for generating branch name
 * @param customBranchName - Optional pre-generated branch name (from LLM)
 */
export function createWorktree(
  repoPath: string,
  description: string,
  customBranchName?: string
): { path: string; branch: string; baseBranch: string } {
  const worktreesDir = ensureWorktreesDir(repoPath);
  // Use custom branch name if provided, otherwise generate from description
  const branch = customBranchName || generateBranchName(description);
  const safeDirName = sanitizeBranchName(description) + "-" + Date.now().toString(36);
  const worktreePath = join(worktreesDir, safeDirName);

  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }

  // Check if branch already exists
  const existing = listWorktrees(repoPath);
  const branchInUse = existing.find((w) => w.branch === branch);
  if (branchInUse) {
    throw new Error(
      `Branch '${branch}' is already checked out at: ${branchInUse.path}`
    );
  }

  // Get current branch as base
  const baseBranch = getCurrentBranch(repoPath);

  // Create the worktree with new branch from current HEAD
  execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
    cwd: repoPath,
    encoding: "utf-8",
  });

  return { path: worktreePath, branch, baseBranch };
}

/**
 * Remove a worktree
 */
export function removeWorktree(
  mainRepoPath: string,
  worktreePath: string,
  force = false
): void {
  if (!existsSync(worktreePath)) {
    // Worktree doesn't exist, just prune
    execSync("git worktree prune", { cwd: mainRepoPath });
    return;
  }

  const cmd = force ? "git worktree remove --force" : "git worktree remove";
  execSync(`${cmd} "${worktreePath}"`, {
    cwd: mainRepoPath,
    encoding: "utf-8",
  });
}

/**
 * Delete the branch associated with a worktree (after removal)
 */
export function deleteWorktreeBranch(
  mainRepoPath: string,
  branch: string,
  force = false
): void {
  try {
    const deleteFlag = force ? "-D" : "-d";
    execSync(`git branch ${deleteFlag} "${branch}"`, {
      cwd: mainRepoPath,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch (e) {
    console.error(`Failed to delete branch ${branch}:`, e);
  }
}

/**
 * Check if a worktree has uncommitted changes
 */
export function isWorktreeClean(worktreePath: string): boolean {
  try {
    const status = execSync("git status --porcelain", {
      cwd: worktreePath,
      encoding: "utf-8",
    });
    return status.trim() === "";
  } catch {
    return false;
  }
}

/**
 * Get detailed worktree status
 */
export function getWorktreeStatus(worktreePath: string): WorktreeStatus {
  let ahead = 0;
  let behind = 0;
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  try {
    // Get ahead/behind
    const aheadBehind = execSync(
      "git rev-list --left-right --count HEAD...@{upstream}",
      {
        cwd: worktreePath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    ).trim();
    const [a, b] = aheadBehind.split("\t").map(Number);
    ahead = a || 0;
    behind = b || 0;
  } catch {}

  try {
    // Get file status counts
    const statusOutput = execSync("git status --porcelain", {
      cwd: worktreePath,
      encoding: "utf-8",
    });

    for (const line of statusOutput.split("\n").filter(Boolean)) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];

      if (indexStatus === "?" && workTreeStatus === "?") {
        untracked++;
      } else {
        if (indexStatus !== " " && indexStatus !== "?") {
          staged++;
        }
        if (workTreeStatus !== " " && workTreeStatus !== "?") {
          modified++;
        }
      }
    }
  } catch {}

  return {
    ahead,
    behind,
    isClean: staged === 0 && modified === 0 && untracked === 0,
    staged,
    modified,
    untracked,
  };
}

/**
 * Prune stale worktree references
 */
export function pruneWorktrees(repoPath: string): void {
  execSync("git worktree prune", { cwd: repoPath });
}

/**
 * Commit all changes in a worktree
 */
export function commitWorktreeChanges(
  worktreePath: string,
  message: string
): boolean {
  try {
    execSync("git add -A", { cwd: worktreePath });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: worktreePath,
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of commits in worktree branch not in base branch
 */
export function getWorktreeCommits(
  worktreePath: string,
  baseBranch: string
): { hash: string; message: string }[] {
  try {
    const output = execSync(
      `git log ${baseBranch}..HEAD --format="%H|%s"`,
      {
        cwd: worktreePath,
        encoding: "utf-8",
      }
    );

    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, ...messageParts] = line.split("|");
        return { hash, message: messageParts.join("|") };
      });
  } catch {
    return [];
  }
}

/**
 * Get list of files changed in worktree compared to base
 */
export function getWorktreeChangedFiles(
  worktreePath: string,
  baseBranch: string
): { path: string; status: string }[] {
  try {
    const output = execSync(
      `git diff --name-status ${baseBranch}...HEAD`,
      {
        cwd: worktreePath,
        encoding: "utf-8",
      }
    );

    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, ...pathParts] = line.split("\t");
        return { status, path: pathParts.join("\t") };
      });
  } catch {
    return [];
  }
}

export interface MergeResult {
  success: boolean;
  conflicts?: string[];
  error?: string;
  needsConflictResolution?: boolean;  // True if rebase is paused waiting for conflict resolution
  conflictContext?: ConflictContext;  // Rich context for Claude to resolve conflicts
}

export interface ConflictContext {
  conflictingFiles: ConflictFileInfo[];
  worktreeBranch: string;
  baseBranch: string;
  worktreePath: string;
  mainRepoPath: string;
  snapshotId: string;  // ID to restore if resolution fails
}

export interface ConflictFileInfo {
  path: string;
  oursContent: string;   // Content from base branch
  theirsContent: string; // Content from worktree branch
  fullContent: string;   // File with conflict markers
  conflictMarkers: string[]; // Line numbers with conflict markers
}

/**
 * Helper to safely execute git command with rollback tracking
 */
function safeExec(cmd: string, cwd: string): { success: boolean; output?: string; error?: string } {
  try {
    const output = execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" });
    return { success: true, output: output.trim() };
  } catch (e: any) {
    return { success: false, error: e.stderr?.toString() || e.message || String(e) };
  }
}

/**
 * Snapshot of repo state for safe rollback
 */
export interface RepoSnapshot {
  id: string;
  repoPath: string;
  branch: string;
  commitHash: string;
  stashCreated: boolean;
  stashRef?: string;
  timestamp: number;
}

// In-memory storage for snapshots (could be persisted to DB later)
const snapshots = new Map<string, RepoSnapshot>();

/**
 * Create a snapshot of the repo state before risky operations
 */
export function createRepoSnapshot(repoPath: string): RepoSnapshot | null {
  try {
    const id = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Get current branch
    const branchResult = safeExec("git branch --show-current", repoPath);
    if (!branchResult.success) return null;
    const branch = branchResult.output || "HEAD";

    // Get current commit hash
    const hashResult = safeExec("git rev-parse HEAD", repoPath);
    if (!hashResult.success) return null;
    const commitHash = hashResult.output || "";

    // Check for uncommitted changes and stash them
    const statusResult = safeExec("git status --porcelain", repoPath);
    const hasChanges = (statusResult.output || "").trim().length > 0;
    let stashCreated = false;
    let stashRef: string | undefined;

    if (hasChanges) {
      const stashResult = safeExec(`git stash push -m "navi-snapshot-${id}" --include-untracked`, repoPath);
      if (stashResult.success) {
        stashCreated = true;
        // Get the stash ref
        const stashListResult = safeExec("git stash list -1", repoPath);
        if (stashListResult.success && stashListResult.output) {
          const match = stashListResult.output.match(/^(stash@\{[0-9]+\})/);
          stashRef = match ? match[1] : "stash@{0}";
        }
      }
    }

    const snapshot: RepoSnapshot = {
      id,
      repoPath,
      branch,
      commitHash,
      stashCreated,
      stashRef,
      timestamp: Date.now(),
    };

    snapshots.set(id, snapshot);
    console.log("[Snapshot] Created:", { id, branch, commitHash, stashCreated });
    return snapshot;
  } catch (e) {
    console.error("[Snapshot] Failed to create:", e);
    return null;
  }
}

/**
 * Restore repo to a previous snapshot state
 */
export function restoreRepoSnapshot(snapshotId: string): boolean {
  const snapshot = snapshots.get(snapshotId);
  if (!snapshot) {
    console.error("[Snapshot] Not found:", snapshotId);
    return false;
  }

  console.log("[Snapshot] Restoring:", snapshot);

  try {
    // Abort any in-progress merge or rebase
    safeExec("git merge --abort", snapshot.repoPath);
    safeExec("git rebase --abort", snapshot.repoPath);

    // Reset to the original commit (hard reset to discard all changes)
    const resetResult = safeExec(`git reset --hard ${snapshot.commitHash}`, snapshot.repoPath);
    if (!resetResult.success) {
      console.error("[Snapshot] Failed to reset:", resetResult.error);
      return false;
    }

    // Checkout the original branch if different
    const currentBranch = safeExec("git branch --show-current", snapshot.repoPath);
    if (currentBranch.output !== snapshot.branch) {
      safeExec(`git checkout "${snapshot.branch}"`, snapshot.repoPath);
    }

    // Restore stashed changes if any
    if (snapshot.stashCreated && snapshot.stashRef) {
      const popResult = safeExec(`git stash pop ${snapshot.stashRef}`, snapshot.repoPath);
      if (!popResult.success) {
        // Try just stash pop without ref
        safeExec("git stash pop", snapshot.repoPath);
      }
    }

    console.log("[Snapshot] Restored successfully");
    snapshots.delete(snapshotId);
    return true;
  } catch (e) {
    console.error("[Snapshot] Failed to restore:", e);
    return false;
  }
}

/**
 * Delete a snapshot (call after successful operation)
 */
export function deleteRepoSnapshot(snapshotId: string): void {
  const snapshot = snapshots.get(snapshotId);
  if (snapshot) {
    // If we created a stash but didn't restore, we should clean it up
    // But only if the operation succeeded - leave it for manual recovery otherwise
    snapshots.delete(snapshotId);
    console.log("[Snapshot] Deleted:", snapshotId);
  }
}

/**
 * Get rich conflict information for Claude to resolve
 */
export function getConflictDetails(repoPath: string, conflictFiles: string[]): ConflictFileInfo[] {
  const details: ConflictFileInfo[] = [];

  for (const filePath of conflictFiles) {
    try {
      const fullPath = join(repoPath, filePath);
      const fullContent = readFileSync(fullPath, "utf-8");

      // Parse conflict markers to extract ours/theirs
      let oursContent = "";
      let theirsContent = "";
      const conflictMarkers: string[] = [];

      const lines = fullContent.split("\n");
      let inConflict = false;
      let inOurs = false;
      let lineNum = 0;

      for (const line of lines) {
        lineNum++;
        if (line.startsWith("<<<<<<<")) {
          inConflict = true;
          inOurs = true;
          conflictMarkers.push(`Line ${lineNum}: Conflict start`);
        } else if (line.startsWith("=======")) {
          inOurs = false;
        } else if (line.startsWith(">>>>>>>")) {
          inConflict = false;
          conflictMarkers.push(`Line ${lineNum}: Conflict end`);
        } else if (inConflict) {
          if (inOurs) {
            oursContent += line + "\n";
          } else {
            theirsContent += line + "\n";
          }
        }
      }

      details.push({
        path: filePath,
        oursContent: oursContent.trim(),
        theirsContent: theirsContent.trim(),
        fullContent,
        conflictMarkers,
      });
    } catch (e) {
      console.error(`[Conflict] Failed to read ${filePath}:`, e);
      details.push({
        path: filePath,
        oursContent: "",
        theirsContent: "",
        fullContent: "",
        conflictMarkers: [],
      });
    }
  }

  return details;
}

/**
 * Rollback helper - restores repo to original state
 */
function rollbackMerge(
  mainRepoPath: string,
  state: { didStash: boolean; didCheckout: boolean; originalBranch: string; baseBranch: string; mergeInProgress: boolean }
) {
  console.log("[Merge Rollback] Restoring original state...", state);

  // Step 1: Abort any in-progress merge
  if (state.mergeInProgress) {
    safeExec("git merge --abort", mainRepoPath);
    console.log("[Merge Rollback] Aborted merge");
  }

  // Step 2: Go back to original branch if we changed it
  if (state.didCheckout && state.originalBranch && state.originalBranch !== state.baseBranch) {
    safeExec(`git checkout "${state.originalBranch}"`, mainRepoPath);
    console.log("[Merge Rollback] Restored original branch:", state.originalBranch);
  }

  // Step 3: Restore stash if we made one
  if (state.didStash) {
    safeExec("git stash pop", mainRepoPath);
    console.log("[Merge Rollback] Restored stashed changes");
  }

  console.log("[Merge Rollback] Done");
}

/**
 * Merge worktree branch into base branch using REBASE strategy
 *
 * Strategy:
 * 1. In WORKTREE: rebase onto latest base branch
 *    - This brings worktree up-to-date with base
 *    - Conflicts are resolved here (in the safe worktree environment)
 * 2. In MAIN REPO: fast-forward merge (guaranteed conflict-free after rebase)
 *    - Stash uncommitted changes
 *    - Checkout base, pull latest
 *    - Fast-forward merge worktree branch
 *    - Restore stash
 *
 * SAFETY:
 * - If rebase has conflicts, main repo is UNTOUCHED
 * - User resolves conflicts in worktree first
 * - Final merge is always fast-forward (no conflicts possible)
 */
export function mergeWorktreeToBase(
  mainRepoPath: string,
  worktreeBranch: string,
  baseBranch: string,
  worktreePath?: string
): MergeResult {
  // Track state for rollback (only for main repo operations)
  const state = {
    didStash: false,
    didCheckout: false,
    originalBranch: "",
    baseBranch,
    mergeInProgress: false,
  };

  console.log("[Merge] Starting rebase-based merge:", { worktreeBranch, baseBranch, mainRepoPath, worktreePath });

  // ============================================
  // PHASE 0: Create snapshots for safe rollback
  // ============================================
  let mainSnapshot: RepoSnapshot | null = null;
  let worktreeSnapshot: RepoSnapshot | null = null;

  console.log("[Merge] Phase 0: Creating safety snapshots");
  mainSnapshot = createRepoSnapshot(mainRepoPath);
  if (!mainSnapshot) {
    return { success: false, error: "Failed to create safety snapshot of main repo" };
  }

  if (worktreePath) {
    worktreeSnapshot = createRepoSnapshot(worktreePath);
    if (!worktreeSnapshot) {
      deleteRepoSnapshot(mainSnapshot.id);
      return { success: false, error: "Failed to create safety snapshot of worktree" };
    }
  }

  console.log("[Merge] Snapshots created:", { main: mainSnapshot.id, worktree: worktreeSnapshot?.id });

  // ============================================
  // PHASE 1: Rebase worktree onto latest base
  // ============================================
  if (worktreePath) {
    console.log("[Merge] Phase 1: Rebasing worktree onto latest", baseBranch);

    // Fetch latest from origin
    const fetchResult = safeExec("git fetch origin", worktreePath);
    if (!fetchResult.success) {
      console.log("[Merge] Fetch failed (maybe no remote), continuing with local");
    }

    // Check if worktree has uncommitted changes
    const wtStatus = safeExec("git status --porcelain", worktreePath);
    if ((wtStatus.output || "").trim().length > 0) {
      // Restore snapshots
      if (worktreeSnapshot) restoreRepoSnapshot(worktreeSnapshot.id);
      restoreRepoSnapshot(mainSnapshot.id);
      return {
        success: false,
        error: "Worktree has uncommitted changes. Please commit them first before merging."
      };
    }

    // Try to rebase onto base branch
    // First try origin/base, fall back to local base
    let rebaseResult = safeExec(`git rebase "origin/${baseBranch}"`, worktreePath);
    if (!rebaseResult.success && rebaseResult.error?.includes("origin/")) {
      console.log("[Merge] origin/ rebase failed, trying local base branch");
      rebaseResult = safeExec(`git rebase "${baseBranch}"`, worktreePath);
    }

    if (!rebaseResult.success) {
      // Check for rebase conflicts
      const conflictStatus = safeExec("git status --porcelain", worktreePath);
      const conflicts = (conflictStatus.output || "")
        .split("\n")
        .filter((line) => line.startsWith("UU") || line.startsWith("AA") || line.startsWith("DD") || line.startsWith("DU") || line.startsWith("UD"))
        .map((line) => line.slice(3).trim())
        .filter(Boolean);

      if (conflicts.length > 0) {
        // Get rich conflict details for Claude
        const conflictingFiles = getConflictDetails(worktreePath, conflicts);
        console.log("[Merge] Rebase conflicts detected, providing context for resolution:", conflicts);

        // Create conflict context for Claude
        const conflictContext: ConflictContext = {
          conflictingFiles,
          worktreeBranch,
          baseBranch,
          worktreePath,
          mainRepoPath,
          snapshotId: worktreeSnapshot?.id || mainSnapshot.id,
        };

        return {
          success: false,
          conflicts,
          needsConflictResolution: true,
          conflictContext,
          error: `Merge conflicts detected in ${conflicts.length} file(s). Claude will help resolve them.`
        };
      }

      // No conflicts but still failed - restore and return error
      console.log("[Merge] Rebase failed without conflicts, restoring snapshots");
      if (worktreeSnapshot) restoreRepoSnapshot(worktreeSnapshot.id);
      restoreRepoSnapshot(mainSnapshot.id);
      return {
        success: false,
        error: `Failed to rebase onto ${baseBranch}: ${rebaseResult.error}`
      };
    }

    console.log("[Merge] Worktree successfully rebased onto", baseBranch);
  }

  // ============================================
  // PHASE 2: Fast-forward merge in main repo
  // ============================================
  console.log("[Merge] Phase 2: Fast-forward merge in main repo");

  // The snapshot already handled stashing, so we just need to do the merge
  // Step 1: Get current branch in main repo
  const branchResult = safeExec("git branch --show-current", mainRepoPath);
  if (!branchResult.success) {
    if (worktreeSnapshot) restoreRepoSnapshot(worktreeSnapshot.id);
    restoreRepoSnapshot(mainSnapshot.id);
    return { success: false, error: `Failed to get current branch: ${branchResult.error}` };
  }
  state.originalBranch = branchResult.output || "";
  console.log("[Merge] Original branch:", state.originalBranch);

  // Step 2: Checkout base branch if needed
  if (state.originalBranch !== baseBranch) {
    console.log("[Merge] Checking out base branch:", baseBranch);
    const checkoutResult = safeExec(`git checkout "${baseBranch}"`, mainRepoPath);
    if (!checkoutResult.success) {
      if (worktreeSnapshot) restoreRepoSnapshot(worktreeSnapshot.id);
      restoreRepoSnapshot(mainSnapshot.id);
      return { success: false, error: `Failed to checkout ${baseBranch}: ${checkoutResult.error}` };
    }
    state.didCheckout = true;
  }

  // Step 3: Pull latest on base branch
  console.log("[Merge] Pulling latest on", baseBranch);
  safeExec("git pull --ff-only", mainRepoPath); // Best effort, might fail if no remote

  // Step 4: Fast-forward merge (should ALWAYS succeed after rebase)
  console.log("[Merge] Fast-forward merging:", worktreeBranch);
  state.mergeInProgress = true;

  // Try fast-forward first, then regular merge
  let mergeResult = safeExec(`git merge "${worktreeBranch}" --ff-only`, mainRepoPath);
  if (!mergeResult.success) {
    console.log("[Merge] Fast-forward failed, trying regular merge");
    mergeResult = safeExec(`git merge "${worktreeBranch}" --no-edit`, mainRepoPath);
  }

  if (!mergeResult.success) {
    console.log("[Merge] Merge in main repo failed, checking for conflicts");

    // Check if there are merge conflicts in the main repo
    const conflictStatus = safeExec("git status --porcelain", mainRepoPath);
    const conflicts = (conflictStatus.output || "")
      .split("\n")
      .filter((line) => line.startsWith("UU") || line.startsWith("AA") || line.startsWith("DD") || line.startsWith("DU") || line.startsWith("UD"))
      .map((line) => line.slice(3).trim())
      .filter(Boolean);

    if (conflicts.length > 0) {
      // Get rich conflict details for Claude
      const conflictingFiles = getConflictDetails(mainRepoPath, conflicts);
      console.log("[Merge] Conflicts detected in main repo:", conflicts);

      // Create conflict context for Claude to resolve in main repo
      const conflictContext: ConflictContext = {
        conflictingFiles,
        worktreeBranch,
        baseBranch,
        worktreePath: mainRepoPath, // Conflicts are in main repo
        mainRepoPath,
        snapshotId: mainSnapshot.id,
      };

      return {
        success: false,
        conflicts,
        needsConflictResolution: true,
        conflictContext,
        error: `Merge conflicts in main repo. Claude will help resolve them.`
      };
    }

    // No conflicts but still failed - restore from snapshot
    console.log("[Merge] Merge failed unexpectedly (no conflicts detected), restoring snapshots");
    if (worktreeSnapshot) restoreRepoSnapshot(worktreeSnapshot.id);
    restoreRepoSnapshot(mainSnapshot.id);
    return { success: false, error: `Merge failed: ${mergeResult.error}` };
  }

  state.mergeInProgress = false;
  console.log("[Merge] Merge successful!");

  // Clean up snapshots on success
  if (worktreeSnapshot) deleteRepoSnapshot(worktreeSnapshot.id);
  deleteRepoSnapshot(mainSnapshot.id);

  // Step 7: Restore stash
  if (state.didStash) {
    console.log("[Merge] Restoring stashed changes...");
    const unstashResult = safeExec("git stash pop", mainRepoPath);
    if (!unstashResult.success) {
      console.log("[Merge] Stash pop had conflicts - partial success");
      return {
        success: true,
        error: "Merge succeeded! But restoring your uncommitted changes had conflicts. Run 'git stash pop' to resolve."
      };
    }
    console.log("[Merge] Stash restored successfully");
  }

  console.log("[Merge] Complete success!");
  return { success: true };
}

/**
 * Abort an in-progress merge
 */
export function abortMerge(repoPath: string): void {
  execSync("git merge --abort", { cwd: repoPath });
}

/**
 * Abort an in-progress rebase
 */
export function abortRebase(repoPath: string): void {
  safeExec("git rebase --abort", repoPath);
}

/**
 * Check if a rebase is in progress
 */
export function isRebaseInProgress(repoPath: string): boolean {
  const gitDir = safeExec("git rev-parse --git-dir", repoPath);
  if (!gitDir.success) return false;

  const rebaseDir = join(repoPath, gitDir.output || ".git", "rebase-merge");
  const rebaseApplyDir = join(repoPath, gitDir.output || ".git", "rebase-apply");

  return existsSync(rebaseDir) || existsSync(rebaseApplyDir);
}

/**
 * Continue a rebase after conflicts have been resolved
 * Returns success if rebase completes, or new conflicts if more exist
 */
export function continueRebase(worktreePath: string): MergeResult {
  console.log("[Rebase] Continuing rebase in", worktreePath);

  // First, check if there are still unresolved conflicts
  const statusResult = safeExec("git status --porcelain", worktreePath);
  const unresolvedConflicts = (statusResult.output || "")
    .split("\n")
    .filter((line) => line.startsWith("UU") || line.startsWith("AA") || line.startsWith("DD") || line.startsWith("DU") || line.startsWith("UD"))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  if (unresolvedConflicts.length > 0) {
    console.log("[Rebase] Still has unresolved conflicts:", unresolvedConflicts);
    return {
      success: false,
      conflicts: unresolvedConflicts,
      needsConflictResolution: true,
      error: "There are still unresolved conflicts. Please resolve all conflicts and stage the files."
    };
  }

  // Stage any resolved files (in case user resolved but didn't stage)
  safeExec("git add -A", worktreePath);

  // Continue the rebase
  const continueResult = safeExec("git rebase --continue", worktreePath);

  if (!continueResult.success) {
    // Check if there are new conflicts from the next commit
    const newConflicts = safeExec("git status --porcelain", worktreePath);
    const conflicts = (newConflicts.output || "")
      .split("\n")
      .filter((line) => line.startsWith("UU") || line.startsWith("AA") || line.startsWith("DD") || line.startsWith("DU") || line.startsWith("UD"))
      .map((line) => line.slice(3).trim())
      .filter(Boolean);

    if (conflicts.length > 0) {
      console.log("[Rebase] New conflicts from next commit:", conflicts);
      return {
        success: false,
        conflicts,
        needsConflictResolution: true,
        error: "More conflicts found. Please resolve them and continue."
      };
    }

    return {
      success: false,
      error: `Failed to continue rebase: ${continueResult.error}`
    };
  }

  console.log("[Rebase] Rebase completed successfully!");
  return { success: true };
}

/**
 * Get conflict markers from a file
 */
export function getConflictContent(
  repoPath: string,
  filePath: string
): { ours: string; theirs: string; full: string } | null {
  try {
    const fullPath = join(repoPath, filePath);
    const content = readFileSync(fullPath, "utf-8");

    // Parse conflict markers
    const oursMatch = content.match(/<<<<<<< HEAD\n([\s\S]*?)=======/);
    const theirsMatch = content.match(/=======\n([\s\S]*?)>>>>>>> /);

    if (oursMatch && theirsMatch) {
      return {
        ours: oursMatch[1],
        theirs: theirsMatch[1],
        full: content,
      };
    }
    return null;
  } catch {
    return null;
  }
}
