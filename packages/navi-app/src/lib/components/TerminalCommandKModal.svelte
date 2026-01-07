<script lang="ts">
  import { onMount } from "svelte";
  import { getServerUrl } from "../config";

  interface Props {
    open: boolean;
    onClose: () => void;
    onRunCommand: (command: string) => void;
    onPasteCommand: (command: string) => void;
    terminalContext?: string;
    cwd?: string;
    // Position near cursor
    anchorX?: number;
    anchorY?: number;
  }

  let {
    open,
    onClose,
    onRunCommand,
    onPasteCommand,
    terminalContext = "",
    cwd = "",
    anchorX = 0,
    anchorY = 0,
  }: Props = $props();

  let containerRef: HTMLDivElement;
  let inputRef: HTMLInputElement;
  let prompt = $state("");
  let generatedCommand = $state("");
  let explanation = $state("");
  let isGenerating = $state(false);
  let error = $state("");
  let showResult = $state(false);

  // Computed position - ensure it stays within viewport
  let posX = $state(0);
  let posY = $state(0);

  function updatePosition() {
    if (!open) return;

    const padding = 16;
    const tooltipWidth = 420;
    const tooltipHeight = showResult ? 200 : 56;

    // Default to anchor position, adjusted to stay in viewport
    let x = anchorX || window.innerWidth / 2 - tooltipWidth / 2;
    let y = anchorY || window.innerHeight / 2;

    // Keep within viewport
    if (x + tooltipWidth > window.innerWidth - padding) {
      x = window.innerWidth - tooltipWidth - padding;
    }
    if (x < padding) x = padding;

    if (y + tooltipHeight > window.innerHeight - padding) {
      y = anchorY - tooltipHeight - 10; // Show above cursor
    }
    if (y < padding) y = padding;

    posX = x;
    posY = y;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showResult && generatedCommand) {
        handleRun();
      } else if (prompt.trim() && !isGenerating) {
        generateCommand();
      }
    } else if (e.key === "Tab" && showResult && generatedCommand) {
      e.preventDefault();
      handlePaste();
    }
  }

  function handleClose() {
    prompt = "";
    generatedCommand = "";
    explanation = "";
    error = "";
    showResult = false;
    isGenerating = false;
    onClose();
  }

  async function generateCommand() {
    if (!prompt.trim() || isGenerating) return;

    isGenerating = true;
    error = "";
    generatedCommand = "";
    explanation = "";
    showResult = false;

    try {
      const response = await fetch(`${getServerUrl()}/api/terminal/generate-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          context: terminalContext,
          cwd,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate command");
      }

      const data = await response.json();
      generatedCommand = data.command || "";
      explanation = data.explanation || "";
      showResult = true;
      updatePosition(); // Recalc position after showing result
    } catch (e: any) {
      error = e.message || "Failed to generate command";
    } finally {
      isGenerating = false;
    }
  }

  function handleRun() {
    if (generatedCommand) {
      onRunCommand(generatedCommand);
      handleClose();
    }
  }

  function handlePaste() {
    if (generatedCommand) {
      onPasteCommand(generatedCommand);
      handleClose();
    }
  }

  $effect(() => {
    if (open) {
      updatePosition();
      setTimeout(() => inputRef?.focus(), 30);
    }
  });

  $effect(() => {
    // Recalculate when result changes
    if (showResult) {
      updatePosition();
    }
  });
</script>

{#if open}
  <!-- Invisible backdrop to catch clicks outside -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={handleClose}></div>

  <!-- Inline tooltip -->
  <div
    bind:this={containerRef}
    class="command-tooltip"
    style="left: {posX}px; top: {posY}px;"
  >
    <div class="input-row">
      <span class="prompt-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
      </span>
      <input
        bind:this={inputRef}
        type="text"
        bind:value={prompt}
        onkeydown={handleKeydown}
        placeholder="What command do you need?"
        class="prompt-input"
        disabled={isGenerating}
      />
      {#if isGenerating}
        <span class="spinner"></span>
      {:else if !showResult}
        <kbd class="hint-key">↵</kbd>
      {/if}
    </div>

    {#if error}
      <div class="error-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        {error}
      </div>
    {/if}

    {#if showResult && generatedCommand}
      <div class="result-section">
        <div class="command-row">
          <pre class="command-text">{generatedCommand}</pre>
        </div>
        {#if explanation}
          <div class="explanation-row">{explanation}</div>
        {/if}
        <div class="action-row">
          <button class="action-btn" onclick={handlePaste}>
            Paste <kbd>Tab</kbd>
          </button>
          <button class="action-btn primary" onclick={handleRun}>
            Run <kbd>↵</kbd>
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .command-tooltip {
    position: fixed;
    z-index: 1000;
    width: 420px;
    background: #1e1e2e;
    border: 1px solid #45475a;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05);
    overflow: hidden;
    animation: popIn 0.15s ease-out;
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #181825;
  }

  .prompt-icon {
    display: flex;
    color: #6c7086;
    flex-shrink: 0;
  }

  .prompt-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 14px;
    color: #cdd6f4;
    font-family: inherit;
  }

  .prompt-input::placeholder {
    color: #6c7086;
  }

  .prompt-input:disabled {
    opacity: 0.6;
  }

  .hint-key {
    padding: 2px 6px;
    font-size: 11px;
    font-family: inherit;
    color: #6c7086;
    background: #313244;
    border: none;
    border-radius: 4px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #313244;
    border-top-color: #89b4fa;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    font-size: 12px;
    color: #f38ba8;
    background: rgba(243, 139, 168, 0.1);
    border-top: 1px solid rgba(243, 139, 168, 0.2);
  }

  .result-section {
    border-top: 1px solid #313244;
  }

  .command-row {
    padding: 10px 12px;
    background: #11111b;
  }

  .command-text {
    margin: 0;
    font-size: 13px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    color: #a6e3a1;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .explanation-row {
    padding: 8px 12px;
    font-size: 12px;
    color: #a6adc8;
    background: #181825;
    border-top: 1px solid #313244;
  }

  .action-row {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 8px 12px;
    background: #181825;
    border-top: 1px solid #313244;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    color: #cdd6f4;
    background: #313244;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .action-btn:hover {
    background: #45475a;
  }

  .action-btn.primary {
    color: #1e1e2e;
    background: #89b4fa;
  }

  .action-btn.primary:hover {
    background: #b4befe;
  }

  .action-btn kbd {
    padding: 1px 4px;
    font-size: 10px;
    font-family: inherit;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  .action-btn.primary kbd {
    color: #1e1e2e;
  }
</style>
