<script lang="ts">
  import {
    currentAgent,
    currentTestRun,
    testRuns,
    startTestRun,
    updateTestRun,
    addTestLog,
  } from "../stores";
  import type { TestRun } from "../types";
  import JsonTreeViewer from "../../../components/JsonTreeViewer.svelte";

  let inputJson = $state("{\n  \n}");
  let inputError = $state<string | null>(null);
  let isRunning = $state(false);

  // Validate JSON input
  function validateInput(): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(inputJson);
      inputError = null;
      return parsed;
    } catch (e: any) {
      inputError = e.message;
      return null;
    }
  }

  // Run the agent with input
  async function handleRun() {
    const input = validateInput();
    if (!input || !$currentAgent) return;

    isRunning = true;

    const run = startTestRun($currentAgent.id, input);
    updateTestRun(run.id, { status: "running" });
    addTestLog(run.id, "info", "Starting agent execution...");

    try {
      // TODO: Actually run the agent via API
      // For now, simulate a run
      await new Promise((resolve) => setTimeout(resolve, 2000));

      addTestLog(run.id, "info", "Agent completed successfully");

      updateTestRun(run.id, {
        status: "completed",
        completedAt: new Date(),
        output: {
          result: "Simulated output",
          metadata: {
            duration: 2000,
            tokensUsed: 150,
          },
        },
        files: [
          {
            name: "report.md",
            path: "/tmp/agent-output/report.md",
            mimeType: "text/markdown",
            size: 1234,
          },
        ],
      });
    } catch (e: any) {
      addTestLog(run.id, "error", `Execution failed: ${e.message}`);
      updateTestRun(run.id, {
        status: "failed",
        completedAt: new Date(),
        error: e.message,
      });
    } finally {
      isRunning = false;
    }
  }

  // Format timestamp
  function formatTime(date: Date): string {
    return date.toLocaleTimeString();
  }

  // Get status color
  function getStatusColor(status: TestRun["status"]): string {
    switch (status) {
      case "pending":
        return "text-gray-400";
      case "running":
        return "text-blue-500";
      case "completed":
        return "text-green-500";
      case "failed":
        return "text-red-500";
      default:
        return "text-gray-400";
    }
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
    <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Test Harness</h2>
    {#if $currentTestRun}
      <span class="text-xs {getStatusColor($currentTestRun.status)}">{$currentTestRun.status}</span>
    {/if}
  </div>

  <!-- Input section -->
  <div class="px-3 py-3 border-b border-gray-100">
    <label class="block text-xs font-medium text-gray-600 mb-2">Input (JSON)</label>
    <div class="relative">
      <textarea
        bind:value={inputJson}
        oninput={() => validateInput()}
        class="w-full h-32 p-2 text-xs font-mono bg-gray-50 border rounded-lg resize-none focus:outline-none focus:border-indigo-400 {inputError ? 'border-red-300' : 'border-gray-200'}"
        placeholder="Enter JSON input..."
        spellcheck="false"
      ></textarea>
      {#if inputError}
        <p class="mt-1 text-xs text-red-500">{inputError}</p>
      {/if}
    </div>

    <button
      onclick={handleRun}
      disabled={isRunning || !!inputError}
      class="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {#if isRunning}
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Running...
      {:else}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Run Agent
      {/if}
    </button>
  </div>

  <!-- Output section -->
  <div class="flex-1 overflow-y-auto">
    {#if $currentTestRun}
      <!-- Output -->
      {#if $currentTestRun.output}
        <div class="px-3 py-2 border-b border-gray-100">
          <label class="block text-xs font-medium text-gray-600 mb-2">Output</label>
          <div class="bg-gray-50 rounded-lg p-2 text-xs max-h-48 overflow-auto">
            <JsonTreeViewer value={$currentTestRun.output} />
          </div>
        </div>
      {/if}

      <!-- Files -->
      {#if $currentTestRun.files && $currentTestRun.files.length > 0}
        <div class="px-3 py-2 border-b border-gray-100">
          <label class="block text-xs font-medium text-gray-600 mb-2">Output Files</label>
          <div class="space-y-1">
            {#each $currentTestRun.files as file}
              <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="text-xs font-mono text-gray-700 flex-1 truncate">{file.name}</span>
                <span class="text-xs text-gray-400">{(file.size / 1024).toFixed(1)}KB</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Error -->
      {#if $currentTestRun.error}
        <div class="px-3 py-2 border-b border-gray-100">
          <div class="p-2 bg-red-50 border border-red-200 rounded-lg">
            <p class="text-xs text-red-700">{$currentTestRun.error}</p>
          </div>
        </div>
      {/if}

      <!-- Logs -->
      <div class="px-3 py-2">
        <label class="block text-xs font-medium text-gray-600 mb-2">Logs</label>
        <div class="space-y-1 text-xs font-mono">
          {#each $currentTestRun.logs as log}
            <div class="flex gap-2 {log.level === 'error' ? 'text-red-600' : log.level === 'warn' ? 'text-amber-600' : 'text-gray-600'}">
              <span class="text-gray-400 shrink-0">{formatTime(log.timestamp)}</span>
              <span>{log.message}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <!-- Empty state -->
      <div class="flex-1 flex items-center justify-center p-4">
        <div class="text-center">
          <svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-xs text-gray-400">No test runs yet</p>
          <p class="text-xs text-gray-400">Enter input and click Run</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Previous runs -->
  {#if $testRuns.length > 1}
    <div class="px-3 py-2 border-t border-gray-100">
      <label class="block text-xs font-medium text-gray-600 mb-2">Previous Runs</label>
      <div class="space-y-1 max-h-24 overflow-y-auto">
        {#each $testRuns.slice(1, 6) as run}
          <button
            onclick={() => currentTestRun.set(run)}
            class="w-full flex items-center gap-2 p-1.5 text-xs hover:bg-gray-50 rounded transition-colors"
          >
            <span class="w-2 h-2 rounded-full {run.status === 'completed' ? 'bg-green-400' : run.status === 'failed' ? 'bg-red-400' : 'bg-gray-300'}"></span>
            <span class="text-gray-500">{formatTime(run.startedAt)}</span>
            <span class="text-gray-400 truncate flex-1">{JSON.stringify(run.input).slice(0, 30)}...</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
