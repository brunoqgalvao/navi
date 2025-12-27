<script lang="ts">
  interface Props {
    command: string;
    description?: string;
    timeout?: number;
    resultContent?: string;
    isError?: boolean;
    onRunInTerminal?: (command: string) => void;
    onSendToClaude?: (context: string) => void;
  }

  let { command, description, timeout, resultContent, isError, onRunInTerminal, onSendToClaude }: Props = $props();

  // Error patterns to detect in output
  const ERROR_PATTERNS = [
    /error:/i,
    /ERR!/,
    /failed/i,
    /exception/i,
    /ENOENT/,
    /Cannot find module/,
    /command not found/,
    /permission denied/i,
    /EACCES/,
    /ECONNREFUSED/,
    /TypeError:/,
    /SyntaxError:/,
    /ReferenceError:/,
    /panic:/i,
    /fatal:/i,
  ];

  let isExpanded = $state(false);
  let outputContainer: HTMLDivElement;

  // Parse the result to extract exit code if present
  const parseResult = $derived(() => {
    if (!resultContent) return { output: "", exitCode: null, hasError: false };

    // Check for error patterns in output
    const hasErrorPattern = ERROR_PATTERNS.some(p => p.test(resultContent));
    const hasError = isError || hasErrorPattern;

    // Try to extract exit code from common patterns
    let exitCode: number | null = null;
    const exitMatch = resultContent.match(/exit(?:ed)?\s+(?:with\s+)?(?:code\s+)?(\d+)/i);
    if (exitMatch) {
      exitCode = parseInt(exitMatch[1], 10);
    } else if (isError) {
      exitCode = 1; // Assume error means non-zero
    }

    return { output: resultContent, exitCode, hasError };
  });

  const result = $derived(parseResult());

  // Truncate for collapsed view
  const MAX_COLLAPSED_LINES = 8;
  const MAX_COLLAPSED_CHARS = 500;

  const truncatedOutput = $derived(() => {
    const output = result.output;
    if (!output) return { text: "", isTruncated: false, lineCount: 0 };

    const lines = output.split('\n');
    const lineCount = lines.length;

    if (lineCount <= MAX_COLLAPSED_LINES && output.length <= MAX_COLLAPSED_CHARS) {
      return { text: output, isTruncated: false, lineCount };
    }

    const truncatedLines = lines.slice(0, MAX_COLLAPSED_LINES);
    let text = truncatedLines.join('\n');
    if (text.length > MAX_COLLAPSED_CHARS) {
      text = text.slice(0, MAX_COLLAPSED_CHARS);
    }

    return { text, isTruncated: true, lineCount };
  });

  function handleSendToClaude() {
    const context = `I ran this command:\n\`\`\`bash\n${command}\n\`\`\`\n\nOutput:\n\`\`\`\n${result.output}\n\`\`\`${result.exitCode !== null ? `\n\nExit code: ${result.exitCode}` : ''}\n\nCan you help me understand what went wrong and how to fix it?`;
    onSendToClaude?.(context);
  }

  function formatAnsi(text: string): string {
    // Basic ANSI to HTML conversion
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\x1b\[31m/g, '<span class="ansi-red">')
      .replace(/\x1b\[32m/g, '<span class="ansi-green">')
      .replace(/\x1b\[33m/g, '<span class="ansi-yellow">')
      .replace(/\x1b\[34m/g, '<span class="ansi-blue">')
      .replace(/\x1b\[35m/g, '<span class="ansi-magenta">')
      .replace(/\x1b\[36m/g, '<span class="ansi-cyan">')
      .replace(/\x1b\[1m/g, '<span class="ansi-bold">')
      .replace(/\x1b\[0m/g, '</span>')
      .replace(/\x1b\[\d+m/g, ''); // Remove other ANSI codes
  }
</script>

<div class="bash-preview">
  <!-- Command header -->
  <div class="command-section">
    {#if description}
      <div class="description">{description}</div>
    {/if}
    <div class="command-line">
      <span class="prompt">$</span>
      <code class="command">{command}</code>
      {#if onRunInTerminal}
        <button
          class="run-btn"
          onclick={() => onRunInTerminal(command)}
          title="Run in Terminal"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          Run
        </button>
      {/if}
    </div>
    {#if timeout}
      <div class="timeout">timeout: {timeout}ms</div>
    {/if}
  </div>

  <!-- Output section -->
  {#if resultContent}
    <div class="output-section" class:has-error={result.hasError}>
      <div class="output-header">
        <span class="output-label">Output</span>
        {#if result.exitCode !== null}
          <span class="exit-code" class:error={result.exitCode !== 0}>
            {result.exitCode === 0 ? '✓' : '✗'} Exit {result.exitCode}
          </span>
        {/if}
        {#if truncatedOutput().isTruncated}
          <button class="expand-btn" onclick={() => isExpanded = !isExpanded}>
            {isExpanded ? 'Collapse' : `Show all (${truncatedOutput().lineCount} lines)`}
            <svg class="chevron" class:expanded={isExpanded} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>
        {/if}
      </div>
      <div
        bind:this={outputContainer}
        class="output-content"
        class:expanded={isExpanded}
      >
        <pre>{@html formatAnsi(isExpanded ? result.output : truncatedOutput().text)}{#if !isExpanded && truncatedOutput().isTruncated}<span class="truncated-indicator">...</span>{/if}</pre>
      </div>
    </div>

    <!-- Error prompt -->
    {#if result.hasError && onSendToClaude}
      <div class="error-prompt">
        <span class="error-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </span>
        <span class="error-text">Error detected</span>
        <button class="help-btn" onclick={handleSendToClaude}>
          Ask Claude for help
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .bash-preview {
    font-family: Menlo, Monaco, "Courier New", monospace;
    font-size: 12px;
  }

  .command-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .description {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 2px;
  }

  .command-line {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f3e8ff;
    padding: 6px 10px;
    border-radius: 6px;
    overflow-x: auto;
  }

  .prompt {
    color: #7c3aed;
    font-weight: 600;
    flex-shrink: 0;
  }

  .command {
    color: #6d28d9;
    white-space: pre-wrap;
    word-break: break-all;
    flex: 1;
  }

  .run-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 500;
    color: #7c3aed;
    background: rgba(124, 58, 237, 0.1);
    border: 1px solid rgba(124, 58, 237, 0.2);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
    opacity: 0;
  }

  .command-line:hover .run-btn {
    opacity: 1;
  }

  .run-btn:hover {
    background: rgba(124, 58, 237, 0.2);
    border-color: rgba(124, 58, 237, 0.4);
  }

  .timeout {
    font-size: 10px;
    color: #9ca3af;
  }

  .output-section {
    margin-top: 8px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }

  .output-section.has-error {
    border-color: #fecaca;
  }

  .output-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .output-section.has-error .output-header {
    background: #fef2f2;
    border-bottom-color: #fecaca;
  }

  .output-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
  }

  .exit-code {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #dcfce7;
    color: #166534;
  }

  .exit-code.error {
    background: #fee2e2;
    color: #dc2626;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 2px 6px;
    font-size: 10px;
    color: #6b7280;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 4px;
  }

  .expand-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .chevron {
    width: 12px;
    height: 12px;
    transition: transform 0.15s;
  }

  .chevron.expanded {
    transform: rotate(180deg);
  }

  .output-content {
    padding: 10px;
    background: #1a1b26;
    max-height: 200px;
    overflow-y: auto;
  }

  .output-content.expanded {
    max-height: 400px;
  }

  .output-content pre {
    margin: 0;
    color: #a9b1d6;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
  }

  .truncated-indicator {
    color: #565f89;
    font-style: italic;
  }

  /* ANSI color classes */
  .output-content :global(.ansi-red) { color: #f7768e; }
  .output-content :global(.ansi-green) { color: #9ece6a; }
  .output-content :global(.ansi-yellow) { color: #e0af68; }
  .output-content :global(.ansi-blue) { color: #7aa2f7; }
  .output-content :global(.ansi-magenta) { color: #bb9af7; }
  .output-content :global(.ansi-cyan) { color: #7dcfff; }
  .output-content :global(.ansi-bold) { font-weight: 600; }

  .output-content::-webkit-scrollbar {
    width: 6px;
  }

  .output-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .output-content::-webkit-scrollbar-thumb {
    background: #32344a;
    border-radius: 3px;
  }

  .error-prompt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-top: none;
    border-radius: 0 0 6px 6px;
  }

  .error-icon {
    display: flex;
    color: #dc2626;
    flex-shrink: 0;
  }

  .error-text {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 11px;
    color: #dc2626;
    flex: 1;
  }

  .help-btn {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    font-family: system-ui, -apple-system, sans-serif;
    color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .help-btn:hover {
    background: rgba(220, 38, 38, 0.2);
    border-color: rgba(220, 38, 38, 0.5);
  }
</style>
