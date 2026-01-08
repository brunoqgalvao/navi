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
 */
export function createWorktree(
  repoPath: string,
  description: string
): { path: string; branch: string; baseBranch: string } {
  const worktreesDir = ensureWorktreesDir(repoPath);
  const branch = generateBranchName(description);
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
        // DON'T abort - keep rebase in progress so user can resolve conflicts
        console.log("[Merge] Rebase conflicts detected, waiting for resolution:", conflicts);
        return {
          success: false,
          conflicts,
          needsConflictResolution: true,
          error: `Conflicts detected. Please resolve them in the parallel branch, then click "Continue Merge".`
        };
      }

      // No conflicts but still failed - abort and return error
      safeExec("git rebase --abort", worktreePath);
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

  // Step 1: Get current branch in main repo
  const branchResult = safeExec("git branch --show-current", mainRepoPath);
  if (!branchResult.success) {
    return { success: false, error: `Failed to get current branch: ${branchResult.error}` };
  }
  state.originalBranch = branchResult.output || "";
  console.log("[Merge] Original branch:", state.originalBranch);

  // Step 2: Check for uncommitted changes in main repo
  const statusResult = safeExec("git status --porcelain", mainRepoPath);
  if (!statusResult.success) {
    return { success: false, error: `Failed to get git status: ${statusResult.error}` };
  }
  const hasUncommittedChanges = (statusResult.output || "").trim().length > 0;
  console.log("[Merge] Has uncommitted changes:", hasUncommittedChanges);

  // Step 3: Stash uncommitted changes if needed
  if (hasUncommittedChanges) {
    console.log("[Merge] Stashing uncommitted changes...");
    const stashResult = safeExec('git stash push --include-untracked -m "Auto-stash before worktree merge"', mainRepoPath);
    if (!stashResult.success) {
      return { success: false, error: `Failed to stash changes: ${stashResult.error}` };
    }
    state.didStash = true;

    // Verify clean
    const verifyClean = safeExec("git status --porcelain", mainRepoPath);
    if ((verifyClean.output || "").trim().length > 0) {
      rollbackMerge(mainRepoPath, state);
      return { success: false, error: "Failed to stash all changes." };
    }
    console.log("[Merge] Stash created successfully");
  }

  // Step 4: Checkout base branch if needed
  if (state.originalBranch !== baseBranch) {
    console.log("[Merge] Checking out base branch:", baseBranch);
    const checkoutResult = safeExec(`git checkout "${baseBranch}"`, mainRepoPath);
    if (!checkoutResult.success) {
      rollbackMerge(mainRepoPath, state);
      return { success: false, error: `Failed to checkout ${baseBranch}: ${checkoutResult.error}` };
    }
    state.didCheckout = true;
  }

  // Step 5: Pull latest on base branch
  console.log("[Merge] Pulling latest on", baseBranch);
  safeExec("git pull --ff-only", mainRepoPath); // Best effort, might fail if no remote

  // Step 6: Fast-forward merge (should ALWAYS succeed after rebase)
  console.log("[Merge] Fast-forward merging:", worktreeBranch);
  state.mergeInProgress = true;

  // Try fast-forward first, then regular merge
  let mergeResult = safeExec(`git merge "${worktreeBranch}" --ff-only`, mainRepoPath);
  if (!mergeResult.success) {
    console.log("[Merge] Fast-forward failed, trying regular merge");
    mergeResult = safeExec(`git merge "${worktreeBranch}" --no-edit`, mainRepoPath);
  }

  if (!mergeResult.success) {
    console.log("[Merge] Merge failed unexpectedly");
    rollbackMerge(mainRepoPath, state);
    return { success: false, error: `Merge failed: ${mergeResult.error}` };
  }

  state.mergeInProgress = false;
  console.log("[Merge] Merge successful!");

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
