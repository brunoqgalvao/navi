<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { terminalApi, type ExecEvent } from "../api";

  interface Props {
    command: string;
    cwd?: string;
    onOpenInDock?: (command: string) => void;
    onComplete?: (exitCode: number) => void;
    onSendToClaude?: (context: string) => void;
  }

  let { command, cwd, onOpenInDock, onComplete, onSendToClaude }: Props = $props();

  // Error patterns to detect
  const ERROR_PATTERNS = [
    /error:/i,
    /ERR!/,
    /failed/i,
    /exception/i,
    /ENOENT/,
    /Cannot find module/,
    /command not found/,
    /permission denied/i,
  ];

  let hasError = $state(false);

  function checkForErrors(text: string) {
    if (ERROR_PATTERNS.some(p => p.test(text))) {
      hasError = true;
    }
  }

  function handleSendToClaude() {
    const fullOutput = output.join('');
    const context = `I ran this command:\n\`\`\`bash\n${command}\n\`\`\`\n\nOutput:\n\`\`\`\n${fullOutput}\n\`\`\`${exitCode !== null ? `\n\nExit code: ${exitCode}` : ''}\n\nCan you help me understand what went wrong and how to fix it?`;
    onSendToClaude?.(context);
  }

  let output = $state<string[]>([]);
  let isRunning = $state(true);
  let exitCode = $state<number | null>(null);
  let execId = $state<string | null>(null);
  let error = $state<string | null>(null);
  let outputContainer: HTMLDivElement;

  async function runCommand() {
    isRunning = true;
    output = [];
    error = null;
    exitCode = null;

    try {
      const response = await terminalApi.exec(command, cwd);
      const reader = response.body?.getReader();
      if (!reader) {
        error = "Failed to start command";
        isRunning = false;
        return;
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: ExecEvent = JSON.parse(line.slice(6));
              switch (event.type) {
                case "started":
                  execId = event.execId || null;
                  break;
                case "stdout":
                  if (event.data) {
                    output = [...output, event.data];
                    checkForErrors(event.data);
                    scrollToBottom();
                  }
                  break;
                case "stderr":
                  if (event.data) {
                    output = [...output, `\x1b[31m${event.data}\x1b[0m`];
                    checkForErrors(event.data);
                    scrollToBottom();
                  }
                  break;
                case "exit":
                  exitCode = event.code ?? 0;
                  isRunning = false;
                  execId = null;
                  if (exitCode !== 0) {
                    hasError = true;
                  }
                  onComplete?.(exitCode);
                  break;
                case "error":
                  error = event.message || "Command failed";
                  isRunning = false;
                  execId = null;
                  break;
              }
            } catch { /* SSE event parse error - skip malformed event */ }
          }
        }
      }
    } catch (e: any) {
      error = e.message || "Failed to execute command";
      isRunning = false;
    }
  }

  async function stopCommand() {
    if (execId) {
      await terminalApi.killExec(execId);
      isRunning = false;
      exitCode = -1;
    }
  }

  function scrollToBottom() {
    if (outputContainer) {
      outputContainer.scrollTop = outputContainer.scrollHeight;
    }
  }

  function formatOutput(text: string): string {
    // Basic ANSI to HTML conversion
    return text
      .replace(/\x1b\[31m/g, '<span class="text-red-400">')
      .replace(/\x1b\[32m/g, '<span class="text-green-400">')
      .replace(/\x1b\[33m/g, '<span class="text-yellow-400">')
      .replace(/\x1b\[34m/g, '<span class="text-blue-400">')
      .replace(/\x1b\[35m/g, '<span class="text-purple-400">')
      .replace(/\x1b\[36m/g, '<span class="text-cyan-400">')
      .replace(/\x1b\[0m/g, '</span>')
      .replace(/\x1b\[\d+m/g, ''); // Remove other ANSI codes
  }

  onMount(() => {
    runCommand();
  });

  onDestroy(() => {
    if (execId) {
      terminalApi.killExec(execId).catch(() => {});
    }
  });
</script>

<div class="inline-command-block">
  <div class="command-header">
    <div class="command-title">
      <span class="terminal-icon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </span>
      <code class="command-text">{command}</code>
    </div>
    <div class="command-actions">
      {#if isRunning}
        <button class="action-btn stop" onclick={stopCommand} title="Stop">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
        </button>
        <span class="status running">
          <span class="spinner"></span>
          Running
        </span>
      {:else if exitCode !== null}
        <span class="status {exitCode === 0 ? 'success' : 'error'}">
          {exitCode === 0 ? '✓' : '✗'} Exit {exitCode}
        </span>
      {/if}
      {#if onOpenInDock}
        <button class="action-btn" onclick={() => onOpenInDock?.(command)} title="Open in Dock Terminal">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  {#if output.length > 0 || error}
    <div bind:this={outputContainer} class="command-output">
      {#each output as line}
        <span class="output-line">{@html formatOutput(line)}</span>
      {/each}
      {#if error}
        <span class="output-line error">{error}</span>
      {/if}
    </div>
  {/if}

  <!-- Error detection prompt -->
  {#if hasError && !isRunning && onSendToClaude}
    <div class="error-prompt">
      <span class="error-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </span>
      <span class="error-text">Error detected in output</span>
      <button class="help-btn" onclick={handleSendToClaude}>
        Ask Claude for help
      </button>
    </div>
  {/if}
</div>

<style>
  .inline-command-block {
    background: #1a1b26;
    border-radius: 8px;
    overflow: hidden;
    font-family: Menlo, Monaco, "Courier New", monospace;
    font-size: 12px;
    margin: 8px 0;
  }

  .command-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #24283b;
    border-bottom: 1px solid #32344a;
  }

  .command-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #a9b1d6;
    min-width: 0;
    flex: 1;
  }

  .terminal-icon {
    display: flex;
    color: #7aa2f7;
    flex-shrink: 0;
  }

  .command-text {
    color: #c0caf5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .command-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: #32344a;
    color: #a9b1d6;
  }

  .action-btn.stop {
    color: #f7768e;
  }

  .action-btn.stop:hover {
    background: rgba(247, 118, 142, 0.15);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .status.running {
    color: #7aa2f7;
    background: rgba(122, 162, 247, 0.1);
  }

  .status.success {
    color: #9ece6a;
    background: rgba(158, 206, 106, 0.1);
  }

  .status.error {
    color: #f7768e;
    background: rgba(247, 118, 142, 0.1);
  }

  .spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(122, 162, 247, 0.3);
    border-top-color: #7aa2f7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .command-output {
    padding: 12px;
    max-height: 300px;
    overflow-y: auto;
    color: #a9b1d6;
    line-height: 1.5;
  }

  .output-line {
    display: block;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .output-line.error {
    color: #f7768e;
  }

  .command-output::-webkit-scrollbar {
    width: 6px;
  }

  .command-output::-webkit-scrollbar-track {
    background: transparent;
  }

  .command-output::-webkit-scrollbar-thumb {
    background: #32344a;
    border-radius: 3px;
  }

  .command-output::-webkit-scrollbar-thumb:hover {
    background: #444b6a;
  }

  .error-prompt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(247, 118, 142, 0.1);
    border-top: 1px solid rgba(247, 118, 142, 0.2);
  }

  .error-icon {
    display: flex;
    color: #f7768e;
    flex-shrink: 0;
  }

  .error-text {
    color: #f7768e;
    font-size: 11px;
    flex: 1;
  }

  .help-btn {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    color: #f7768e;
    background: rgba(247, 118, 142, 0.15);
    border: 1px solid rgba(247, 118, 142, 0.3);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .help-btn:hover {
    background: rgba(247, 118, 142, 0.25);
    border-color: rgba(247, 118, 142, 0.5);
  }
</style>
