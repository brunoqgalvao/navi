import { json } from "../utils/response";
import { projects, sessions } from "../db";
import {
  isGitRepo,
  createWorktree,
  removeWorktree,
  deleteWorktreeBranch,
  getWorktreeStatus,
  isWorktreeClean,
  isMainRepoClean,
  getMainRepoChanges,
  commitWorktreeChanges,
  getWorktreeCommits,
  getWorktreeChangedFiles,
  mergeWorktreeToBase,
  abortMerge,
  abortRebase,
  continueRebase,
  isRebaseInProgress,
  getConflictContent,
  pruneWorktrees,
  restoreRepoSnapshot,
  deleteRepoSnapshot,
  type ConflictContext,
} from "../utils/worktree";
// ⚠️ EXPERIMENTAL: Worktree preview cleanup - remove this import to revert (see worktree-preview.ts)
import { cleanupWorktreePreview } from "./worktree-preview";
import { existsSync } from "fs";

export async function handleWorktreeRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // POST /api/sessions/:id/worktree - Create worktree for a session
  const createMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/worktree$/);
  if (createMatch && method === "POST") {
    const sessionId = createMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (session.worktree_path) {
      return json({ error: "Session already has a worktree" }, 400);
    }

    const project = projects.get(session.project_id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    if (!isGitRepo(project.path)) {
      return json({ error: "Project is not a git repository" }, 400);
    }

    const body = await req.json();
    const { description, branchName } = body;

    if (!description || typeof description !== "string") {
      return json({ error: "description is required" }, 400);
    }

    try {
      // Use custom branch name if provided (from LLM), otherwise generate from description
      const { path: worktreePath, branch, baseBranch } = createWorktree(
        project.path,
        description,
        branchName // Optional LLM-generated branch name
      );

      // Update session with worktree info
      sessions.setWorktree(sessionId, worktreePath, branch, baseBranch);

      const updatedSession = sessions.get(sessionId);

      return json({
        session: updatedSession,
        worktree: {
          path: worktreePath,
          branch,
          baseBranch,
        },
      });
    } catch (e: any) {
      console.error("Create worktree error:", e);
      return json({ error: e.message || "Failed to create worktree" }, 500);
    }
  }

  // GET /api/sessions/:id/worktree/status - Get worktree status
  const statusMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/status$/
  );
  if (statusMatch && method === "GET") {
    const sessionId = statusMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path) {
      return json({ error: "Session does not have a worktree" }, 400);
    }

    if (!existsSync(session.worktree_path)) {
      return json({
        error: "Worktree path no longer exists",
        needsCleanup: true,
      }, 400);
    }

    try {
      const status = getWorktreeStatus(session.worktree_path);
      const commits = getWorktreeCommits(
        session.worktree_path,
        session.worktree_base_branch || "main"
      );
      const changedFiles = getWorktreeChangedFiles(
        session.worktree_path,
        session.worktree_base_branch || "main"
      );

      return json({
        status,
        commits,
        changedFiles,
        branch: session.worktree_branch,
        baseBranch: session.worktree_base_branch,
      });
    } catch (e: any) {
      console.error("Get worktree status error:", e);
      return json({ error: e.message || "Failed to get worktree status" }, 500);
    }
  }

  // DELETE /api/sessions/:id/worktree - Remove worktree from session
  const deleteMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree$/
  );
  if (deleteMatch && method === "DELETE") {
    const sessionId = deleteMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path) {
      return json({ error: "Session does not have a worktree" }, 400);
    }

    const project = projects.get(session.project_id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const deleteBranch = body.deleteBranch !== false; // default true

    try {
      // Check for uncommitted changes
      if (!force && existsSync(session.worktree_path) && !isWorktreeClean(session.worktree_path)) {
        return json({
          error: "Worktree has uncommitted changes. Use force=true to delete anyway.",
          hasUncommittedChanges: true,
        }, 400);
      }

      // ⚠️ EXPERIMENTAL: Stop any running preview server for this worktree - remove to revert
      cleanupWorktreePreview(sessionId);

      // Remove git worktree
      if (existsSync(session.worktree_path)) {
        removeWorktree(project.path, session.worktree_path, force);
      }

      // Delete the branch
      if (deleteBranch && session.worktree_branch) {
        deleteWorktreeBranch(project.path, session.worktree_branch, force);
      }

      // Clear worktree info from session
      sessions.clearWorktree(sessionId);

      return json({ success: true });
    } catch (e: any) {
      console.error("Delete worktree error:", e);
      return json({ error: e.message || "Failed to delete worktree" }, 500);
    }
  }

  // POST /api/sessions/:id/worktree/commit - Commit changes in worktree
  const commitMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/commit$/
  );
  if (commitMatch && method === "POST") {
    const sessionId = commitMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path || !existsSync(session.worktree_path)) {
      return json({ error: "Session does not have a valid worktree" }, 400);
    }

    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return json({ error: "commit message is required" }, 400);
    }

    try {
      const success = commitWorktreeChanges(session.worktree_path, message);

      if (!success) {
        return json({ error: "No changes to commit or commit failed" }, 400);
      }

      return json({ success: true });
    } catch (e: any) {
      console.error("Commit worktree error:", e);
      return json({ error: e.message || "Failed to commit changes" }, 500);
    }
  }

  // GET /api/sessions/:id/worktree/merge/preview - Preview merge
  const previewMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/merge\/preview$/
  );
  if (previewMatch && method === "GET") {
    const sessionId = previewMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path || !existsSync(session.worktree_path)) {
      return json({ error: "Session does not have a valid worktree" }, 400);
    }

    const project = projects.get(session.project_id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      const status = getWorktreeStatus(session.worktree_path);
      const commits = getWorktreeCommits(
        session.worktree_path,
        session.worktree_base_branch || "main"
      );
      const changedFiles = getWorktreeChangedFiles(
        session.worktree_path,
        session.worktree_base_branch || "main"
      );

      // Check if main repo has uncommitted changes - block merge if so
      const mainRepoClean = isMainRepoClean(project.path);
      const mainRepoChanges = mainRepoClean ? null : getMainRepoChanges(project.path);

      return json({
        canMerge: (status.isClean || status.staged === 0) && mainRepoClean,
        hasUncommittedChanges: !status.isClean,
        mainHasUncommittedChanges: !mainRepoClean,
        mainRepoChanges,
        commits,
        changedFiles,
        totalChanges: changedFiles.length,
        branch: session.worktree_branch,
        baseBranch: session.worktree_base_branch,
      });
    } catch (e: any) {
      console.error("Preview merge error:", e);
      return json({ error: e.message || "Failed to preview merge" }, 500);
    }
  }

  // POST /api/sessions/:id/worktree/merge - Merge worktree to base
  const mergeMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/merge$/
  );
  if (mergeMatch && method === "POST") {
    const sessionId = mergeMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path || !existsSync(session.worktree_path)) {
      return json({ error: "Session does not have a valid worktree" }, 400);
    }

    const project = projects.get(session.project_id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    // Block merge if main repo has uncommitted changes
    if (!isMainRepoClean(project.path)) {
      const changes = getMainRepoChanges(project.path);
      return json({
        error: "Cannot merge: main branch has uncommitted changes. Please commit or stash them first.",
        mainHasUncommittedChanges: true,
        mainRepoChanges: changes,
      }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const { commitMessage, autoCommit = true, cleanupAfter = true } = body;

    try {
      // Check if main repo has uncommitted changes - block merge if so
      const mainRepoStatus = getWorktreeStatus(project.path);
      if (!mainRepoStatus.isClean) {
        return json({
          success: false,
          error: "Cannot merge: the main repository has uncommitted changes. Please commit or stash them first.",
          mainRepoHasChanges: true,
          mainRepoStatus: {
            staged: mainRepoStatus.staged,
            modified: mainRepoStatus.modified,
            untracked: mainRepoStatus.untracked,
          },
        }, 400);
      }

      // Auto-commit uncommitted changes if requested
      if (autoCommit && !isWorktreeClean(session.worktree_path)) {
        const message = commitMessage || `Changes from: ${session.title}`;
        commitWorktreeChanges(session.worktree_path, message);
      }

      // Perform the merge
      const result = mergeWorktreeToBase(
        project.path,
        session.worktree_branch!,
        session.worktree_base_branch || "main",
        session.worktree_path  // Pass worktree path for updating with latest
      );

      if (!result.success && result.conflicts) {
        // Return conflict info for resolution - now includes rich context for Claude
        const conflictDetails = result.conflicts.map((file) => ({
          file,
          content: getConflictContent(result.conflictContext?.worktreePath || project.path, file),
        }));

        return json({
          success: false,
          hasConflicts: true,
          needsConflictResolution: result.needsConflictResolution,
          conflicts: conflictDetails,
          conflictContext: result.conflictContext, // Rich context for Claude chat
          error: result.error,
        });
      }

      if (!result.success) {
        console.error(`[Merge] Failed:`, result.error);
        return json({ success: false, error: result.error }, 400);
      }

      // Cleanup after successful merge if requested
      if (cleanupAfter) {
        try {
          removeWorktree(project.path, session.worktree_path, true);
          deleteWorktreeBranch(project.path, session.worktree_branch!, true);
          sessions.clearWorktree(sessionId);
        } catch (cleanupError) {
          console.error("Cleanup after merge failed:", cleanupError);
        }
      }

      return json({
        success: true,
        merged: true,
        cleanedUp: cleanupAfter,
      });
    } catch (e: any) {
      console.error("Merge worktree error:", e);
      return json({ error: e.message || "Failed to merge worktree" }, 500);
    }
  }

  // POST /api/sessions/:id/worktree/merge/abort - Abort merge
  const abortMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/merge\/abort$/
  );
  if (abortMatch && method === "POST") {
    const sessionId = abortMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    const project = projects.get(session.project_id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      abortMerge(project.path);
      return json({ success: true });
    } catch (e: any) {
      console.error("Abort merge error:", e);
      return json({ error: e.message || "Failed to abort merge" }, 500);
    }
  }

  // POST /api/sessions/:id/worktree/rebase/continue - Continue rebase after conflict resolution
  const continueRebaseMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/rebase\/continue$/
  );
  if (continueRebaseMatch && method === "POST") {
    const sessionId = continueRebaseMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path || !existsSync(session.worktree_path)) {
      return json({ error: "Session does not have a valid worktree" }, 400);
    }

    const project = projects.get(session.project_id);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    try {
      // Check if rebase is actually in progress
      if (!isRebaseInProgress(session.worktree_path)) {
        return json({ error: "No rebase in progress" }, 400);
      }

      // Continue the rebase
      const result = continueRebase(session.worktree_path);

      if (!result.success) {
        if (result.needsConflictResolution) {
          // More conflicts found
          const conflictDetails = (result.conflicts || []).map((file) => ({
            file,
            content: getConflictContent(session.worktree_path!, file),
          }));

          return json({
            success: false,
            hasConflicts: true,
            needsConflictResolution: true,
            conflicts: conflictDetails,
            error: result.error,
          });
        }

        return json({ success: false, error: result.error }, 400);
      }

      // Rebase completed! Now do the fast-forward merge in main repo
      const body = await req.json().catch(() => ({}));
      const { cleanupAfter = true } = body;

      // Fast-forward merge to main repo
      const mergeResult = mergeWorktreeToBase(
        project.path,
        session.worktree_branch!,
        session.worktree_base_branch || "main",
        undefined  // Don't pass worktree path - rebase already done
      );

      if (!mergeResult.success) {
        return json({ success: false, error: mergeResult.error }, 400);
      }

      // Cleanup after successful merge
      if (cleanupAfter) {
        try {
          removeWorktree(project.path, session.worktree_path, true);
          deleteWorktreeBranch(project.path, session.worktree_branch!, true);
          sessions.clearWorktree(sessionId);
        } catch (cleanupError) {
          console.error("Cleanup after merge failed:", cleanupError);
        }
      }

      return json({
        success: true,
        merged: true,
        cleanedUp: cleanupAfter,
      });
    } catch (e: any) {
      console.error("Continue rebase error:", e);
      return json({ error: e.message || "Failed to continue rebase" }, 500);
    }
  }

  // POST /api/sessions/:id/worktree/rebase/abort - Abort rebase
  const abortRebaseMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/rebase\/abort$/
  );
  if (abortRebaseMatch && method === "POST") {
    const sessionId = abortRebaseMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path || !existsSync(session.worktree_path)) {
      return json({ error: "Session does not have a valid worktree" }, 400);
    }

    try {
      abortRebase(session.worktree_path);
      return json({ success: true });
    } catch (e: any) {
      console.error("Abort rebase error:", e);
      return json({ error: e.message || "Failed to abort rebase" }, 500);
    }
  }

  // GET /api/sessions/:id/worktree/rebase/status - Check rebase status
  const rebaseStatusMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/worktree\/rebase\/status$/
  );
  if (rebaseStatusMatch && method === "GET") {
    const sessionId = rebaseStatusMatch[1];
    const session = sessions.get(sessionId);

    if (!session) {
      return json({ error: "Session not found" }, 404);
    }

    if (!session.worktree_path || !existsSync(session.worktree_path)) {
      return json({ error: "Session does not have a valid worktree" }, 400);
    }

    try {
      const inProgress = isRebaseInProgress(session.worktree_path);
      return json({ inProgress });
    } catch (e: any) {
      console.error("Check rebase status error:", e);
      return json({ error: e.message || "Failed to check rebase status" }, 500);
    }
  }

  // POST /api/projects/:id/worktrees/prune - Prune stale worktrees
  const pruneMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/worktrees\/prune$/
  );
  if (pruneMatch && method === "POST") {
    const projectId = pruneMatch[1];
    const project = projects.get(projectId);

    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    if (!isGitRepo(project.path)) {
      return json({ error: "Project is not a git repository" }, 400);
    }

    try {
      pruneWorktrees(project.path);

      // Also clean up sessions with orphaned worktrees
      const worktreeSessions = sessions.listWithWorktrees(projectId);
      const cleaned: string[] = [];

      for (const sess of worktreeSessions) {
        if (sess.worktree_path && !existsSync(sess.worktree_path)) {
          sessions.clearWorktree(sess.id);
          cleaned.push(sess.id);
        }
      }

      return json({ success: true, cleanedSessions: cleaned });
    } catch (e: any) {
      console.error("Prune worktrees error:", e);
      return json({ error: e.message || "Failed to prune worktrees" }, 500);
    }
  }

  // POST /api/merge/restore/:snapshotId - Restore repo from snapshot (abort merge)
  const restoreMatch = url.pathname.match(/^\/api\/merge\/restore\/([^/]+)$/);
  if (restoreMatch && method === "POST") {
    const snapshotId = restoreMatch[1];

    try {
      const success = restoreRepoSnapshot(snapshotId);

      if (!success) {
        return json({ error: "Failed to restore from snapshot" }, 400);
      }

      return json({ success: true, message: "Repository restored to pre-merge state" });
    } catch (e: any) {
      console.error("Restore snapshot error:", e);
      return json({ error: e.message || "Failed to restore snapshot" }, 500);
    }
  }

  // DELETE /api/merge/snapshot/:snapshotId - Delete snapshot (cleanup after successful resolve)
  const deleteSnapshotMatch = url.pathname.match(/^\/api\/merge\/snapshot\/([^/]+)$/);
  if (deleteSnapshotMatch && method === "DELETE") {
    const snapshotId = deleteSnapshotMatch[1];

    try {
      deleteRepoSnapshot(snapshotId);
      return json({ success: true });
    } catch (e: any) {
      console.error("Delete snapshot error:", e);
      return json({ error: e.message || "Failed to delete snapshot" }, 500);
    }
  }

  return null;
}
