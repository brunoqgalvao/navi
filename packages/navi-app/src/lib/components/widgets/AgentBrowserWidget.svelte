<script lang="ts">
  import {
    parseCommand,
    parseSnapshot,
    extractScreenshotPath,
    extractUrl,
    getCommandDescription,
    getCommandIcon,
    type ParsedSnapshot
  } from '$lib/utils/agent-browser-parser';
  import { getServerUrl } from '$lib/config';
  import AccessibilityTreeView from './AccessibilityTreeView.svelte';

  interface Props {
    command: string;
    output?: string;
    isError?: boolean;
    isRunning?: boolean;
  }

  let { command, output = '', isError = false, isRunning = false }: Props = $props();

  // Parse the command
  const parsedCommand = $derived(parseCommand(command));

  // Extract data from output
  const screenshotPath = $derived(output ? extractScreenshotPath(output) : null);
  const currentUrl = $derived(extractUrl(command, output));

  // Parse snapshot - check if output contains accessibility tree
  const snapshot = $derived.by((): ParsedSnapshot | null => {
    if (parsedCommand.type === 'snapshot' && output && (output.includes('[ref=') || output.includes('@e'))) {
      return parseSnapshot(output);
    }
    return null;
  });

  // UI state
  let showRawOutput = $state(false);
  let screenshotExpanded = $state(false);
  let imageError = $state(false);
  let lastScreenshotPath = $state<string | null>(null);

  // Reset imageError when screenshot path changes
  $effect(() => {
    if (screenshotPath !== lastScreenshotPath) {
      lastScreenshotPath = screenshotPath;
      imageError = false;
    }
  });

  // Status styling - using theme-aware colors
  const statusConfig = $derived.by(() => {
    if (isRunning) {
      return {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
        text: 'Running...',
        textColor: 'text-blue-600 dark:text-blue-400'
      };
    }
    if (isError) {
      return {
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800',
        text: 'Error',
        textColor: 'text-red-600 dark:text-red-400'
      };
    }
    return {
      bg: 'bg-gray-50 dark:bg-gray-800/50',
      border: 'border-gray-200 dark:border-gray-700',
      text: 'Done',
      textColor: 'text-gray-500 dark:text-gray-400'
    };
  });

  function getScreenshotUrl(path: string): string {
    // For local file paths, use the server's file serving endpoint
    if (path.startsWith('/')) {
      return `${getServerUrl()}/api/file?path=${encodeURIComponent(path)}`;
    }
    return path;
  }
</script>

<div class="agent-browser-widget rounded-lg border {statusConfig.border} {statusConfig.bg} overflow-hidden">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
    <span class="text-lg">{getCommandIcon(parsedCommand.type)}</span>
    <span class="flex-1 font-medium text-sm text-gray-800 dark:text-gray-200">
      {getCommandDescription(parsedCommand)}
    </span>
    <span class="flex items-center gap-1.5 text-xs {statusConfig.textColor}">
      {#if isRunning}
        <span class="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
      {/if}
      {statusConfig.text}
    </span>
  </div>

  <!-- URL bar (only for open/navigation commands) -->
  {#if currentUrl && parsedCommand.type === 'open'}
    <div class="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
      <span class="text-gray-400 dark:text-gray-500 text-xs">🔗</span>
      <span class="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">{currentUrl}</span>
    </div>
  {/if}

  <!-- Content -->
  <div class="p-3 space-y-3">
    <!-- Screenshot preview (only for screenshot commands) -->
    {#if screenshotPath && !imageError && parsedCommand.type === 'screenshot'}
      <div class="screenshot-section">
        <button
          class="w-full text-left"
          onclick={() => screenshotExpanded = !screenshotExpanded}
        >
          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
            <span>📸</span>
            <span>Screenshot</span>
            <span class="text-gray-400 dark:text-gray-500 truncate">{screenshotPath}</span>
            <span class="ml-auto">{screenshotExpanded ? '▼' : '▶'}</span>
          </div>
        </button>

        {#if screenshotExpanded}
          <div class="screenshot-container rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
            <img
              src={getScreenshotUrl(screenshotPath)}
              alt="Browser screenshot"
              class="w-full h-auto"
              onerror={() => imageError = true}
            />
          </div>
        {:else}
          <!-- Thumbnail preview -->
          <div class="screenshot-thumbnail rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 max-h-32 relative">
            <img
              src={getScreenshotUrl(screenshotPath)}
              alt="Browser screenshot thumbnail"
              class="w-full h-auto object-cover object-top"
              style="max-height: 128px;"
              onerror={() => imageError = true}
            />
            <div class="absolute bottom-0 left-0 right-0 py-1 bg-gradient-to-t from-black/50 to-transparent text-center">
              <span class="text-[10px] text-white/80">Click to expand</span>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Accessibility tree -->
    {#if snapshot && snapshot.elements.length > 0}
      <div class="snapshot-section">
        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <span>📋</span>
          <span>Accessibility Tree</span>
          <span class="text-gray-400 dark:text-gray-500">({snapshot.elements.length} elements)</span>
        </div>
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2">
          <AccessibilityTreeView
            elements={snapshot.elements}
            maxHeight="200px"
            collapsible={true}
          />
        </div>
      </div>
    {/if}

    <!-- Error message -->
    {#if isError && output}
      <div class="error-section rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
        <div class="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 mb-1">
          <span>⚠️</span>
          <span>Error</span>
        </div>
        <pre class="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap font-mono">{output}</pre>
      </div>
    {/if}

    <!-- Raw output toggle (for debugging) -->
    {#if output && !isError && parsedCommand.type !== 'snapshot'}
      <button
        class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        onclick={() => showRawOutput = !showRawOutput}
      >
        {showRawOutput ? '▼ Hide' : '▶ Show'} raw output
      </button>

      {#if showRawOutput}
        <pre class="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono max-h-40">{output}</pre>
      {/if}
    {/if}

    <!-- Command details (collapsed by default) -->
    <details class="text-xs">
      <summary class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
        Command details
      </summary>
      <div class="mt-2 space-y-1 text-gray-500 dark:text-gray-400 font-mono">
        <div>Type: {parsedCommand.type}</div>
        {#if parsedCommand.session}
          <div>Session: {parsedCommand.session}</div>
        {/if}
        <div class="truncate">Raw: {command}</div>
      </div>
    </details>
  </div>
</div>

<style>
  details summary {
    list-style: none;
  }

  details summary::-webkit-details-marker {
    display: none;
  }
</style>
