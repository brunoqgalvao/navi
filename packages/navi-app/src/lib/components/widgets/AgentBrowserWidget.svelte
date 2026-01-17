<script lang="ts">
  /**
   * AgentBrowserWidget
   *
   * Rich display for agent-browser CLI commands with screenshot preview,
   * accessibility tree visualization, and Navi-branded styling.
   */
  import {
    parseCommand,
    parseSnapshot,
    extractScreenshotPath,
    extractUrl,
    getCommandDescription,
    type ParsedSnapshot
  } from '$lib/utils/agent-browser-parser';
  import { getServerUrl } from '$lib/config';
  import AccessibilityTreeView from './AccessibilityTreeView.svelte';
  import DoodlePulse from '../DoodlePulse.svelte';

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
  let screenshotExpanded = $state(true); // Default to expanded for screenshots
  let imageError = $state(false);
  let lastScreenshotPath = $state<string | null>(null);

  // Reset imageError when screenshot path changes
  $effect(() => {
    if (screenshotPath !== lastScreenshotPath) {
      lastScreenshotPath = screenshotPath;
      imageError = false;
    }
  });

  function getScreenshotUrl(path: string): string {
    // For local file paths, use the server's file serving endpoint
    if (path.startsWith('/')) {
      return `${getServerUrl()}/api/file?path=${encodeURIComponent(path)}`;
    }
    return path;
  }

  // Get command-specific icon SVG path
  function getCommandIconPath(type: string): string {
    switch (type) {
      case 'open': return 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9';
      case 'screenshot': return 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z';
      case 'click': return 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122';
      case 'fill': case 'type': return 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z';
      case 'snapshot': return 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01';
      case 'hover': return 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5';
      case 'wait': return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'close': return 'M6 18L18 6M6 6l12 12';
      case 'back': return 'M10 19l-7-7m0 0l7-7m-7 7h18';
      case 'forward': return 'M14 5l7 7m0 0l-7 7m7-7H3';
      case 'reload': return 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
      default: return 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9';
    }
  }

  // Extract filename from path for compact display
  function getFileName(path: string): string {
    return path.split('/').pop() || path;
  }
</script>

<!-- Main container with Navi cyan branding -->
<div class="agent-browser-widget rounded-xl border-2 overflow-hidden shadow-sm
  {isError ? 'border-red-200 bg-red-50/50' : 'border-cyan-200 bg-cyan-50/30'}">

  <!-- Header bar -->
  <div class="flex items-center gap-3 px-4 py-2.5 border-b
    {isError ? 'border-red-100 bg-red-50' : 'border-cyan-100 bg-cyan-50/50'}">

    <!-- Icon badge -->
    <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0
      {isError ? 'bg-red-100' : 'bg-cyan-100'}">
      <svg class="w-4.5 h-4.5 {isError ? 'text-red-600' : 'text-cyan-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d={getCommandIconPath(parsedCommand.type)}></path>
      </svg>
    </div>

    <!-- Title & description -->
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold text-gray-900">
        {getCommandDescription(parsedCommand)}
      </div>
      {#if currentUrl && parsedCommand.type === 'open'}
        <div class="text-xs text-gray-500 truncate font-mono">{currentUrl}</div>
      {/if}
    </div>

    <!-- Status badge -->
    <div class="shrink-0">
      {#if isRunning}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-100 rounded-full">
          <DoodlePulse size={10} color="rgb(6 182 212)" />
          <span class="text-xs font-medium text-cyan-700">Running</span>
        </div>
      {:else if isError}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-red-100 rounded-full">
          <svg class="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span class="text-xs font-medium text-red-700">Error</span>
        </div>
      {:else}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 rounded-full">
          <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="text-xs font-medium text-emerald-700">Done</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Content area -->
  <div class="p-3 space-y-3">

    <!-- Screenshot display (shown by default for screenshot commands) -->
    {#if screenshotPath && !imageError && parsedCommand.type === 'screenshot'}
      <div class="screenshot-section">
        <!-- Header with toggle -->
        <button
          class="w-full flex items-center gap-2 text-xs text-cyan-700 hover:text-cyan-800 mb-2 transition-colors"
          onclick={() => screenshotExpanded = !screenshotExpanded}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          <span class="font-medium">Screenshot captured</span>
          <span class="text-gray-400 truncate flex-1 text-left">{getFileName(screenshotPath)}</span>
          <svg class="w-4 h-4 text-gray-400 transform transition-transform {screenshotExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        <!-- Screenshot image -->
        {#if screenshotExpanded}
          <div class="screenshot-container rounded-lg overflow-hidden border-2 border-cyan-200 bg-white shadow-sm">
            <img
              src={getScreenshotUrl(screenshotPath)}
              alt="Browser screenshot"
              class="w-full h-auto"
              onerror={() => imageError = true}
            />
          </div>
        {:else}
          <!-- Collapsed thumbnail -->
          <div class="screenshot-thumbnail rounded-lg overflow-hidden border border-cyan-200 bg-white max-h-24 relative cursor-pointer hover:border-cyan-300 transition-colors"
               onclick={() => screenshotExpanded = true}
               onkeydown={(e) => e.key === 'Enter' && (screenshotExpanded = true)}
               role="button"
               tabindex="0">
            <img
              src={getScreenshotUrl(screenshotPath)}
              alt="Browser screenshot thumbnail"
              class="w-full h-auto object-cover object-top opacity-60"
              style="max-height: 96px;"
              onerror={() => imageError = true}
            />
            <div class="absolute inset-0 flex items-center justify-center bg-cyan-900/10">
              <span class="text-xs font-medium text-cyan-700 bg-white/90 px-2 py-1 rounded-full shadow-sm">
                Click to expand
              </span>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Accessibility tree -->
    {#if snapshot && snapshot.elements.length > 0}
      <div class="snapshot-section">
        <div class="flex items-center gap-2 text-xs text-cyan-700 mb-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
          </svg>
          <span class="font-medium">Accessibility Tree</span>
          <span class="text-gray-400">({snapshot.elements.length} elements)</span>
        </div>
        <div class="rounded-lg border border-cyan-200 bg-white p-2">
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
      <div class="error-section rounded-lg bg-red-50 border border-red-200 p-3">
        <div class="flex items-center gap-2 text-xs text-red-700 font-medium mb-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          <span>Error</span>
        </div>
        <pre class="text-xs text-red-800 whitespace-pre-wrap font-mono bg-red-100/50 rounded p-2 overflow-x-auto">{output}</pre>
      </div>
    {/if}

    <!-- Raw output toggle (for non-error, non-snapshot commands) -->
    {#if output && !isError && parsedCommand.type !== 'snapshot'}
      <button
        class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-cyan-600 transition-colors"
        onclick={() => showRawOutput = !showRawOutput}
      >
        <svg class="w-3.5 h-3.5 transform transition-transform {showRawOutput ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
        <span>{showRawOutput ? 'Hide' : 'Show'} raw output</span>
      </button>

      {#if showRawOutput}
        <pre class="text-xs text-gray-600 bg-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono max-h-40 border border-gray-200">{output}</pre>
      {/if}
    {/if}

    <!-- Command details (collapsed by default) -->
    <details class="text-xs group">
      <summary class="flex items-center gap-1.5 text-gray-400 hover:text-cyan-600 cursor-pointer transition-colors">
        <svg class="w-3.5 h-3.5 transform transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
        <span>Command details</span>
      </summary>
      <div class="mt-2 ml-5 space-y-1 text-gray-500 font-mono text-[11px] bg-gray-50 rounded-lg p-2 border border-gray-200">
        <div><span class="text-gray-400">type:</span> {parsedCommand.type}</div>
        {#if parsedCommand.session}
          <div><span class="text-gray-400">session:</span> {parsedCommand.session}</div>
        {/if}
        <div class="truncate"><span class="text-gray-400">raw:</span> {command}</div>
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

  .screenshot-container img {
    display: block;
  }
</style>
