<script lang="ts">
  import Modal from "./Modal.svelte";
  import { worktreeApi, type MergePreview, type MergeResult, type ConflictInfo, type ConflictContext } from "../api";

  interface Props {
    open: boolean;
    sessionId: string;
    sessionTitle: string;
    branch: string;
    baseBranch: string;
    worktreePath?: string;
    onClose: () => void;
    onMergeComplete: (options: { keepChatting: boolean }) => void;
    onConflictResolution?: (context: ConflictContext, prompt: string) => void; // Callback to send message to Claude
  }

  let {
    open,
    sessionId,
    sessionTitle,
    branch,
    baseBranch,
    worktreePath,
    onClose,
    onMergeComplete,
    onConflictResolution,
  }: Props = $props();

  type Step = "preview" | "merging" | "conflicts" | "continuing" | "success" | "error";

  let step = $state<Step>("preview");
  let preview = $state<MergePreview | null>(null);
  let conflicts = $state<ConflictInfo[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let cleanupAfterMerge = $state(true);
  let keepChatting = $state(true); // Keep the session active on main after merge
  let needsConflictResolution = $state(false); // True when rebase is paused for conflict resolution

  async function loadPreview() {
    try {
      loading = true;
      error = null;
      preview = await worktreeApi.previewMerge(sessionId);

      // Check if there's an existing rebase in progress
      try {
        const rebaseStatus = await worktreeApi.rebaseStatus(sessionId);
        if (rebaseStatus.inProgress) {
          needsConflictResolution = true;
          step = "conflicts";
        }
      } catch {
        // Ignore errors checking rebase status
      }
    } catch (e: any) {
      error = e.message;
      step = "error";
    } finally {
      loading = false;
    }
  }

  async function handleMerge() {
    step = "merging";
    try {
      const result = await worktreeApi.merge(sessionId, {
        autoCommit: true,
        cleanupAfter: cleanupAfterMerge,
      });

      if (result.needsConflictResolution && result.conflictContext && onConflictResolution) {
        // Conflicts detected - send to Claude for resolution
        const ctx = result.conflictContext;
        const prompt = buildConflictResolutionPrompt(ctx);

        // Close modal and trigger Claude chat
        onConflictResolution(ctx, prompt);
        onClose();
        return;
      } else if (result.needsConflictResolution && result.conflicts) {
        // Fallback: Rebase is paused - user needs to resolve conflicts in worktree
        conflicts = result.conflicts;
        needsConflictResolution = true;
        step = "conflicts";
      } else if (result.hasConflicts && result.conflicts) {
        // Legacy merge conflict handling
        conflicts = result.conflicts;
        needsConflictResolution = false;
        step = "conflicts";
      } else if (result.success) {
        step = "success";
      } else {
        error = result.error || "Merge failed";
        step = "error";
      }
    } catch (e: any) {
      error = e.message;
      step = "error";
    }
  }

  function buildConflictResolutionPrompt(ctx: ConflictContext): string {
    const fileList = ctx.conflictingFiles.map(f => `- ${f.path}`).join("\n");
    const fileDetails = ctx.conflictingFiles.map(f => {
      return `
### ${f.path}

**Base branch (${ctx.baseBranch}) version:**
\`\`\`
${f.oursContent.slice(0, 2000)}${f.oursContent.length > 2000 ? "\n... (truncated)" : ""}
\`\`\`

**Feature branch (${ctx.worktreeBranch}) version:**
\`\`\`
${f.theirsContent.slice(0, 2000)}${f.theirsContent.length > 2000 ? "\n... (truncated)" : ""}
\`\`\`
`;
    }).join("\n");

    return `I'm trying to merge the branch \`${ctx.worktreeBranch}\` into \`${ctx.baseBranch}\` but there are merge conflicts in ${ctx.conflictingFiles.length} file(s):

${fileList}

Please help me resolve these conflicts. Here are the details:

${fileDetails}

**Instructions:**
1. Read each conflicting file in the worktree at \`${ctx.worktreePath}\`
2. Understand the intent of both changes
3. Edit each file to resolve the conflicts (remove the conflict markers and merge the code appropriately)
4. After resolving all conflicts, stage the files with \`git add .\`
5. Continue the rebase with \`git rebase --continue\`
6. After rebase completes successfully, switch to main repo at \`${ctx.mainRepoPath}\` and fast-forward merge:
   \`\`\`
   cd "${ctx.mainRepoPath}"
   git checkout ${ctx.baseBranch}
   git merge ${ctx.worktreeBranch} --ff-only
   \`\`\`
7. Confirm the merge was successful

The snapshot ID is \`${ctx.snapshotId}\` in case we need to abort and restore.

Please resolve these conflicts now and complete the merge.`;
  }

  async function handleContinueRebase() {
    step = "continuing";
    try {
      const result = await worktreeApi.continueRebase(sessionId, {
        cleanupAfter: cleanupAfterMerge,
      });

      if (result.needsConflictResolution && result.conflicts) {
        // More conflicts to resolve
        conflicts = result.conflicts;
        step = "conflicts";
      } else if (result.success) {
        step = "success";
      } else {
        error = result.error || "Continue merge failed";
        step = "error";
      }
    } catch (e: any) {
      error = e.message;
      step = "error";
    }
  }

  async function handleAbort() {
    try {
      // Abort the rebase in worktree (not merge in main repo)
      await worktreeApi.abortMerge(sessionId);
      needsConflictResolution = false;
      step = "preview";
      await loadPreview();
    } catch (e: any) {
      error = e.message;
    }
  }

  function handleClose() {
    if (step === "success") {
      onMergeComplete({ keepChatting });
    }
    onClose();
  }

  // Load preview on mount
  $effect(() => {
    loadPreview();
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "A": return { icon: "+", color: "#10b981", label: "Added" };
      case "M": return { icon: "~", color: "#f59e0b", label: "Modified" };
      case "D": return { icon: "-", color: "#ef4444", label: "Deleted" };
      case "R": return { icon: "→", color: "#6366f1", label: "Renamed" };
      default: return { icon: "?", color: "#6b7280", label: "Changed" };
    }
  };
</script>

<Modal {open} title="Merge to {baseBranch}" onClose={handleClose} size="lg">
  {#snippet children()}
    {#if step === "preview"}
      {#if loading}
        <div class="loading">
          <div class="spinner"></div>
          <p>Analyzing changes...</p>
        </div>
      {:else if preview}
        <div class="preview-content">
          <div class="summary-card">
            <div class="summary-header">
              <h3>Ready to merge</h3>
              <p class="summary-subtitle">
                Merge <strong>{branch.replace("session/", "")}</strong> into <strong>{baseBranch}</strong>
              </p>
            </div>

            {#if preview.hasUncommittedChanges}
              <div class="warning-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>You have uncommitted changes. They will be auto-committed before merge.</span>
              </div>
            {/if}

            <div class="stats-row">
              <div class="stat">
                <span class="stat-value">{preview.commits.length}</span>
                <span class="stat-label">commits</span>
              </div>
              <div class="stat">
                <span class="stat-value">{preview.changedFiles.length}</span>
                <span class="stat-label">files changed</span>
              </div>
            </div>
          </div>

          {#if preview.commits.length > 0}
            <div class="section">
              <h4>Commits</h4>
              <div class="commits-list">
                {#each preview.commits.slice(0, 5) as commit}
                  <div class="commit-item">
                    <span class="commit-hash">{commit.hash.slice(0, 7)}</span>
                    <span class="commit-message">{commit.message}</span>
                  </div>
                {/each}
                {#if preview.commits.length > 5}
                  <div class="more-items">+{preview.commits.length - 5} more commits</div>
                {/if}
              </div>
            </div>
          {/if}

          {#if preview.changedFiles.length > 0}
            <div class="section">
              <h4>Changed Files</h4>
              <div class="files-list">
                {#each preview.changedFiles.slice(0, 10) as file}
                  {@const status = statusIcon(file.status)}
                  <div class="file-item">
                    <span class="file-status" style="color: {status.color}" title={status.label}>{status.icon}</span>
                    <span class="file-path">{file.path}</span>
                  </div>
                {/each}
                {#if preview.changedFiles.length > 10}
                  <div class="more-items">+{preview.changedFiles.length - 10} more files</div>
                {/if}
              </div>
            </div>
          {/if}

          <div class="options-section">
            <label class="cleanup-option">
              <input type="checkbox" bind:checked={keepChatting} />
              <div class="option-text">
                <span class="option-label">Keep chatting on {baseBranch}</span>
                <span class="option-hint">Continue this conversation on the main branch</span>
              </div>
            </label>
            <label class="cleanup-option">
              <input type="checkbox" bind:checked={cleanupAfterMerge} />
              <span>Delete worktree after merge</span>
            </label>
          </div>
        </div>
      {/if}

    {:else if step === "merging"}
      <div class="loading">
        <div class="spinner"></div>
        <p>Rebasing and merging changes...</p>
      </div>

    {:else if step === "continuing"}
      <div class="loading">
        <div class="spinner"></div>
        <p>Continuing merge...</p>
      </div>

    {:else if step === "conflicts"}
      <div class="conflicts-content">
        <div class="conflict-header" class:rebase-conflict={needsConflictResolution}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3>{needsConflictResolution ? "Resolve Conflicts" : "Merge Conflicts"}</h3>
            <p>
              {#if needsConflictResolution}
                These files have conflicts. Resolve them in your parallel branch, then click "Continue Merge".
              {:else}
                These files have conflicts that need to be resolved manually.
              {/if}
            </p>
          </div>
        </div>

        {#if needsConflictResolution && worktreePath}
          <div class="worktree-path-box">
            <span class="path-label">Resolve conflicts in:</span>
            <code class="path-value">{worktreePath}</code>
          </div>
        {/if}

        <div class="conflicts-list">
          {#each conflicts as conflict}
            <div class="conflict-item">
              <span class="conflict-icon">!</span>
              <span class="conflict-file">{conflict.file}</span>
            </div>
          {/each}
        </div>

        <div class="conflict-instructions">
          {#if needsConflictResolution}
            <h4>Steps to resolve:</h4>
            <ol>
              <li>Open the conflicting files in your parallel branch</li>
              <li>Look for <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> markers</li>
              <li>Edit the files to resolve the conflicts</li>
              <li>Save the files (no need to stage/commit)</li>
              <li>Click "Continue Merge" below</li>
            </ol>
          {:else}
            <p class="conflict-help">
              Please resolve the conflicts in your editor, then try merging again.
            </p>
          {/if}
        </div>
      </div>

    {:else if step === "success"}
      <div class="success-content">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3>Merge Complete!</h3>
        <p>Your changes have been merged into <strong>{baseBranch}</strong>.</p>
        {#if cleanupAfterMerge}
          <p class="cleanup-note">The worktree has been cleaned up.</p>
        {/if}
      </div>

    {:else if step === "error"}
      <div class="error-content">
        <div class="error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3>Merge Failed</h3>
        <p class="error-message">{error}</p>
      </div>
    {/if}
  {/snippet}

  {#snippet footer()}
    {#if step === "preview"}
      <button class="btn btn-secondary" onclick={onClose}>Cancel</button>
      <button
        class="btn btn-primary"
        onclick={handleMerge}
        disabled={loading || !preview?.canMerge}
      >
        Merge to {baseBranch}
      </button>
    {:else if step === "conflicts"}
      <button class="btn btn-secondary btn-danger" onclick={handleAbort}>Abort</button>
      {#if needsConflictResolution}
        <button class="btn btn-primary" onclick={handleContinueRebase}>
          Continue Merge
        </button>
      {:else}
        <button class="btn btn-primary" onclick={() => { step = "preview"; loadPreview(); }}>
          Try Again
        </button>
      {/if}
    {:else if step === "success"}
      <button class="btn btn-primary" onclick={handleClose}>Done</button>
    {:else if step === "error"}
      <button class="btn btn-secondary" onclick={() => { step = "preview"; loadPreview(); }}>
        Try Again
      </button>
      <button class="btn btn-primary" onclick={onClose}>Close</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    gap: 1rem;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid #e5e5e5;
    border-top-color: #10b981;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading p {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .summary-card {
    background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
    border: 1px solid #a7f3d0;
    border-radius: 12px;
    padding: 1.25rem;
  }

  .summary-header h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.125rem;
    color: #065f46;
  }

  .summary-subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: #059669;
  }

  .warning-box {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.75rem;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: 8px;
    font-size: 0.8125rem;
    color: #92400e;
  }

  .warning-box svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    color: #f59e0b;
  }

  .stats-row {
    display: flex;
    gap: 2rem;
    margin-top: 1rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: #065f46;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #059669;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section h4 {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .commits-list, .files-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.5rem;
    max-height: 150px;
    overflow-y: auto;
  }

  .commit-item, .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    font-family: ui-monospace, monospace;
  }

  .commit-hash {
    color: #6366f1;
    font-weight: 500;
  }

  .commit-message {
    color: #374151;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-status {
    font-weight: 700;
    width: 1rem;
    text-align: center;
  }

  .file-path {
    color: #374151;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .more-items {
    font-size: 0.75rem;
    color: #6b7280;
    padding: 0.25rem 0.5rem;
  }

  .options-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid #e5e7eb;
    margin-top: 0.5rem;
  }

  .cleanup-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
    cursor: pointer;
  }

  .cleanup-option input {
    accent-color: #10b981;
    margin-top: 0.125rem;
  }

  .option-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .option-label {
    font-weight: 500;
  }

  .option-hint {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .conflicts-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .conflict-header {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
  }

  .conflict-header svg {
    width: 1.5rem;
    height: 1.5rem;
    color: #ef4444;
    flex-shrink: 0;
  }

  .conflict-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #991b1b;
  }

  .conflict-header p {
    margin: 0.25rem 0 0 0;
    font-size: 0.8125rem;
    color: #b91c1c;
  }

  .conflicts-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.5rem;
  }

  .conflict-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    font-family: ui-monospace, monospace;
    font-size: 0.8125rem;
  }

  .conflict-icon {
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ef4444;
    color: white;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.75rem;
  }

  .conflict-file {
    color: #374151;
  }

  .conflict-help {
    font-size: 0.8125rem;
    color: #6b7280;
    margin: 0;
  }

  .conflict-header.rebase-conflict {
    background: #fef9c3;
    border-color: #fde047;
  }

  .conflict-header.rebase-conflict svg {
    color: #ca8a04;
  }

  .conflict-header.rebase-conflict h3 {
    color: #854d0e;
  }

  .conflict-header.rebase-conflict p {
    color: #a16207;
  }

  .worktree-path-box {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .path-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #64748b;
  }

  .path-value {
    font-size: 0.8125rem;
    font-family: ui-monospace, monospace;
    color: #334155;
    word-break: break-all;
  }

  .conflict-instructions {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }

  .conflict-instructions h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #374151;
  }

  .conflict-instructions ol {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8125rem;
    color: #4b5563;
  }

  .conflict-instructions li {
    margin-bottom: 0.375rem;
  }

  .conflict-instructions li:last-child {
    margin-bottom: 0;
  }

  .conflict-instructions code {
    font-size: 0.75rem;
    padding: 0.125rem 0.25rem;
    background: #e5e7eb;
    border-radius: 3px;
  }

  .btn-danger {
    color: #dc2626;
    border-color: #fecaca;
  }

  .btn-danger:hover {
    background: #fef2f2;
    border-color: #fca5a5;
  }

  .success-content, .error-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }

  .success-icon {
    width: 4rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #d1fae5;
    border-radius: 50%;
    margin-bottom: 1rem;
  }

  .success-icon svg {
    width: 2rem;
    height: 2rem;
    color: #10b981;
  }

  .success-content h3 {
    margin: 0 0 0.5rem 0;
    color: #065f46;
  }

  .success-content p {
    margin: 0;
    color: #059669;
  }

  .cleanup-note {
    margin-top: 0.5rem !important;
    font-size: 0.8125rem;
    color: #6b7280 !important;
  }

  .error-icon {
    width: 4rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fee2e2;
    border-radius: 50%;
    margin-bottom: 1rem;
  }

  .error-icon svg {
    width: 2rem;
    height: 2rem;
    color: #ef4444;
  }

  .error-content h3 {
    margin: 0 0 0.5rem 0;
    color: #991b1b;
  }

  .error-message {
    color: #b91c1c;
    font-size: 0.875rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-secondary {
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .btn-secondary:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .btn-primary {
    background: #10b981;
    color: white;
    border: 1px solid #10b981;
  }

  .btn-primary:hover:not(:disabled) {
    background: #059669;
    border-color: #059669;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
