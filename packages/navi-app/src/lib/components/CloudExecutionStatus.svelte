<script lang="ts">
  /**
   * @deprecated This component is deprecated and scheduled for removal.
   * E2B cloud execution has been superseded by Navi Cloud.
   *
   * CloudExecutionStatus - Shows the current status of a cloud execution
   * Displays stage, progress, output stream, and cost estimate
   */

  export type CloudStage = "starting" | "cloning" | "checkout" | "executing" | "syncing" | "completed" | "failed";

  interface Props {
    executionId: string;
    stage: CloudStage;
    stageMessage?: string;
    repoUrl?: string;
    branch?: string;
    outputLines?: string[];
    duration?: number;
    estimatedCostUsd?: number;
    success?: boolean;
    error?: string;
    onCancel?: () => void;
  }

  let {
    executionId,
    stage = "starting",
    stageMessage = "",
    repoUrl,
    branch,
    outputLines = [],
    duration,
    estimatedCostUsd,
    success,
    error,
    onCancel,
  }: Props = $props();

  // Stage configuration with icons and colors
  const stageConfig: Record<CloudStage, { icon: string; color: string; label: string }> = {
    starting: { icon: "cloud", color: "sky", label: "Starting sandbox..." },
    cloning: { icon: "download", color: "blue", label: "Cloning repository..." },
    checkout: { icon: "git-branch", color: "purple", label: "Checking out branch..." },
    executing: { icon: "terminal", color: "emerald", label: "Executing Claude Code..." },
    syncing: { icon: "sync", color: "amber", label: "Syncing files..." },
    completed: { icon: "check", color: "green", label: "Completed" },
    failed: { icon: "x", color: "red", label: "Failed" },
  };

  let config = $derived(stageConfig[stage] || stageConfig.starting);
  let isRunning = $derived(!["completed", "failed"].includes(stage));

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  function formatCost(usd: number): string {
    if (usd < 0.0001) return "<$0.0001";
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  }
</script>

<div class="cloud-execution-status {config.color} {stage}">
  <!-- Header -->
  <div class="status-header">
    <div class="status-icon">
      {#if stage === "starting"}
        <svg class="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
        </svg>
      {:else if stage === "cloning"}
        <svg class="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      {:else if stage === "checkout"}
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9"/>
        </svg>
      {:else if stage === "executing"}
        <svg class="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
        </svg>
      {:else if stage === "syncing"}
        <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      {:else if stage === "completed"}
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      {:else if stage === "failed"}
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      {/if}
    </div>

    <div class="status-text">
      <span class="status-label">{config.label}</span>
      {#if stageMessage}
        <span class="status-message">{stageMessage}</span>
      {/if}
    </div>

    <div class="status-meta">
      {#if duration}
        <span class="duration">{formatDuration(duration)}</span>
      {/if}
      {#if estimatedCostUsd !== undefined && estimatedCostUsd > 0}
        <span class="cost">{formatCost(estimatedCostUsd)}</span>
      {/if}
    </div>

    {#if isRunning && onCancel}
      <button class="cancel-btn" onclick={onCancel} title="Cancel execution">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Repo info -->
  {#if repoUrl || branch}
    <div class="repo-info">
      {#if repoUrl}
        <span class="repo-url" title={repoUrl}>
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
          </svg>
          {repoUrl.split('/').slice(-2).join('/')}
        </span>
      {/if}
      {#if branch}
        <span class="branch">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 4.97-4.03 9-9 9"/>
          </svg>
          {branch}
        </span>
      {/if}
    </div>
  {/if}

  <!-- Error message -->
  {#if error}
    <div class="error-message">
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span>{error}</span>
    </div>
  {/if}

  <!-- Output stream (last few lines) -->
  {#if outputLines.length > 0}
    <div class="output-stream">
      {#each outputLines.slice(-5) as line}
        <div class="output-line">{line}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cloud-execution-status {
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.05) 0%, rgba(14, 165, 233, 0.1) 100%);
    border: 1px solid rgba(14, 165, 233, 0.2);
    border-radius: 12px;
    padding: 12px 14px;
    margin: 8px 0;
    font-size: 13px;
  }

  .cloud-execution-status.failed {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(239, 68, 68, 0.1) 100%);
    border-color: rgba(239, 68, 68, 0.2);
  }

  .cloud-execution-status.completed {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.1) 100%);
    border-color: rgba(34, 197, 94, 0.2);
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .status-icon {
    color: #0ea5e9;
    flex-shrink: 0;
  }

  .failed .status-icon {
    color: #ef4444;
  }

  .completed .status-icon {
    color: #22c55e;
  }

  .status-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .status-label {
    font-weight: 500;
    color: #1e293b;
  }

  :global(.dark) .status-label {
    color: #e2e8f0;
  }

  .status-message {
    font-size: 11px;
    color: #64748b;
  }

  .status-meta {
    display: flex;
    gap: 8px;
    font-size: 11px;
    color: #64748b;
  }

  .duration {
    font-variant-numeric: tabular-nums;
  }

  .cost {
    color: #0ea5e9;
    font-weight: 500;
  }

  .cancel-btn {
    padding: 4px;
    border-radius: 4px;
    color: #94a3b8;
    transition: all 0.15s ease;
  }

  .cancel-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .repo-info {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    font-size: 11px;
    color: #64748b;
  }

  .repo-url, .branch {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 8px 10px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 6px;
    color: #dc2626;
    font-size: 12px;
  }

  .output-stream {
    margin-top: 8px;
    padding: 8px;
    background: rgba(15, 23, 42, 0.8);
    border-radius: 6px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 10px;
    line-height: 1.5;
    max-height: 100px;
    overflow-y: auto;
  }

  .output-line {
    color: #94a3b8;
    white-space: pre-wrap;
    word-break: break-all;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-25%); }
  }

  .animate-bounce {
    animation: bounce 1s infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
