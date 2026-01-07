<script lang="ts">
  interface Props {
    branch: string;
    baseBranch?: string;
    changesCount?: number;
    size?: "sm" | "md";
    showMergeButton?: boolean;
    onMergeClick?: () => void;
  }

  let {
    branch,
    baseBranch,
    changesCount = 0,
    size = "sm",
    showMergeButton = false,
    onMergeClick,
  }: Props = $props();

  // Extract short branch name (remove session/ prefix)
  const shortBranch = $derived(branch.replace(/^session\//, "").slice(0, 25));
</script>

<div class="worktree-badge" class:md={size === "md"}>
  <div class="badge-content">
    <svg class="branch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
    <span class="branch-name" title={branch}>{shortBranch}</span>
    {#if changesCount > 0}
      <span class="changes-count" title="{changesCount} uncommitted changes">{changesCount}</span>
    {/if}
  </div>

  {#if showMergeButton && onMergeClick}
    <button class="merge-button" onclick={onMergeClick} title="Merge to {baseBranch || 'main'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
      Merge
    </button>
  {/if}
</div>

<style>
  .worktree-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.1875rem 0.5rem;
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1px solid #a7f3d0;
    border-radius: 9999px;
    font-size: 0.6875rem;
  }

  .worktree-badge.md {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    gap: 0.5rem;
  }

  .badge-content {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .branch-icon {
    width: 0.75rem;
    height: 0.75rem;
    color: #10b981;
    flex-shrink: 0;
  }

  .md .branch-icon {
    width: 0.875rem;
    height: 0.875rem;
  }

  .branch-name {
    color: #059669;
    font-weight: 500;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .md .branch-name {
    max-width: 180px;
  }

  .changes-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.25rem;
    background: #10b981;
    color: white;
    font-size: 0.625rem;
    font-weight: 600;
    border-radius: 9999px;
  }

  .merge-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .merge-button:hover {
    background: #059669;
  }

  .merge-button svg {
    width: 0.625rem;
    height: 0.625rem;
  }

  .md .merge-button {
    padding: 0.1875rem 0.5rem;
    font-size: 0.6875rem;
  }

  .md .merge-button svg {
    width: 0.75rem;
    height: 0.75rem;
  }
</style>
