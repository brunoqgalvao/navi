<script lang="ts">
  /**
   * SafeTerminal - Error-isolated terminal wrapper
   *
   * Wraps TerminalPanel with error handling to prevent terminal crashes
   * from taking down the entire app. Provides recovery UI.
   */
  import { onMount } from "svelte";
  import TerminalPanel from "./TerminalPanel.svelte";

  interface Props {
    cwd?: string;
    initialCommand?: string;
    projectId?: string;
    name?: string;
    existingTerminalId?: string;
    onClose?: () => void;
    onSendToClaude?: (context: string) => void;
    onTerminalIdChange?: (terminalId: string | null) => void;
  }

  let {
    cwd,
    initialCommand,
    projectId,
    name,
    existingTerminalId,
    onClose,
    onSendToClaude,
    onTerminalIdChange,
  }: Props = $props();

  let terminalRef: TerminalPanel | null = $state(null);
  let hasError = $state(false);
  let errorMessage = $state("");
  let retryCount = $state(0);
  let isRetrying = $state(false);
  const MAX_RETRIES = 3;

  // Track terminal health
  let lastHealthCheck = $state(Date.now());
  let isHealthy = $state(true);

  function handleError(error: Error) {
    console.error("[SafeTerminal] Terminal error:", error);
    hasError = true;
    errorMessage = error.message || "Terminal encountered an error";
    isHealthy = false;
  }

  async function retry() {
    if (retryCount >= MAX_RETRIES) {
      errorMessage = "Maximum retries exceeded. Please refresh the page.";
      return;
    }

    isRetrying = true;
    retryCount++;

    // Small delay before retry
    await new Promise(r => setTimeout(r, 500));

    hasError = false;
    errorMessage = "";
    isRetrying = false;
    isHealthy = true;
  }

  function resetTerminal() {
    // Clear the existing terminal ID to force a fresh PTY
    onTerminalIdChange?.(null);
    retryCount = 0;
    hasError = false;
    errorMessage = "";
    isHealthy = true;
  }

  // Expose terminal methods through a safe wrapper
  export function pasteCommand(command: string) {
    if (!hasError && terminalRef) {
      try {
        terminalRef.pasteCommand(command);
      } catch (e) {
        handleError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  export function runCommand(command: string) {
    if (!hasError && terminalRef) {
      try {
        terminalRef.runCommand(command);
      } catch (e) {
        handleError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  export function killTerminal() {
    if (!hasError && terminalRef) {
      try {
        terminalRef.killTerminal();
      } catch (e) {
        handleError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  // Set up error catching for the terminal
  onMount(() => {
    // Catch errors from the terminal's async operations
    const originalConsoleError = console.error;
    console.error = (...args) => {
      // Check if this is a terminal-related error
      const errorStr = args.join(" ");
      if (
        errorStr.includes("xterm") ||
        errorStr.includes("terminal") ||
        errorStr.includes("PTY") ||
        errorStr.includes("WebSocket")
      ) {
        // Terminal-specific error, mark as unhealthy but don't crash
        isHealthy = false;
      }
      originalConsoleError.apply(console, args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  });
</script>

{#if hasError}
  <div class="terminal-error-state">
    <div class="error-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
        <line x1="12" y1="12" x2="12" y2="12"></line>
      </svg>
    </div>
    <h3>Terminal Error</h3>
    <p class="error-message">{errorMessage}</p>
    <div class="error-actions">
      {#if retryCount < MAX_RETRIES}
        <button class="retry-btn" onclick={retry} disabled={isRetrying}>
          {#if isRetrying}
            <span class="spinner"></span>
            Retrying...
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            Retry ({MAX_RETRIES - retryCount} left)
          {/if}
        </button>
      {/if}
      <button class="reset-btn" onclick={resetTerminal}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
        Reset Terminal
      </button>
    </div>
    {#if onSendToClaude}
      <button class="ask-claude-btn" onclick={() => onSendToClaude?.(`Terminal crashed with error: ${errorMessage}\n\nPlease help me troubleshoot this issue.`)}>
        Ask Claude for help
      </button>
    {/if}
  </div>
{:else}
  {#key retryCount}
    <TerminalPanel
      bind:this={terminalRef}
      {cwd}
      {initialCommand}
      {projectId}
      {name}
      {existingTerminalId}
      {onClose}
      {onSendToClaude}
      {onTerminalIdChange}
    />
  {/key}
{/if}

<style>
  .terminal-error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px;
    height: 100%;
    min-height: 200px;
    background: #1a1b26;
    color: #a9b1d6;
    text-align: center;
  }

  .error-icon {
    color: #f7768e;
    opacity: 0.8;
  }

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #c0caf5;
  }

  .error-message {
    margin: 0;
    font-size: 13px;
    color: #565f89;
    max-width: 350px;
  }

  .error-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .retry-btn,
  .reset-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .retry-btn {
    color: #7aa2f7;
    background: rgba(122, 162, 247, 0.1);
    border: 1px solid rgba(122, 162, 247, 0.3);
  }

  .retry-btn:hover:not(:disabled) {
    background: rgba(122, 162, 247, 0.2);
    border-color: rgba(122, 162, 247, 0.5);
  }

  .retry-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .reset-btn {
    color: #9ece6a;
    background: rgba(158, 206, 106, 0.1);
    border: 1px solid rgba(158, 206, 106, 0.3);
  }

  .reset-btn:hover {
    background: rgba(158, 206, 106, 0.2);
    border-color: rgba(158, 206, 106, 0.5);
  }

  .ask-claude-btn {
    margin-top: 4px;
    padding: 6px 12px;
    font-size: 11px;
    color: #bb9af7;
    background: transparent;
    border: 1px solid rgba(187, 154, 247, 0.3);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ask-claude-btn:hover {
    background: rgba(187, 154, 247, 0.1);
    border-color: rgba(187, 154, 247, 0.5);
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(122, 162, 247, 0.3);
    border-top-color: #7aa2f7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
