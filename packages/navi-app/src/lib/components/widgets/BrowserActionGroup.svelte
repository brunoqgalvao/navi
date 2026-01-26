<script lang="ts">
  /**
   * BrowserActionGroup
   *
   * Groups consecutive agent-browser commands into a single collapsible widget
   * with step-by-step navigation. Shows the final screenshot prominently.
   */
  import {
    parseCommand,
    parseSnapshot,
    extractScreenshotPath,
    extractUrl,
    getCommandDescription,
    getCommandIcon,
    type BrowserCommand,
    type ParsedSnapshot
  } from '$lib/utils/agent-browser-parser';
  import { getServerUrl } from '$lib/config';
  import AccessibilityTreeView from './AccessibilityTreeView.svelte';
  import DoodlePulse from '../DoodlePulse.svelte';
  import MediaDisplay from '../MediaDisplay.svelte';

  interface BrowserStep {
    command: string;
    output: string;
    isError?: boolean;
    isRunning?: boolean;
  }

  interface Props {
    steps: BrowserStep[];
  }

  let { steps }: Props = $props();

  // Current step index for navigation
  let currentStep = $state(0);
  let expanded = $state(false);

  // Reset to last step when steps change (new commands added)
  $effect(() => {
    if (steps.length > 0) {
      currentStep = steps.length - 1;
    }
  });

  // Derived: parsed info for all steps
  const parsedSteps = $derived(steps.map(step => {
    const parsedCommand = parseCommand(step.command);
    const screenshotPath = step.output ? extractScreenshotPath(step.output) : null;
    const url = extractUrl(step.command, step.output);
    const snapshot = parsedCommand.type === 'snapshot' && step.output &&
      (step.output.includes('[ref=') || step.output.includes('@e'))
      ? parseSnapshot(step.output)
      : null;

    return {
      ...step,
      parsedCommand,
      screenshotPath,
      url,
      snapshot
    };
  }));

  // Find the most recent screenshot
  const latestScreenshot = $derived.by(() => {
    for (let i = parsedSteps.length - 1; i >= 0; i--) {
      if (parsedSteps[i].screenshotPath) {
        return parsedSteps[i].screenshotPath;
      }
    }
    return null;
  });

  // Current step data
  const currentStepData = $derived(parsedSteps[currentStep] || parsedSteps[0]);

  // Summary: extract URL being browsed
  const browsingUrl = $derived.by(() => {
    for (const step of parsedSteps) {
      if (step.url) {
        try {
          return new URL(step.url).hostname;
        } catch {
          return step.url;
        }
      }
    }
    return 'page';
  });

  // Any step still running?
  const isRunning = $derived(steps.some(s => s.isRunning));
  const hasError = $derived(steps.some(s => s.isError));
  const allDone = $derived(!isRunning && !hasError);

  function prevStep() {
    if (currentStep > 0) currentStep--;
  }

  function nextStep() {
    if (currentStep < steps.length - 1) currentStep++;
  }

  function getScreenshotUrl(path: string): string {
    if (path.startsWith('/')) {
      return `${getServerUrl()}/api/file?path=${encodeURIComponent(path)}`;
    }
    return path;
  }
</script>

<!-- Main container -->
<div class="browser-action-group rounded-xl border-2 overflow-hidden shadow-sm
  {hasError ? 'border-red-200 bg-red-50/50' : 'border-cyan-200 bg-cyan-50/30'}">

  <!-- Collapsed header (always visible) -->
  <button
    class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-cyan-50/50 transition-colors"
    onclick={() => expanded = !expanded}
  >
    <!-- Browser icon -->
    <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0
      {hasError ? 'bg-red-100' : 'bg-cyan-100'}">
      <svg class="w-5 h-5 {hasError ? 'text-red-600' : 'text-cyan-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"></path>
      </svg>
    </div>

    <!-- Title -->
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold text-gray-900">
        Browsing {browsingUrl}
      </div>
      <div class="text-xs text-gray-500">
        {steps.length} action{steps.length > 1 ? 's' : ''}
        {#if latestScreenshot}
          · Screenshot captured
        {/if}
      </div>
    </div>

    <!-- Status badge -->
    <div class="shrink-0">
      {#if isRunning}
        <div class="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-100 rounded-full">
          <DoodlePulse size={10} color="rgb(6 182 212)" />
          <span class="text-xs font-medium text-cyan-700">Running</span>
        </div>
      {:else if hasError}
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

    <!-- Expand arrow -->
    <svg
      class="w-4 h-4 text-gray-400 transition-transform {expanded ? 'rotate-180' : ''}"
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
    </svg>
  </button>

  <!-- Screenshot preview (shown in collapsed state too if available) -->
  {#if latestScreenshot && !expanded}
    <div class="px-4 pb-3 -mt-1">
      <div class="rounded-lg overflow-hidden border border-cyan-200 bg-white max-h-32 relative">
        <img
          src={getScreenshotUrl(latestScreenshot)}
          alt="Browser screenshot"
          class="w-full h-auto object-cover object-top"
          style="max-height: 128px;"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-white/80 to-transparent pointer-events-none"></div>
      </div>
    </div>
  {/if}

  <!-- Expanded content -->
  {#if expanded}
    <div class="border-t border-cyan-100">
      <!-- Step navigation bar -->
      <div class="flex items-center gap-2 px-4 py-2 bg-cyan-50/50 border-b border-cyan-100">
        <!-- Prev button -->
        <button
          class="p-1 rounded hover:bg-cyan-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          onclick={prevStep}
          disabled={currentStep === 0}
          title="Previous step"
        >
          <svg class="w-4 h-4 text-cyan-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>

        <!-- Step indicators -->
        <div class="flex-1 flex items-center gap-1 overflow-x-auto">
          {#each parsedSteps as step, idx}
            <button
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all shrink-0
                {idx === currentStep
                  ? 'bg-cyan-200 text-cyan-800 font-medium'
                  : 'bg-white hover:bg-cyan-100 text-gray-600'}"
              onclick={() => currentStep = idx}
            >
              <span>{getCommandIcon(step.parsedCommand.type)}</span>
              <span class="truncate max-w-20">{step.parsedCommand.type}</span>
              {#if step.isError}
                <svg class="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              {:else if step.isRunning}
                <DoodlePulse size={8} color="rgb(6 182 212)" />
              {:else}
                <svg class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Next button -->
        <button
          class="p-1 rounded hover:bg-cyan-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          onclick={nextStep}
          disabled={currentStep === steps.length - 1}
          title="Next step"
        >
          <svg class="w-4 h-4 text-cyan-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>

        <!-- Step counter -->
        <span class="text-xs text-gray-400 shrink-0">
          {currentStep + 1}/{steps.length}
        </span>
      </div>

      <!-- Current step content -->
      {#if currentStepData}
        <div class="p-4 space-y-3">
          <!-- Step header -->
          <div class="flex items-center gap-2">
            <span class="text-lg">{getCommandIcon(currentStepData.parsedCommand.type)}</span>
            <span class="text-sm font-medium text-gray-800">
              {getCommandDescription(currentStepData.parsedCommand)}
            </span>
            {#if currentStepData.url && currentStepData.parsedCommand.type === 'open'}
              <span class="text-xs text-gray-500 truncate">{currentStepData.url}</span>
            {/if}
          </div>

          <!-- Screenshot (if this step produced one) -->
          {#if currentStepData.screenshotPath}
            <div class="rounded-lg overflow-hidden border-2 border-cyan-200 bg-white">
              <img
                src={getScreenshotUrl(currentStepData.screenshotPath)}
                alt="Browser screenshot"
                class="w-full h-auto"
              />
            </div>
          {/if}

          <!-- Accessibility tree (if snapshot command) -->
          {#if currentStepData.snapshot && currentStepData.snapshot.elements.length > 0}
            <div class="rounded-lg border border-cyan-200 bg-white p-2">
              <div class="flex items-center gap-2 text-xs text-cyan-700 mb-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                </svg>
                <span class="font-medium">Accessibility Tree</span>
                <span class="text-gray-400">({currentStepData.snapshot.elements.length} elements)</span>
              </div>
              <AccessibilityTreeView
                elements={currentStepData.snapshot.elements}
                maxHeight="200px"
                collapsible={true}
              />
            </div>
          {/if}

          <!-- Error output -->
          {#if currentStepData.isError && currentStepData.output}
            <div class="rounded-lg bg-red-50 border border-red-200 p-3">
              <pre class="text-xs text-red-800 whitespace-pre-wrap font-mono">{currentStepData.output}</pre>
            </div>
          {/if}

          <!-- Command details -->
          <details class="text-xs group">
            <summary class="flex items-center gap-1.5 text-gray-400 hover:text-cyan-600 cursor-pointer transition-colors">
              <svg class="w-3.5 h-3.5 transform transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
              <span>Command details</span>
            </summary>
            <div class="mt-2 ml-5 font-mono text-[11px] bg-gray-50 rounded-lg p-2 border border-gray-200 text-gray-500">
              <div class="truncate">{currentStepData.command}</div>
            </div>
          </details>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  details summary {
    list-style: none;
  }
  details summary::-webkit-details-marker {
    display: none;
  }
</style>
